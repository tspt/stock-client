/**
 * 周K图表弹窗：蜡烛图 + 周线均线 + 成交量 + MACD
 */

import { useMemo, useRef, useState } from 'react';
import { Modal, Button, Space, Tag, Tooltip, Typography, App, Segmented, Spin } from 'antd';
import { DownloadOutlined } from '@ant-design/icons';
import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';
import type { KLineData } from '@/types/stock';
import type { ChipDistribution, ChipPeriod } from '@/types/chipDistribution';
import { calculateMA, calculateMACD } from '@/utils/analysis/indicators';
import { buildChipChartOption } from '@/utils/chart/chipChartOption';
import { YI, type WeeklyAnalysis } from '@/utils/analysis/weekly';
import { formatVolume } from '@/utils/format/format';
import { downloadDataUrl } from '@/utils/export/weeklyKlineExportUtils';
import { useChipDistribution } from '@/hooks/useChipDistribution';
import { logger } from '@/utils/business/logger';

const { Text } = Typography;

/** 筹码分布面板宽度（px），与周K图并排展示 */
const CHIP_PANEL_WIDTH = 260;
/** 图表区域高度（px） */
const CHART_HEIGHT = 520;

interface WeeklyChartModalProps {
  open: boolean;
  code: string;
  name: string;
  kline: KLineData[];
  analysis: WeeklyAnalysis | null;
  onClose: () => void;
}

function formatDate(time: number): string {
  const d = new Date(time);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function buildWeeklyChartOption(
  data: KLineData[],
  name: string,
  chip: ChipDistribution | null
): EChartsOption {
  const ma5 = calculateMA(data, 5);
  const ma10 = calculateMA(data, 10);
  const ma20 = calculateMA(data, 20);
  const ma30 = calculateMA(data, 30);
  const ma60 = calculateMA(data, 60);
  const macd = calculateMACD(data);

  // 默认展示最近 120 周
  const visible = Math.min(120, data.length);
  const startPercent = data.length > visible ? ((data.length - visible) / data.length) * 100 : 0;

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
        // 筹码成本参考线：平均成本 + 90% 成本区间上下沿
        markLine: chip
          ? {
              silent: true,
              symbol: 'none',
              label: { position: 'insideEndTop', fontSize: 10 },
              data: [
                {
                  name: 'avgCost',
                  yAxis: chip.avgCost,
                  lineStyle: { color: '#faad14', width: 1, type: 'solid' },
                  label: { formatter: `平均成本 ${chip.avgCost.toFixed(2)}` },
                },
                {
                  name: 'cost90High',
                  yAxis: chip.range90.high,
                  lineStyle: { color: '#bfbfbf', width: 1, type: 'dashed' },
                  label: { formatter: `90%上沿 ${chip.range90.high.toFixed(2)}` },
                },
                {
                  name: 'cost90Low',
                  yAxis: chip.range90.low,
                  lineStyle: { color: '#bfbfbf', width: 1, type: 'dashed' },
                  label: { formatter: `90%下沿 ${chip.range90.low.toFixed(2)}` },
                },
              ],
            }
          : undefined,
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

  const { distribution: chip, loading: chipLoading, error: chipError } = useChipDistribution(
    code,
    chipPeriod,
    open
  );

  const option = useMemo(() => {
    if (kline.length === 0) return null;
    return buildWeeklyChartOption(kline, name, chip);
  }, [kline, name, chip]);

  const chipOption = useMemo(() => (chip ? buildChipChartOption(chip) : null), [chip]);

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
