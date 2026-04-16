/**
 * 行业对比Tab组件
 */

import { Descriptions, Empty } from 'antd';
import type { FundamentalAnalysis } from '@/types/stock';
import styles from './FundamentalAnalysisCard.module.css';

interface IndustryComparisonTabProps {
  data: FundamentalAnalysis;
}

export function IndustryComparisonTab({ data }: IndustryComparisonTabProps) {
  const industry = data.industryComparison;

  if (!industry) {
    return <Empty description="暂无行业对比数据" />;
  }

  const getRankText = (rank?: number, total?: number) => {
    if (rank === undefined || total === undefined) return '-';
    const percentile = ((rank / total) * 100).toFixed(1);
    return `${rank}/${total} (${percentile}%)`;
  };

  return (
    <div className={styles.tabContent}>
      <Descriptions bordered column={1} size="small">
        <Descriptions.Item label="所属行业">
          {industry.industryName}
        </Descriptions.Item>
        <Descriptions.Item label="行业PE中位数">
          {industry.industryPeMedian !== undefined ? industry.industryPeMedian.toFixed(2) : '-'}
        </Descriptions.Item>
        <Descriptions.Item label="行业PB中位数">
          {industry.industryPbMedian !== undefined ? industry.industryPbMedian.toFixed(2) : '-'}
        </Descriptions.Item>
        <Descriptions.Item label="行业PS中位数">
          {industry.industryPsMedian !== undefined ? industry.industryPsMedian.toFixed(2) : '-'}
        </Descriptions.Item>
        <Descriptions.Item label="PE行业排名">
          {getRankText(industry.peRank, industry.totalCompanies)}
        </Descriptions.Item>
        <Descriptions.Item label="PB行业排名">
          {getRankText(industry.pbRank, industry.totalCompanies)}
        </Descriptions.Item>
        <Descriptions.Item label="PS行业排名">
          {getRankText(industry.psRank, industry.totalCompanies)}
        </Descriptions.Item>
      </Descriptions>
    </div>
  );
}
