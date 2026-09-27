/**
 * 机会分析页 K 线抽屉：蜡烛图 + 均线 + 成交量 + KDJ，右侧并排展示筹码分布
 *
 * K 线数据直接复用机会分析页已缓存的 `klineDataCache`（不再单独发请求，因此周期跟随
 * 列表顶部的分析周期）；筹码分布由 `useChipDistribution` 按需拉取，默认日线口径。
 *
 * 对齐策略（不依赖任何 ECharts 内部 API）：
 * 1. 由当前 dataZoom 可见窗口 + 均线，在本地推导出价格上下限并取整；
 * 2. 把同一个价格区间同时赋给左侧K线主图与右侧筹码面板的纵轴；
 * 3. 两侧网格的 top/height 保持一致（容器等高，故像素范围相同）。
 * 于是「同一价格落在同一水平线」，且缩放K线时筹码面板同步重算、实时跟随。
 *
 * 采用 Drawer 形态：抽屉高度占满视口，图表区用 flex 自适应拉伸到底部，
 * 为后续在图表下方追加「股东户数 / 机构持仓 / 十大流通股东」等纵向内容预留空间。
 * 注意：左右两侧（K线 / 筹码）必须始终等高，否则纵轴无法逐像素对齐。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Drawer, Button, Tag, Typography, App, Segmented, Spin } from 'antd';
import { LeftOutlined, RightOutlined, PlusOutlined, MinusOutlined } from '@ant-design/icons';
import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';
import type { KLineData, KLinePeriod } from '@/types/stock';
import type { ChipPeriod } from '@/types/chipDistribution';
import { calculateMA, calculateKDJ } from '@/utils/analysis/indicators';
import { buildChipChartOption } from '@/utils/chart/chipChartOption';
import { calculateChipDistribution } from '@/utils/analysis/chipDistribution';
import { formatVolume } from '@/utils/format/format';
import { StockConceptTags } from '@/components/common/Tags';
import { useChipDistribution } from '@/hooks/useChipDistribution';
import { useRecordNavigation, isEditableTarget } from '@/hooks/useRecordNavigation';
import { useThemeStore } from '@/stores/themeStore';
import { useTempStockListStore } from '@/stores/tempStockListStore';

const { Text } = Typography;

/** 筹码统计项：上标签、下数值 */
function ChipStatItem({
  label,
  value,
  valueColor,
}: {
  label: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Text type="secondary" style={{ fontSize: 14 }}>
        {label}
      </Text>
      <Text strong style={{ fontSize: 14, color: valueColor }}>
        {value}
      </Text>
    </div>
  );
}

/** 抽屉宽度：尽量铺满窗口，同时两侧各留 24px 遮罩，便于点击遮罩关闭 */
const DRAWER_WIDTH = 'min(1540px, calc(100vw - 48px))';
/**
 * 图表区域高度（px）：左右两侧容器必须等高，纵轴才能逐像素对齐。
 * 刻意用固定高度而非 flex 拉伸——抽屉高度占满视口，
 * 若让图表撑满剩余空间，主图会被拉得过高，底部缩放条还会顶到抽屉页脚。
 */
const CHART_HEIGHT = 520;
/** 筹码分布面板宽度（px），与K线图并排展示 */
const CHIP_PANEL_WIDTH = 260;
/** 筹码统计面板宽度（px），位于筹码图右侧 */
const CHIP_STATS_WIDTH = 180;
/** 默认展示最近多少根 */
const DEFAULT_VISIBLE_BARS = 120;
/** K线主图价格网格的位置，筹码面板必须与其完全一致 */
const MAIN_GRID = { top: '10%', height: '50%' };
/** 纵轴分段数，两侧保持一致以便刻度文字相同 */
const Y_SPLIT_COUNT = 5;
/** 缩放条高度（px）：ECharts 默认 30 会压住 KDJ 底部刻度，收窄后把空间让给副图 */
const ZOOM_SLIDER_HEIGHT = 22;
/**
 * 缩放条距容器底部的距离（px）：
 * ECharts 会把缩放条两端的日期标签渲染在缩放条「下方」，
 * bottom 为 0 时标签会落到容器外被裁掉（表现为日期只露出半截）。
 */
