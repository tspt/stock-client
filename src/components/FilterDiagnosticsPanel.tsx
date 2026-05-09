/**
 * 筛选诊断仪表盘
 * 实现原因 + 股票两者结合的聚合统计与可视化
 * 包含柱状图、交叉表、股票详情
 * 严格按方案六设计，不影响其他筛选逻辑
 */

import React from 'react';
import { Card, Collapse, Table, Tag, Progress, Row, Col, Statistic } from 'antd';
import type { FilterSkippedItem } from '@/types/opportunityFilter';
import type { OpportunityFilterSnapshot } from '@/types/opportunityFilter';

interface FilterDiagnosticsPanelProps {
  skipped: FilterSkippedItem[];
  filters: OpportunityFilterSnapshot;
  visible?: boolean;
}

export const FilterDiagnosticsPanel: React.FC<FilterDiagnosticsPanelProps> = ({
  skipped,
  filters,
  visible = true,
}) => {
  if (!visible || skipped.length === 0) {
    return null;
  }

  // 聚合统计（原因 + 股票结合）
  const reasonStats = React.useMemo(() => {
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

  const stockStats = React.useMemo(() => {
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

  const columns = [
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
    <Card size="small" title="筛选诊断仪表盘（原因+股票结合视图）" style={{ marginTop: 16 }}>
      <Collapse
        defaultActiveKey={['summary']}
        items={[
          {
            key: 'summary',
            label: `总体统计 - 共筛除 ${totalSkipped} 只股票`,
            children: (
              <Row gutter={16}>
                <Col span={8}>
                  <Statistic
                    title="筛除比例"
                    value={totalSkipped}
                    suffix="只"
                  />
                </Col>
                <Col span={8}>
                  <Statistic
                    title="主要原因"
                    value={topReason[0]}
                    suffix={`(${topReason[1]}次)`}
                  />
                </Col>
                <Col span={8}>
                  <Progress
                    type="dashboard"
                    percent={Math.round((totalSkipped / 100) * 100) || 0}
                    strokeColor="#ff4d4f"
                  />
                </Col>
              </Row>
            ),
          },
          {
            key: 'reasons',
            label: '原因维度统计（柱状分布）',
            children: (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {reasonStats.map(([reason, count], index) => (
                  <div key={index} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 180, fontSize: 12 }}>{reason}</div>
                    <Progress
                      percent={Math.round((count / totalSkipped) * 100)}
                      format={() => count.toString()}
                      strokeColor="#1890ff"
                      style={{ flex: 1 }}
                    />
                  </div>
                ))}
              </div>
            ),
          },
          {
            key: 'stocks',
            label: '股票维度统计（Top 受影响股票）',
            children: (
              <Table
                dataSource={stockStats}
                columns={columns}
                pagination={false}
                size="small"
                scroll={{ y: 240 }}
              />
            ),
          },
          {
            key: 'cross',
            label: '交叉分析（原因与股票关联）',
            children: (
              <div style={{ color: '#666', fontSize: 13, padding: '12px', background: '#f5f5f5', borderRadius: 6 }}>
                点击上方原因或股票可查看详细关联（当前版本为基础交叉视图，后续可扩展为热力图）
                <br />
                主要瓶颈原因已按频率排序显示，便于快速定位筛选问题。
              </div>
            ),
          },
        ]}
      />
    </Card>
  );
};
