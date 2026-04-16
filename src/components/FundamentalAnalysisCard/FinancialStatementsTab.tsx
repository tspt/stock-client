/**
 * 财务报表Tab组件
 */

import { Table, Empty } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { FundamentalAnalysis, FinancialStatement } from '@/types/stock';
import styles from './FundamentalAnalysisCard.module.css';

interface FinancialStatementsTabProps {
  data: FundamentalAnalysis;
}

export function FinancialStatementsTab({ data }: FinancialStatementsTabProps) {
  const history = data.financialHistory || [];

  if (history.length === 0) {
    return <Empty description="暂无财务数据" />;
  }

  const columns: ColumnsType<FinancialStatement> = [
    {
      title: '报告期',
      dataIndex: 'reportPeriod',
      key: 'reportPeriod',
      width: 120,
      fixed: 'left',
    },
    {
      title: '营业收入',
      dataIndex: 'revenue',
      key: 'revenue',
      width: 120,
      render: (value?: number) => value !== undefined ? `${(value / 100000000).toFixed(2)}亿` : '-',
    },
    {
      title: '净利润',
      dataIndex: 'netProfit',
      key: 'netProfit',
      width: 120,
      render: (value?: number) => value !== undefined ? `${(value / 100000000).toFixed(2)}亿` : '-',
    },
    {
      title: '扣非净利润',
      dataIndex: 'deductNetProfit',
      key: 'deductNetProfit',
      width: 120,
      render: (value?: number) => value !== undefined ? `${(value / 100000000).toFixed(2)}亿` : '-',
    },
    {
      title: '经营现金流',
      dataIndex: 'operatingCashFlow',
      key: 'operatingCashFlow',
      width: 120,
      render: (value?: number) => value !== undefined ? `${(value / 100000000).toFixed(2)}亿` : '-',
    },
    {
      title: '每股收益',
      dataIndex: 'eps',
      key: 'eps',
      width: 100,
      render: (value?: number) => value !== undefined ? value.toFixed(2) : '-',
    },
    {
      title: '净资产收益率',
      dataIndex: 'roe',
      key: 'roe',
      width: 120,
      render: (value?: number) => value !== undefined ? `${value.toFixed(2)}%` : '-',
    },
    {
      title: '毛利率',
      dataIndex: 'grossMargin',
      key: 'grossMargin',
      width: 100,
      render: (value?: number) => value !== undefined ? `${value.toFixed(2)}%` : '-',
    },
    {
      title: '净利率',
      dataIndex: 'netMargin',
      key: 'netMargin',
      width: 100,
      render: (value?: number) => value !== undefined ? `${value.toFixed(2)}%` : '-',
    },
  ];

  return (
    <div className={styles.tabContent}>
      <Table
        columns={columns}
        dataSource={history}
        rowKey="reportPeriod"
        pagination={false}
        scroll={{ x: 1200 }}
        size="small"
      />
    </div>
  );
}
