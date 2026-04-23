/**
 * K线图组件
 */

import { useMemo, useRef } from 'react';
import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';
import type { KLineData, KLinePeriod } from '@/types/stock';
import { calculateAllMA, calculateKDJ, calculateAllRSI } from '@/utils/analysis/indicators';
import { formatVolume } from '@/utils/format/format';
import { detectCandlestickPatternsInWindow, type CandlestickPatternResult } from '@/utils/analysis/candlestickPatterns';
import { getMultiplePatternsSVG, type CandlestickPatternType } from '@/utils/analysis/candlestickPatternSVGs';
import styles from './KLineChart.module.css';

interface KLineChartProps {
  /** K线数据 */
  data: KLineData[];
  /** 周期 */
  period: KLinePeriod;
  /** 加载状态 */
  loading?: boolean;
}

/**
 * 获取指定位置检测到的形态列表
 * 针对当前位置进行形态检测，而不是使用全局预计算结果
 */
function getPatternsAtIndex(
  patterns: CandlestickPatternResult,
  index: number,
  data: KLineData[]
): CandlestickPatternType[] {
  const result: CandlestickPatternType[] = [];

  if (index < 0 || index >= data.length) {
    return result;
  }

  // 单根形态：检查当前K线是否符合形态特征
  if (patterns.hammer) {
    const kline = data[index];
    const body = Math.abs(kline.close - kline.open);
    const lowerShadow = Math.min(kline.close, kline.open) - kline.low;
    const upperShadow = kline.high - Math.max(kline.close, kline.open);
    const range = kline.high - kline.low;

    if (range > 0 && body < range * 0.33 && lowerShadow >= body * 2 && upperShadow < range * 0.33) {
      result.push('hammer');
    }
  }

  if (patterns.shootingStar) {
    const kline = data[index];
    const body = Math.abs(kline.close - kline.open);
    const lowerShadow = Math.min(kline.close, kline.open) - kline.low;
    const upperShadow = kline.high - Math.max(kline.close, kline.open);
    const range = kline.high - kline.low;

    if (range > 0 && body < range * 0.33 && upperShadow >= body * 2 && lowerShadow < range * 0.33) {
      result.push('shootingStar');
    }
  }

  if (patterns.doji) {
    const kline = data[index];
    const body = Math.abs(kline.close - kline.open);
    const range = kline.high - kline.low;

    if (range > 0 && body / range < 0.1) {
      result.push('doji');
    }
  }

  // 新增形态检测
  if (patterns.invertedHammer) {
    const kline = data[index];
    const body = Math.abs(kline.close - kline.open);
    const lowerShadow = Math.min(kline.close, kline.open) - kline.low;
    const upperShadow = kline.high - Math.max(kline.close, kline.open);
    const range = kline.high - kline.low;

    if (range > 0 && body < range * 0.33 && upperShadow >= body * 2 && lowerShadow < range * 0.33) {
      result.push('invertedHammer');
    }
  }

  if (patterns.hangingMan) {
    const kline = data[index];
    const body = Math.abs(kline.close - kline.open);
    const lowerShadow = Math.min(kline.close, kline.open) - kline.low;
    const upperShadow = kline.high - Math.max(kline.close, kline.open);
    const range = kline.high - kline.low;

    if (range > 0 && body < range * 0.33 && lowerShadow >= body * 2 && upperShadow < range * 0.33) {
      result.push('hangingMan');
    }
  }

  if (patterns.dragonflyDoji) {
    const kline = data[index];
    const body = Math.abs(kline.close - kline.open);
    const range = kline.high - kline.low;
    const openCloseAvg = (kline.open + kline.close) / 2;

    if (range > 0 && body / range < 0.05 &&
      kline.high - openCloseAvg <= range * 0.1 &&
      (openCloseAvg - kline.low) >= range * 0.5) {
      result.push('dragonflyDoji');
    }
  }

  if (patterns.gravestoneDoji) {
    const kline = data[index];
    const body = Math.abs(kline.close - kline.open);
    const range = kline.high - kline.low;
    const openCloseAvg = (kline.open + kline.close) / 2;

    if (range > 0 && body / range < 0.05 &&
      openCloseAvg - kline.low <= range * 0.1 &&
      (kline.high - openCloseAvg) >= range * 0.5) {
      result.push('gravestoneDoji');
    }
  }

  // 双根形态：检查当前K线和前一根K线
  if (index >= 1) {
    const prev = data[index - 1];
    const curr = data[index];

    if (patterns.engulfingBullish) {
      const prevIsBearish = prev.close < prev.open;
      const currIsBullish = curr.close > curr.open;
      const currBody = Math.abs(curr.close - curr.open);
      const prevBody = Math.abs(prev.close - prev.open);

      if (prevIsBearish && currIsBullish && currBody > prevBody &&
        curr.open <= prev.close && curr.close >= prev.open) {
        result.push('engulfingBullish');
      }
    }

    if (patterns.engulfingBearish) {
      const prevIsBullish = prev.close > prev.open;
      const currIsBearish = curr.close < curr.open;
      const currBody = Math.abs(curr.close - curr.open);
      const prevBody = Math.abs(prev.close - prev.open);

      if (prevIsBullish && currIsBearish && currBody > prevBody &&
        curr.open >= prev.close && curr.close <= prev.open) {
        result.push('engulfingBearish');
      }
    }

    if (patterns.haramiBullish) {
      const prevIsBullish = prev.close > prev.open;
      const currIsBearish = curr.close < curr.open;
      const currBody = Math.abs(curr.close - curr.open);
      const prevBody = Math.abs(prev.close - prev.open);

      if (prevIsBullish && currIsBearish && currBody < prevBody * 0.5) {
        result.push('haramiBullish');
      }
    }

    if (patterns.haramiBearish) {
      const prevIsBearish = prev.close < prev.open;
      const currIsBullish = curr.close > curr.open;
      const currBody = Math.abs(curr.close - curr.open);
      const prevBody = Math.abs(prev.close - prev.open);

      if (prevIsBearish && currIsBullish && currBody < prevBody * 0.5) {
        result.push('haramiBearish');
      }
    }

    if (patterns.darkCloudCover) {
      const prevIsBullish = prev.close > prev.open;
      const currIsBearish = curr.close < curr.open;
      const prevMidpoint = (prev.open + prev.close) / 2;

      if (prevIsBullish && currIsBearish && curr.open > prev.high && curr.close < prevMidpoint) {
        result.push('darkCloudCover');
      }
    }

    if (patterns.piercing) {
      const prevIsBearish = prev.close < prev.open;
      const currIsBullish = curr.close > curr.open;
      const prevMidpoint = (prev.open + prev.close) / 2;

      if (prevIsBearish && currIsBullish && curr.open < prev.low && curr.close > prevMidpoint) {
        result.push('piercing');
      }
    }
  }

  // 三根形态：检查当前K线和前两根K线
  if (index >= 2) {
    const first = data[index - 2];
    const second = data[index - 1];
    const third = data[index];

    if (patterns.morningStar) {
      const firstIsBearish = first.close < first.open;
      const secondBody = Math.abs(second.close - second.open);
      const firstBody = Math.abs(first.close - first.open);
      const secondIsSmall = secondBody < firstBody * 0.5;
      const thirdIsBullish = third.close > third.open;
      const firstMidpoint = (first.open + first.close) / 2;
      const thirdAboveMid = third.close > firstMidpoint;

      if (firstIsBearish && secondIsSmall && thirdIsBullish && thirdAboveMid) {
        result.push('morningStar');
      }
    }

    if (patterns.eveningStar) {
      const firstIsBullish = first.close > first.open;
      const secondBody = Math.abs(second.close - second.open);
      const firstBody = Math.abs(first.close - first.open);
      const secondIsSmall = secondBody < firstBody * 0.5;
      const thirdIsBearish = third.close < third.open;
      const firstMidpoint = (first.open + first.close) / 2;
      const thirdBelowMid = third.close < firstMidpoint;

      if (firstIsBullish && secondIsSmall && thirdIsBearish && thirdBelowMid) {
        result.push('eveningStar');
      }
    }

    if (patterns.threeBlackCrows) {
      const allBearish = first.close < first.open && second.close < second.open && third.close < third.open;
      const descendingClose = first.close > second.close && second.close > third.close;

      if (allBearish && descendingClose) {
        result.push('threeBlackCrows');
      }
    }

    if (patterns.threeWhiteSoldiers) {
      const allBullish = first.close > first.open && second.close > second.open && third.close > third.open;
      const ascendingClose = first.close < second.close && second.close < third.close;

      if (allBullish && ascendingClose) {
        result.push('threeWhiteSoldiers');
      }
    }
  }

  return result;
}

