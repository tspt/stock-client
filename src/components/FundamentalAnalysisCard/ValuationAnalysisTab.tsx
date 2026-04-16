/**
 * 估值分析Tab组件
 */

import { Descriptions, Progress, Empty } from 'antd';
import type { FundamentalAnalysis } from '@/types/stock';
import styles from './FundamentalAnalysisCard.module.css';

interface ValuationAnalysisTabProps {
  data: FundamentalAnalysis;
}

export function ValuationAnalysisTab({ data }: ValuationAnalysisTabProps) {
  const valuation = data.valuation;

  if (!valuation) {
    return <Empty description="暂无估值数据" />;
  }

  const getPercentileColor = (percentile?: number) => {
    if (percentile === undefined) return '#d9d9d9';
    if (percentile < 30) return '#52c41a'; // 低估 - 绿色
    if (percentile < 70) return '#faad14'; // 合理 - 橙色
    return '#ff4d4f'; // 高估 - 红色
  };

  const getPercentileText = (percentile?: number) => {
    if (percentile === undefined) return '暂无数据';
    if (percentile < 30) return '低估';
    if (percentile < 70) return '合理';
    return '高估';
  };

  return (
    <div className={styles.tabContent}>
      <Descriptions bordered column={2} size="small">
        <Descriptions.Item label="市盈率(TTM)">
          {valuation.peTtm !== undefined ? valuation.peTtm.toFixed(2) : '-'}
        </Descriptions.Item>
        <Descriptions.Item label="市净率(PB)">
          {valuation.pb !== undefined ? valuation.pb.toFixed(2) : '-'}
        </Descriptions.Item>
        <Descriptions.Item label="市销率(PS)">
          {valuation.ps !== undefined ? valuation.ps.toFixed(2) : '-'}
        </Descriptions.Item>
        <Descriptions.Item label="股息率">
          {valuation.dividendYield !== undefined ? `${valuation.dividendYield.toFixed(2)}%` : '-'}
        </Descriptions.Item>
        <Descriptions.Item label="EV/EBITDA">
          {valuation.evEbitda !== undefined ? valuation.evEbitda.toFixed(2) : '-'}
        </Descriptions.Item>
      </Descriptions>

      <div className={styles.percentileSection}>
        <h4>估值分位数</h4>
        <div className={styles.percentileItem}>
          <span>PE分位数</span>
          <Progress
            percent={valuation.pePercentile || 0}
            strokeColor={getPercentileColor(valuation.pePercentile)}
            format={() => getPercentileText(valuation.pePercentile)}
          />
        </div>
        <div className={styles.percentileItem}>
          <span>PB分位数</span>
          <Progress
            percent={valuation.pbPercentile || 0}
            strokeColor={getPercentileColor(valuation.pbPercentile)}
            format={() => getPercentileText(valuation.pbPercentile)}
          />
        </div>
        <div className={styles.percentileItem}>
          <span>PS分位数</span>
          <Progress
            percent={valuation.psPercentile || 0}
            strokeColor={getPercentileColor(valuation.psPercentile)}
            format={() => getPercentileText(valuation.psPercentile)}
          />
        </div>
      </div>
    </div>
  );
}
