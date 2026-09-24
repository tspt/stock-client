/**
 * 机会分析页 K 线弹窗：蜡烛图 + 均线 + 成交量 + KDJ，右侧并排展示筹码分布
 *
 * K 线数据直接复用机会分析页已缓存的 `klineDataCache`（不再单独发请求，因此周期跟随
 * 列表顶部的分析周期）；筹码分布由 `useChipDistribution` 按需拉取，默认日线口径。
 *
 * 对齐策略（不依赖任何 ECharts 内部 API）：
 * 1. 由当前 dataZoom 可见窗口 + 均线，在本地推导出价格上下限并取整；
 * 2. 把同一个价格区间同时赋给左侧K线主图与右侧筹码面板的纵轴；
 * 3. 两侧网格的 top/height 保持一致（容器等高，故像素范围相同）。
 * 于是「同一价格落在同一水平线」，且缩放K线时筹码面板同步重算、实时跟随。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Button, Space, Tag, Typography, App, Segmented, Spin } from 'antd';
import { DownloadOutlined, LeftOutlined, RightOutlined } from '@ant-design/icons';
import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';
import type { KLineData, KLinePeriod } from '@/types/stock';
import type { ChipPeriod } from '@/types/chipDistribution';
import { calculateMA, calculateKDJ } from '@/utils/analysis/indicators';
import { buildChipChartOption } from '@/utils/chart/chipChartOption';
import { calculateChipDistribution } from '@/utils/analysis/chipDistribution';
import { formatVolume } from '@/utils/format/format';
import { downloadDataUrl } from '@/utils/export/weeklyKlineExportUtils';
import { useChipDistribution } from '@/hooks/useChipDistribution';
import { useModalDrag } from '@/hooks/useModalDrag';
import { useRecordNavigation } from '@/hooks/useRecordNavigation';
import { logger } from '@/utils/business/logger';

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
      <Text type="secondary" style={{ fontSize: 13 }}>
        {label}
      </Text>
      <Text strong style={{ fontSize: 13, color: valueColor }}>
        {value}
      </Text>
    </div>
  );
}

/** 筹码分布面板宽度（px），与K线图并排展示 */
const CHIP_PANEL_WIDTH = 260;
/** 筹码统计面板宽度（px），位于筹码图右侧 */
const CHIP_STATS_WIDTH = 180;
/** 图表区域高度（px），两侧容器等高才能保证纵轴逐像素对齐 */
const CHART_HEIGHT = 520;
/** 默认展示最近多少根 */
const DEFAULT_VISIBLE_BARS = 120;
/** K线主图价格网格的位置，筹码面板必须与其完全一致 */
const MAIN_GRID = { top: '10%', height: '50%' };
/** 纵轴分段数，两侧保持一致以便刻度文字相同 */
const Y_SPLIT_COUNT = 5;

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