const ZOOM_SLIDER_BOTTOM = 20;
/** 副图 KDJ 网格：上沿避开成交量刻度，下沿给「缩放条 + 日期标签」让出空间 */
const SUB_GRID = { top: '79%', height: '12%' };
/**
 * KDJ 三线配色：K 蓝 / D 橙 / J 黑。
 * J 是摆动最剧烈、最需要一眼看到的那条线，用黑色压住；深色主题下换成浅灰，避免黑线淹没在深色背景里。
 */
const KDJ_COLOR = {
  light: { k: '#1677ff', d: '#fa8c16', j: '#000000' },
  dark: { k: '#4096ff', d: '#ffa940', j: '#f0f0f0' },
} as const;

/** K 线周期中文标签 */
const PERIOD_LABEL: Record<KLinePeriod, string> = {
  '1min': '1分钟',
  '5min': '5分钟',
  '15min': '15分钟',
  '30min': '30分钟',
  '60min': '60分钟',
  day: '日',
  week: '周',
  month: '月',
  year: '年',
};

interface DailyChartDrawerProps {
  open: boolean;
  code: string;
  name: string;
  /** 机会分析页缓存的 K 线数据（周期为 period） */
  kline: KLineData[];
  /** kline 的实际周期，用于标题 / tooltip 文案 */
  period: KLinePeriod;
  /** 所属行业名称，由页面传入（弹窗内不额外拉取股票列表） */
  industry?: string;
  /** 所属概念板块列表，由页面传入（弹窗内不额外拉取股票列表） */
  concepts?: Array<{ code?: string; name: string }>;
  /** 表格当前展示顺序的股票列表，用于 ← / → 快速切换上一行 / 下一行 */
  records?: Array<{ code: string; name: string }>;
  /** 切换相邻行时回调，父级据此更新弹窗数据 */
  onNavigate?: (record: { code: string; name: string }) => void;
  onClose: () => void;
}

interface PriceRange {
  min: number;
  max: number;
}

interface ChartIndicators {
  ma: { ma5: number[]; ma10: number[]; ma20: number[]; ma30: number[]; ma60: number[] };
  kdj: { k: number[]; d: number[]; j: number[] };
}

interface KlineChartBuildInput {
  data: KLineData[];
  name: string;
  periodLabel: string;
  indicators: ChartIndicators;
  /** 与我方推导的价格区间一致；null 时退回 ECharts 自适应 */
  yRange: PriceRange | null;
  zoom: { start: number; end: number };
  /** 是否深色主题：决定副图配色（黑色线条在深色底不可见） */
  isDark: boolean;
  /** 十字星指向的 K 线下标；null 时涨幅退回可见区间最后一根 */
  hoverIndex?: number | null;
}

function formatDate(time: number): string {
  const d = new Date(time);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * 计算「整齐」的纵轴上下限（步长取 1/2/2.5/5 × 10^n）。
 * 上下限取整后，两侧坐标轴给出的刻度文字才会一致且可读。
 */
function nicePriceRange(min: number, max: number): PriceRange | null {
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) {
    return null;
  }
  const rawStep = (max - min) / Y_SPLIT_COUNT;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const normalized = rawStep / magnitude;
  const step =
    (normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 2.5 ? 2.5 : normalized <= 5 ? 5 : 10) *
    magnitude;

  return {
    min: Number((Math.floor(min / step) * step).toFixed(6)),
    max: Number((Math.ceil(max / step) * step).toFixed(6)),
  };
}

