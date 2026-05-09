/**
 * 数据管理页面
 * 统一管理应用中的所有缓存数据
 */

import { useState, useEffect } from 'react';
import { Card, Button, Space, Typography, Statistic, Row, Col, App, Modal, Upload } from 'antd';
import {
  ReloadOutlined,
  DeleteOutlined,
  ExportOutlined,
  ImportOutlined,
  DatabaseOutlined,
  StockOutlined,
  PartitionOutlined,
} from '@ant-design/icons';
import { refreshStockList } from '@/services/stocks/api';
import {
  refreshIndustrySectorsBasic,
  refreshConceptSectorsBasic,
} from '@/services/hot/unified-sectors';
import {
  getIndustrySectors,
  getConceptSectors,
  clearSectorStocksDB,
} from '@/utils/storage/sectorStocksIndexedDB';
import { exportSectorStocksToJSON, importSectorStocksFromJSON } from '@/utils/export/sectorStocksExport';
import { CACHE_TTL, CACHE_KEYS } from '@/utils/config/constants';
import { getStorage } from '@/utils/storage/storage';
import type { StockInfo } from '@/types/stock';
import { logger } from '@/utils/business/logger';
import styles from './DataManagerPage.module.css';

const { Title, Text } = Typography;

interface CacheStatus {
  count: number;
  lastUpdate?: number;
  isExpired: boolean;
}

