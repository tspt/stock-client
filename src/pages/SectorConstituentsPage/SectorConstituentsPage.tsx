/**
 * 成分股大全页面 - 仪表盘式布局
 */

import { useState, useMemo, useEffect, useRef } from 'react';
import { Layout, Button, Progress, Input, Typography, Empty, App, Space } from 'antd';
import { RocketOutlined, LoadingOutlined, ExportOutlined, FilterOutlined } from '@ant-design/icons';
import { fetchAllSectorsStocks, fetchRemainingSectorsStocks, type SectorFullData, type FetchProgress, type FailedSector, type StockSimpleInfo } from '@/services/hot/sector-stocks-service';
import { getIndustrySectors, getConceptSectors, type SectorWithStocks } from '@/utils/storage/sectorStocksIndexedDB';
import { CACHE_TTL } from '@/utils/config/constants';
import { logger } from '@/utils/business/logger';
import { StockFilterDrawer } from '@/components/StockFilterDrawer/StockFilterDrawer';
import {
  loadSectorFilterPrefs,
  saveSectorFilterPrefs,
  clearSectorFilterPrefs,
  hasActiveFilters,
  type SectorFilterPrefs,
  DEFAULT_FILTER_PREFS,
} from '@/utils/config/sectorFilterPrefs';
import styles from './SectorConstituentsPage.module.css';

const { Header, Content } = Layout;
const { Text } = Typography;

