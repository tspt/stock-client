/**
 * 股票 K 线 ECharts 配置构建器（日K抽屉 / 周K抽屉共用）
 *
 * 固定四段：主图（蜡烛 + 均线 + 价格轴）/ 成交量 / MACD / KDJ。
 * 与右侧筹码面板只共享两样东西——「主图网格像素位置」与「价格区间」，
 * 只要 grid[0] 的 top/height 与筹码面板一致，同一价格就落在同一水平线。
 *
 * 两个入口的差异全部收敛到参数上：
 * - `periodLabel`：同时决定 tooltip 首行与 K 线 series 名（日线传「日 / 60分钟」，周线传「周」）
 * - `titleChgBold`：周线标题里的当前价 / 涨幅加粗，日线不加粗
 */

import type { EChartsOption } from 'echarts';
import type { KLineData } from '@/types/stock';
import type { KlineIndicatorSeries } from '@/utils/analysis/indicators';
import type { PriceRange } from '@/utils/chart/priceRange';
import { CHART_FALL_COLOR, CHART_RISE_COLOR } from '@/utils/config/chartColors';
import { formatVolume } from '@/utils/format/format';
import { formatKlineDate } from '@/utils/format/klineDate';
import {
  GRID_LEFT,
  GRID_RIGHT,
  KDJ_GRID,
  MACD_GRID,
  MAIN_GRID,
  VOLUME_GRID,
  Y_SPLIT_COUNT,
  ZOOM_SLIDER_BOTTOM,
  ZOOM_SLIDER_HEIGHT,
} from '@/utils/config/stockDrawerLayout';

/** 阳线（红）空心 / 阴线（绿）实心：色值取全项目统一色源，勿在此另写十六进制 */
const UP_COLOR = CHART_RISE_COLOR;
const DOWN_COLOR = CHART_FALL_COLOR;

/** 涨跌配色：同时用于蜡烛（阳线描边 / 阴线实心）与成交量柱 */
export interface UpDownColors {
  up: string;
  down: string;
}

/** 默认涨跌配色：红涨绿跌 */
const DEFAULT_UP_DOWN_COLORS: UpDownColors = { up: UP_COLOR, down: DOWN_COLOR };

/**
 * MACD 快慢线配色：快线（DIF）蓝、慢线（DEA）橙，与 KDJ 的蓝/橙口径保持一致；
 * 深色主题下整体提亮，避免颜色淹没在深色背景里。
 */
const MACD_COLOR = {
  light: { dif: '#1677ff', dea: '#fa8c16' },
  dark: { dif: '#4096ff', dea: '#ffa940' },
} as const;

/**
 * KDJ 三线配色：K 蓝 / D 橙 / J 黑。
 * J 是摆动最剧烈、最需要一眼看到的那条线，用黑色压住；深色主题下换成浅灰，避免黑线淹没在深色背景里。
 */
const KDJ_COLOR = {
  light: { k: '#1677ff', d: '#fa8c16', j: '#000000' },
  dark: { k: '#4096ff', d: '#ffa940', j: '#f0f0f0' },
} as const;

export interface StockKlineOptionInput {
  data: KLineData[];
  indicators: KlineIndicatorSeries;
  /** 与调用方推导的价格区间一致；null 时退回 ECharts 自适应 */
  yRange: PriceRange | null;
  /** 当前 dataZoom 可见窗口（百分比） */
  zoom: { start: number; end: number };
  /** 是否深色主题：决定副图配色（黑色线条在深色底不可见） */
  isDark: boolean;
  /** 十字星指向的 K 线下标；null 时涨幅退回可见区间最后一根 */
  hoverIndex?: number | null;
  /** 周期中文标签：同时决定 tooltip 首行与 K 线 series 名 */
  periodLabel: string;
  /** 标题里的当前价 / 涨幅是否加粗（周线为 true） */
  titleChgBold?: boolean;
  /** 蜡烛 / 成交量柱的涨跌配色；不传时使用默认红涨绿跌 */
  upDownColors?: UpDownColors;
}

