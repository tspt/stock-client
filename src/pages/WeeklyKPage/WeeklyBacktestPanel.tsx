/**
 * 周线持仓回测摘要：超额、回撤、持有周数、防御模式
 */

import { Alert, Card, Empty, Space, Spin, Typography } from 'antd';
import type { HoldStrategyResult } from '@/utils/analysis/weekly';

const { Text } = Typography;

interface WeeklyBacktestPanelProps {
  result: HoldStrategyResult | null;
  loading: boolean;
}

function colorByValue(value: number): string {
  return value > 0 ? '#cf1322' : value < 0 ? '#389e0d' : '#595959';
}

function cell(label: string, value: string, color?: string) {
  return (
    <div style={{ minWidth: 120 }}>
      <div style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)' }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 600, color: color ?? '#262626' }}>{value}</div>
    </div>
  );
}

export function WeeklyBacktestPanel({ result, loading }: WeeklyBacktestPanelProps) {
  if (loading) {
    return (
      <Card size="small" style={{ marginBottom: 12 }}>
        <Space>
          <Spin size="small" />
          <Text type="secondary">正在按「当周收盘成交、持有 2–6 周」回测组合…</Text>
        </Space>
      </Card>
    );
  }

  if (!result) return null;

  if (result.weeks === 0) {
    return (
      <Card size="small" title="回测摘要" style={{ marginBottom: 12 }}>
        <Empty description={result.warnings[0] || '样本不足，无法回测'} image={Empty.PRESENTED_IMAGE_SIMPLE} />
      </Card>
    );
  }

  const excessOk = result.excessReturnPct > 0 && result.maxDrawdownPct < 40;

  return (
    <Card size="small" title="回测摘要" style={{ marginBottom: 12 }}>
      {result.warnings.map((w) => (
        <Alert key={w} type="warning" showIcon message={w} style={{ marginBottom: 8 }} />
      ))}
      <Alert
        type={excessOk ? 'success' : result.excessReturnPct > 0 ? 'warning' : 'error'}
        showIcon
        style={{ marginBottom: 12 }}
        message={
          result.defenseMode
            ? '当前为防御模式：池内站上周MA20 的比例偏低，本周不新开仓。已有仓仍按 2–6 周规则处理。'
            : `相对主板等权超额 ${result.excessReturnPct.toFixed(1)}%，最大回撤 ${result.maxDrawdownPct.toFixed(1)}%。成交按信号周收盘价。`
        }
      />
      <Space wrap size="large">
        {cell('策略收益', `${result.totalReturnPct.toFixed(1)}%`, colorByValue(result.totalReturnPct))}
        {cell('主板等权', `${result.benchReturnPct.toFixed(1)}%`, colorByValue(result.benchReturnPct))}
        {cell('超额', `${result.excessReturnPct.toFixed(1)}%`, colorByValue(result.excessReturnPct))}
        {cell('最大回撤', `${result.maxDrawdownPct.toFixed(1)}%`)}
        {cell('超额回撤', `${result.excessMaxDrawdownPct.toFixed(1)}%`)}
        {cell('年化', `${result.annualizedPct.toFixed(1)}%`, colorByValue(result.annualizedPct))}
        {cell('Calmar', result.calmar.toFixed(2))}
        {cell('平均持有', `${result.avgHoldWeeks.toFixed(1)} 周`)}
        {cell('成交笔数', String(result.trades))}
        {cell('胜率', `${result.winRate.toFixed(1)}%`)}
        {cell('平均持仓', `${result.avgPositions.toFixed(1)} 只`)}
        {cell('防御周数', `${result.defenseWeeks} / ${result.weeks}`)}
        {cell('样本', `${result.stockCount} 只`)}
      </Space>
      {result.industryExposure.length > 0 && (
        <div style={{ marginTop: 10, fontSize: 12, color: 'rgba(0,0,0,0.45)' }}>
          当前持仓行业：
          {result.industryExposure.map((x) => `${x.name} ${x.count}`).join('、')}
        </div>
      )}
    </Card>
  );
}
