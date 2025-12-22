/**
 * 机会分析页面
 */

import { useEffect, useState, useMemo } from 'react';
import { Layout, Card, Button, Space, Progress, Select, Collapse, message, InputNumber } from 'antd';
import {
  PlayCircleOutlined,
  StopOutlined,
  ExportOutlined,
  SettingOutlined,
  ExclamationCircleOutlined,
} from '@ant-design/icons';
import { useOpportunityStore } from '@/stores/opportunityStore';
import { OpportunityTable } from '@/components/OpportunityTable/OpportunityTable';
import { OverviewColumnSettings } from '@/components/OverviewColumnSettings/OverviewColumnSettings';
import { exportOpportunityToExcel } from '@/utils/opportunityExportUtils';
import type { KLinePeriod, StockInfo } from '@/types/stock';
import { useAllStocks } from '@/hooks/useAllStocks';
import { getPureCode } from '@/utils/format';
import { getStockQuotes } from '@/services/stockApi';
import styles from './OpportunityPage.module.css';

const { Header, Content } = Layout;
const { Panel } = Collapse;

const PERIOD_OPTIONS: { label: string; value: KLinePeriod }[] = [
  { label: '日', value: 'day' },
  { label: '周', value: 'week' },
  { label: '月', value: 'month' },
  { label: '年', value: 'year' },
];

