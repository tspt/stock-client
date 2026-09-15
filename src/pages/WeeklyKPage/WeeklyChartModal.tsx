/**
 * 周K图表弹窗：蜡烛图 + 周线均线 + 成交量 + MACD
 */

import { useMemo, useRef } from 'react';
import { Modal, Button, Space, Tag, Typography, App } from 'antd';
import { DownloadOutlined } from '@ant-design/icons';
import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';
import type { KLineData } from '@/types/stock';
import { calculateMA, calculateMACD } from '@/utils/analysis/indicators';
import { WEEKLY_STRUCTURE_LABELS, type WeeklyKlineAnalysis } from '@/utils/analysis/weeklyKlineAnalysis';
import { formatVolume } from '@/utils/format/format';
import { downloadDataUrl } from '@/utils/export/weeklyKlineExportUtils';
import { logger } from '@/utils/business/logger';

const { Text } = Typography;

interface WeeklyChartModalProps {
  open: boolean;
  code: string;
  name: string;
  kline: KLineData[];
  analysis: WeeklyKlineAnalysis | null;
  onClose: () => void;
}

function formatDate(time: number): string {
  const d = new Date(time);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function buildWeeklyChartOption(data: KLineData[], name: string): EChartsOption {
  const ma5 = calculateMA(data, 5);
  const ma10 = calculateMA(data, 10);
  const ma20 = calculateMA(data, 20);
  const ma30 = calculateMA(data, 30);
  const macd = calculateMACD(data);

  // 默认展示最近 120 周
  const visible = Math.min(120, data.length);
  const startPercent = data.length > visible ? ((data.length - visible) / data.length) * 100 : 0;

  return {
    title: {
      text: `${name} 周K（MA5≈月线 / MA10≈季线 / MA20≈半年线）`,
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

        [['MA5', ma5], ['MA10', ma10], ['MA20', ma20], ['MA30', ma30]].forEach(([label, arr]) => {
          const value = (arr as number[])[dataIndex];
          if (Number.isFinite(value)) {
            html += `<div>${label}: ${value.toFixed(2)}</div>`;
          }
        });

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
      { left: '8%', right: '4%', top: '12%', height: '48%' },
      { left: '8%', right: '4%', top: '66%', height: '12%' },
      { left: '8%', right: '4%', top: '82%', height: '12%' },
    ],
    xAxis: [
      {
        type: 'category',
        data: data.map((d) => formatDate(d.time)),
        boundaryGap: false,
        axisLine: { onZero: false },
        axisLabel: { show: false },
        splitLine: { show: false },
      },
      {
        type: 'category',
        gridIndex: 1,
        data: data.map((d) => formatDate(d.time)),
        boundaryGap: false,
        axisLine: { onZero: false },
        axisTick: { show: false },
        axisLabel: { show: false },
        splitLine: { show: false },
      },
      {
        type: 'category',
        gridIndex: 2,
        data: data.map((d) => formatDate(d.time)),
        boundaryGap: false,
        axisLine: { onZero: false },
        axisTick: { show: false },
        splitLine: { show: false },
      },
    ],
    yAxis: [
      { scale: true, splitArea: { show: true } },
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
      { type: 'inside', xAxisIndex: [0, 1, 2], start: startPercent, end: 100 },
      { show: true, xAxisIndex: [0, 1, 2], type: 'slider', bottom: 0, start: startPercent, end: 100 },
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

  const option = useMemo(() => {
    if (kline.length === 0) return null;
    return buildWeeklyChartOption(kline, name);
  }, [kline, name]);

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
      width={1080}
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
            <Tag color="blue">结构：{WEEKLY_STRUCTURE_LABELS[analysis.structure]}</Tag>
            {analysis.maBullish && <Tag color="red">均线多头</Tag>}
            {analysis.aboveMa10 && <Tag color={analysis.ma10Rising ? 'red' : 'orange'}>站上MA10</Tag>}
            {analysis.macdGoldenCross && (
              <Tag color={analysis.macdGoldenAboveZero ? 'red' : 'orange'}>MACD金叉</Tag>
            )}
            {analysis.boxBreakout && <Tag color="volcano">箱体突破</Tag>}
            {analysis.runningWeekIncluded && <Tag color="default">含未完成本周</Tag>}
          </Space>
          <div style={{ marginTop: 8 }}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              信号：{analysis.signals.map((s) => `${s.label}(${s.detail})`).join('；') || '无'}
            </Text>
          </div>
          {analysis.warnings.length > 0 && (
            <div style={{ marginTop: 4 }}>
              <Text type="danger" style={{ fontSize: 12 }}>
                风险：{analysis.warnings.join('；')}
              </Text>
            </div>
          )}
        </div>
      )}
      <div style={{ height: 520 }}>
        {option ? (
          <ReactECharts
            ref={chartRef}
            option={option}
            lazyUpdate
            style={{ height: '100%', width: '100%' }}
            opts={{ renderer: 'canvas' }}
          />
        ) : (
          <div style={{ paddingTop: 40, textAlign: 'center' }}>暂无周K数据</div>
        )}
      </div>
    </Modal>
  );
}
