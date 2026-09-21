/**
 * 筹码分布图 ECharts 配置构建器
 *
 * 供周K弹窗（WeeklyChartModal）与日K弹窗（DailyChartModal）共用。
 *
 * 视觉：价格轴在右（数字）、筹码图形在左并自左向右生长；现价以下为获利筹码（红），
 * 以上为套牢筹码（蓝）；平均成本用橙色虚线 + 右端圆圈 + 描边数字标出。
 *
 * 支持两种纵轴模式：
 * - 对齐模式（传入 `priceRange`）：纵轴改用 value 轴并直接采用左侧K线主图当前的价格区间，
 *   筹码条按真实价格定位；只要网格纵向位置（`grid.top/height`）与K线主图 grid[0] 一致，
 *   即可实现「同一价格落在同一水平线」的严格对齐。
 * - 兼容模式（不传 `priceRange`）：沿用按分箱序号均分的 category 轴。
 */

import type { EChartsOption } from 'echarts';
import type { ChipDistribution } from '@/types/chipDistribution';
import { findNearestPriceIndex } from '@/utils/analysis/chipDistribution';

/** 获利筹码（现价以下） */
const PROFIT_COLOR = 'rgba(239, 83, 80, 0.62)';
/** 套牢筹码（现价以上）：由原来的绿色改为蓝色 */
const TRAPPED_COLOR = 'rgba(44, 111, 209, 0.5)';
/** 平均成本参考线 */
const AVG_COST_COLOR = '#ff8c00';

/** 与左侧K线主图共享价格轴时的展示配置 */
export interface ChipChartOptionConfig {
  /**
   * 与左侧K线主图共享的纵轴价格区间。
   * 传入后纵轴改用 value 轴并按价格精确定位筹码条（实现水平对齐）；
   * 不传时退回按分箱序号均分的 category 轴。
   */
  priceRange?: { min: number; max: number };
  /**
   * 网格位置。对齐模式下 `top` / `height` 应与左侧K线主图的 grid[0] 保持一致，
   * 否则纵轴刻度仍会对不齐；`left` / `right` 不传时由本面板按
   * 「图形靠左、数字靠右」的版式自行决定。
   */
  grid?: {
    left?: number | string;
    right?: number | string;
    top?: number | string;
    height?: number | string;
  };
}

/** 平均成本线：橙色虚线 + 右端圆圈 + 带白色描边的数字 */
function buildAvgCostMarkLine(avgCost: number) {
  return {
    silent: true,
    symbol: ['none', 'circle'],
    symbolSize: 7,
    itemStyle: { color: '#ffffff', borderColor: AVG_COST_COLOR, borderWidth: 2 },
    lineStyle: { color: AVG_COST_COLOR, width: 1.2, type: 'dashed' as const },
    label: {
      show: true,
      position: 'end' as const,
      formatter: avgCost.toFixed(2),
      fontSize: 14,
      fontWeight: 'bold' as const,
      color: '#434343',
      // 白描边，避免与右侧价格轴数字叠在一起时糊成一团
      textBorderColor: '#ffffff',
      textBorderWidth: 3,
    },
    data: [{ yAxis: avgCost }],
  };
}

