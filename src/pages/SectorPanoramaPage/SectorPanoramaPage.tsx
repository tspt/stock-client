/**
 * 板块全景页面 - 高信息密度的极简设计
 */

import { useState, useMemo } from 'react';
import { Layout, Button, Progress, Input, Typography, Empty } from 'antd';
import { RocketOutlined, LoadingOutlined } from '@ant-design/icons';
import { fetchAllSectorsStocks, type SectorFullData, type FetchProgress } from '@/services/hot/unified-sectors';
import styles from './SectorPanoramaPage.module.css';

const { Header, Content } = Layout;
const { Text } = Typography;

export function SectorPanoramaPage() {
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<FetchProgress | null>(null);
  const [industryData, setIndustryData] = useState<SectorFullData[]>([]);
  const [conceptData, setConceptData] = useState<SectorFullData[]>([]);
  const [selectedSector, setSelectedSector] = useState<SectorFullData | null>(null);
  const [industrySearch, setIndustrySearch] = useState('');
  const [conceptSearch, setConceptSearch] = useState('');

  // 开始获取数据
  const handleStartFetch = async () => {
    setLoading(true);
    setProgress(null);
    try {
      const result = await fetchAllSectorsStocks((p) => {
        setProgress(p);
      });
      setIndustryData(result.industry);
      setConceptData(result.concept);
      setProgress(null);
    } catch (error) {
      console.error('获取板块成分股失败:', error);
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

  // 渲染板块列表
  const renderSectorList = (data: SectorFullData[], searchValue: string, setSearch: (v: string) => void, title: string, colorClass: string) => (
    <div className={styles.column}>
      <div className={styles.columnHeader}>
        <Text className={styles.columnTitle}>{title}</Text>
        <Input
          placeholder="搜索板块"
          value={searchValue}
          onChange={(e) => setSearch(e.target.value)}
          allowClear
          className={styles.searchInput}
        />
      </div>
      <div className={styles.listContainer}>
        {data.length === 0 ? (
          <Empty description="暂无数据" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        ) : (
          data.map((sector) => (
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
          ))
        )}
      </div>
    </div>
  );

  return (
    <Layout className={styles.layout}>
      {/* 顶部区域 */}
      <Header className={styles.header}>
        <div className={styles.headerContent}>
          <div className={styles.headerLeft}>
            <Text className={styles.pageTitle}>板块全景</Text>
            <Text type="secondary" className={styles.pageSubtitle}>
              获取所有行业和概念板块的成分股数据
            </Text>
          </div>
          <Button
            type="primary"
            icon={loading ? <LoadingOutlined /> : <RocketOutlined />}
            onClick={handleStartFetch}
            loading={loading}
            disabled={loading}
            size="large"
            className={styles.fetchButton}
          >
            {loading ? '获取中...' : '开始全量获取'}
          </Button>
        </div>
      </Header>

      {/* 进度条 */}
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

      {/* 主体内容 */}
      <Content className={styles.content}>
        <div className={styles.mainGrid}>
          {/* 行业板块列 */}
          {renderSectorList(filteredIndustry, industrySearch, setIndustrySearch, '行业板块', styles.industryColor)}

          {/* 概念板块列 */}
          {renderSectorList(filteredConcept, conceptSearch, setConceptSearch, '概念板块', styles.conceptColor)}
        </div>

        {/* 成分股详情区域 */}
        {selectedSector && (
          <div className={styles.detailSection}>
            <div className={styles.detailHeader}>
              <div className={styles.detailTitle}>
                <Text className={styles.detailName}>{selectedSector.sectorName}</Text>
                <Text type="secondary" className={styles.detailCount}>
                  {selectedSector.stocks.length} 只成分股
                </Text>
              </div>
              <Button size="small" onClick={handleExport}>
                导出
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
          </div>
        )}
      </Content>
    </Layout>
  );
}