function buildKlineChartOption(input: KlineChartBuildInput): EChartsOption {
  const { data, name, periodLabel, indicators, yRange, zoom, isDark, hoverIndex = null } = input;
  const { ma5, ma10, ma20, ma30, ma60 } = indicators.ma;
  const kdj = indicators.kdj;
  const kdjColor = isDark ? KDJ_COLOR.dark : KDJ_COLOR.light;

  /**
   * KDJ 纵轴范围：固定以 -50 ~ 150 为基准（刻度 -50 / 0 / 50 / 100 / 150），
   * 这样超买超卖区间（0~100）在框内的相对位置恒定，不同股票之间可直接横向比较。
   * 只有当可见区间内的 K/D/J 真的冲出 -50 ~ 150 时，才再向外扩到 10 的倍数，避免被裁掉。
   */
  const kdjAxis = (() => {
    const total = data.length;
    const baseMin = -50;
    const baseMax = 150;
    if (total === 0) {
      return { min: baseMin, max: baseMax };
    }
    // 与主图价格轴一致：两端各多取 1 根，避免边界处的极值被漏掉
    const startIndex = Math.max(0, Math.floor((zoom.start / 100) * (total - 1)) - 1);
    const endIndex = Math.min(total - 1, Math.ceil((zoom.end / 100) * (total - 1)) + 1);

    let lo = baseMin;
    let hi = baseMax;
    for (let i = startIndex; i <= endIndex; i += 1) {
      for (const value of [kdj.k[i], kdj.d[i], kdj.j[i]]) {
        if (!Number.isFinite(value)) continue;
        if (value < lo) lo = value;
        if (value > hi) hi = value;
      }
    }
    return { min: Math.floor(lo / 10) * 10, max: Math.ceil(hi / 10) * 10 };
  })();

  /**
   * 涨幅取「当前可见区间最后一根」相对前一根的涨跌，随 dataZoom 缩放/平移动态变化。
   * 索引换算方式与 ECharts dataZoom 百分比一致（percent / 100 × (len - 1)）。
   */
  const visibleEndIndex =
    data.length === 0
      ? -1
      : Math.min(data.length - 1, Math.max(0, Math.round((zoom.end / 100) * (data.length - 1))));
  /** 十字星优先，未悬停时退回可见区间最后一根 */
  const changeIndex =
    hoverIndex !== null && hoverIndex >= 0 && hoverIndex < data.length ? hoverIndex : visibleEndIndex;
  const lastBar = changeIndex >= 0 ? data[changeIndex] : undefined;
  const prevBar = changeIndex > 0 ? data[changeIndex - 1] : undefined;
  const changePct =
    lastBar && prevBar && prevBar.close > 0
      ? ((lastBar.close - prevBar.close) / prevBar.close) * 100
      : null;
  const changeText = changePct === null ? '' : `${changePct >= 0 ? '+' : ''}${changePct.toFixed(2)}%`;
  const changeColor = changePct !== null && changePct < 0 ? '#26a69a' : '#ef5350';
  /** 当前价（收盘价）与涨幅同源（十字星所指那一根优先），显示在涨幅左侧 */
  const closeText = lastBar ? lastBar.close.toFixed(2) : '';

  const timeAxis = (gridIndex?: number) => ({
    type: 'category' as const,
    ...(gridIndex === undefined ? {} : { gridIndex }),
    data: data.map((d) => formatDate(d.time)),
    boundaryGap: false,
    axisLine: { onZero: false },
    axisTick: { show: false },
    axisLabel: { show: false },
    splitLine: { show: false },
  });

  return {
    title: {
      text: `${
        closeText ? `  {chg|当前价 ${closeText}}` : ''
      }${changeText ? `  {chg|涨幅 ${changeText}}` : ''}`,
      left: 0,
      textStyle: {
        fontSize: 14,
        rich: { chg: { color: changeColor, fontSize: 15 } },
      },
    },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'cross' },
      formatter: (params: unknown) => {
        if (!Array.isArray(params) || params.length === 0) return '';
        const dataIndex = (params[0] as { dataIndex: number }).dataIndex;
        const item = data[dataIndex];
        if (!item) return '';

        let html = `<div>${periodLabel}: ${formatDate(item.time)}</div>`;
        html += `<div>开: ${item.open.toFixed(2)}</div>`;
        html += `<div>收: ${item.close.toFixed(2)}</div>`;
        html += `<div>高: ${item.high.toFixed(2)}</div>`;
        html += `<div>低: ${item.low.toFixed(2)}</div>`;
        html += `<div>量: ${formatVolume(item.volume)}</div>`;

        [['MA5', ma5], ['MA10', ma10], ['MA20', ma20], ['MA30', ma30], ['MA60', ma60]].forEach(
          ([label, arr]) => {
            const value = (arr as number[])[dataIndex];
            if (Number.isFinite(value)) {
              html += `<div>${label}: ${value.toFixed(2)}</div>`;
            }
          }
        );

        const k = kdj.k[dataIndex];
        const d = kdj.d[dataIndex];
        const j = kdj.j[dataIndex];
        if (Number.isFinite(k) && Number.isFinite(d)) {
          // 数值颜色与副图线条一一对应，配合图表上方的颜色说明即可确认哪条线是哪个值
          html += `<div><span style="color:${kdjColor.k}">K: ${k.toFixed(2)}</span> / <span style="color:${kdjColor.d}">D: ${d.toFixed(2)}</span> / <span style="color:${kdjColor.j}">J: ${Number.isFinite(j) ? j.toFixed(2) : '-'}</span></div>`;
        }
        return html;
      },
    },
    grid: [
      { left: '8%', right: '4%', top: MAIN_GRID.top, height: MAIN_GRID.height },
      { left: '8%', right: '4%', top: '64%', height: '13%' },
      { left: '8%', right: '4%', top: SUB_GRID.top, height: SUB_GRID.height },
    ],
    xAxis: [timeAxis(), timeAxis(1), timeAxis(2)],
    yAxis: [
      {
        scale: true,
        // 与右侧筹码面板共用同一区间，保证水平对齐
        min: yRange?.min,
        max: yRange?.max,
        splitNumber: Y_SPLIT_COUNT,
        splitArea: { show: true },
      },
      {
        scale: true,
        gridIndex: 1,
        splitNumber: 2,
        axisLabel: { show: true, formatter: (value: number) => formatVolume(value) },
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { show: false },
      },
      {
        scale: true,
        gridIndex: 2,
        min: kdjAxis.min,
        max: kdjAxis.max,
        // 基准区间 200 跨 4 段 → 刻度正好落在 -50 / 0 / 50 / 100 / 150
        splitNumber: 4,
        // 容器高度较小时自动隐藏重叠刻度，避免数字叠在一起
        axisLabel: { show: true, hideOverlap: true },
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { show: false },
      },
    ],
    dataZoom: [
      { type: 'inside', xAxisIndex: [0, 1, 2], start: zoom.start, end: zoom.end },
      {
        show: true,
        xAxisIndex: [0, 1, 2],
        type: 'slider',
        bottom: ZOOM_SLIDER_BOTTOM,
        height: ZOOM_SLIDER_HEIGHT,
        start: zoom.start,
        end: zoom.end,
      },
    ],
    series: [
      {
        name: `${periodLabel}K`,
        type: 'candlestick',
        data: data.map((d) => [d.open, d.close, d.low, d.high]),
        itemStyle: {
          // 阳线（红）空心：内部透明、仅红色描边
          color: 'transparent',
          borderColor: '#ef5350',
          borderWidth: 1,
          // 阴线（绿）保持实心
          color0: '#26a69a',
          borderColor0: '#26a69a',
        },
      },
      { name: 'MA5', type: 'line', data: ma5, smooth: false, showSymbol: false, lineStyle: { width: 1 }, animation: false },
      { name: 'MA10', type: 'line', data: ma10, smooth: false, showSymbol: false, lineStyle: { width: 1 }, animation: false },
      { name: 'MA20', type: 'line', data: ma20, smooth: false, showSymbol: false, lineStyle: { width: 1 }, animation: false },
      { name: 'MA30', type: 'line', data: ma30, smooth: false, showSymbol: false, lineStyle: { width: 1 }, animation: false },
      {
        name: 'MA60',
        type: 'line',
        data: ma60,
        smooth: false,
        showSymbol: false,
        lineStyle: { width: 2, color: '#722ed1' },
        animation: false,
      },
      {
        name: '成交量',
        type: 'bar',
        xAxisIndex: 1,
        yAxisIndex: 1,
        data: data.map((d) => d.volume),
        itemStyle: {
          color: (params: { dataIndex: number }) => {
            const row = data[params.dataIndex];
            return row && row.close >= row.open ? '#ef5350' : '#26a69a';
          },
        },
      },
      {
        name: 'K',
        type: 'line',
        xAxisIndex: 2,
        yAxisIndex: 2,
        data: kdj.k,
        showSymbol: false,
        // itemStyle.color 同时决定图例色块，保证图例与线条颜色一致
        itemStyle: { color: kdjColor.k },
        lineStyle: { width: 1.5, color: kdjColor.k },
        animation: false,
      },
      {
        name: 'D',
        type: 'line',
        xAxisIndex: 2,
        yAxisIndex: 2,
        data: kdj.d,
        showSymbol: false,
        itemStyle: { color: kdjColor.d },
        lineStyle: { width: 1.5, color: kdjColor.d },
        animation: false,
      },
      {
        name: 'J',
        type: 'line',
        xAxisIndex: 2,
        yAxisIndex: 2,
        data: kdj.j,
        showSymbol: false,
        itemStyle: { color: kdjColor.j },
        // J 摆动最剧烈，线宽再粗一档，黑色线条也能压住其它两条
        lineStyle: { width: 1.5, color: kdjColor.j },
        animation: false,
      },
    ],
  };
}

