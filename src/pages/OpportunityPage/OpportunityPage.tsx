/**
 * 机会分析页面
 */

import { useEffect, useState } from 'react';
import { Layout, Card, Button, Space, Progress, Select, Collapse, message, InputNumber } from 'antd';
import {
  PlayCircleOutlined,
  StopOutlined,
  ExportOutlined,
  SettingOutlined,
  ExclamationCircleOutlined,
} from '@ant-design/icons';
import { useOpportunityStore } from '@/stores/opportunityStore';
import { useStockStore } from '@/stores/stockStore';
import { OpportunityTable } from '@/components/OpportunityTable/OpportunityTable';
import { OverviewColumnSettings } from '@/components/OverviewColumnSettings/OverviewColumnSettings';
import { exportOpportunityToCSV, exportOpportunityToExcel } from '@/utils/opportunityExportUtils';
import type { KLinePeriod } from '@/types/stock';
import { BUILTIN_GROUP_SELF_ID, BUILTIN_GROUP_SELF_NAME } from '@/utils/constants';
import styles from './OpportunityPage.module.css';

const { Header, Content } = Layout;
const { Panel } = Collapse;

const PERIOD_OPTIONS: { label: string; value: KLinePeriod }[] = [
  { label: '日', value: 'day' },
  { label: '周', value: 'week' },
  { label: '月', value: 'month' },
  { label: '年', value: 'year' },
];

const GROUP_ALL_ID = '__all__';

