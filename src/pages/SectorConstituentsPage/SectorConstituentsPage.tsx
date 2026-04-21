/**
 * 成分股大全页面 - 仪表盘式布局
 */

import { useState, useMemo } from 'react';
import { Layout, Button, Progress, Input, Typography, Empty, message } from 'antd';
import { RocketOutlined, LoadingOutlined, ExportOutlined } from '@ant-design/icons';
import { fetchAllSectorsStocks, type SectorFullData, type FetchProgress, type FailedSector } from '@/services/hot/sector-stocks-service';
import styles from './SectorConstituentsPage.module.css';

const { Header, Content } = Layout;
const { Text } = Typography;

export function SectorConstituentsPage() {
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<FetchProgress | null>(null);
  const [industryData, setIndustryData] = useState<SectorFullData[]>([]);
  const [conceptData, setConceptData] = useState<SectorFullData[]>([]);
  const [failedSectors, setFailedSectors] = useState<FailedSector[]>([]);
  const [selectedSector, setSelectedSector] = useState<SectorFullData | null>(null);
  const [industrySearch, setIndustrySearch] = useState('');
  const [conceptSearch, setConceptSearch] = useState('');

  // 开始获取数据
  const handleStartFetch = async (retryList?: FailedSector[]) => {
    setLoading(true);
    const sectorsToFetch = retryList || [];
    setProgress({ current: 0, total: sectorsToFetch.length > 0 ? sectorsToFetch.length : 1, percent: 0, message: '准备中...' });
    try {
      const result = await fetchAllSectorsStocks((p) => {
        setProgress(p);
      }, !retryList, sectorsToFetch); // 如果不是重试，则强制刷新

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
      if (result.failed.length === 0) {
        message.success('数据获取完成');
      } else {
        message.warning(`获取完成，但有 ${result.failed.length} 个板块失败，可点击重试`);
      }
    } catch (error) {
      console.error('获取板块成分股失败:', error);
      message.error('获取数据失败，请查看控制台');
      setProgress(null);
    } finally {
      setLoading(false);
    }
  };

  // 导出当前选中板块的成分股
  const handleExport = () => {
    if (!selectedSector) return;
    const content = selectedSector.stocks
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
      onClick={() => setSelectedSector(sector)}
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
            {failedSectors.length > 0 && (
              <Button
                danger
                onClick={() => handleStartFetch(failedSectors)}
                disabled={loading}
              >
                重试失败项 ({failedSectors.length})
              </Button>
            )}
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

      {/* 进度条区域 */}
      {progress && (
        <div className={styles.progressContainer}>
          <div className={styles.progressInfo}>
            <LoadingOutlined spin />
            <Text>{progress.message}</Text>
            <Text type="secondary">
              {progress.current}/{progress.total}
            </Text>
          </div>
          <Progress
            percent={progress.percent}
            status="active"
            showInfo={false}
            strokeColor="#1890ff"
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
                    共 {selectedSector.stocks.length} 只成分股
                  </Text>
                </div>
                <Button size="small" icon={<ExportOutlined />} onClick={handleExport}>
                  导出名单
                </Button>
              </div>
              <div className={styles.stockGrid}>
                {selectedSector.stocks.map((stock) => (
                  <div key={stock.code} className={styles.stockItem}>
                    <Text className={styles.stockName}>{stock.name}</Text>
                    <Text type="secondary" className={styles.stockCode}>
                      {stock.code}
                    </Text>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className={styles.emptyState}>
              <Empty description="请在左侧点击板块查看成分股" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            </div>
          )}
        </Content>
      </div>
    </Layout>
  );
}