interface DailyChartModalProps {
  open: boolean;
  code: string;
  name: string;
  /** 机会分析页缓存的 K 线数据（周期为 period） */
  kline: KLineData[];
  /** kline 的实际周期，用于标题 / tooltip 文案 */
  period: KLinePeriod;
  /** 所属行业名称，由页面传入（弹窗内不额外拉取股票列表） */
  industry?: string;
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
  const { data, name, periodLabel, indicators, yRange, zoom, hoverIndex = null } = input;
  const { ma5, ma10, ma20, ma30, ma60 } = indicators.ma;
  const kdj = indicators.kdj;

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
  /** 收盘价与涨幅同源（十字星所指那一根优先），按「价格 涨幅」习惯顺序显示在涨幅左侧 */
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
      text: `${name} ${periodLabel}K（MA5 / MA10 / MA20 / MA30 / MA60）${
        closeText ? `  {chg|当前价 ${closeText}}` : ''
      }${changeText ? `  {chg|涨幅 ${changeText}}` : ''}`,
      left: 0,
      textStyle: {
        fontSize: 14,
        rich: { chg: { color: changeColor, fontSize: 15, fontWeight: 'bold' } },
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
          html += `<div>K: ${k.toFixed(2)} / D: ${d.toFixed(2)} / J: ${j.toFixed(2)}</div>`;
        }
        return html;
      },
    },
    grid: [
      { left: '8%', right: '4%', top: MAIN_GRID.top, height: MAIN_GRID.height },
      { left: '8%', right: '4%', top: '64%', height: '13%' },
      { left: '8%', right: '4%', top: '81%', height: '13%' },
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
        min: 0,
        max: 100,
        splitNumber: 2,
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
        bottom: 0,
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
        lineStyle: { width: 1, color: '#f5222d' },
        animation: false,
      },
      {
        name: 'D',
        type: 'line',
        xAxisIndex: 2,
        yAxisIndex: 2,
        data: kdj.d,
        showSymbol: false,
        lineStyle: { width: 1, color: '#1890ff' },
        animation: false,
      },
      {
        name: 'J',
        type: 'line',
        xAxisIndex: 2,
        yAxisIndex: 2,
        data: kdj.j,
        showSymbol: false,
        lineStyle: { width: 1, color: '#faad14' },
        animation: false,
      },
    ],
  };
}

export function DailyChartModal({
  open,
  code,
  name,
  kline,
  period,
  industry,
  records = [],
  onNavigate,
  onClose,
}: DailyChartModalProps) {
  const { message } = App.useApp();
  const chartRef = useRef<ReactECharts>(null);
  /** 筹码周期固定为日线口径 */
  const chipPeriod: ChipPeriod = 'day';

  /** ← / →（或底部按钮）在表格行之间切换：切换后 code / kline 变化会自动复位缩放、十字星与筹码 */
  const navigation = useRecordNavigation({
    enabled: open,
    records,
    currentCode: code,
    onNavigate,
  });

  /** 拖拽：按住标题栏可整体移动弹窗，关闭后自动复位居中 */
  const modalDrag = useModalDrag(open);

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
      hoverIndex,
    });
  }, [kline, name, periodLabel, indicators, priceRange, zoom, hoverIndex]);

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

  const handleExportChart = () => {
    const instance = chartRef.current?.getEchartsInstance();
    if (!instance) {
      message.warning('图表尚未就绪');
      return;
    }
    try {
      const dataUrl = instance.getDataURL({ type: 'png', pixelRatio: 2, backgroundColor: '#ffffff' });
      downloadDataUrl(dataUrl, `${periodLabel}K_${name || code}_${formatDate(Date.now())}.png`);
      message.success('K线图已导出');
    } catch (error) {
      logger.error('[DailyChartModal] 导出K线图失败:', error);
      message.error('导出K线图失败');
    }
  };

  return (
    <Modal
      open={open}
      onCancel={onClose}
      width={1540}
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span>{`${name || ''} ${code} K线分析`}</span>
          {industry && (
            <Tag color="blue" style={{ marginInlineEnd: 0 }}>
              {industry}
            </Tag>
          )}
          {navigation.currentIndex >= 0 && navigation.total > 1 && (
            <Text type="secondary" style={{ fontSize: 12, fontWeight: 'normal' }}>
              第 {navigation.currentIndex + 1} / {navigation.total} 只
            </Text>
          )}
        </div>
      }
      footer={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ flex: 1 }} />
          <Space size={8}>
            <Button key="export" icon={<DownloadOutlined />} onClick={handleExportChart}>
              导出K线图(PNG)
            </Button>
            <Button key="close" type="primary" onClick={onClose}>
              关闭
            </Button>
          </Space>
        </div>
      }
      modalRender={modalDrag.modalRender}
      styles={{ header: modalDrag.styles.header }}
      destroyOnHidden
      centered
    >
      <div
        style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}
      >
        {chipDate && (
          <Text type="secondary" style={{ fontSize: 13 }}>
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
      <div style={{ display: 'flex', gap: 8, height: CHART_HEIGHT }}>
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
    </Modal>
  );
}