export function SectorConstituentsPage() {
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<FetchProgress | null>(null);
  const [industryData, setIndustryData] = useState<SectorFullData[]>([]);
  const [conceptData, setConceptData] = useState<SectorFullData[]>([]);
  const [failedSectors, setFailedSectors] = useState<FailedSector[]>([]);
  const [selectedSector, setSelectedSector] = useState<SectorFullData | null>(null);
  const [industrySearch, setIndustrySearch] = useState('');
  const [conceptSearch, setConceptSearch] = useState('');
  const [filterDrawerOpen, setFilterDrawerOpen] = useState(false);
  const [filterPrefs, setFilterPrefs] = useState<SectorFilterPrefs>(DEFAULT_FILTER_PREFS);
  const abortControllerRef = useRef<AbortController | null>(null);
  const hasLoadedRef = useRef(false);

  // 页面加载时从 IndexedDB 读取缓存，并加载筛选配置
  useEffect(() => {
    if (!hasLoadedRef.current) {
      hasLoadedRef.current = true;
      // 加载筛选配置
      const savedPrefs = loadSectorFilterPrefs();
      setFilterPrefs(savedPrefs);
      // 加载缓存数据
      loadCachedData();
    }
  }, []);

  const loadCachedData = async (showMessage: boolean = true) => {
    try {
      const [cachedIndustry, cachedConcept] = await Promise.all([
        getIndustrySectors(),
        getConceptSectors(),
      ]);

      if (cachedIndustry.length > 0 || cachedConcept.length > 0) {
        // 板块成分股数据过期时间设置为不限，直接加载缓存数据
        setIndustryData(formatToDisplayData(cachedIndustry));
        setConceptData(formatToDisplayData(cachedConcept));
        if (showMessage) {
          message.success('已加载本地缓存数据');
        }
      }
    } catch (error) {
      logger.error('加载缓存数据失败:', error);
    }
  };

  const formatToDisplayData = (sectors: SectorWithStocks[]): SectorFullData[] => {
    return sectors.map((s) => ({
      sectorCode: s.code,
      sectorName: s.name,
      stocks: s.children,
    }));
  };

  // 开始获取数据
  const handleStartFetch = async (retryList?: FailedSector[]) => {
    setLoading(true);
    const sectorsToFetch = retryList || [];

    // 创建新的 AbortController
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    setProgress({ current: 0, total: sectorsToFetch.length > 0 ? sectorsToFetch.length : 1, percent: 0, message: '准备中...' });
    try {
      const result = await fetchAllSectorsStocks((p) => {
        setProgress(p);
      }, !retryList, sectorsToFetch, signal); // 传入 signal

      if (!retryList) {
        setIndustryData(result.industry);
        setConceptData(result.concept);
      } else {
        // 重试模式下，合并数据
        setIndustryData(prev => [...prev, ...result.industry]);
        setConceptData(prev => [...prev, ...result.concept]);
      }

      setFailedSectors(result.failed);
      setProgress(null);
      if (signal.aborted) {
        message.info('已取消获取');
      } else if (result.failed.length === 0) {
        message.success('数据获取完成');
      } else {
        message.warning(`获取完成，但有 ${result.failed.length} 个板块失败，可点击重试`);
      }
    } catch (error: any) {
      if (error.name === 'AbortError') {
        message.info('已取消获取');
        // 注意：此时 result 未定义，需要从 IndexedDB 重新加载（不显示提示）
        await loadCachedData(false);
      } else {
        logger.error('获取板块成分股失败:', error);
        message.error('获取数据失败，请查看控制台');
      }
      setProgress(null);
    } finally {
      setLoading(false);
      abortControllerRef.current = null;
    }
  };

  // 取消获取
  const handleCancelFetch = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  };

  // 开始增量获取数据(剩余全量获取)
  const handleStartRemainingFetch = async () => {
    setLoading(true);

    // 创建新的 AbortController
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    setProgress({ current: 0, total: 1, percent: 0, message: '检查缓存中...' });

    try {
      const result = await fetchRemainingSectorsStocks((p) => {
        setProgress(p);
      }, signal);

      // 合并数据到现有状态
      setIndustryData((prev) => {
        const existingCodes = new Set(prev.map((s) => s.sectorCode));
        const newItems = result.industry.filter((s) => !existingCodes.has(s.sectorCode));
        return [...prev, ...newItems];
      });

      setConceptData((prev) => {
        const existingCodes = new Set(prev.map((s) => s.sectorCode));
        const newItems = result.concept.filter((s) => !existingCodes.has(s.sectorCode));
        return [...prev, ...newItems];
      });

      setFailedSectors(result.failed);
      setProgress(null);

      if (signal.aborted) {
        message.info('已取消获取');
      } else if (result.failed.length === 0) {
        message.success('剩余数据获取完成');
      } else {
        message.warning(`获取完成,但有 ${result.failed.length} 个板块失败,可点击重试`);
      }
    } catch (error: any) {
      if (error.name === 'AbortError') {
        message.info('已取消获取');
        // 注意：此时 result 未定义，需要从 IndexedDB 重新加载（不显示提示）
        await loadCachedData(false);
      } else {
        logger.error('获取剩余板块成分股失败:', error);
        message.error('获取数据失败,请查看控制台');
      }
      setProgress(null);
    } finally {
      setLoading(false);
      abortControllerRef.current = null;
    }
  };

  // 导出当前选中板块的成分股（导出筛选后的结果）
  const handleExport = () => {
    if (!selectedSector) return;
    const stocksToExport = applyFilterToStocks(selectedSector.stocks, filterPrefs);
    const content = stocksToExport
      .map((s) => `${s.name}\t${s.code}`)
      .join('\n');
    const blob = new Blob([`板块名称：${selectedSector.sectorName}\n\n名称\t代码\n${content}`], {
      type: 'text/plain;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selectedSector.sectorName}_成分股.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // 应用筛选到股票列表
  const applyFilterToStocks = (stocks: StockSimpleInfo[], prefs: SectorFilterPrefs): StockSimpleInfo[] => {
    let filtered = [...stocks];

    // 1. 关键词搜索（代码或名称）
    if (prefs.searchKeyword) {
      const keyword = prefs.searchKeyword.toLowerCase();
      filtered = filtered.filter(
        (stock) =>
          stock.code.toLowerCase().includes(keyword) ||
          stock.name.toLowerCase().includes(keyword)
      );
    }

    // 2. 代码范围筛选
    if (prefs.codeStart) {
      filtered = filtered.filter((stock) => stock.code >= prefs.codeStart);
    }
    if (prefs.codeEnd) {
      filtered = filtered.filter((stock) => stock.code <= prefs.codeEnd);
    }

    // 3. 市场类型筛选
    if (prefs.marketTypes.length > 0) {
      filtered = filtered.filter((stock) => {
        const codePrefix = stock.code.substring(0, 2);
        return prefs.marketTypes.some((type) => {
          switch (type) {
            case 'shanghai':
              return codePrefix === '60';
            case 'shenzhen-main':
              return codePrefix === '00';
            case 'shenzhen-chinext':
              return codePrefix === '30';
            case 'beijing':
              return codePrefix === '83' || codePrefix === '87' || codePrefix === '43';
            default:
              return false;
          }
        });
      });
    }

    // 4. 排序
    filtered.sort((a, b) => {
      switch (prefs.sortOrder) {
        case 'code-asc':
          return a.code.localeCompare(b.code);
        case 'code-desc':
          return b.code.localeCompare(a.code);
        case 'name-asc':
          return a.name.localeCompare(b.name, 'zh-CN');
        default:
          return 0;
      }
    });

    return filtered;
  };

  // 处理筛选条件变化
  const handleFilterChange = (prefs: SectorFilterPrefs) => {
    setFilterPrefs(prefs);
    saveSectorFilterPrefs(prefs);
  };

  // 清除筛选
  const handleClearFilters = () => {
    setFilterPrefs(DEFAULT_FILTER_PREFS);
    clearSectorFilterPrefs();
  };

  // 关闭筛选抽屉
  const handleCloseFilterDrawer = () => {
    setFilterDrawerOpen(false);
  };

  // 切换板块
  const handleSectorSelect = (sector: SectorFullData) => {
    setSelectedSector(sector);
  };

  // 过滤后的列表
  const filteredIndustry = useMemo(() => {
    if (!industrySearch) return industryData;
    return industryData.filter((item) =>
      item.sectorName.toLowerCase().includes(industrySearch.toLowerCase())
    );
  }, [industryData, industrySearch]);

  const filteredConcept = useMemo(() => {
    if (!conceptSearch) return conceptData;
    return conceptData.filter((item) =>
      item.sectorName.toLowerCase().includes(conceptSearch.toLowerCase())
    );
  }, [conceptData, conceptSearch]);

  // 渲染侧边栏列表项
  const renderListItem = (sector: SectorFullData, colorClass: string) => (
    <div
      key={sector.sectorCode}
      className={`${styles.listItem} ${selectedSector?.sectorCode === sector.sectorCode ? styles.activeItem : ''}`}
      onClick={() => handleSectorSelect(sector)}
    >
      <Text className={styles.sectorName} ellipsis={{ tooltip: sector.sectorName }}>
        {sector.sectorName}
      </Text>
      <span className={`${styles.stockCount} ${colorClass}`}>
        {sector.stocks.length}
      </span>
    </div>
  );

  return (
    <Layout className={styles.pageContainer}>
      {/* 顶部控制区 */}
      <Header className={styles.header}>
        <div className={styles.headerContent}>
          <div className={styles.headerLeft}>
            <Text className={styles.pageTitle}>成分股大全</Text>
            <Text type="secondary" className={styles.pageSubtitle}>
              一键获取所有行业与概念板块的完整成分股名单
            </Text>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            {loading ? (
              <Button danger onClick={handleCancelFetch}>
                取消获取
              </Button>
            ) : (
              failedSectors.length > 0 && (
                <Button
                  danger
                  onClick={() => handleStartFetch(failedSectors)}
                >
                  重试失败项 ({failedSectors.length})
                </Button>
              )
            )}
            <Button
              icon={<FilterOutlined />}
              onClick={() => setFilterDrawerOpen(true)}
              style={{
                borderColor: hasActiveFilters(filterPrefs) ? 'var(--ant-color-primary)' : undefined,
                color: hasActiveFilters(filterPrefs) ? 'var(--ant-color-primary)' : undefined,
              }}
            >
              全局筛选
              {hasActiveFilters(filterPrefs) && (
                <span style={{ marginLeft: 4, fontSize: 10 }}>●</span>
              )}
            </Button>
            <Button
              icon={<RocketOutlined />}
              onClick={handleStartRemainingFetch}
              loading={loading}
              disabled={loading}
            >
              剩余全量获取
            </Button>
            <Button
              type="primary"
              icon={loading ? <LoadingOutlined /> : <RocketOutlined />}
              onClick={() => handleStartFetch()}
              loading={loading}
              disabled={loading}
            >
              {loading ? '全量获取中...' : '开始全量获取'}
            </Button>
          </div>
        </div>
      </Header>

      {/* 进度条悬浮层 */}
      {progress && (
        <div className={styles.progressOverlay}>
          <div className={styles.progressInfo}>
            <LoadingOutlined spin />
            <Text strong>{progress.message}</Text>
            <Text type="secondary">
              ({progress.current}/{progress.total})
            </Text>
          </div>
          <Progress
            percent={progress.percent}
            status="active"
            showInfo={false}
            strokeColor="#1890ff"
            size="small"
          />
        </div>
      )}

      {/* 主体内容区 */}
      <div className={styles.mainGrid}>
        {/* 左侧导航栏 */}
        <div className={styles.sidebar}>
          {/* 行业板块 */}
          <div className={styles.sidebarSection}>
            <div className={styles.sectionHeader}>
              <Text className={styles.sectionTitle}>行业板块</Text>
              <Input
                placeholder="搜索"
                value={industrySearch}
                onChange={(e) => setIndustrySearch(e.target.value)}
                allowClear
                size="small"
                className={styles.searchInput}
              />
            </div>
            <div className={styles.listContainer}>
              {filteredIndustry.map((s) => renderListItem(s, styles.industryColor))}
            </div>
          </div>

          {/* 概念板块 */}
          <div className={styles.sidebarSection}>
            <div className={styles.sectionHeader}>
              <Text className={styles.sectionTitle}>概念板块</Text>
              <Input
                placeholder="搜索"
                value={conceptSearch}
                onChange={(e) => setConceptSearch(e.target.value)}
                allowClear
                size="small"
                className={styles.searchInput}
              />
            </div>
            <div className={styles.listContainer}>
              {filteredConcept.map((s) => renderListItem(s, styles.conceptColor))}
            </div>
          </div>
        </div>

        {/* 右侧详情区 */}
        <Content className={styles.contentArea}>
          {selectedSector ? (
            <>
              <div className={styles.detailHeader}>
                <div>
                  <Text className={styles.detailName}>{selectedSector.sectorName}</Text>
                  <Text type="secondary" className={styles.detailCount}>
                    {(() => {
                      const filtered = applyFilterToStocks(selectedSector.stocks, filterPrefs);
                      const totalCount = selectedSector.stocks.length;
                      const filteredCount = filtered.length;
                      if (hasActiveFilters(filterPrefs)) {
                        return (
                          <>
                            共 <strong>{filteredCount}</strong>/{totalCount} 只成分股
                            <span style={{ marginLeft: 8, color: 'var(--ant-color-primary)' }}>
                              (已筛选)
                            </span>
                          </>
                        );
                      }
                      return `共 ${totalCount} 只成分股`;
                    })()}
                  </Text>
                </div>
                <Space>
                  <Button size="small" icon={<ExportOutlined />} onClick={handleExport}>
                    导出名单
                  </Button>
                </Space>
              </div>
              <div className={styles.stockGrid}>
                {(() => {
                  const filtered = applyFilterToStocks(selectedSector.stocks, filterPrefs);
                  return filtered.map((stock) => (
                    <div key={stock.code} className={styles.stockItem}>
                      <Text className={styles.stockName}>{stock.name}</Text>
                      <Text type="secondary" className={styles.stockCode}>
                        {stock.code}
                      </Text>
                    </div>
                  ));
                })()}
              </div>
            </>
          ) : (
            <div className={styles.emptyState}>
              <Empty description="请在左侧点击板块查看成分股" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            </div>
          )}
        </Content>
      </div>

      {/* 全局筛选抽屉 */}
      {selectedSector && (
        <StockFilterDrawer
          open={filterDrawerOpen}
          onClose={handleCloseFilterDrawer}
          stocks={selectedSector.stocks}
          filterPrefs={filterPrefs}
          onFilterChange={handleFilterChange}
          onClearFilters={handleClearFilters}
        />
      )}
    </Layout>
  );
}