export function buildStockKlineOption(input: StockKlineOptionInput): EChartsOption {
  const {
    data,
    indicators,
    yRange,
    zoom,
    isDark,
    hoverIndex = null,
    periodLabel,
    titleChgBold = false,
    upDownColors = DEFAULT_UP_DOWN_COLORS,
  } = input;
  const { ma5, ma10, ma20, ma30, ma60 } = indicators.ma;
  const macd = indicators.macd;
  const kdj = indicators.kdj;
  const macdColor = isDark ? MACD_COLOR.dark : MACD_COLOR.light;
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
   * 涨幅取「当前可见区间最后一根」相对前一根的涨跌，随 dataZoom 缩放 / 平移动态变化；
   * 鼠标悬停时改为跟随十字星所指那一根。
   * 索引换算方式与 ECharts dataZoom 百分比一致（percent / 100 × (len - 1)）。
   */
  const visibleEndIndex =
    data.length === 0
      ? -1
      : Math.min(data.length - 1, Math.max(0, Math.round((zoom.end / 100) * (data.length - 1))));
  const changeIndex =
    hoverIndex !== null && hoverIndex >= 0 && hoverIndex < data.length ? hoverIndex : visibleEndIndex;
  const lastBar = changeIndex >= 0 ? data[changeIndex] : undefined;
  const prevBar = changeIndex > 0 ? data[changeIndex - 1] : undefined;
  const changePct =
    lastBar && prevBar && prevBar.close > 0
      ? ((lastBar.close - prevBar.close) / prevBar.close) * 100
      : null;
  const changeText = changePct === null ? '' : `${changePct >= 0 ? '+' : ''}${changePct.toFixed(2)}%`;
  const changeColor = changePct !== null && changePct < 0 ? DOWN_COLOR : UP_COLOR;
  /** 当前价（收盘价）与涨幅同源（十字星所指那一根优先），显示在涨幅左侧 */
  const closeText = lastBar ? lastBar.close.toFixed(2) : '';

  /** 三个副图共用同一份横轴类目，boundaryGap 关闭保证蜡烛与量柱左右对齐 */
  const timeAxis = (gridIndex?: number) => ({
    type: 'category' as const,
    ...(gridIndex === undefined ? {} : { gridIndex }),
    data: data.map((d) => formatKlineDate(d.time)),
    boundaryGap: false,
    axisLine: { onZero: false },
    axisTick: { show: false },
    axisLabel: { show: false },
    splitLine: { show: false },
  });

  return {
    title: {
      text: `${closeText ? `  {chg|当前价 ${closeText}}` : ''}${
        changeText ? `  {chg|涨幅 ${changeText}}` : ''
      }`,
      left: 0,
      textStyle: {
        fontSize: 14,
        rich: {
          chg: { color: changeColor, fontSize: 15, fontWeight: titleChgBold ? 'bold' : 'normal' },
        },
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

        let html = `<div>${periodLabel}: ${formatKlineDate(item.time)}</div>`;
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

        const dif = macd.dif[dataIndex];
        const dea = macd.dea[dataIndex];
        const macdBar = macd.macd[dataIndex];
        if (Number.isFinite(dif) && Number.isFinite(dea)) {
          // 数值颜色与副图线条一一对应，配合图表上方的颜色说明即可确认哪条线是哪个值
          html += `<div><span style="color:${macdColor.dif}">DIF: ${dif.toFixed(3)}</span> / <span style="color:${macdColor.dea}">DEA: ${dea.toFixed(3)}</span> / MACD: ${Number.isFinite(macdBar) ? macdBar.toFixed(3) : '-'}</div>`;
        }

        const k = kdj.k[dataIndex];
        const d = kdj.d[dataIndex];
        const j = kdj.j[dataIndex];
        if (Number.isFinite(k) && Number.isFinite(d)) {
          html += `<div><span style="color:${kdjColor.k}">K: ${k.toFixed(2)}</span> / <span style="color:${kdjColor.d}">D: ${d.toFixed(2)}</span> / <span style="color:${kdjColor.j}">J: ${Number.isFinite(j) ? j.toFixed(2) : '-'}</span></div>`;
        }
        return html;
      },
    },
    grid: [
      { left: GRID_LEFT, right: GRID_RIGHT, top: MAIN_GRID.top, height: MAIN_GRID.height },
      { left: GRID_LEFT, right: GRID_RIGHT, top: VOLUME_GRID.top, height: VOLUME_GRID.height },
      { left: GRID_LEFT, right: GRID_RIGHT, top: MACD_GRID.top, height: MACD_GRID.height },
      { left: GRID_LEFT, right: GRID_RIGHT, top: KDJ_GRID.top, height: KDJ_GRID.height },
    ],
    xAxis: [timeAxis(), timeAxis(1), timeAxis(2), timeAxis(3)],
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
        // 副图只有 58px 高，刻度重叠时自动隐藏，避免数字叠在一起
        splitNumber: 2,
        axisLabel: { show: true, hideOverlap: true },
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { show: false },
      },
      {
        scale: true,
        gridIndex: 3,
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
      { type: 'inside', xAxisIndex: [0, 1, 2, 3], start: zoom.start, end: zoom.end },
      {
        show: true,
        xAxisIndex: [0, 1, 2, 3],
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
          // 阳线空心：内部透明、仅描边
          color: 'transparent',
          borderColor: upDownColors.up,
          borderWidth: 1,
          // 阴线保持实心
          color0: upDownColors.down,
          borderColor0: upDownColors.down,
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
            return row && row.close >= row.open ? upDownColors.up : upDownColors.down;
          },
        },
      },
      {
        name: 'MACD',
        type: 'bar',
        xAxisIndex: 2,
        yAxisIndex: 2,
        data: macd.macd,
        itemStyle: {
          // 与蜡烛 / 成交量柱共用涨跌配色，低调配色模式下一起变灰黑
          color: (params: { dataIndex: number }) =>
            (macd.macd[params.dataIndex] ?? 0) >= 0 ? upDownColors.up : upDownColors.down,
        },
      },
      {
        name: 'DIF',
        type: 'line',
        xAxisIndex: 2,
        yAxisIndex: 2,
        data: macd.dif,
        showSymbol: false,
        // itemStyle.color 同时决定图例色块，保证图例与线条颜色一致
        itemStyle: { color: macdColor.dif },
        lineStyle: { width: 1.5, color: macdColor.dif },
        animation: false,
      },
      {
        name: 'DEA',
        type: 'line',
        xAxisIndex: 2,
        yAxisIndex: 2,
        data: macd.dea,
        showSymbol: false,
        itemStyle: { color: macdColor.dea },
        lineStyle: { width: 1.5, color: macdColor.dea },
        animation: false,
      },
      {
        name: 'K',
        type: 'line',
        xAxisIndex: 3,
        yAxisIndex: 3,
        data: kdj.k,
        showSymbol: false,
        itemStyle: { color: kdjColor.k },
        lineStyle: { width: 1.5, color: kdjColor.k },
        animation: false,
      },
      {
        name: 'D',
        type: 'line',
        xAxisIndex: 3,
        yAxisIndex: 3,
        data: kdj.d,
        showSymbol: false,
        itemStyle: { color: kdjColor.d },
        lineStyle: { width: 1.5, color: kdjColor.d },
        animation: false,
      },
      {
        name: 'J',
        type: 'line',
        xAxisIndex: 3,
        yAxisIndex: 3,
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
