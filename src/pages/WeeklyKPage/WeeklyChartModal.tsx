/**
 * 周K图表弹窗：蜡烛图 + 周线均线 + 成交量 + MACD，右侧并排展示筹码分布
 *
 * 左侧K线由周线选股页面已缓存的周K数据直接传入（只有「周」一种周期，不额外发请求）；
 * 筹码分布由 `useChipDistribution` 按需拉取（默认周线口径，与周线选股页面口径一致）。
 *
 * 与机会分析页 DailyChartModal 对齐（不依赖任何 ECharts 内部 API）：
 * 1. 由当前 dataZoom 可见窗口 + 均线，在本地推导出价格上下限并取整；
 * 2. 把同一个价格区间同时赋给左侧K线主图与右侧筹码面板的纵轴；
 * 3. 两侧网格的 top/height 保持一致（容器等高，故像素范围相同）。
 * 于是「同一价格落在同一水平线」，且缩放K线时筹码面板同步重算、实时跟随；
 * 十字星移动时右侧筹码切换为对应那一周的分布。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Button, Space, Tag, Tooltip, Typography, App, Segmented, Spin } from 'antd';
import { DownloadOutlined } from '@ant-design/icons';
import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';
import type { KLineData } from '@/types/stock';
import type { ChipPeriod } from '@/types/chipDistribution';
import { calculateMA, calculateMACD } from '@/utils/analysis/indicators';
import { buildChipChartOption } from '@/utils/chart/chipChartOption';
import { calculateChipDistribution } from '@/utils/analysis/chipDistribution';
import { YI, type WeeklyAnalysis } from '@/utils/analysis/weekly';
import { formatVolume } from '@/utils/format/format';
import { downloadDataUrl } from '@/utils/export/weeklyKlineExportUtils';
import { useChipDistribution } from '@/hooks/useChipDistribution';
import { logger } from '@/utils/business/logger';

const { Text } = Typography;

/** 筹码分布面板宽度（px），与周K图并排展示 */
const CHIP_PANEL_WIDTH = 260;
/** 图表区域高度（px），两侧容器等高才能保证纵轴逐像素对齐 */
const CHART_HEIGHT = 520;
/** 默认展示最近多少根周K */
const DEFAULT_VISIBLE_BARS = 120;
/** K线主图价格网格的位置，筹码面板必须与其完全一致 */
const MAIN_GRID = { top: '10%', height: '50%' };
/** 纵轴分段数，两侧保持一致以便刻度文字相同 */
const Y_SPLIT_COUNT = 5;

interface WeeklyChartModalProps {
  open: boolean;
  code: string;
  name: string;
  kline: KLineData[];
  analysis: WeeklyAnalysis | null;
  onClose: () => void;
}

interface PriceRange {
  min: number;
  max: number;
}

interface ChartIndicators {
  ma: { ma5: number[]; ma10: number[]; ma20: number[]; ma30: number[]; ma60: number[] };
  macd: { dif: number[]; dea: number[]; macd: number[] };
}