export function buildChipChartOption(
  chip: ChipDistribution,
  config: ChipChartOptionConfig = {}
): EChartsOption {
  const { prices, amounts, totalChips, avgCost, close, benefitRatio, range90 } = chip;
  const { priceRange, grid } = config;

  const maxAmount = amounts.length > 0 ? Math.max(...amounts) : 0;

  const title = {
    text: '筹码分布',
    subtext: `获利 ${(benefitRatio * 100).toFixed(1)}%`,
    left: 'center' as const,
    top: 0,
    textStyle: { fontSize: 12 },
    subtextStyle: { fontSize: 11, color: benefitRatio >= 0.5 ? '#ef5350' : '#26a69a' },
  };

  const shareOf = (amount: number) => (totalChips === 0 ? 0 : (amount / totalChips) * 100);

  // ===== 对齐模式：value 纵轴，与K线主图共享价格区间 =====
  if (priceRange && Number.isFinite(priceRange.min) && priceRange.max > priceRange.min) {
    // 单个价格分箱的高度（价格单位），用于把「分箱」画成连续柱体
    const binStep = prices.length > 1 ? Math.abs(prices[1] - prices[0]) : 0.01;
    const halfBin = (binStep > 0 ? binStep : 0.01) / 2;

    return {
      title,
      grid: {
        // 图形贴左侧、右侧留出价格数字的位置
        left: grid?.left ?? 0,
        right: grid?.right ?? 46,
        top: grid?.top ?? '10%',
        height: grid?.height ?? '50%',
      },
      tooltip: {
        trigger: 'item',
        formatter: (params: unknown) => {
          const value = (params as { value?: unknown }).value;
          if (!Array.isArray(value)) {
            return '';
          }
          const price = Number(value[0]);
          const amount = Number(value[1] ?? 0);
          return `价格 ${price.toFixed(2)}<br/>筹码占比 ${shareOf(amount).toFixed(2)}%`;
        },
      },
      xAxis: {
        type: 'value',
        min: 0,
        // 峰值恰好抵到网格右缘，与参考图一致
        max: maxAmount > 0 ? maxAmount : 1,
        inverse: false,
        show: false,
      },
      yAxis: {
        type: 'value',
        // 与K线主图完全一致的价格区间 → 同一价格必然处于同一水平线
        min: priceRange.min,
        max: priceRange.max,
        // 价格数字放在右侧
        position: 'right',
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { show: true, lineStyle: { color: '#f2f2f2' } },
        axisLabel: { fontSize: 11, color: '#8c8c8c', margin: 8 },
      },
      series: [
        {
          name: '筹码',
          type: 'custom',
          encode: { x: [1], y: [0] },
          // 每个分箱画成一个矩形：横向长度=筹码量（自左向右），纵向高度=分箱价格跨度
          renderItem: (_params: unknown, api: any) => {
            const price = Number(api.value(0));
            const amount = Number(api.value(1));
            const zeroX = api.coord([0, price])[0];
            const amountX = api.coord([amount, price])[0];
            const yHigh = api.coord([0, price + halfBin])[1];
            const yLow = api.coord([0, price - halfBin])[1];
            const left = Math.min(zeroX, amountX);
            const width = Math.abs(amountX - zeroX);
            return {
              type: 'rect',
              shape: {
                x: left,
                y: Math.min(yHigh, yLow),
                width: Math.max(width, 0.4),
                height: Math.max(Math.abs(yLow - yHigh), 0.4),
              },
              style: api.style(),
            };
          },
          data: prices.map((price, index) => ({
            value: [price, amounts[index] ?? 0],
            itemStyle: { color: price <= close ? PROFIT_COLOR : TRAPPED_COLOR },
          })),
          // 90% 成本区间：中性灰带，避免与蓝色套牢筹码混淆
          markArea: {
            silent: true,
            itemStyle: { color: 'rgba(0, 0, 0, 0.035)' },
            label: { show: false },
            data: [[{ yAxis: range90.low }, { yAxis: range90.high }]],
          },
          markLine: buildAvgCostMarkLine(avgCost),
        },
      ],
    };
  }

  // ===== 兼容模式：按分箱序号均分的 category 纵轴 =====
  const categories = prices.map((price) => price.toFixed(2));

  // 现价以下为获利筹码（红）、以上为套牢筹码（蓝）
  const breakIndex = findNearestPriceIndex(prices, close);
  const avgIndex = findNearestPriceIndex(prices, avgCost);
  const low90Index = findNearestPriceIndex(prices, range90.low);
  const high90Index = findNearestPriceIndex(prices, range90.high);

  return {
    title,
    grid: { left: 48, right: 6, top: 52, bottom: 6 },
    tooltip: {
      trigger: 'item',
      formatter: (params: unknown) => {
        const item = params as { dataIndex?: number; value?: number };
        const index = item?.dataIndex;
        if (index === undefined || index < 0) {
          return '';
        }
        return `价格 ${categories[index]}<br/>筹码占比 ${shareOf(Number(item.value ?? 0)).toFixed(2)}%`;
      },
    },
    xAxis: {
      type: 'value',
      min: 0,
      max: maxAmount > 0 ? maxAmount * 1.05 : 1,
      inverse: true,
      show: false,
    },
    yAxis: {
      type: 'category',
      data: categories,
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { show: false },
      // 150 个分箱无法全部标注，抽样展示避免文字重叠
      axisLabel: { fontSize: 10, interval: (index: number) => index % 25 === 0 },
    },
    series: [
      {
        name: '筹码',
        type: 'bar',
        data: amounts,
        // 相邻分箱连续排布，呈现柱状分布图观感
        barCategoryGap: '0%',
        itemStyle: {
          color: (params: { dataIndex: number }) =>
            params.dataIndex <= breakIndex ? PROFIT_COLOR : TRAPPED_COLOR,
        },
        // 90% 成本区间用横向色带标出
        markArea: {
          silent: true,
          itemStyle: { color: 'rgba(0, 0, 0, 0.035)' },
          label: { show: false },
          data: [[{ yAxis: low90Index }, { yAxis: high90Index }]],
        },
        markLine: {
          silent: true,
          symbol: 'none',
          label: { show: false },
          data: [{ yAxis: avgIndex, lineStyle: { color: AVG_COST_COLOR, width: 1, type: 'solid' } }],
        },
      },
    ],
  };
}