function buildKLineChartOption(data: KLineData[], period: KLinePeriod, patternsCache?: Map<number, CandlestickPatternType[]>): EChartsOption {
  const maData = calculateAllMA(data);
  const kdjData = calculateKDJ(data);
  const rsiData = calculateAllRSI(data);

  // 预计算形态检测结果（回溯窗口20根）
  const patterns = detectCandlestickPatternsInWindow(data, 20);

  // 如果没有传入缓存，则创建新的缓存
  const cache = patternsCache || new Map<number, CandlestickPatternType[]>();
  if (!patternsCache) {
    for (let i = 0; i < data.length; i++) {
      cache.set(i, getPatternsAtIndex(patterns, i, data));
    }
  }

  const klineData = data.map((item) => [
    item.open,
    item.close,
    item.low,
    item.high,
  ]);

  const timeFormatter = (time: number) => {
    const date = new Date(time);
    if (period === 'day' || period === 'week' || period === 'month' || period === 'year') {
      return `${date.getMonth() + 1}-${date.getDate()}`;
    }
    return `${date.getHours()}:${date.getMinutes().toString().padStart(2, '0')}`;
  };

  const timeFormatterFull = (time: number) => {
    const date = new Date(time);
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');

    if (period === 'day' || period === 'week' || period === 'month' || period === 'year') {
      return `${year}-${month}-${day}`;
    }
    return `${year}-${month}-${day} ${hours}:${minutes}`;
  };

  return {
    title: {
      text: 'K线图',
      left: 0,
    },
    tooltip: {
      trigger: 'axis',
      axisPointer: {
        type: 'cross',
      },
      formatter: (params: unknown) => {
        if (!Array.isArray(params)) return '';
        const dataIndex = (params[0] as { dataIndex: number }).dataIndex;
        const item = data[dataIndex];
        if (!item) return '';

        let html = `<div>时间: ${timeFormatterFull(item.time)}</div>`;
        html += `<div>开: ${item.open.toFixed(2)}</div>`;
        html += `<div>收: ${item.close.toFixed(2)}</div>`;
        html += `<div>高: ${item.high.toFixed(2)}</div>`;
        html += `<div>低: ${item.low.toFixed(2)}</div>`;
        html += `<div>量: ${formatVolume(item.volume)}</div>`;

        const maPeriods = [5, 10, 20, 30, 60, 120, 240, 360];
        for (const n of maPeriods) {
          const maKey = `ma${n}` as keyof typeof maData;
          if (maData[maKey] && !isNaN(maData[maKey][dataIndex])) {
            html += `<div>MA${n}: ${maData[maKey][dataIndex].toFixed(2)}</div>`;
          }
        }

        if (kdjData.k[dataIndex] !== undefined && !isNaN(kdjData.k[dataIndex])) {
          html += `<div>K: ${kdjData.k[dataIndex].toFixed(2)}</div>`;
          html += `<div>D: ${kdjData.d[dataIndex].toFixed(2)}</div>`;
          html += `<div>J: ${kdjData.j[dataIndex].toFixed(2)}</div>`;
        }

        if (rsiData.rsi6 && !isNaN(rsiData.rsi6[dataIndex])) {
          html += `<div>RSI6: ${rsiData.rsi6[dataIndex].toFixed(2)}</div>`;
        }
        if (rsiData.rsi12 && !isNaN(rsiData.rsi12[dataIndex])) {
          html += `<div>RSI12: ${rsiData.rsi12[dataIndex].toFixed(2)}</div>`;
        }
        if (rsiData.rsi24 && !isNaN(rsiData.rsi24[dataIndex])) {
          html += `<div>RSI24: ${rsiData.rsi24[dataIndex].toFixed(2)}</div>`;
        }

        // 形态检测 - 使用预计算缓存，提高性能
        const detectedPatterns = cache.get(dataIndex);
        if (detectedPatterns && detectedPatterns.length > 0) {
          html += getMultiplePatternsSVG(detectedPatterns);
        }

        return html;
      },
    },
    grid: [
      {
        left: '10%',
        right: '8%',
        top: '15%',
        height: '40%',
      },
      {
        left: '10%',
        right: '8%',
        top: '58%',
        height: '12%',
      },
      {
        left: '10%',
        right: '8%',
        top: '73%',
        height: '12%',
      },
      {
        left: '10%',
        right: '8%',
        top: '88%',
        height: '12%',
      },
    ],
    xAxis: [
      {
        type: 'category',
        data: data.map((item) => timeFormatter(item.time)),
        boundaryGap: false,
        axisLine: { onZero: false },
        splitLine: { show: false },
      },
      {
        type: 'category',
        gridIndex: 1,
        data: data.map((item) => timeFormatter(item.time)),
        boundaryGap: false,
        axisLine: { onZero: false },
        axisTick: { show: false },
        splitLine: { show: false },
      },
      {
        type: 'category',
        gridIndex: 2,
        data: data.map((item) => timeFormatter(item.time)),
        boundaryGap: false,
        axisLine: { onZero: false },
        axisTick: { show: false },
        splitLine: { show: false },
      },
      {
        type: 'category',
        gridIndex: 3,
        data: data.map((item) => timeFormatter(item.time)),
        boundaryGap: false,
        axisLine: { onZero: false },
        axisTick: { show: false },
        splitLine: { show: false },
      },
    ],
    yAxis: [
      {
        scale: true,
        splitArea: {
          show: true,
        },
      },
      {
        scale: true,
        gridIndex: 1,
        splitNumber: 2,
        axisLabel: {
          show: true,
          formatter: (value: number) => formatVolume(value),
        },
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { show: false },
      },
      {
        scale: true,
        gridIndex: 2,
        splitNumber: 2,
        min: 0,
        max: 100,
        axisLabel: { show: true },
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { show: false },
      },
      {
        scale: true,
        gridIndex: 3,
        splitNumber: 2,
        min: 0,
        max: 100,
        axisLabel: { show: true },
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { show: false },
      },
    ],
    dataZoom: [
      {
        type: 'inside',
        xAxisIndex: [0, 1, 2, 3],
        start: 80,
        end: 100,
      },
      {
        show: true,
        xAxisIndex: [0, 1, 2, 3],
        type: 'slider',
        bottom: '2%',
        start: 80,
        end: 100,
      },
    ],
    series: [
      {
        name: 'K线',
        type: 'candlestick',
        data: klineData,
        itemStyle: {
          color: '#ef5350',
          color0: '#26a69a',
          borderColor: '#ef5350',
          borderColor0: '#26a69a',
        },
      },
      ...Object.entries(maData).map(([key, values]) => ({
        name: key.toUpperCase(),
        type: 'line' as const,
        data: values,
        smooth: false,
        lineStyle: { width: 1 },
        showSymbol: false,
        symbol: 'none',
        symbolSize: 0,
        animation: false,
      })),
      {
        name: '成交量',
        type: 'bar',
        xAxisIndex: 1,
        yAxisIndex: 1,
        data: data.map((item) => item.volume),
        itemStyle: {
          color: (params: { dataIndex: number }) => {
            const dataIndex = params.dataIndex;
            const row = data[dataIndex];
            return row && row.close >= row.open ? '#ef5350' : '#26a69a';
          },
        },
      },
      {
        name: 'K',
        type: 'line' as const,
        xAxisIndex: 2,
        yAxisIndex: 2,
        data: kdjData.k,
        smooth: false,
        lineStyle: { width: 1, color: '#ff6b6b' },
        showSymbol: false,
        symbol: 'none',
        symbolSize: 0,
        animation: false,
      },
      {
        name: 'D',
        type: 'line' as const,
        xAxisIndex: 2,
        yAxisIndex: 2,
        data: kdjData.d,
        smooth: false,
        lineStyle: { width: 1, color: '#4ecdc4' },
        showSymbol: false,
        symbol: 'none',
        symbolSize: 0,
        animation: false,
      },
      {
        name: 'J',
        type: 'line' as const,
        xAxisIndex: 2,
        yAxisIndex: 2,
        data: kdjData.j,
        smooth: false,
        lineStyle: { width: 1, color: '#ffe66d' },
        showSymbol: false,
        symbol: 'none',
        symbolSize: 0,
        animation: false,
      },
      {
        name: 'RSI6',
        type: 'line' as const,
        xAxisIndex: 3,
        yAxisIndex: 3,
        data: rsiData.rsi6 || [],
        smooth: false,
        lineStyle: { width: 1, color: '#ff6b6b' },
        showSymbol: false,
        symbol: 'none',
        symbolSize: 0,
        animation: false,
      },
      {
        name: 'RSI12',
        type: 'line' as const,
        xAxisIndex: 3,
        yAxisIndex: 3,
        data: rsiData.rsi12 || [],
        smooth: false,
        lineStyle: { width: 1, color: '#4ecdc4' },
        showSymbol: false,
        symbol: 'none',
        symbolSize: 0,
        animation: false,
      },
      {
        name: 'RSI24',
        type: 'line' as const,
        xAxisIndex: 3,
        yAxisIndex: 3,
        data: rsiData.rsi24 || [],
        smooth: false,
        lineStyle: { width: 1, color: '#ffe66d' },
        showSymbol: false,
        symbol: 'none',
        symbolSize: 0,
        animation: false,
      },
    ],
  };
}