export function OpportunityPage() {
  const {
    analysisData,
    loading,
    progress,
    currentPeriod,
    currentCount,
    columnConfig,
    sortConfig,
    errors,
    startAnalysis,
    cancelAnalysis,
    loadCachedData,
    updateColumnConfig,
    updateSortConfig,
    resetColumnConfig,
  } = useOpportunityStore();

  const { watchList, groups, loadWatchList } = useStockStore();
  const [columnSettingsVisible, setColumnSettingsVisible] = useState(false);
  const [selectedGroupId, setSelectedGroupId] = useState<string>(GROUP_ALL_ID);

  useEffect(() => {
    loadCachedData();
  }, [loadCachedData]);

  useEffect(() => {
    loadWatchList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleAnalyze = async () => {
    if (watchList.length === 0) {
      message.warning('请先添加股票到自选列表');
      return;
    }

    if (selectedGroupId !== GROUP_ALL_ID) {
      const hasStocksInGroup = watchList.some((s) => s.groupIds && s.groupIds.includes(selectedGroupId));
      if (!hasStocksInGroup) {
        message.warning('该分组暂无股票');
        return;
      }
    }

    await startAnalysis(currentPeriod, selectedGroupId, currentCount);
  };

  const handleCancel = () => {
    cancelAnalysis();
    message.info('分析已取消');
  };

  const handleExport = async (format: 'csv' | 'excel') => {
    if (analysisData.length === 0) {
      message.warning('没有数据可导出');
      return;
    }

    try {
      if (format === 'csv') {
        exportOpportunityToCSV(analysisData, columnConfig);
        message.success('CSV导出成功');
      } else {
        await exportOpportunityToExcel(analysisData, columnConfig);
        message.success('Excel导出成功');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '导出失败';
      message.error(errorMessage);
      console.error('导出失败:', error);
    }
  };

  const handleColumnSettingsOk = (columns: typeof columnConfig) => {
    updateColumnConfig(columns);
    setColumnSettingsVisible(false);
  };

  return (
    <Layout className={styles.opportunityPage}>
      <Header className={styles.header}>
        <div className={styles.headerContent}>
          <h2 className={styles.title}>机会分析</h2>
          <Space>
            <Select
              value={selectedGroupId}
              onChange={(value: string) => {
                setSelectedGroupId(value);
                if (analysisData.length > 0) {
                  message.info('分组已更改，请重新分析');
                }
              }}
              options={[
                { label: '全部', value: GROUP_ALL_ID },
                { label: BUILTIN_GROUP_SELF_NAME, value: BUILTIN_GROUP_SELF_ID },
                ...[...groups].sort((a, b) => a.order - b.order).map((g) => ({ label: g.name, value: g.id })),
              ]}
              style={{ width: 160 }}
              disabled={loading}
            />
            <Select
              value={currentPeriod}
              onChange={(value: KLinePeriod) => {
                useOpportunityStore.setState({ currentPeriod: value });
                if (analysisData.length > 0) {
                  message.info('周期已更改，请重新分析');
                }
              }}
              options={PERIOD_OPTIONS}
              style={{ width: 100 }}
              disabled={loading}
            />
            <InputNumber
              value={currentCount}
              min={10}
              max={10000}
              step={100}
              style={{ width: 120 }}
              placeholder="count"
              disabled={loading}
              onChange={(v) => {
                const next = typeof v === 'number' && isFinite(v) ? Math.floor(v) : 2000;
                useOpportunityStore.setState({ currentCount: next });
                if (analysisData.length > 0) {
                  message.info('count已更改，请重新分析');
                }
              }}
            />
            <Button
              type="primary"
              icon={<PlayCircleOutlined />}
              onClick={handleAnalyze}
              loading={loading}
              disabled={loading || watchList.length === 0}
            >
              一键分析
            </Button>
            {loading && (
              <Button icon={<StopOutlined />} onClick={handleCancel}>
                取消
              </Button>
            )}
            <Button icon={<ExportOutlined />} onClick={() => handleExport('csv')} disabled={analysisData.length === 0}>
              导出CSV
            </Button>
            <Button icon={<ExportOutlined />} onClick={() => handleExport('excel')} disabled={analysisData.length === 0}>
              导出Excel
            </Button>
            <Button icon={<SettingOutlined />} onClick={() => setColumnSettingsVisible(true)}>
              列设置
            </Button>
          </Space>
        </div>
      </Header>

      <Content className={styles.content}>
        {loading && (
          <Card className={styles.progressCard}>
            <div className={styles.progressInfo}>
              <Progress
                percent={progress.percent}
                status={loading ? 'active' : 'success'}
                format={(percent) => `${percent?.toFixed(1)}%`}
              />
              <div className={styles.progressText}>
                进度: {progress.completed} / {progress.total} (失败: {progress.failed})
              </div>
            </div>
          </Card>
        )}

        {errors.length > 0 && (
          <Card className={styles.errorCard} size="small">
            <Collapse>
              <Panel
                header={
                  <span>
                    <ExclamationCircleOutlined style={{ color: '#ff4d4f', marginRight: 8 }} />
                    分析失败 ({errors.length} 只股票)
                  </span>
                }
                key="errors"
              >
                <div className={styles.errorList}>
                  {errors.map((err, index) => (
                    <div key={index} className={styles.errorItem}>
                      <span className={styles.errorStock}>
                        {err.stock.name} ({err.stock.code})
                      </span>
                      <span className={styles.errorMessage}>{err.error}</span>
                    </div>
                  ))}
                </div>
              </Panel>
            </Collapse>
          </Card>
        )}

        {analysisData.length > 0 ? (
          <Card className={styles.tableCard}>
            <OpportunityTable data={analysisData} columns={columnConfig} sortConfig={sortConfig} onSortChange={updateSortConfig} />
          </Card>
        ) : (
          <Card className={styles.emptyCard}>
            <div className={styles.emptyText}>
              {watchList.length === 0 ? '请先添加股票到自选列表' : '点击"一键分析"按钮开始分析'}
            </div>
          </Card>
        )}
      </Content>

      <OverviewColumnSettings
        visible={columnSettingsVisible}
        columns={columnConfig}
        onOk={handleColumnSettingsOk}
        onCancel={() => setColumnSettingsVisible(false)}
        onReset={resetColumnConfig}
      />
    </Layout>
  );
}


