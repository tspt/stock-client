/**
 * 回测结果面板
 *
 * 目的只有一个：让用户自己判断「当前这套筛选条件历史上到底有没有用」，
 * 而不是把评分当成不可质疑的结论。
 */

import { Alert, Card, Empty, Space, Spin, Table, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { BacktestHorizonStat, WeeklyBacktestResult } from '@/utils/analysis/weekly';

const { Text } = Typography;

interface WeeklyBacktestPanelProps {
  result: WeeklyBacktestResult | null;
  loading: boolean;
}

function colorByValue(value: number): string {
  return value > 0 ? '#cf1322' : value < 0 ? '#389e0d' : '#595959';
}

/** 给出一句话结论，避免用户只看到一堆数字 */
function summarize(result: WeeklyBacktestResult): { type: 'success' | 'warning' | 'error' | 'info'; text: string } {
  const usable = result.horizons.filter((h) => h.samples >= 30);
  if (usable.length === 0) {
    return {
      type: 'warning',
      text: '有效样本不足 30 个，统计结论不可靠。建议放宽筛选条件（尤其是评分与 RS 分位门槛）后重测。',
    };
  }

  // 以中期持有（13 周）为主，兼顾长短周期
  const mid = usable.find((h) => h.weeks >= 13) ?? usable[usable.length - 1];
  const positive = usable.filter((h) => h.excessReturn > 0).length;
  const ratio = positive / usable.length;

  const detail = `中期持有 ${mid.weeks} 周：胜率 ${mid.winRate.toFixed(1)}%，平均收益 ${mid.avgReturn.toFixed(
    2
  )}%，同期市场中位数 ${mid.benchmarkReturn.toFixed(2)}%，超额 ${mid.excessReturn.toFixed(2)}%。`;

  if (ratio >= 0.75 && mid.excessReturn > 1) {
    return { type: 'success', text: `${detail} 多数持有期的超额收益为正，当前条件在历史上具备有效性。` };
  }
  if (ratio >= 0.5 && mid.excessReturn > 0) {
    return { type: 'warning', text: `${detail} 超额收益为正但不稳定，建议配合止损并控制仓位。` };
  }
  return {
    type: 'error',
    text: `${detail} 超额收益不显著，说明当前条件选出的更多是「市场整体上涨的受益者」而非真正强势股，建议提高 RS 分位门槛或改用其他预设。`,
  };
}

export function WeeklyBacktestPanel({ result, loading }: WeeklyBacktestPanelProps) {
  if (loading) {
    return (
      <Card size="small" style={{ marginBottom: 12 }}>
        <Space>
          <Spin size="small" />
          <Text type="secondary">正在回测历史信号（抽样 400 只，遍历约 10 年周K）…</Text>
        </Space>
      </Card>
    );
  }

  if (!result) return null;

  if (result.signalCount === 0) {
    return (
      <Card size="small" title="策略回测" style={{ marginBottom: 12 }}>
        <Empty
          description="在历史数据中未触发任何信号，说明当前条件过于严格，或历史上极少出现这类形态"
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        />
      </Card>
    );
  }

  const columns: ColumnsType<BacktestHorizonStat> = [
    { title: '持有期', dataIndex: 'weeks', width: 90, render: (v: number) => `${v} 周` },
    {
      title: '样本数',
      dataIndex: 'samples',
      width: 90,
      align: 'right',
      render: (v: number) => (v < 30 ? <Text type="warning">{v}</Text> : v),
    },
    {
      title: '胜率',
      dataIndex: 'winRate',
      width: 90,
      align: 'right',
      render: (v: number) => <span style={{ color: v >= 55 ? '#cf1322' : '#595959' }}>{v.toFixed(1)}%</span>,
    },
    {
      title: '平均收益',
      dataIndex: 'avgReturn',
      width: 100,
      align: 'right',
      render: (v: number) => <span style={{ color: colorByValue(v) }}>{v.toFixed(2)}%</span>,
    },
    {
      title: '收益中位数',
      dataIndex: 'medianReturn',
      width: 110,
      align: 'right',
      render: (v: number) => <span style={{ color: colorByValue(v) }}>{v.toFixed(2)}%</span>,
    },
    {
      title: '市场基准',
      dataIndex: 'benchmarkReturn',
      width: 100,
      align: 'right',
      render: (v: number) => <span style={{ color: colorByValue(v) }}>{v.toFixed(2)}%</span>,
    },
    {
      title: '超额收益',
      dataIndex: 'excessReturn',
      width: 100,
      align: 'right',
      render: (v: number) => (
        <strong style={{ color: colorByValue(v) }}>
          {v > 0 ? '+' : ''}
          {v.toFixed(2)}%
        </strong>
      ),
    },
    {
      title: '盈亏比',
      dataIndex: 'profitFactor',
      width: 90,
      align: 'right',
      render: (v: number) => <span style={{ color: v >= 1.2 ? '#cf1322' : '#595959' }}>{v.toFixed(2)}</span>,
    },
    {
      title: '最差单笔',
      dataIndex: 'worstReturn',
      width: 100,
      align: 'right',
      render: (v: number) => <span style={{ color: '#389e0d' }}>{v.toFixed(2)}%</span>,
    },
  ];

  const summary = summarize(result);

  return (
    <Card size="small" title="策略回测（基于当前筛选条件）" style={{ marginBottom: 12 }}>
      <Alert
        type={summary.type}
        showIcon
        message={summary.text}
        style={{ marginBottom: 12 }}
      />
      <Table<BacktestHorizonStat>
        rowKey="weeks"
        size="small"
        pagination={false}
        columns={columns}
        dataSource={result.horizons}
      />
      <Text type="secondary" style={{ fontSize: 12 }}>
        回测股票 {result.stockCount} 只{result.sampled ? '（全市场抽样）' : ''}
        ，触发信号 {result.signalCount} 次，同一标的两次信号至少间隔 8 周。
        基准为「同一周买入并持有相同周期」的全市场收益中位数，超额收益才是筛选逻辑真正贡献的部分。
      </Text>
    </Card>
  );
}
