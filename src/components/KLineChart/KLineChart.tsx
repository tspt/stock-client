/**
 * K线图组件
 */

import { useRef } from 'react';
import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';
import type { KLineData, KLinePeriod } from '@/types/stock';
import { calculateAllMA, calculateKDJ, calculateAllRSI } from '@/utils/indicators';
import { formatVolume } from '@/utils/format';
import styles from './KLineChart.module.css';

interface KLineChartProps {
  /** K线数据 */
  data: KLineData[];
  /** 周期 */
  period: KLinePeriod;
  /** 加载状态 */
  loading?: boolean;
}

export function KLineChart({
  data,
  period,
  loading = false,
}: KLineChartProps) {
  const chartRef = useRef<ReactECharts>(null);

  // 如果没有数据，显示空状态
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

  // 计算技术指标
  const maData = calculateAllMA(data);
  const kdjData = calculateKDJ(data);
  const rsiData = calculateAllRSI(data);

  // 准备K线数据
  // ECharts candlestick 需要格式：[open, close, low, high]
  const klineData = data.map((item) => [
    item.open,
    item.close,
    item.low,
    item.high,
  ]);

  // 时间格式化（用于X轴显示）
  const timeFormatter = (time: number) => {
    const date = new Date(time);
    if (period === 'day' || period === 'week' || period === 'month' || period === 'year') {
      return `${date.getMonth() + 1}-${date.getDate()}`;
    }
    return `${date.getHours()}:${date.getMinutes().toString().padStart(2, '0')}`;
  };

  // 时间格式化（用于Tooltip显示，包含完整年月日）
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

  const option: EChartsOption = {
    title: {
      text: 'K线图',
      left: 0,
    },
    tooltip: {
      trigger: 'axis',
      axisPointer: {
        type: 'cross',
      },
      formatter: (params: any) => {
        if (!Array.isArray(params)) return '';
        const dataIndex = params[0].dataIndex;
        const item = data[dataIndex];
        if (!item) return '';

        let html = `<div>时间: ${timeFormatterFull(item.time)}</div>`;
        html += `<div>开: ${item.open.toFixed(2)}</div>`;
        html += `<div>收: ${item.close.toFixed(2)}</div>`;
        html += `<div>高: ${item.high.toFixed(2)}</div>`;
        html += `<div>低: ${item.low.toFixed(2)}</div>`;
        html += `<div>量: ${formatVolume(item.volume)}</div>`;

        // 添加所有MA数据
        const maPeriods = [5, 10, 20, 30, 60, 120, 240, 360];
        for (const period of maPeriods) {
          const maKey = `ma${period}` as keyof typeof maData;
          if (maData[maKey] && !isNaN(maData[maKey][dataIndex])) {
            html += `<div>MA${period}: ${maData[maKey][dataIndex].toFixed(2)}</div>`;
          }
        }

        // 添加KDJ数据
        if (kdjData.k[dataIndex] !== undefined && !isNaN(kdjData.k[dataIndex])) {
          html += `<div>K: ${kdjData.k[dataIndex].toFixed(2)}</div>`;
          html += `<div>D: ${kdjData.d[dataIndex].toFixed(2)}</div>`;
          html += `<div>J: ${kdjData.j[dataIndex].toFixed(2)}</div>`;
        }

        // 添加RSI数据
        if (rsiData.rsi6 && !isNaN(rsiData.rsi6[dataIndex])) {
          html += `<div>RSI6: ${rsiData.rsi6[dataIndex].toFixed(2)}</div>`;
        }
        if (rsiData.rsi12 && !isNaN(rsiData.rsi12[dataIndex])) {
          html += `<div>RSI12: ${rsiData.rsi12[dataIndex].toFixed(2)}</div>`;
        }
        if (rsiData.rsi24 && !isNaN(rsiData.rsi24[dataIndex])) {
          html += `<div>RSI24: ${rsiData.rsi24[dataIndex].toFixed(2)}</div>`;
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
      // MA线
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
      // 成交量
      {
        name: '成交量',
        type: 'bar',
        xAxisIndex: 1,
        yAxisIndex: 1,
        data: data.map((item) => item.volume),
        itemStyle: {
          color: (params: any) => {
            const dataIndex = params.dataIndex;
            const item = data[dataIndex];
            return item && item.close >= item.open ? '#ef5350' : '#26a69a';
          },
        },
      },
      // KDJ指标
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
      // RSI指标
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

  return (
    <div className={styles.klineChart}>
      {loading && <div className={styles.loading}>加载中...</div>}
      <ReactECharts
        ref={chartRef}
        option={option}
        style={{ height: '100%', width: '100%' }}
        opts={{ renderer: 'canvas' }}
      />
    </div>
  );
}