interface WeeklyChartBuildInput {
  data: KLineData[];
  name: string;
  indicators: ChartIndicators;
  /** 与推导出的价格区间一致；null 时退回 ECharts 自适应 */
  yRange: PriceRange | null;
  zoom: { start: number; end: number };
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

function buildWeeklyChartOption(input: WeeklyChartBuildInput): EChartsOption {
  const { data, name, indicators, yRange, zoom } = input;
  const { ma5, ma10, ma20, ma30, ma60 } = indicators.ma;
  const macd = indicators.macd;

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
      text: `${name} 周K（MA5≈月线 / MA10≈季线 / MA20≈半年线 / MA60≈牛熊线）`,
      left: 0,
      textStyle: { fontSize: 14 },
    },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'cross' },
      formatter: (params: unknown) => {
        if (!Array.isArray(params) || params.length === 0) return '';
        const dataIndex = (params[0] as { dataIndex: number }).dataIndex;
        const item = data[dataIndex];
        if (!item) return '';

        let html = `<div>周: ${formatDate(item.time)}</div>`;
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
        const bar = macd.macd[dataIndex];
        if (Number.isFinite(dif) && Number.isFinite(dea)) {
          html += `<div>DIF: ${dif.toFixed(3)} / DEA: ${dea.toFixed(3)} / MACD: ${bar.toFixed(3)}</div>`;
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
        splitNumber: 2,
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { show: false },
      },
    ],
    dataZoom: [
      { type: 'inside', xAxisIndex: [0, 1, 2], start: zoom.start, end: zoom.end },
      { show: true, xAxisIndex: [0, 1, 2], type: 'slider', bottom: 0, start: zoom.start, end: zoom.end },
    ],
    series: [
      {
        name: '周K',
        type: 'candlestick',
        data: data.map((d) => [d.open, d.close, d.low, d.high]),
        itemStyle: {
          color: '#ef5350',
          color0: '#26a69a',
          borderColor: '#ef5350',
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
        name: 'MACD',
        type: 'bar',
        xAxisIndex: 2,
        yAxisIndex: 2,
        data: macd.macd,
        itemStyle: {
          color: (params: { dataIndex: number }) =>
            (macd.macd[params.dataIndex] ?? 0) >= 0 ? '#ef5350' : '#26a69a',
        },
      },
      {
        name: 'DIF',
        type: 'line',
        xAxisIndex: 2,
        yAxisIndex: 2,
        data: macd.dif,
        showSymbol: false,
        lineStyle: { width: 1, color: '#faad14' },
        animation: false,
      },
      {
        name: 'DEA',
        type: 'line',
        xAxisIndex: 2,
        yAxisIndex: 2,
        data: macd.dea,
        showSymbol: false,
        lineStyle: { width: 1, color: '#1890ff' },
        animation: false,
      },
    ],
  };
}

