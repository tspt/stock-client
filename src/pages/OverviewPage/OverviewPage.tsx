/**
 * 数据概况页面
 */

import { useEffect, useState } from 'react';
import { Layout, Card, Button, Space, Progress, Select, Collapse, message } from 'antd';
import {
  PlayCircleOutlined,
  StopOutlined,
  ExportOutlined,
  SettingOutlined,
  ExclamationCircleOutlined,
} from '@ant-design/icons';
import { useOverviewStore } from '@/stores/overviewStore';
import { useStockStore } from '@/stores/stockStore';
import { OverviewTable } from '@/components/OverviewTable/OverviewTable';
import { OverviewColumnSettings } from '@/components/OverviewColumnSettings/OverviewColumnSettings';
import { exportToCSV, exportToExcel } from '@/utils/exportUtils';
import type { KLinePeriod } from '@/types/stock';
import styles from './OverviewPage.module.css';

const { Header, Content } = Layout;
const { Panel } = Collapse;

const PERIOD_OPTIONS: { label: string; value: KLinePeriod }[] = [
  { label: '日', value: 'day' },
  { label: '周', value: 'week' },
  { label: '月', value: 'month' },
  { label: '年', value: 'year' },
];

export function OverviewPage() {
  const {
    analysisData,
    loading,
    progress,
    currentPeriod,
    columnConfig,
    sortConfig,
    errors,
    startAnalysis,
    cancelAnalysis,
    loadCachedData,
    updateColumnConfig,
    updateSortConfig,
    resetColumnConfig,
  } = useOverviewStore();

  const { watchList } = useStockStore();
  const [columnSettingsVisible, setColumnSettingsVisible] = useState(false);

  // 加载缓存数据
  useEffect(() => {
    loadCachedData();
  }, [loadCachedData]);

  // 处理一键分析
  const handleAnalyze = async () => {
    if (watchList.length === 0) {
      message.warning('请先添加股票到自选列表');
      return;
    }
    await startAnalysis(currentPeriod);
  };

  // 处理取消
  const handleCancel = () => {
    cancelAnalysis();
    message.info('分析已取消');
  };

  // 处理导出
  const handleExport = async (format: 'csv' | 'excel') => {
    if (analysisData.length === 0) {
      message.warning('没有数据可导出');
      return;
    }

    try {
      if (format === 'csv') {
        exportToCSV(analysisData, columnConfig);
        message.success('CSV导出成功');
      } else {
        await exportToExcel(analysisData, columnConfig);
        message.success('Excel导出成功');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '导出失败';
      message.error(errorMessage);
      console.error('导出失败:', error);
    }
  };

  // 处理列设置
  const handleColumnSettingsOk = (columns: typeof columnConfig) => {
    updateColumnConfig(columns);
    setColumnSettingsVisible(false);
  };

  return (
    <Layout className={styles.overviewPage}>
      <Header className={styles.header}>
        <div className={styles.headerContent}>
          <h2 className={styles.title}>列表数据概况</h2>
          <Space>
            <Select
              value={currentPeriod}
              onChange={(value: KLinePeriod) => {
                // 更新周期（store中会自动更新）
                useOverviewStore.setState({ currentPeriod: value });
                // 如果已有数据，提示用户需要重新分析
                if (analysisData.length > 0) {
                  message.info('周期已更改，请重新分析');
                }
              }}
              options={PERIOD_OPTIONS}
              style={{ width: 100 }}
              disabled={loading}
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
            <Button
              icon={<ExportOutlined />}
              onClick={() => handleExport('csv')}
              disabled={analysisData.length === 0}
            >
              导出CSV
            </Button>
            <Button
              icon={<ExportOutlined />}
              onClick={() => handleExport('excel')}
              disabled={analysisData.length === 0}
            >
              导出Excel
            </Button>
            <Button
              icon={<SettingOutlined />}
              onClick={() => setColumnSettingsVisible(true)}
            >
              列设置
            </Button>
          </Space>
        </div>
      </Header>
      <Content className={styles.content}>
        {/* 进度条 */}
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

        {/* 错误列表 */}
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

        {/* 数据表格 */}
        {analysisData.length > 0 ? (
          <Card className={styles.tableCard}>
            <OverviewTable
              data={analysisData}
              columns={columnConfig}
              sortConfig={sortConfig}
              onSortChange={updateSortConfig}
            />
          </Card>
        ) : (
          <Card className={styles.emptyCard}>
            <div className={styles.emptyText}>
              {watchList.length === 0
                ? '请先添加股票到自选列表'
                : '点击"一键分析"按钮开始分析'}
            </div>
          </Card>
        )}
      </Content>

      {/* 列设置弹窗 */}
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