const MARKET_OPTIONS: { label: string; value: string }[] = [
  { label: '沪市主板', value: 'sh_main' },
  { label: '深市主板', value: 'sz_main' },
  { label: '创业板', value: 'sz_gem' },
];

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

  const { allStocks } = useAllStocks();
  const [columnSettingsVisible, setColumnSettingsVisible] = useState(false);
  const [selectedMarket, setSelectedMarket] = useState<string>('sh_main');
  const [priceRange, setPriceRange] = useState<{ min?: number; max?: number }>({});
  const [filteringQuotes, setFilteringQuotes] = useState(false);

  useEffect(() => {
    loadCachedData();
  }, [loadCachedData]);

  // 根据选择的市场类型筛选股票
  const filteredStocks = useMemo<StockInfo[]>(() => {
    if (allStocks.length === 0) {
      return [];
    }

    return allStocks.filter((stock) => {
      const pureCode = getPureCode(stock.code);

      switch (selectedMarket) {
        case 'sh_main':
          // 沪市主板：60开头
          return pureCode.startsWith('60');
        case 'sz_main':
          // 深市主板：00开头
          return pureCode.startsWith('00');
        case 'sz_gem':
          // 创业板：30开头
          return pureCode.startsWith('30');
        default:
          return false;
      }
    });
  }, [allStocks, selectedMarket]);

  const handleAnalyze = async () => {
    if (filteredStocks.length === 0) {
      message.warning('当前市场暂无股票数据');
      return;
    }

    // 如果设置了价格范围，需要先获取行情进行筛选
    const hasPriceFilter = priceRange.min !== undefined || priceRange.max !== undefined;

    if (hasPriceFilter) {
      setFilteringQuotes(true);
      try {
        // Step 1: 分批获取行情（每批最多100个）
        const QUOTES_BATCH_SIZE = 100;
        const batches: StockInfo[][] = [];
        for (let i = 0; i < filteredStocks.length; i += QUOTES_BATCH_SIZE) {
          batches.push(filteredStocks.slice(i, i + QUOTES_BATCH_SIZE));
        }

        const allQuotes: Array<{ stock: StockInfo; price: number }> = [];

        for (const batch of batches) {
          const codes = batch.map((s) => s.code);
          const quotes = await getStockQuotes(codes);

          quotes.forEach((quote) => {
            const stock = batch.find((s) => s.code === quote.code);
            if (stock) {
              allQuotes.push({ stock, price: quote.price });
            }
          });
        }

        // Step 2: 根据价格范围筛选
        const finalStocks = allQuotes
          .filter((item) => {
            const price = item.price;
            if (priceRange.min !== undefined && price < priceRange.min) {
              return false;
            }
            if (priceRange.max !== undefined && price > priceRange.max) {
              return false;
            }
            return true;
          })
          .map((item) => item.stock);

        if (finalStocks.length === 0) {
          message.warning('没有股票满足价格范围条件');
          setFilteringQuotes(false);
          return;
        }

        // Step 3: 对筛选后的股票进行分析
        await startAnalysis(currentPeriod, finalStocks, currentCount);
      } catch (error) {
        console.error('获取行情失败:', error);
        message.error('获取行情数据失败，请重试');
      } finally {
        setFilteringQuotes(false);
      }
    } else {
      // 没有设置价格范围，直接使用所有股票进行分析
      await startAnalysis(currentPeriod, filteredStocks, currentCount);
    }
  };

  const handleCancel = () => {
    cancelAnalysis();
    message.info('分析已取消');
  };

  const handleExport = async (format: 'excel') => {
    if (analysisData.length === 0) {
      message.warning('没有数据可导出');
      return;
    }

    try {
      if (format === 'excel') {
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
          <Space>
            <Space.Compact className={styles.spaceCompact}>
              <span className={styles.label}>市场：</span>
              <Select
                value={selectedMarket}
                onChange={(value: string) => {
                  setSelectedMarket(value);
                  if (analysisData.length > 0) {
                    message.info('市场已更改，请重新分析');
                  }
                }}
                options={MARKET_OPTIONS}
                style={{ width: 120 }}
                disabled={loading}
              />
            </Space.Compact>
            <Space.Compact className={styles.spaceCompact}>
              <span className={styles.label}>周期：</span>
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
            </Space.Compact>
            <Space className={styles.spaceCompact}>
              <span className={styles.label}>K线数量：</span>
              <InputNumber
                value={currentCount}
                min={50}
                max={1000}
                step={10}
                style={{ width: 120 }}
                placeholder="count"
                disabled={loading || filteringQuotes}
                onChange={(v) => {
                  const next = typeof v === 'number' && isFinite(v) ? Math.floor(v) : 500;
                  useOpportunityStore.setState({ currentCount: next });
                  if (analysisData.length > 0) {
                    message.info('count已更改，请重新分析');
                  }
                }}
              />
            </Space>
            <Space.Compact className={styles.spaceCompact}>
              <span className={styles.label}>价格范围：</span>
              <InputNumber
                value={priceRange.min}
                min={0}
                step={0.01}
                precision={2}
                style={{ width: 100 }}
                placeholder="最低价"
                disabled={loading || filteringQuotes}
                onChange={(v) => {
                  setPriceRange((prev) => ({
                    ...prev,
                    min: typeof v === 'number' && isFinite(v) ? v : undefined,
                  }));
                  if (analysisData.length > 0) {
                    message.info('价格范围已更改，请重新分析');
                  }
                }}
              />
              <span style={{ margin: '0 4px' }}>~</span>
              <InputNumber
                value={priceRange.max}
                min={0}
                step={0.01}
                precision={2}
                style={{ width: 100 }}
                placeholder="最高价"
                disabled={loading || filteringQuotes}
                onChange={(v) => {
                  setPriceRange((prev) => ({
                    ...prev,
                    max: typeof v === 'number' && isFinite(v) ? v : undefined,
                  }));
                  if (analysisData.length > 0) {
                    message.info('价格范围已更改，请重新分析');
                  }
                }}
              />
              {(priceRange.min !== undefined || priceRange.max !== undefined) && (
                <Button
                  size="small"
                  style={{ marginLeft: 8 }}
                  onClick={() => {
                    setPriceRange({});
                    if (analysisData.length > 0) {
                      message.info('价格范围已清除，请重新分析');
                    }
                  }}
                  disabled={loading || filteringQuotes}
                >
                  不限
                </Button>
              )}
            </Space.Compact>
            <Button
              type="primary"
              icon={<PlayCircleOutlined />}
              onClick={handleAnalyze}
              loading={loading || filteringQuotes}
              disabled={loading || filteringQuotes || filteredStocks.length === 0}
            >
              一键分析
            </Button>
            {loading && (
              <Button icon={<StopOutlined />} onClick={handleCancel}>
                取消
              </Button>
            )}
            <Button icon={<ExportOutlined />} onClick={() => handleExport('excel')} disabled={analysisData.length === 0}>
              导出Excel
            </Button>
            <Button icon={<SettingOutlined />} onClick={() => setColumnSettingsVisible(true)}>
              列设置
            </Button>
          </Space>
        </div >
      </Header >

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
              {filteredStocks.length === 0 ? '当前市场暂无股票数据' : '点击"一键分析"按钮开始分析'}
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
    </Layout >
  );
}


