/**
 * 成分股大全页面 - 仪表盘式布局
 */

import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { Layout, Button, Progress, Input, Typography, Empty, App, Space, Tooltip } from 'antd';
import { RocketOutlined, LoadingOutlined, ExportOutlined, FilterOutlined, SyncOutlined, ArrowRightOutlined } from '@ant-design/icons';
import VirtualList from 'rc-virtual-list';
import { fetchAllSectorsStocks, fetchRemainingSectorsStocks, type SectorFullData, type FetchProgress, type FailedSector, type StockSimpleInfo } from '@/services/hot/sector-stocks-service';
import { getIndustrySectors, getConceptSectors, type SectorWithStocks } from '@/utils/storage/sectorStocksIndexedDB';
import { CACHE_TTL } from '@/utils/config/constants';
import { logger } from '@/utils/business/logger';
import { StockFilterDrawer } from '@/components/StockFilterDrawer/StockFilterDrawer';
import { clearSectorMappingCache } from '@/services/stocks/sectorEnhancer';
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

// 列表项高度（box-sizing: border-box，height 已包含 padding）
const LIST_ITEM_HEIGHT = 36; // 34px height + 2px margin-bottom

// Memoized 列表项组件，使用 forwardRef 支持 VirtualList 的 ref 传递
const SectorListItem = React.memo(React.forwardRef<HTMLDivElement, {
  sector: SectorFullData;
  colorClass: string;
  isSelected: boolean;
  onSelect: (sector: SectorFullData) => void;
  style?: React.CSSProperties;
}>(({ sector, colorClass, isSelected, onSelect, style }, ref) => {
  const handleClick = useCallback(() => {
    onSelect(sector);
  }, [sector, onSelect]);

  return (
    <div
      ref={ref}
      className={`${styles.listItem} ${isSelected ? styles.activeItem : ''}`}
      onClick={handleClick}
      style={style}
    >
      <Text className={styles.sectorName} ellipsis>
        {sector.sectorName}
      </Text>
      <span className={`${styles.stockCount} ${colorClass}`}>
        {sector.stocks.length}
      </span>
    </div>
  );
}));

