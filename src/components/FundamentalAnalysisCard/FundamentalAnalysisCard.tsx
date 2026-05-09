/**
 * 基本面分析卡片组件
 */

import { Card, Tabs, Spin, Empty } from 'antd';
import { useFundamentalAnalysis } from '@/hooks/useFundamentalAnalysis';
import { FinancialStatementsTab } from './FinancialStatementsTab';
import { ValuationAnalysisTab } from './ValuationAnalysisTab';
import { IndustryComparisonTab } from './IndustryComparisonTab';
import { ResearchReportsTab } from './ResearchReportsTab';
import styles from './FundamentalAnalysisCard.module.css';

interface FundamentalAnalysisCardProps {
  code: string;
}

export function FundamentalAnalysisCard({ code }: FundamentalAnalysisCardProps) {
  const { data, loading, error } = useFundamentalAnalysis(code);

  if (loading) {
    return (
      <Card className={styles.card}>
        <div className={styles.loadingContainer}>
          <Spin size="large" />
        </div>
      </Card>
    );
  }

  if (error || !data) {
    return (
      <Card className={styles.card}>
        <Empty description="暂无基本面数据" />
      </Card>
    );
  }

  const items = [
    {
      key: 'financials',
      label: '财务报表',
      children: <FinancialStatementsTab data={data} />,
    },
    {
      key: 'valuation',
      label: '估值分析',
      children: <ValuationAnalysisTab data={data} />,
    },
    {
      key: 'industry',
      label: '行业对比',
      children: <IndustryComparisonTab data={data} />,
    },
    {
      key: 'reports',
      label: '机构研报',
      children: <ResearchReportsTab data={data} />,
    },
  ];

  return (
    <Card className={styles.card} title="基本面分析">
      <Tabs defaultActiveKey="financials" items={items} />
    </Card>
  );
}