export function DailyChartDrawer({
  open,
  code,
  name,
  kline,
  period,
  industry,
  concepts,
  records = [],
  onNavigate,
  onClose,
}: DailyChartDrawerProps) {
  const { message } = App.useApp();
  const chartRef = useRef<ReactECharts>(null);
  /** 筹码分布图实例：抽屉开合动画结束后需要一并 resize */
  const chipChartRef = useRef<ReactECharts>(null);

  /** 临时列表（全局、仅内存）：本弹窗加入，机会分析页「导出/设置」里导出 */
  const tempListCount = useTempStockListStore((state) => state.items.length);
  const inTempList = useTempStockListStore((state) =>
    state.items.some((item) => item.code === code)
  );
  const addToTempList = useTempStockListStore((state) => state.addStock);
  const removeFromTempList = useTempStockListStore((state) => state.removeStock);

  /** 加入临时列表：按 code 去重，重复加入只提示不新增 */
  const handleAddToTempList = useCallback(() => {
    if (!code) {
      return;
    }
    const stockName = name || code;
    if (addToTempList({ code, name: stockName })) {
      message.success(`已加入临时列表：${stockName}（共 ${tempListCount + 1} 只）`);
    } else {
      message.info(`${stockName} 已在临时列表中`);
    }
  }, [addToTempList, code, message, name, tempListCount]);

  /** 取消加入：把当前股票从临时列表移除（不在列表中时只提示） */
  const handleRemoveFromTempList = useCallback(() => {
    if (!code) {
      return;
    }
    const stockName = name || code;
    if (!inTempList) {
      message.info(`${stockName} 不在临时列表中`);
      return;
    }
    removeFromTempList(code);
    message.success(`已取消加入：${stockName}（剩余 ${Math.max(0, tempListCount - 1)} 只）`);
  }, [code, inTempList, message, name, removeFromTempList, tempListCount]);

  /**
   * ↑ 加入 / ↓ 取消 快捷键：
   * 与 ← / → 换股同一套约定——ECharts 画布不接收焦点，必须监听 window，
   * 弹窗打开时注册、关闭即移除；输入框等可编辑控件内不劫持，组合键交还系统。
   */
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      if (isEditableTarget(event.target)) return;

      // 方向键默认会滚动页面 / 弹窗内容，这里必须拦下
      event.preventDefault();
      if (event.key === 'ArrowUp') {
        handleAddToTempList();
      } else {
        handleRemoveFromTempList();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, handleAddToTempList, handleRemoveFromTempList]);

  /** 深色主题下副图配色需切换（黑色线条在深色底不可见） */
  const isDark = useThemeStore((state) => state.theme === 'dark');
  /** 副图 KDJ 配色：与图内线条同源，用于图表外的颜色说明 */
  const kdjKey = isDark ? KDJ_COLOR.dark : KDJ_COLOR.light;
  /** 筹码周期固定为日线口径 */
  const chipPeriod: ChipPeriod = 'day';

  /** ← / →（或底部按钮）在表格行之间切换：切换后 code / kline 变化会自动复位缩放、十字星与筹码 */
  const navigation = useRecordNavigation({
    enabled: open,
    records,
    currentCode: code,
    onNavigate,
  });

  /**
   * 抽屉滑入动画结束后触发一次 ECharts resize：
   * Drawer 容器在开合过程中尺寸可能尚未就绪，不 resize 会出现空白画布。
   */
  const handleAfterOpenChange = useCallback((isOpen: boolean) => {
    if (!isOpen) return;
    chartRef.current?.getEchartsInstance()?.resize();
    chipChartRef.current?.getEchartsInstance()?.resize();
  }, []);

  /** 默认可见区间：最近 120 根 */
  const defaultZoom = useCallback((bars: KLineData[]) => {
    const visible = Math.min(DEFAULT_VISIBLE_BARS, bars.length);
    const start = bars.length > visible ? ((bars.length - visible) / bars.length) * 100 : 0;
    return { start, end: 100 };
  }, []);

  /** 当前 dataZoom 可见窗口（百分比），是左右两张图的唯一真源 */
  const [zoom, setZoom] = useState<{ start: number; end: number }>(() => defaultZoom(kline));

  const {
    distribution: latestChip,
    bars: chipBars,
    loading: chipLoading,
    error: chipError,
  } = useChipDistribution(code, chipPeriod, open);

  /** 十字星指向的筹码下标；null 表示跟随最新一根 */
  const [chipIndex, setChipIndex] = useState<number | null>(null);

  /** 十字星指向的主图 K 线下标；null 表示未悬停（涨幅退回可见区间最后一根） */
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  /** 按日期对齐筹码 K 线（两份数据起点/长度不同，不能直接用数组下标对应） */
  const chipIndexByDate = useMemo(() => {
    const map = new Map<string, number>();
    chipBars.forEach((bar, i) => map.set(bar.date, i));
    return map;
  }, [chipBars]);

  // 换股票 / 筹码数据变化时回到最新一根
  useEffect(() => {
    setChipIndex(null);
  }, [code, chipBars]);

  // 换股票 / K线数据变化时十字星复位（顶部涨幅回到可见区间最后一根）
  useEffect(() => {
    setHoverIndex(null);
  }, [code, kline]);

  const resolvedChipIndex = useMemo(() => {
    if (chipBars.length === 0) {
      return -1;
    }
    if (chipIndex === null) {
      return chipBars.length - 1;
    }
    return Math.min(Math.max(chipIndex, 0), chipBars.length - 1);
  }, [chipBars.length, chipIndex]);

  /**
   * 当前展示的筹码：默认最新一根；十字星移动时切换到对应日期。
   * 筹码算法本身是逐根累积的（第 i 根的结果 = 截断到第 i 根的中间态），
   * 因此按 index 重新推一遍即可得到「那一天」的筹码分布。
   */
  const chip = useMemo(() => {
    if (chipBars.length === 0 || resolvedChipIndex < 0) {
      return null;
    }
    if (resolvedChipIndex === chipBars.length - 1) {
      return latestChip;
    }
    return calculateChipDistribution(chipBars, resolvedChipIndex);
  }, [chipBars, resolvedChipIndex, latestChip]);

  /** 当前筹码对应的日期 */
  const chipDate = resolvedChipIndex >= 0 ? chipBars[resolvedChipIndex]?.date : undefined;

  /** 十字星日期 → 主图下标（驱动顶部涨幅）＋ 筹码下标（早于筹码窗口用最早一根，晚于窗口用最后一根） */
  const handleAxisPointer = useCallback(
    (params: unknown) => {
      const payload = params as { axesInfo?: Array<{ axisDim?: string; value?: unknown }> };
      const xInfo = payload?.axesInfo?.find((info) => info.axisDim === 'x');
      if (!xInfo) {
        return;
      }
      // axesInfo[].value 在部分版本返回下标、部分版本返回类目名（日期字符串），两者都兜住
      const raw = xInfo.value;
      let dataIndex: number;
      if (typeof raw === 'number') {
        dataIndex = Math.round(raw);
      } else if (typeof raw === 'string') {
        const asNumber = Number(raw);
        dataIndex = Number.isFinite(asNumber)
          ? Math.round(asNumber)
          : kline.findIndex((item) => formatDate(item.time) === raw);
      } else {
        return;
      }
      if (!Number.isFinite(dataIndex) || dataIndex < 0) {
        return;
      }
      const bar = kline[dataIndex];
      if (!bar) {
        return;
      }

      // 顶部涨幅跟随十字星所在 K 线（与筹码是否就绪无关）
      setHoverIndex((prev) => (prev === dataIndex ? prev : dataIndex));

      if (chipBars.length === 0) {
        return;
      }

      const date = formatDate(bar.time);
      const exact = chipIndexByDate.get(date);
      let next: number;
      if (exact !== undefined) {
        next = exact;
      } else if (date < chipBars[0].date) {
        next = 0;
      } else {
        next = chipBars.length - 1;
      }
      setChipIndex((prev) => (prev === next ? prev : next));
    },
    [chipBars, chipIndexByDate, kline]
  );

  /** 鼠标移出图表回到最新一根 */
  const handleGlobalOut = useCallback(() => {
    setChipIndex((prev) => (prev === null ? prev : null));
    setHoverIndex((prev) => (prev === null ? prev : null));
  }, []);

  const periodLabel = PERIOD_LABEL[period] ?? '日';

  // 换股票 / K线变化时把缩放窗口复位
  useEffect(() => {
    setZoom(defaultZoom(kline));
  }, [kline, defaultZoom]);

  /** 指标只算一次，供K线图与价格区间共用 */
  const indicators = useMemo<ChartIndicators | null>(() => {
    if (kline.length === 0) {
      return null;
    }
    return {
      ma: {
        ma5: calculateMA(kline, 5),
        ma10: calculateMA(kline, 10),
        ma20: calculateMA(kline, 20),
        ma30: calculateMA(kline, 30),
        ma60: calculateMA(kline, 60),
      },
      kdj: calculateKDJ(kline),
    };
  }, [kline]);

  /** 可见区间对应的价格上下限：左右两张图共用，保证同一价格同一水平线 */
  const priceRange = useMemo<PriceRange | null>(() => {
    const total = kline.length;
    if (total === 0) {
      return null;
    }

    // 两端各多取 1 根，避免边界蜡烛被裁掉
    const startIndex = Math.max(0, Math.floor((zoom.start / 100) * (total - 1)) - 1);
    const endIndex = Math.min(total - 1, Math.ceil((zoom.end / 100) * (total - 1)) + 1);
    if (endIndex <= startIndex) {
      return null;
    }

    let low = Infinity;
    let high = -Infinity;
    for (let i = startIndex; i <= endIndex; i += 1) {
      const bar = kline[i];
      if (!bar) continue;
      if (bar.low < low) low = bar.low;
      if (bar.high > high) high = bar.high;
    }

    // 均线可能冲出K线高低点（如下跌初期的MA60），一并纳入
    if (indicators) {
      const maList = [
        indicators.ma.ma5,
        indicators.ma.ma10,
        indicators.ma.ma20,
        indicators.ma.ma30,
        indicators.ma.ma60,
      ];
      for (const series of maList) {
        for (let i = startIndex; i <= endIndex; i += 1) {
          const value = series[i];
          if (!Number.isFinite(value)) continue;
          if (value < low) low = value;
          if (value > high) high = value;
        }
      }
    }

    if (!Number.isFinite(low) || !Number.isFinite(high) || high <= low) {
      return null;
    }

    const padding = (high - low) * 0.02;
    return nicePriceRange(low - padding, high + padding);
  }, [kline, indicators, zoom]);

  /** dataZoom 事件：把缩放区间同步到 state，驱动左右两侧重新计算价格轴 */
  const handleDataZoom = useCallback((params: unknown) => {
    const payload = params as {
      start?: number;
      end?: number;
      batch?: Array<{ start?: number; end?: number }>;
    };
    const start = payload?.batch?.[0]?.start ?? payload?.start;
    const end = payload?.batch?.[0]?.end ?? payload?.end;
    if (typeof start !== 'number' || typeof end !== 'number') return;
    if (!Number.isFinite(start) || !Number.isFinite(end)) return;
    setZoom((prev) => (prev.start === start && prev.end === end ? prev : { start, end }));
  }, []);

  const chartEvents = useMemo(
    () => ({
      datazoom: handleDataZoom,
      updateAxisPointer: handleAxisPointer,
      globalout: handleGlobalOut,
    }),
    [handleDataZoom, handleAxisPointer, handleGlobalOut]
  );

  const option = useMemo(() => {
    if (kline.length === 0 || !indicators) {
      return null;
    }
    return buildKlineChartOption({
      data: kline,
      name,
      periodLabel,
      indicators,
      yRange: priceRange,
      zoom,
      isDark,
      hoverIndex,
    });
  }, [kline, name, periodLabel, indicators, priceRange, zoom, isDark, hoverIndex]);

  const chipOption = useMemo(
    () =>
      chip
        ? buildChipChartOption(chip, {
            priceRange: priceRange ?? undefined,
            // 只对齐纵向（top/height）；横向留白由筹码面板按「图形靠左、数字靠右」自行决定
            grid: { top: MAIN_GRID.top, height: MAIN_GRID.height },
          })
        : null,
    [chip, priceRange]
  );

  return (
    <Drawer
      open={open}
      onClose={onClose}
      placement="right"
      width={DRAWER_WIDTH}
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span>{`${name || ''} ${code}`}</span>
          {industry && (
            <Tag color="blue" style={{ marginInlineEnd: 0 }}>
              {industry}
            </Tag>
          )}
          {concepts && concepts.length > 0 && <StockConceptTags concepts={concepts} max={3} />}
          {navigation.currentIndex >= 0 && navigation.total > 1 && (
            <Text type="secondary" style={{ fontSize: 12, fontWeight: 'normal' }}>
              第 {navigation.currentIndex + 1} / {navigation.total} 只
            </Text>
          )}
        </div>
      }
      extra={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Text type="secondary" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
            临时列表 {tempListCount} 只（↑ 加入 / ↓ 取消）
          </Text>
          <Button
            key="toggle-temp"
            icon={inTempList ? <MinusOutlined /> : <PlusOutlined />}
            disabled={!code}
            onClick={inTempList ? handleRemoveFromTempList : handleAddToTempList}
            title="快捷键：↑ 加入临时列表 / ↓ 取消加入"
          >
            {inTempList ? '取消加入' : '加入临时列表'}
          </Button>
        </div>
      }
      destroyOnHidden
      afterOpenChange={handleAfterOpenChange}
      styles={{
        body: {
          display: 'flex',
          flexDirection: 'column',
          paddingTop: 12,
          // 图表区自适应拉伸；内容不超出抽屉时不允许 body 自身滚动
          overflow: 'hidden',
        },
      }}
    >
      <div
        style={{
          marginBottom: 8,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          flexWrap: 'wrap',
          flexShrink: 0,
        }}
      >
        {chipDate && (
          <Text type="secondary" style={{ fontSize: 14, paddingLeft: 12 }}>
            筹码日期 <Text strong>{chipDate}</Text>
            {resolvedChipIndex !== chipBars.length - 1 ? '（跟随十字星）' : '（最新）'}
          </Text>
        )}
        {chipLoading && (
          <Text type="secondary" style={{ fontSize: 12 }}>
            筹码计算中…
          </Text>
        )}
        {!chipLoading && chipError && (
          <Text type="danger" style={{ fontSize: 12 }}>
            筹码分布：{chipError}
          </Text>
        )}
        {period !== 'day' && (
          <Text type="warning" style={{ fontSize: 12 }}>
            当前列表缓存为{periodLabel}线数据，如需日K请将顶部周期切换为「日」后重新分析
          </Text>
        )}
      </div>
      <div
        style={{
          display: 'flex',
          gap: 8,
          height: CHART_HEIGHT,
          // 极窄窗口下允许收缩，避免内容溢出抽屉
          flexShrink: 1,
          minHeight: 0,
        }}
      >
        <div style={{ flex: 1, minWidth: 0, height: '100%' }}>
          {option ? (
            <ReactECharts
              ref={chartRef}
              option={option}
              onEvents={chartEvents}
              lazyUpdate
              style={{ height: '100%', width: '100%' }}
              opts={{ renderer: 'canvas' }}
            />
          ) : (
            <div style={{ paddingTop: 40, textAlign: 'center' }}>暂无K线数据</div>
          )}
        </div>
        <div style={{ width: CHIP_PANEL_WIDTH, flex: '0 0 auto', height: '100%' }}>
          {chipOption ? (
            <ReactECharts
              ref={chipChartRef}
              option={chipOption}
              lazyUpdate
              style={{ height: '100%', width: '100%' }}
              opts={{ renderer: 'canvas' }}
            />
          ) : (
            <div
              style={{
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {chipLoading ? (
                <Spin size="small" />
              ) : (
                <Text type="secondary" style={{ fontSize: 12 }}>
                  暂无筹码数据
                </Text>
              )}
            </div>
          )}
        </div>
        <div
          style={{
            width: CHIP_STATS_WIDTH,
            flex: '0 0 auto',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            paddingTop: 2,
          }}
        >
          {chip ? (
            <>
              <ChipStatItem
                label="获利比例"
                value={`${(chip.benefitRatio * 100).toFixed(1)}%`}
                valueColor={chip.benefitRatio >= 0.5 ? '#ef5350' : '#26a69a'}
              />
              <ChipStatItem label="平均成本" value={chip.avgCost.toFixed(2)} />
              <ChipStatItem
                label="90%成本"
                value={`${chip.range90.low.toFixed(2)} ~ ${chip.range90.high.toFixed(2)}`}
              />
              <Text type="secondary" style={{ fontSize: 11, marginTop: -8 }}>
                集中度 {chip.range90.concentration.toFixed(3)}
              </Text>
              <ChipStatItem
                label="70%成本"
                value={`${chip.range70.low.toFixed(2)} ~ ${chip.range70.high.toFixed(2)}`}
              />
            </>
          ) : (
            !chipLoading && (
              <Text type="secondary" style={{ fontSize: 12 }}>
                暂无筹码数据
              </Text>
            )
          )}
        </div>
      </div>
    </Drawer>
  );
}