SectorListItem.displayName = 'SectorListItem';

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
  const [debouncedIndustrySearch, setDebouncedIndustrySearch] = useState('');
  const [debouncedConceptSearch, setDebouncedConceptSearch] = useState('');
  const [filterDrawerOpen, setFilterDrawerOpen] = useState(false);
  const [filterPrefs, setFilterPrefs] = useState<SectorFilterPrefs>(DEFAULT_FILTER_PREFS);
  const abortControllerRef = useRef<AbortController | null>(null);
  const hasLoadedRef = useRef(false);
  const [updatingSectorInfo, setUpdatingSectorInfo] = useState(false);

  // 搜索防抖定时器
  const industrySearchTimerRef = useRef<NodeJS.Timeout | null>(null);
  const conceptSearchTimerRef = useRef<NodeJS.Timeout | null>(null);

  // 列表容器引用和高度状态
  const industryListRef = useRef<HTMLDivElement>(null);
  const conceptListRef = useRef<HTMLDivElement>(null);
  const [industryListHeight, setIndustryListHeight] = useState(200);
  const [conceptListHeight, setConceptListHeight] = useState(200);

  // 手动触发更新板块映射缓存
  const handleUpdateSectorMapping = async () => {
    setUpdatingSectorInfo(true);
    try {
      // 清除缓存并更新 LocalStorage，将板块信息持久化到股票列表
      await clearSectorMappingCache();
      message.success('板块信息已同步到股票列表');
    } catch (error) {
      logger.error('更新板块信息失败:', error);
      message.error('更新板块信息失败');
    } finally {
      setUpdatingSectorInfo(false);
    }
  };

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

  // 组件卸载时清理定时器
  useEffect(() => {
    return () => {
      if (industrySearchTimerRef.current) {
        clearTimeout(industrySearchTimerRef.current);
      }
      if (conceptSearchTimerRef.current) {
        clearTimeout(conceptSearchTimerRef.current);
      }
    };
  }, []);

  // 使用 ResizeObserver 监听容器高度变化
  useEffect(() => {
    const updateHeights = () => {
      if (industryListRef.current) {
        setIndustryListHeight(industryListRef.current.clientHeight);
      }
      if (conceptListRef.current) {
        setConceptListHeight(conceptListRef.current.clientHeight);
      }
    };

    // 初始化时获取高度
    updateHeights();

    // 监听容器大小变化
    const resizeObserver = new ResizeObserver(updateHeights);
    if (industryListRef.current) {
      resizeObserver.observe(industryListRef.current);
    }
    if (conceptListRef.current) {
      resizeObserver.observe(conceptListRef.current);
    }

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  // 行业板块搜索防抖
  const handleIndustrySearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setIndustrySearch(value);

    if (industrySearchTimerRef.current) {
      clearTimeout(industrySearchTimerRef.current);
    }

    industrySearchTimerRef.current = setTimeout(() => {
      setDebouncedIndustrySearch(value);
    }, 300); // 300ms 防抖
  }, []);

  // 概念板块搜索防抖
  const handleConceptSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setConceptSearch(value);

    if (conceptSearchTimerRef.current) {
      clearTimeout(conceptSearchTimerRef.current);
    }

    conceptSearchTimerRef.current = setTimeout(() => {
      setDebouncedConceptSearch(value);
    }, 300); // 300ms 防抖
  }, []);

  // 处理清空行业搜索
  const handleIndustryClear = useCallback(() => {
    setIndustrySearch('');
    if (industrySearchTimerRef.current) {
      clearTimeout(industrySearchTimerRef.current);
    }
    setDebouncedIndustrySearch('');
  }, []);

  // 处理清空概念搜索
  const handleConceptClear = useCallback(() => {
    setConceptSearch('');
    if (conceptSearchTimerRef.current) {
      clearTimeout(conceptSearchTimerRef.current);
    }
    setDebouncedConceptSearch('');
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
        message.success('数据获取完成，请点击“更新板块信息”按钮同步到股票列表');
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
        message.success('剩余数据获取完成，请点击“更新板块信息”按钮同步到股票列表');
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

  // 过滤后的列表（使用防抖后的搜索词）
  const filteredIndustry = useMemo(() => {
    if (!debouncedIndustrySearch) return industryData;
    const searchLower = debouncedIndustrySearch.toLowerCase();
    return industryData.filter((item) =>
      item.sectorName.toLowerCase().includes(searchLower)
    );
  }, [industryData, debouncedIndustrySearch]);

  const filteredConcept = useMemo(() => {
    if (!debouncedConceptSearch) return conceptData;
    const searchLower = debouncedConceptSearch.toLowerCase();
    return conceptData.filter((item) =>
      item.sectorName.toLowerCase().includes(searchLower)
    );
  }, [conceptData, debouncedConceptSearch]);

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
            strokeColor={{
              '0%': '#1890ff',
              '100%': '#52c41a',
            }}
            trailColor="rgba(0, 0, 0, 0.06)"
            size="small"
            style={{ borderRadius: 4 }}
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
              <Space size={4}>
                <Text className={styles.sectionTitle}>行业板块</Text>
                <span className={`${styles.stockCount} ${styles.industryColor}`} style={{ fontSize: 11 }}>
                  {industryData.length}
                </span>
              </Space>
              <Space size={4}>
                <Input
                  placeholder="搜索"
                  value={industrySearch}
                  onChange={handleIndustrySearchChange}
                  onClear={handleIndustryClear}
                  allowClear
                  size="small"
                  className={styles.searchInput}
                />
                <Tooltip title="将成分股数据同步到股票列表，使股票包含行业和概念信息">
                  <Button
                    size="small"
                    icon={<ArrowRightOutlined />}
                    onClick={handleUpdateSectorMapping}
                    loading={updatingSectorInfo}
                  />
                </Tooltip>
              </Space>
            </div>
            <div ref={industryListRef} className={styles.listContainer}>
              <VirtualList
                data={filteredIndustry}
                height={industryListHeight}
                itemHeight={LIST_ITEM_HEIGHT}
                itemKey="sectorCode"
              >
                {(item, index, { style }) => (
                  <SectorListItem
                    key={item.sectorCode}
                    sector={item}
                    colorClass={styles.industryColor}
                    isSelected={selectedSector?.sectorCode === item.sectorCode}
                    onSelect={handleSectorSelect}
                    style={style}
                  />
                )}
              </VirtualList>
            </div>
          </div>

          {/* 概念板块 */}
          <div className={styles.sidebarSection}>
            <div className={styles.sectionHeader}>
              <Space size={4}>
                <Text className={styles.sectionTitle}>概念板块</Text>
                <span className={`${styles.stockCount} ${styles.conceptColor}`} style={{ fontSize: 11 }}>
                  {conceptData.length}
                </span>
              </Space>
              <Space size={4}>
                <Input
                  placeholder="搜索"
                  value={conceptSearch}
                  onChange={handleConceptSearchChange}
                  onClear={handleConceptClear}
                  allowClear
                  size="small"
                  className={styles.searchInput}
                />
                <Tooltip title="将成分股数据同步到股票列表，使股票包含行业和概念信息">
                  <Button
                    size="small"
                    icon={<ArrowRightOutlined />}
                    onClick={handleUpdateSectorMapping}
                    loading={updatingSectorInfo}
                  />
                </Tooltip>
              </Space>
            </div>
            <div ref={conceptListRef} className={styles.listContainer}>
              <VirtualList
                data={filteredConcept}
                height={conceptListHeight}
                itemHeight={LIST_ITEM_HEIGHT}
                itemKey="sectorCode"
              >
                {(item, index, { style }) => (
                  <SectorListItem
                    key={item.sectorCode}
                    sector={item}
                    colorClass={styles.conceptColor}
                    isSelected={selectedSector?.sectorCode === item.sectorCode}
                    onSelect={handleSectorSelect}
                    style={style}
                  />
                )}
              </VirtualList>
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