export function WeeklyChartModal({ open, code, name, kline, analysis, onClose }: WeeklyChartModalProps) {
  const { message } = App.useApp();
  const chartRef = useRef<ReactECharts>(null);
  const [chipPeriod, setChipPeriod] = useState<ChipPeriod>('week');

  /** 默认可见区间：最近 120 根周K（约两年多） */
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

  /** 十字星指向的筹码下标；null 表示跟随最新一周 */
  const [chipIndex, setChipIndex] = useState<number | null>(null);

  /** 按日期对齐筹码K线（两份数据起点/长度不同，不能直接用数组下标对应） */
  const chipIndexByDate = useMemo(() => {
    const map = new Map<string, number>();
    chipBars.forEach((bar, i) => map.set(bar.date, i));
    return map;
  }, [chipBars]);

  // 换股票 / 筹码数据变化时回到最新一周
  useEffect(() => {
    setChipIndex(null);
  }, [code, chipBars]);

  // 换股票 / 周K变化时把缩放窗口复位
  useEffect(() => {
    setZoom(defaultZoom(kline));
  }, [kline, defaultZoom]);

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
   * 当前展示的筹码：默认最新一周；十字星移动时切换到对应那一周。
   * 筹码算法本身是逐根累积的（第 i 根的结果 = 截断到第 i 根的中间态），
   * 因此按 index 重新推一遍即可得到「那一周」的筹码分布。
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

  /** 十字星日期 → 筹码下标（早于筹码窗口用最早一根，晚于窗口用最后一根） */
  const handleAxisPointer = useCallback(
    (params: unknown) => {
      if (chipBars.length === 0) {
        return;
      }
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
  }, []);

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
      macd: calculateMACD(kline),
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

  const option = useMemo(() => {
    if (kline.length === 0 || !indicators) {
      return null;
    }
    return buildWeeklyChartOption({ data: kline, name, indicators, yRange: priceRange, zoom });
  }, [kline, name, indicators, priceRange, zoom]);

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
      downloadDataUrl(dataUrl, `周K_${name || code}_${formatDate(Date.now())}.png`);
      message.success('周K图已导出');
    } catch (error) {
      logger.error('[WeeklyChartModal] 导出周K图失败:', error);
      message.error('导出周K图失败');
    }
  };

  return (
    <Modal
      open={open}
      onCancel={onClose}
      width={1360}
      title={`${name || ''} ${code} 周线分析`}
      footer={[
        <Button key="export" icon={<DownloadOutlined />} onClick={handleExportChart}>
          导出周K图(PNG)
        </Button>,
        <Button key="close" type="primary" onClick={onClose}>
          关闭
        </Button>,
      ]}
      destroyOnHidden
      centered
    >
      {analysis && (
        <div style={{ marginBottom: 12 }}>
          <Space wrap size={[6, 6]}>
            <Text strong>评分 {analysis.score}</Text>
            {analysis.industryName && <Tag>{analysis.industryName}</Tag>}
            {analysis.pxAboveMa8 && <Tag color="orange">站上周MA8</Tag>}
            {analysis.pxAboveMa60 && <Tag color="purple">站上60周线</Tag>}
            {analysis.ma60FlatOrUp && <Tag color="purple">60周线走平/上翘</Tag>}
            {analysis.macdBottomDivergence && <Tag color="green">MACD底背离</Tag>}
            {analysis.runningWeekIncluded && <Tag color="default">含未完成本周</Tag>}
          </Space>
          {analysis.setups.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <Space wrap size={[4, 4]}>
                {analysis.setups.map((hit) => (
                  <Tooltip key={hit.key} title={hit.reasons.join('；')}>
                    <Tag color="red">
                      {hit.label} {hit.score}/{hit.max}
                    </Tag>
                  </Tooltip>
                ))}
              </Space>
            </div>
          )}
          <div style={{ marginTop: 8 }}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              信号：{analysis.signals.join('；') || '无'}
            </Text>
          </div>
          <div style={{ marginTop: 4 }}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              乖离 {(analysis.extBias ?? 0).toFixed(2)} ATR（相对周MA20）｜周波动{' '}
              {(analysis.atrPct ?? 0).toFixed(2)}%｜周均成交额{' '}
              {analysis.avgAmount20w === undefined ? '-' : `${(analysis.avgAmount20w / YI).toFixed(1)}亿`}
              {analysis.stopLoss !== undefined && (
                <>
                  ｜参考止损 {analysis.stopLoss.toFixed(2)}
                  {analysis.riskPct !== undefined && `（风险 ${analysis.riskPct.toFixed(1)}%）`}
                </>
              )}
            </Text>
          </div>
          {analysis.warnings.length > 0 && (
            <div style={{ marginTop: 4 }}>
              <Text type="danger" style={{ fontSize: 12 }}>
                风险：{analysis.warnings.join('；')}
              </Text>
            </div>
          )}
          {analysis.exitSignals.length > 0 && (
            <div style={{ marginTop: 4 }}>
              <Text type="warning" style={{ fontSize: 12 }}>
                卖出信号：{analysis.exitSignals.join('；')}
              </Text>
            </div>
          )}
        </div>
      )}
      <div
        style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}
      >
        <Segmented
          size="small"
          value={chipPeriod}
          onChange={(value) => setChipPeriod(value as ChipPeriod)}
          options={[
            { label: '周线筹码', value: 'week' },
            { label: '日线筹码', value: 'day' },
          ]}
        />
        {chipDate && (
          <Text type="secondary" style={{ fontSize: 12 }}>
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
        {!chipLoading && chip && (
          <>
            <Text type="secondary" style={{ fontSize: 12 }}>
              获利比例{' '}
              <Text strong style={{ color: chip.benefitRatio >= 0.5 ? '#ef5350' : '#26a69a' }}>
                {(chip.benefitRatio * 100).toFixed(1)}%
              </Text>
            </Text>
            <Text type="secondary" style={{ fontSize: 12 }}>
              平均成本 <Text strong>{chip.avgCost.toFixed(2)}</Text>
            </Text>
            <Text type="secondary" style={{ fontSize: 12 }}>
              90%成本{' '}
              <Text strong>
                {chip.range90.low.toFixed(2)} ~ {chip.range90.high.toFixed(2)}
              </Text>
              （集中度 {chip.range90.concentration.toFixed(3)}）
            </Text>
            <Text type="secondary" style={{ fontSize: 12 }}>
              70%成本{' '}
              <Text strong>
                {chip.range70.low.toFixed(2)} ~ {chip.range70.high.toFixed(2)}
              </Text>
            </Text>
          </>
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
            <div style={{ paddingTop: 40, textAlign: 'center' }}>暂无周K数据</div>
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
      </div>
    </Modal>
  );
}
