/**
 * 筛选诊断抽屉
 * 整合跳过详情列表和诊断分析视图
 */

import React, { useState, useMemo } from 'react';
import { Drawer, Tabs, Table, Tag, Progress, Row, Col, Statistic, Button, Space } from 'antd';
import type { FilterSkippedItem } from '@/types/opportunityFilter';
import styles from './FilterDiagnosticsDrawer.module.css';

const { TabPane } = Tabs;

interface FilterDiagnosticsDrawerProps {
  open: boolean;
  onClose: () => void;
  skipped: FilterSkippedItem[];
}

export const FilterDiagnosticsDrawer: React.FC<FilterDiagnosticsDrawerProps> = ({
  open,
  onClose,
  skipped,
}) => {
  const [showAllSkipped, setShowAllSkipped] = useState(false);
  const SKIP_DETAIL_DISPLAY_COUNT = 20;

  // 聚合统计 - 原因维度
  const reasonStats = useMemo(() => {
    const map = new Map<string, number>();
    skipped.forEach(item => {
      const reasons = item.reason.split('；');
      reasons.forEach(r => {
        const key = r.trim();
        map.set(key, (map.get(key) || 0) + 1);
      });
    });
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);
  }, [skipped]);

  // 聚合统计 - 股票维度
  const stockStats = useMemo(() => {
    const map = new Map<string, { count: number; reasons: string[] }>();
    skipped.forEach(item => {
      const key = `${item.code} ${item.name}`;
      const current = map.get(key) || { count: 0, reasons: [] };
      current.count += 1;
      current.reasons.push(item.reason);
      map.set(key, current);
    });
    return Array.from(map.entries())
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 10)
      .map(([key, data]) => ({
        key,
        stock: key,
        count: data.count,
        reasons: data.reasons.join('; '),
      }));
  }, [skipped]);

  const stockColumns = [
    {
      title: '股票',
      dataIndex: 'stock',
      key: 'stock',
    },
    {
      title: '被筛次数',
      dataIndex: 'count',
      key: 'count',
      render: (count: number) => <Tag color="red">{count}</Tag>,
    },
    {
      title: '主要原因',
      dataIndex: 'reasons',
      key: 'reasons',
      ellipsis: true,
    },
  ];

  const totalSkipped = skipped.length;
  const topReason = reasonStats[0] || ['', 0];

  return (
    <Drawer
      title={`筛选诊断 - 共筛除 ${totalSkipped} 只股票`}
      placement="right"
      width={650}
      open={open}
      onClose={onClose}
      destroyOnClose={false}
    >
      <Tabs defaultActiveKey="list">
        <TabPane tab="详细列表" key="list">
          <div className={styles.diagnosticsList}>
            {(showAllSkipped ? skipped : skipped.slice(0, SKIP_DETAIL_DISPLAY_COUNT)).map((item, index) => (
              <div key={`${item.code}-${item.reason}-${index}`} className={styles.diagnosticsListItem}>
                <Tag color="warning">{item.code} {item.name}</Tag>
                <span className={styles.diagnosticsListReason}>{item.reason}</span>
              </div>
            ))}
            {!showAllSkipped && skipped.length > SKIP_DETAIL_DISPLAY_COUNT && (
              <Button
                type="link"
                size="small"
                className={styles.diagnosticsShowAll}
                onClick={() => setShowAllSkipped(true)}
              >
                查看全部 {skipped.length} 条
              </Button>
            )}
            {showAllSkipped && skipped.length > SKIP_DETAIL_DISPLAY_COUNT && (
              <Button
                type="link"
                size="small"
                className={styles.diagnosticsShowAll}
                onClick={() => setShowAllSkipped(false)}
              >
                收起（仅显示前 {SKIP_DETAIL_DISPLAY_COUNT} 条）
              </Button>
            )}
          </div>
        </TabPane>

        <TabPane tab="诊断分析" key="diagnostics">
          <div className={styles.diagnosticContent}>
            {/* 总体统计 */}
            <div className={styles.diagnosticStats}>
              <Statistic
                title="筛除总数"
                value={totalSkipped}
                suffix="只"
                valueStyle={{ fontSize: 20 }}
              />
              <Statistic
                title="主要原因"
                value={topReason[0] || '无'}
                suffix={topReason[1] > 0 ? `(${topReason[1]}次)` : ''}
                valueStyle={{ fontSize: 14 }}
              />
              <div style={{ textAlign: 'center' }}>
                <Progress
                  type="dashboard"
                  percent={Math.min(100, Math.round((totalSkipped / 100) * 100))}
                  strokeColor="#ff4d4f"
                  format={() => `${totalSkipped}`}
                  width={60}
                />
                <div style={{ fontSize: 12, color: '#999', marginTop: 4 }}>筛除数量</div>
              </div>
            </div>

            {/* 原因维度统计 */}
            {reasonStats.length > 0 && (
              <div className={styles.diagnosticSection}>
                <h4 className={styles.diagnosticSectionTitle}>原因维度统计（Top 8）</h4>
                <div className={styles.reasonBars}>
                  {reasonStats.map(([reason, count], index) => (
                    <div key={index} className={styles.reasonBar}>
                      <div className={styles.reasonLabel}>{reason}</div>
                      <Progress
                        percent={Math.round((count / totalSkipped) * 100)}
                        format={() => count.toString()}
                        strokeColor="#1890ff"
                        className={styles.reasonProgress}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 股票维度统计 */}
            {stockStats.length > 0 && (
              <div className={styles.diagnosticSection}>
                <h4 className={styles.diagnosticSectionTitle}>股票维度统计（Top 10）</h4>
                <Table
                  dataSource={stockStats}
                  columns={stockColumns}
                  pagination={false}
                  size="small"
                  scroll={{ y: 300 }}
                />
              </div>
            )}
          </div>
        </TabPane>
      </Tabs>
    </Drawer>
  );
};
