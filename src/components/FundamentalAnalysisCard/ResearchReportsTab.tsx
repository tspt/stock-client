/**
 * 机构研报Tab组件
 */

import { List, Card, Tag, Empty } from 'antd';
import type { FundamentalAnalysis, ResearchReportSummary } from '@/types/stock';
import styles from './FundamentalAnalysisCard.module.css';

interface ResearchReportsTabProps {
  data: FundamentalAnalysis;
}

export function ResearchReportsTab({ data }: ResearchReportsTabProps) {
  const reports = data.researchReports || [];

  if (reports.length === 0) {
    return <Empty description="暂无机构研报" />;
  }

  const getRatingColor = (rating?: string) => {
    if (!rating) return 'default';
    const lowerRating = rating.toLowerCase();
    if (lowerRating.includes('买入') || lowerRating.includes('增持') || lowerRating.includes('推荐')) {
      return 'red';
    }
    if (lowerRating.includes('持有') || lowerRating.includes('中性')) {
      return 'orange';
    }
    if (lowerRating.includes('卖出') || lowerRating.includes('减持')) {
      return 'green';
    }
    return 'default';
  };

  return (
    <div className={styles.tabContent}>
      <List
        dataSource={reports}
        renderItem={(report: ResearchReportSummary) => (
          <List.Item>
            <Card size="small" className={styles.reportCard}>
              <div className={styles.reportHeader}>
                <h4 className={styles.reportTitle}>{report.title}</h4>
                {report.rating && (
                  <Tag color={getRatingColor(report.rating)}>{report.rating}</Tag>
                )}
              </div>
              <div className={styles.reportMeta}>
                <span>{report.institution}</span>
                <span>{report.publishDate}</span>
                {report.targetPrice && (
                  <span>目标价: {report.targetPrice.toFixed(2)}</span>
                )}
              </div>
              {report.summary && (
                <p className={styles.reportSummary}>{report.summary}</p>
              )}
              {report.url && (
                <a href={report.url} target="_blank" rel="noopener noreferrer" className={styles.reportLink}>
                  查看全文
                </a>
              )}
            </Card>
          </List.Item>
        )}
      />
    </div>
  );
}