export function DataManagerPage() {
  const { message: antMessage } = App.useApp();

  // 股票列表状态
  const [stockListStatus, setStockListStatus] = useState<CacheStatus | null>(null);
  const [refreshingStockList, setRefreshingStockList] = useState(false);

  // 板块基础信息状态
  const [industryBasicStatus, setIndustryBasicStatus] = useState<CacheStatus | null>(null);
  const [conceptBasicStatus, setConceptBasicStatus] = useState<CacheStatus | null>(null);
  const [refreshingIndustryBasic, setRefreshingIndustryBasic] = useState(false);
  const [refreshingConceptBasic, setRefreshingConceptBasic] = useState(false);

  // 成分股数据状态
  const [industryStocksStatus, setIndustryStocksStatus] = useState<CacheStatus | null>(null);
  const [conceptStocksStatus, setConceptStocksStatus] = useState<CacheStatus | null>(null);
  const [clearingSectorStocks, setClearingSectorStocks] = useState(false);
  const [importingSectorStocks, setImportingSectorStocks] = useState(false);

  // 加载所有数据状态
  useEffect(() => {
    loadAllStatus();
  }, []);

  const loadAllStatus = async () => {
    await Promise.all([
      loadStockListStatus(),
      loadSectorBasicStatus(),
      loadSectorStocksStatus(),
    ]);
  };

  // 加载股票列表状态
  const loadStockListStatus = async () => {
    try {
      const cache = getStorage<{ savedAt: number; stocks: StockInfo[] } | null>(
        CACHE_KEYS.BIYING_STOCK_LIST,
        null
      );

      if (cache && cache.stocks) {
        const now = Date.now();
        const age = now - cache.savedAt;
        const ttl = CACHE_TTL.STOCK_LIST;
        const isExpired = age > ttl;

        setStockListStatus({
          count: cache.stocks.length,
          lastUpdate: cache.savedAt,
          isExpired,
        });
      } else {
        setStockListStatus({
          count: 0,
          isExpired: true,
        });
      }
    } catch (error) {
      logger.error('加载股票列表状态失败:', error);
    }
  };

  // 加载板块基础信息状态
  const loadSectorBasicStatus = async () => {
    try {
      const industryCache = getStorage<{ savedAt: number; data: any[] } | null>(
        CACHE_KEYS.INDUSTRY_BASIC,
        null
      );
      const conceptCache = getStorage<{ savedAt: number; data: any[] } | null>(
        CACHE_KEYS.CONCEPT_BASIC,
        null
      );

      if (industryCache?.data) {
        setIndustryBasicStatus({
          count: industryCache.data.length,
          lastUpdate: industryCache.savedAt,
          isExpired: false, // 板块基础信息不过期
        });
      } else {
        setIndustryBasicStatus({ count: 0, isExpired: true });
      }

      if (conceptCache?.data) {
        setConceptBasicStatus({
          count: conceptCache.data.length,
          lastUpdate: conceptCache.savedAt,
          isExpired: false,
        });
      } else {
        setConceptBasicStatus({ count: 0, isExpired: true });
      }
    } catch (error) {
      logger.error('加载板块基础信息状态失败:', error);
    }
  };

  // 加载成分股数据状态
  const loadSectorStocksStatus = async () => {
    try {
      const [industrySectors, conceptSectors] = await Promise.all([
        getIndustrySectors(),
        getConceptSectors(),
      ]);

      const now = Date.now();

      if (industrySectors.length > 0) {
        const lastUpdate = Math.max(...industrySectors.map((s) => s.savedAt || 0));
        // 板块成分股数据默认不过期
        setIndustryStocksStatus({
          count: industrySectors.length,
          lastUpdate,
          isExpired: false,
        });
      } else {
        setIndustryStocksStatus({ count: 0, isExpired: true });
      }

      if (conceptSectors.length > 0) {
        const lastUpdate = Math.max(...conceptSectors.map((s) => s.savedAt || 0));
        // 板块成分股数据默认不过期
        setConceptStocksStatus({
          count: conceptSectors.length,
          lastUpdate,
          isExpired: false,
        });
      } else {
        setConceptStocksStatus({ count: 0, isExpired: true });
      }
    } catch (error) {
      logger.error('加载成分股数据状态失败:', error);
    }
  };

  // 格式化时间
  const formatTime = (timestamp?: number) => {
    if (!timestamp) return '未知';
    const date = new Date(timestamp);
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // 刷新股票列表
  const handleRefreshStockList = async () => {
    setRefreshingStockList(true);
    try {
      await refreshStockList();
      antMessage.success('股票列表刷新成功');
      await loadStockListStatus();
    } catch (error) {
      antMessage.error('刷新失败，请查看控制台');
      logger.error('刷新股票列表失败:', error);
    } finally {
      setRefreshingStockList(false);
    }
  };

  // 清除股票列表缓存
  const handleClearStockList = () => {
    Modal.confirm({
      title: '确认清除',
      content: '清除后将重新获取股票列表，是否继续？',
      onOk: async () => {
        try {
          localStorage.removeItem(CACHE_KEYS.BIYING_STOCK_LIST);
          antMessage.success('缓存已清除');
          await loadStockListStatus();
        } catch (error) {
          antMessage.error('清除失败');
        }
      },
    });
  };

  // 刷新行业板块基础信息
  const handleRefreshIndustryBasic = async () => {
    setRefreshingIndustryBasic(true);
    try {
      await refreshIndustrySectorsBasic();
      antMessage.success('行业板块基础信息刷新成功');
      await loadSectorBasicStatus();
    } catch (error) {
      antMessage.error('刷新失败');
      logger.error('刷新行业板块基础信息失败:', error);
    } finally {
      setRefreshingIndustryBasic(false);
    }
  };

  // 刷新概念板块基础信息
  const handleRefreshConceptBasic = async () => {
    setRefreshingConceptBasic(true);
    try {
      await refreshConceptSectorsBasic();
      antMessage.success('概念板块基础信息刷新成功');
      await loadSectorBasicStatus();
    } catch (error) {
      antMessage.error('刷新失败');
      logger.error('刷新概念板块基础信息失败:', error);
    } finally {
      setRefreshingConceptBasic(false);
    }
  };

  // 清除板块基础信息缓存
  const handleClearSectorBasic = (type: 'industry' | 'concept') => {
    Modal.confirm({
      title: '确认清除',
      content: `清除${type === 'industry' ? '行业' : '概念'}板块基础信息缓存后，将重新获取数据，是否继续？`,
      onOk: async () => {
        try {
          const key = type === 'industry' ? CACHE_KEYS.INDUSTRY_BASIC : CACHE_KEYS.CONCEPT_BASIC;
          localStorage.removeItem(key);
          antMessage.success('缓存已清除');
          await loadSectorBasicStatus();
        } catch (error) {
          antMessage.error('清除失败');
        }
      },
    });
  };

  // 导出成分股数据
  const handleExportSectorStocks = async () => {
    try {
      await exportSectorStocksToJSON();
      antMessage.success('导出成功');
    } catch (error) {
      antMessage.error('导出失败');
      logger.error('导出成分股数据失败:', error);
    }
  };

  // 导入成分股数据
  const handleImportSectorStocks = async (file: File) => {
    setImportingSectorStocks(true);
    try {
      const result = await importSectorStocksFromJSON(file, 'overwrite');
      if (result.success) {
        antMessage.success(result.message);
        await loadSectorStocksStatus();
      } else {
        antMessage.error(result.message);
      }
    } catch (error) {
      antMessage.error('导入失败');
      logger.error('导入成分股数据失败:', error);
    } finally {
      setImportingSectorStocks(false);
    }
    return false; // 阻止默认上传行为
  };

  // 清空成分股数据
  const handleClearSectorStocks = () => {
    Modal.confirm({
      title: '确认清空',
      content: '清空后将删除所有成分股数据，此操作不可恢复，是否继续？',
      okText: '确认清空',
      okType: 'danger',
      onOk: async () => {
        setClearingSectorStocks(true);
        try {
          await clearSectorStocksDB();
          antMessage.success('数据已清空');
          await loadSectorStocksStatus();
        } catch (error) {
          antMessage.error('清空失败');
          logger.error('清空成分股数据失败:', error);
        } finally {
          setClearingSectorStocks(false);
        }
      },
    });
  };

  return (
    <div className={styles.pageContainer}>
      <div className={styles.content}>
        {/* 股票列表管理 */}
        <Card className={styles.card} title={
          <Space>
            <StockOutlined />
            <span>股票列表</span>
          </Space>
        }>
          <Row gutter={16}>
            <Col span={8}>
              <Statistic
                title="股票总数"
                value={stockListStatus?.count || 0}
                suffix="只"
              />
            </Col>
            <Col span={8}>
              <Statistic
                title="最后刷新"
                value={formatTime(stockListStatus?.lastUpdate)}
              />
            </Col>
            <Col span={8}>
              <Statistic
                title="缓存状态"
                value={stockListStatus?.isExpired ? '已过期' : '有效'}
                valueStyle={{
                  color: stockListStatus?.isExpired ? '#ff4d4f' : '#52c41a',
                }}
              />
            </Col>
          </Row>
          <Space className={styles.actionButtons}>
            <Button
              icon={<ReloadOutlined />}
              onClick={handleRefreshStockList}
              loading={refreshingStockList}
              type="primary"
            >
              强制刷新
            </Button>
            <Button
              icon={<DeleteOutlined />}
              onClick={handleClearStockList}
              danger
            >
              清除缓存
            </Button>
          </Space>
        </Card>

        {/* 板块基础信息管理 */}
        <Card className={styles.card} title={
          <Space>
            <PartitionOutlined />
            <span>板块基础信息</span>
          </Space>
        }>
          <Row gutter={16}>
            <Col span={12}>
              <Card size="small" className={styles.subCard}>
                <Statistic
                  title="行业板块"
                  value={industryBasicStatus?.count || 0}
                  suffix="个"
                />
                <Text type="secondary" className={styles.updateTime}>
                  最后更新: {formatTime(industryBasicStatus?.lastUpdate)}
                </Text>
                <Space className={styles.subCardActions}>
                  <Button
                    size="small"
                    icon={<ReloadOutlined />}
                    onClick={handleRefreshIndustryBasic}
                    loading={refreshingIndustryBasic}
                  >
                    刷新
                  </Button>
                  <Button
                    size="small"
                    icon={<DeleteOutlined />}
                    onClick={() => handleClearSectorBasic('industry')}
                    danger
                  >
                    清除
                  </Button>
                </Space>
              </Card>
            </Col>
            <Col span={12}>
              <Card size="small" className={styles.subCard}>
                <Statistic
                  title="概念板块"
                  value={conceptBasicStatus?.count || 0}
                  suffix="个"
                />
                <Text type="secondary" className={styles.updateTime}>
                  最后更新: {formatTime(conceptBasicStatus?.lastUpdate)}
                </Text>
                <Space className={styles.subCardActions}>
                  <Button
                    size="small"
                    icon={<ReloadOutlined />}
                    onClick={handleRefreshConceptBasic}
                    loading={refreshingConceptBasic}
                  >
                    刷新
                  </Button>
                  <Button
                    size="small"
                    icon={<DeleteOutlined />}
                    onClick={() => handleClearSectorBasic('concept')}
                    danger
                  >
                    清除
                  </Button>
                </Space>
              </Card>
            </Col>
          </Row>
        </Card>

        {/* 成分股数据管理 */}
        <Card className={styles.card} title={
          <Space>
            <DatabaseOutlined />
            <span>成分股数据 (IndexedDB)</span>
          </Space>
        }>
          <Row gutter={16}>
            <Col span={12}>
              <Card size="small" className={styles.subCard}>
                <Statistic
                  title="行业成分股"
                  value={industryStocksStatus?.count || 0}
                  suffix="个板块"
                />
                <Text type="secondary" className={styles.updateTime}>
                  最后更新: {formatTime(industryStocksStatus?.lastUpdate)}
                </Text>
              </Card>
            </Col>
            <Col span={12}>
              <Card size="small" className={styles.subCard}>
                <Statistic
                  title="概念成分股"
                  value={conceptStocksStatus?.count || 0}
                  suffix="个板块"
                />
                <Text type="secondary" className={styles.updateTime}>
                  最后更新: {formatTime(conceptStocksStatus?.lastUpdate)}
                </Text>
              </Card>
            </Col>
          </Row>
          <Space className={styles.actionButtons}>
            <Button
              icon={<ExportOutlined />}
              onClick={handleExportSectorStocks}
              type="primary"
            >
              导出数据
            </Button>
            <Upload
              accept=".json"
              showUploadList={false}
              beforeUpload={handleImportSectorStocks}
              disabled={importingSectorStocks}
            >
              <Button
                icon={<ImportOutlined />}
                loading={importingSectorStocks}
              >
                导入数据
              </Button>
            </Upload>
            <Button
              icon={<DeleteOutlined />}
              onClick={handleClearSectorStocks}
              danger
              loading={clearingSectorStocks}
            >
              清空全部
            </Button>
          </Space>
        </Card>
      </div>
    </div>
  );
}
