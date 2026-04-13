/**
 * AI辅助分析详情弹窗组件
 */

import React from 'react';
import { Modal, Card, Progress, Tag, Space, Divider } from 'antd';
import {
  RiseOutlined,
  FallOutlined,
  MinusOutlined,
  ThunderboltOutlined,
  StarOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import type { AIAnalysisResult } from '@/types/stock';
import styles from './AIAnalysisModal.module.css';

interface AIAnalysisModalProps {
  visible: boolean;
  analysis: AIAnalysisResult | null;
  stockName: string;
  stockCode: string;
  onClose: () => void;
}

export const AIAnalysisModal: React.FC<AIAnalysisModalProps> = ({
  visible,
  analysis,
  stockName,
  stockCode,
  onClose,
}) => {
  if (!analysis) {
    return null;
  }

  // 获取趋势方向图标和颜色
  const getTrendIcon = (direction: string) => {
    switch (direction) {
      case 'up':
        return <RiseOutlined style={{ color: '#ff4d4f' }} />;
      case 'down':
        return <FallOutlined style={{ color: '#52c41a' }} />;
      default:
        return <MinusOutlined style={{ color: '#faad14' }} />;
    }
  };

  // 获取趋势方向文本
  const getTrendText = (direction: string) => {
    switch (direction) {
      case 'up':
        return '上涨';
      case 'down':
        return '下跌';
      default:
        return '横盘';
    }
  };

  // 获取置信度颜色
  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.7) return '#52c41a';
    if (confidence >= 0.5) return '#faad14';
    return '#ff4d4f';
  };

  // 获取评分颜色
  const getScoreColor = (score: number) => {
    if (score >= 80) return '#52c41a';
    if (score >= 60) return '#1890ff';
    if (score >= 40) return '#faad14';
    return '#ff4d4f';
  };

  return (
    <Modal
      title={
        <Space>
          <ThunderboltOutlined style={{ color: '#1890ff' }} />
          <span>AI辅助分析 - {stockName} ({stockCode})</span>
        </Space>
      }
      open={visible}
      onCancel={onClose}
      footer={null}
      width={900}
      className={styles.modal}
    >
      <div className={styles.content}>
        {/* 趋势预测 */}
        {analysis.trendPrediction && (
          <Card className={styles.section} title="趋势预测" size="small">
            <div className={styles.trendPrediction}>
              <div className={styles.trendHeader}>
                <Space size="large">
                  <div className={styles.trendDirection}>
                    {getTrendIcon(analysis.trendPrediction.direction)}
                    <span className={styles.trendText}>
                      预测方向：{getTrendText(analysis.trendPrediction.direction)}
                    </span>
                  </div>
                  <div className={styles.confidence}>
                    <span>置信度：</span>
                    <Progress
                      percent={Math.round(analysis.trendPrediction.confidence * 100)}
                      strokeColor={getConfidenceColor(analysis.trendPrediction.confidence)}
                      format={(percent) => `${percent}%`}
                      style={{ width: 120, display: 'inline-block' }}
                    />
                  </div>
                </Space>
              </div>

              {(analysis.trendPrediction.targetPrice ||
                analysis.trendPrediction.supportLevel ||
                analysis.trendPrediction.resistanceLevel) && (
                  <div className={styles.priceLevels}>
                    {analysis.trendPrediction.supportLevel && (
                      <Tag color="green">支撑位：{analysis.trendPrediction.supportLevel.toFixed(2)}</Tag>
                    )}
                    {analysis.trendPrediction.targetPrice && (
                      <Tag color="blue">目标价：{analysis.trendPrediction.targetPrice.toFixed(2)}</Tag>
                    )}
                    {analysis.trendPrediction.resistanceLevel && (
                      <Tag color="red">阻力位：{analysis.trendPrediction.resistanceLevel.toFixed(2)}</Tag>
                    )}
                  </div>
                )}

              {analysis.trendPrediction.reasoning.length > 0 && (
                <div className={styles.reasoning}>
                  <div className={styles.reasoningTitle}>预测依据：</div>
                  <ul>
                    {analysis.trendPrediction.reasoning.map((reason, index) => (
                      <li key={index}>{reason}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </Card>
        )}

        {/* 智能推荐评分 */}
        {analysis.recommendation && (
          <Card className={styles.section} title="智能推荐评分" size="small">
            <div className={styles.recommendation}>
              <div className={styles.totalScore}>
                <div className={styles.scoreLabel}>综合评分</div>
                <div
                  className={styles.scoreValue}
                  style={{ color: getScoreColor(analysis.recommendation.totalScore) }}
                >
                  {analysis.recommendation.totalScore}
                </div>
              </div>

              <Divider />

              <div className={styles.scoreDetails}>
                <div className={styles.scoreItem}>
                  <div className={styles.scoreItemLabel}>技术面</div>
                  <Progress
                    percent={analysis.recommendation.technicalScore}
                    strokeColor={getScoreColor(analysis.recommendation.technicalScore)}
                    format={(percent) => `${percent}`}
                  />
                </div>
                <div className={styles.scoreItem}>
                  <div className={styles.scoreItemLabel}>形态</div>
                  <Progress
                    percent={analysis.recommendation.patternScore}
                    strokeColor={getScoreColor(analysis.recommendation.patternScore)}
                    format={(percent) => `${percent}`}
                  />
                </div>
                <div className={styles.scoreItem}>
                  <div className={styles.scoreItemLabel}>趋势</div>
                  <Progress
                    percent={analysis.recommendation.trendScore}
                    strokeColor={getScoreColor(analysis.recommendation.trendScore)}
                    format={(percent) => `${percent}`}
                  />
                </div>
                <div className={styles.scoreItem}>
                  <div className={styles.scoreItemLabel}>风险</div>
                  <Progress
                    percent={analysis.recommendation.riskScore}
                    strokeColor={getScoreColor(analysis.recommendation.riskScore)}
                    format={(percent) => `${percent}`}
                  />
                </div>
              </div>

              {analysis.recommendation.reasons.length > 0 && (
                <div className={styles.reasonsSection}>
                  <div className={styles.sectionTitle}>
                    <StarOutlined style={{ color: '#faad14', marginRight: 4 }} />
                    推荐理由
                  </div>
                  <ul className={styles.reasonList}>
                    {analysis.recommendation.reasons.map((reason, index) => (
                      <li key={index} className={styles.reasonItem}>
                        {reason}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {analysis.recommendation.warnings.length > 0 && (
                <div className={styles.warningsSection}>
                  <div className={styles.sectionTitle}>
                    <WarningOutlined style={{ color: '#ff4d4f', marginRight: 4 }} />
                    风险提示
                  </div>
                  <ul className={styles.warningList}>
                    {analysis.recommendation.warnings.map((warning, index) => (
                      <li key={index} className={styles.warningItem}>
                        {warning}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </Card>
        )}

        {/* 相似形态 */}
        {analysis.similarPatterns && analysis.similarPatterns.length > 0 && (
          <Card className={styles.section} title="相似形态识别" size="small">
            <div className={styles.similarPatterns}>
              {analysis.similarPatterns.map((pattern, index) => (
                <div key={index} className={styles.patternItem}>
                  <div className={styles.patternHeader}>
                    <Space>
                      <span className={styles.stockName}>{pattern.name}</span>
                      <span className={styles.stockCode}>({pattern.code})</span>
                      <Tag color="blue">相似度: {(pattern.similarity * 100).toFixed(1)}%</Tag>
                    </Space>
                  </div>
                  {pattern.historicalPerformance && (
                    <div className={styles.performance}>
                      <span>历史表现：</span>
                      <Tag
                        color={
                          pattern.historicalPerformance.changePercent >= 0 ? 'green' : 'red'
                        }
                      >
                        {pattern.historicalPerformance.changePercent >= 0 ? '+' : ''}
                        {pattern.historicalPerformance.changePercent.toFixed(2)}%
                      </Tag>
                      <span className={styles.period}>
                        （{pattern.historicalPerformance.period}天）
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* 分析时间 */}
        <div className={styles.analysisTime}>
          分析时间：{new Date(analysis.analyzedAt).toLocaleString('zh-CN')}
        </div>
      </div>
    </Modal>
  );
};