export function KLineChart({
  data,
  period,
  loading = false,
}: KLineChartProps) {
  const chartRef = useRef<ReactECharts>(null);

  // 预计算形态检测结果（回溯窗口20根）
  const patterns = useMemo(() =>
    data?.length ? detectCandlestickPatternsInWindow(data, 20) : null,
    [data]
  );

  // 为每个位置预计算形态结果，避免重复计算
  const patternsCache = useMemo(() => {
    if (!data || !patterns) return undefined;
    const cache = new Map<number, CandlestickPatternType[]>();
    for (let i = 0; i < data.length; i++) {
      cache.set(i, getPatternsAtIndex(patterns, i, data));
    }
    return cache;
  }, [data, patterns]);

  const option = useMemo(
    () => (data?.length ? buildKLineChartOption(data, period, patternsCache) : null),
    [data, period, patternsCache]
  );

  if (!data || data.length === 0) {
    return (
      <div className={styles.klineChart}>
        {loading ? (
          <div className={styles.loading}>加载中...</div>
        ) : (
          <div className={styles.loading}>暂无数据</div>
        )}
      </div>
    );
  }

  return (
    <div className={styles.klineChart}>
      {loading && <div className={styles.loading}>加载中...</div>}
      <ReactECharts
        ref={chartRef}
        option={option!}
        lazyUpdate
        style={{ height: '100%', width: '100%' }}
        opts={{ renderer: 'canvas' }}
      />
    </div>
  );
}
