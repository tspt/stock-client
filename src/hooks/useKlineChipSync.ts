/**
 * K 线 + 筹码抽屉的联动状态（日K抽屉 / 周K抽屉共用一份实现）
 *
 * 负责四件互相纠缠的事，缺一件对齐就会破：
 * 1. 缩放窗口（dataZoom）是左右两张图的唯一真源，`zoom` 变化驱动价格区间重算；
 * 2. 十字星悬停 → 顶部涨幅跟随该根 K 线，并按日期把右侧筹码切到那一天；
 * 3. 价格区间由「可见窗口 + 均线」推导，K 线主图与筹码面板共用同一个区间；
 * 4. 两张 ECharts 实例的持有，以及抽屉开合动画结束后的 resize（不 resize 会白屏）。
 *
 * 指标（MA / MACD / KDJ）也在这里算：价格区间必须覆盖均线，
 * 而两者必须是同一批序列，分开算既浪费又可能不一致。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RefObject } from 'react';
import type ReactECharts from 'echarts-for-react';
import type { KLineData } from '@/types/stock';
import type { ChipDistribution, ChipPeriod } from '@/types/chipDistribution';
import { calculateChipDistribution } from '@/utils/analysis/chipDistribution';
import { calculateKlineIndicators, type KlineIndicatorSeries } from '@/utils/analysis/indicators';
import { computeVisiblePriceRange, type PriceRange } from '@/utils/chart/priceRange';
import { formatKlineDate } from '@/utils/format/klineDate';
import { DEFAULT_VISIBLE_BARS, Y_SPLIT_COUNT } from '@/utils/config/stockDrawerLayout';
import { useChipDistribution } from '@/hooks/useChipDistribution';

export interface UseKlineChipSyncOptions {
  /** 当前股票代码：变化时复位缩放、十字星与筹码 */
  code: string;
  /** 左侧 K 线数据（周期由页面决定，本 hook 不关心） */
  kline: KLineData[];
  /** 筹码口径：日K抽屉传 'day'，周K抽屉传 'week' */
  chipPeriod: ChipPeriod;
  /** 抽屉是否打开（筹码按需拉取） */
  enabled: boolean;
}

export interface UseKlineChipSyncResult {
  /** 左侧 K 线画布实例 */
  chartRef: RefObject<ReactECharts>;
  /** 筹码画布实例 */
  chipChartRef: RefObject<ReactECharts>;
  /** 直接传给 `<Drawer afterOpenChange>`：开合动画结束后 resize 两张画布 */
  handleAfterOpenChange: (isOpen: boolean) => void;
  /** 直接传给 K 线图的 `onEvents` */
  chartEvents: {
    datazoom: (params: unknown) => void;
    updateAxisPointer: (params: unknown) => void;
    globalout: () => void;
  };
  /** 当前缩放窗口，供 K 线 option 构建使用 */
  zoom: { start: number; end: number };
  /** 十字星所指的 K 线下标；null 表示未悬停（顶部涨幅退回可见区间最后一根） */
  hoverIndex: number | null;
  /** 主图 / 副图 / 价格区间共用的同一批指标序列 */
  indicators: KlineIndicatorSeries | null;
  /** 左右两张图共享的价格区间；null 时退回首 ECharts 自适应 */
  priceRange: PriceRange | null;
  /** 当前展示的筹码（默认最新一根，随十字星切换） */
  chip: ChipDistribution | null;
  /** 当前筹码对应的日期 */
  chipDate?: string;
  /** 筹码是否正在跟随十字星（false = 展示最新一根） */
  isFollowingCrosshair: boolean;
  chipLoading: boolean;
  chipError: string | null;
}

/** 默认可见区间：最近 DEFAULT_VISIBLE_BARS 根 */
function buildDefaultZoom(bars: KLineData[]): { start: number; end: number } {
  const visible = Math.min(DEFAULT_VISIBLE_BARS, bars.length);
  const start = bars.length > visible ? ((bars.length - visible) / bars.length) * 100 : 0;
  return { start, end: 100 };
}

export function useKlineChipSync({
  code,
  kline,
  chipPeriod,
  enabled,
}: UseKlineChipSyncOptions): UseKlineChipSyncResult {
  const chartRef = useRef<ReactECharts>(null);
  /** 筹码分布图实例：抽屉开合动画结束后需要一并 resize */
  const chipChartRef = useRef<ReactECharts>(null);

  /** 指标只算一次，供 K 线图与价格区间共用 */
  const indicators = useMemo<KlineIndicatorSeries | null>(
    () => (kline.length === 0 ? null : calculateKlineIndicators(kline)),
    [kline]
  );

  /** 当前 dataZoom 可见窗口（百分比），是左右两张图的唯一真源 */
  const [zoom, setZoom] = useState<{ start: number; end: number }>(() => buildDefaultZoom(kline));

  const {
    distribution: latestChip,
    bars: chipBars,
    loading: chipLoading,
    error: chipError,
  } = useChipDistribution(code, chipPeriod, enabled);

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

  // 换股票 / K线变化时把缩放窗口复位
  useEffect(() => {
    setZoom(buildDefaultZoom(kline));
  }, [kline]);

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

  /** 当前筹码对应的日期（null 与 undefined 统一成 undefined，供 JSX 条件渲染） */
  const chipDate =
    resolvedChipIndex >= 0 ? (chipBars[resolvedChipIndex]?.date ?? undefined) : undefined;

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
          : kline.findIndex((item) => formatKlineDate(item.time) === raw);
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

      const date = formatKlineDate(bar.time);
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

  /** 可见区间对应的价格上下限：左右两张图共用，保证同一价格同一水平线 */
  const priceRange = useMemo<PriceRange | null>(
    () =>
      computeVisiblePriceRange({
        kline,
        // 均线可能冲出K线高低点（如下跌初期的MA60），一并纳入
        maSeries: indicators
          ? [
              indicators.ma.ma5,
              indicators.ma.ma10,
              indicators.ma.ma20,
              indicators.ma.ma30,
              indicators.ma.ma60,
            ]
          : [],
        zoom,
        splitCount: Y_SPLIT_COUNT,
      }),
    [kline, indicators, zoom]
  );

  /**
   * 抽屉滑入动画结束后触发一次 ECharts resize：
   * Drawer 容器在开合过程中尺寸可能尚未就绪，不 resize 会出现空白画布。
   */
  const handleAfterOpenChange = useCallback((isOpen: boolean) => {
    if (!isOpen) return;
    chartRef.current?.getEchartsInstance()?.resize();
    chipChartRef.current?.getEchartsInstance()?.resize();
  }, []);

  return {
    chartRef,
    chipChartRef,
    handleAfterOpenChange,
    chartEvents,
    zoom,
    hoverIndex,
    indicators,
    priceRange,
    chip,
    chipDate,
    isFollowingCrosshair: resolvedChipIndex !== chipBars.length - 1,
    chipLoading,
    chipError,
  };
}
