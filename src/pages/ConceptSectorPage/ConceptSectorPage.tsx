/**
 * 概念板块页面 - 展示概念板块列表（包含主力资金流向）
 */

import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { Layout, Input, Table, Space, Select, Button, Typography, AutoComplete, message } from 'antd';
import { SearchOutlined, ReloadOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { getUnifiedConceptBasic, getUnifiedConceptRank } from '@/services/hot/unified-sectors';
import { getSingleConceptSector } from '@/services/hot/concept-sectors';
import { POLLING_INTERVAL, SECTOR_PAGE_SIZE, SEARCH_DEBOUNCE_DELAY } from '@/utils/config/constants';
import { usePolling } from '@/hooks/usePolling';
import type { ConceptSectorRankData, ConceptSectorBasicInfo } from '@/types/stock';
import { ConceptSectorStocksDrawer } from '@/components/ConceptSectorStocksDrawer/ConceptSectorStocksDrawer';
import { logger } from '@/utils/business/logger';
import styles from './ConceptSectorPage.module.css';

const { Header, Content } = Layout;
const { Option } = Select;
const { Text } = Typography;

// 格式化金额显示（万元转亿或保持万元）
const formatAmount = (value?: number): string => {
  if (!value) return '-';
  const absValue = Math.abs(value);
  if (absValue >= 10000) {
    // 大于等于1亿，显示为亿
    const yiValue = value / 10000;
    return `${yiValue.toFixed(2)}亿`;
  }
  // 否则显示为万元
  return `${value.toFixed(2)}万`;
};

// 格式化净额显示（带颜色）
const formatNetInflow = (value?: number): JSX.Element => {
  if (!value) return <span>-</span>;
  const formatted = formatAmount(value);
  const color = value >= 0 ? 'var(--ant-color-success)' : 'var(--ant-color-error)';
  return <span style={{ color }}>{formatted}</span>;
};

// 格式化净占比显示（带颜色）
const formatRatio = (value?: number): JSX.Element => {
  if (!value && value !== 0) return <span>-</span>;
  const color = value >= 0 ? 'var(--ant-color-success)' : 'var(--ant-color-error)';
  return <span style={{ color }}>{value.toFixed(2)}%</span>;
};

export function ConceptSectorPage() {
  const [searchKeyword, setSearchKeyword] = useState('');
  const [sortOrder, setSortOrder] = useState<number>(1); // 1: 降序, 0: 升序
  const [data, setData] = useState<ConceptSectorRankData[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = SECTOR_PAGE_SIZE;

  // 视图模式：'list' - 概念列表，'detail' - 概念详情
  const [viewMode, setViewMode] = useState<'list' | 'detail'>('list');
  const [selectedSector, setSelectedSector] = useState<{ code: string; name: string } | null>(null);

  // 所有概念分类缓存数据（用于搜索）
  const [allSectors, setAllSectors] = useState<ConceptSectorBasicInfo[]>([]);

  // 控制 AutoComplete 下拉框显示
  const [dropdownOpen, setDropdownOpen] = useState(false);

  // 概念详情抽屉状态
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerSector, setDrawerSector] = useState<{ code: string; name: string } | null>(null);

  // 防重复请求标记
  const isLoadingRef = useRef(false);

  // 搜索防抖定时器
  const searchTimerRef = useRef<NodeJS.Timeout | null>(null);

  // 加载数据（使用统一缓存服务）
  const loadData = useCallback(async (page: number = 1, silent: boolean = false) => {
    if (isLoadingRef.current) return;

    if (!silent) {
      setLoading(true);
    }
    isLoadingRef.current = true;

    try {
      const result = await getUnifiedConceptRank(sortOrder, pageSize, page);
      setData(result.data);
      setTotal(result.total);
      setCurrentPage(page);
    } catch (error) {
      logger.error('加载概念板块数据失败:', error);
      message.error('加载数据失败，请重试');
    } finally {
      if (!silent) {
        setLoading(false);
      }
      isLoadingRef.current = false;
    }
  }, [sortOrder]);

  // 加载所有概念分类（用于搜索，使用统一缓存服务）
  useEffect(() => {
    const loadAllSectors = async () => {
      try {
        const sectors = await getUnifiedConceptBasic();
        setAllSectors(sectors);
      } catch (error) {
        logger.error('加载所有概念分类失败:', error);
        message.warning('加载概念分类失败，搜索功能可能受限');
      }
    };
    loadAllSectors();
  }, []);

  // 初始加载和参数变化时重新加载
  useEffect(() => {
    if (viewMode === 'list') {
      loadData(1);
    }
  }, [loadData, viewMode]);

  // 组件卸载时清理定时器
  useEffect(() => {
    return () => {
      if (searchTimerRef.current) {
        clearTimeout(searchTimerRef.current);
      }
    };
  }, []);

  // 使用标准轮询Hook - 每10秒静默刷新当前页（使用统一缓存服务）
  usePolling(
    async () => {
      if (viewMode === 'list') {
        try {
          const result = await getUnifiedConceptRank(sortOrder, pageSize, currentPage);
          setData(result.data);
          setTotal(result.total);
        } catch (error) {
          logger.error('自动刷新失败:', error);
          message.error('数据刷新失败');
        }
      }
      // 注意：在详情模式下不自动刷新，避免覆盖用户选择的数据
    },
    {
      interval: POLLING_INTERVAL,
      immediate: false, // 不立即执行，因为已有初始加载
      enabled: viewMode === 'list', // 只在列表模式下启用
    }
  );

  // 处理分页变化
  const handlePageChange = (page: number) => {
    loadData(page);
  };

  // 处理搜索关键词变化（带防抖）
  const handleSearchChange = (value: string) => {
    setSearchKeyword(value);

    // 清除之前的定时器
    if (searchTimerRef.current) {
      clearTimeout(searchTimerRef.current);
    }

    // 设置新的定时器，300ms 后执行搜索
    searchTimerRef.current = setTimeout(() => {
      // 这里可以添加额外的搜索逻辑，如果需要的话
      // 目前只是更新搜索关键词，AutoComplete 会自动过滤
    }, SEARCH_DEBOUNCE_DELAY);
  };

  // 处理概念选择 - 切换到概念详情模式
  const handleSectorSelect = async (sectorCode: string) => {
    const sector = allSectors.find((s) => s.code === sectorCode);
    if (!sector) {
      message.warning('未找到该概念信息');
      return;
    }

    // 切换到详情模式
    setViewMode('detail');
    setSelectedSector({ code: sector.code, name: sector.name });
    setSearchKeyword(''); // 清空搜索框
    setCurrentPage(1);
    setLoading(true);

    try {
      // 获取该概念的详细数据（资金流向）
      const data = await getSingleConceptSector(sector.code);
      if (data) {
        setData([data]);
        setTotal(1);
      } else {
        message.warning('未获取到概念详情数据');
      }
    } catch (error) {
      logger.error('加载概念详细数据失败:', error);
      message.error('加载概念详情失败');
    } finally {
      setLoading(false);
    }
  };

  // 返回列表模式
  const handleBackToList = () => {
    setViewMode('list');
    setSelectedSector(null);
    setCurrentPage(1);
    loadData(1);
    message.info('已返回概念列表');
  };

  // 处理名称点击 - 打开概念详情抽屉
  const handleSectorClick = (record: ConceptSectorRankData) => {
    setDrawerSector({ code: record.code, name: record.name });
    setDrawerOpen(true);
  };

  // 关闭抽屉
  const handleCloseDrawer = () => {
    setDrawerOpen(false);
    setDrawerSector(null);
  };

  // 搜索选项（基于本地缓存数据）
  const searchOptions = useMemo(() => {
    if (allSectors.length === 0) return [];

    // 如果没有搜索关键词，显示所有概念（最多50条）
    if (!searchKeyword) {
      return allSectors
        .slice(0, 50)
        .map((sector) => ({
          value: sector.code,
          label: `${sector.name} (${sector.code})`,
        }));
    }

    // 有搜索关键词时，过滤显示匹配结果
    const keyword = searchKeyword.toLowerCase();
    return allSectors
      .filter(
        (sector) =>
          sector.name.toLowerCase().includes(keyword) ||
          sector.code.toLowerCase().includes(keyword)
      )
      .slice(0, 50) // 最多显示50条
      .map((sector) => ({
        value: sector.code,
        label: `${sector.name} (${sector.code})`,
      }));
  }, [searchKeyword, allSectors]);

  // 表格列定义
  const columns: ColumnsType<ConceptSectorRankData> = [
    {
      title: '名称',
      dataIndex: 'name',
      key: 'name',
      width: 160,
      fixed: 'left',
      ellipsis: true,
      render: (text: string, record: ConceptSectorRankData) => (
        <Text
          style={{ color: '#1890ff', cursor: 'pointer' }}
          onClick={() => handleSectorClick(record)}
          title={`点击查看 ${text} 的成分股`}
        >
          {text}
        </Text>
      ),
    },
    {
      title: (
        <div>
          今日涨跌幅
        </div>
      ),
      dataIndex: 'changePercent',
      key: 'changePercent',
      width: 90,
      sorter: (a, b) => (a.changePercent || 0) - (b.changePercent || 0),
      render: (value?: number) => {
        if (!value && value !== 0) return <span>-</span>;
        const isPositive = value >= 0;
        const colorClass = isPositive ? styles.positive : styles.negative;
        return (
          <span className={colorClass} style={{ fontWeight: 600 }}>
            {isPositive ? '+' : ''}{value.toFixed(2)}%
          </span>
        );
      },
    },
    {
      title: (
        <div>
          今日主力净流入
        </div>
      ),
      key: 'mainNetInflow',
      width: 140,
      children: [
        {
          title: '净额',
          dataIndex: 'mainNetInflow',
          key: 'mainNetInflow',
          width: 90,
          sorter: (a, b) => (a.mainNetInflow || 0) - (b.mainNetInflow || 0),
          render: (value?: number) => formatNetInflow(value),
        },
        {
          title: '净占比',
          dataIndex: 'mainNetInflowRatio',
          key: 'mainNetInflowRatio',
          width: 70,
          render: (value?: number) => {
            if (!value && value !== 0) return <span>-</span>;
            const color = value >= 0 ? 'var(--ant-color-success)' : 'var(--ant-color-error)';
            return <span style={{ color }}>{value.toFixed(2)}%</span>;
          },
        },
      ],
    },
    {
      title: (
        <div>
          今日超大单净流入
        </div>
      ),
      key: 'superLargeNetInflow',
      width: 140,
      children: [
        {
          title: '净额',
          dataIndex: 'superLargeNetInflow',
          key: 'superLargeNetInflow',
          width: 90,
          sorter: (a, b) => (a.superLargeNetInflow || 0) - (b.superLargeNetInflow || 0),
          render: (value?: number) => formatNetInflow(value),
        },
        {
          title: '净占比',
          dataIndex: 'superLargeNetInflowRatio',
          key: 'superLargeNetInflowRatio',
          width: 70,
          render: (value?: number) => formatRatio(value),
        },
      ],
    },
    {
      title: (
        <div>
          今日大单净流入
        </div>
      ),
      key: 'largeNetInflow',
      width: 140,
      children: [
        {
          title: '净额',
          dataIndex: 'largeNetInflow',
          key: 'largeNetInflow',
          width: 90,
          sorter: (a, b) => (a.largeNetInflow || 0) - (b.largeNetInflow || 0),
          render: (value?: number) => formatNetInflow(value),
        },
        {
          title: '净占比',
          dataIndex: 'largeNetInflowRatio',
          key: 'largeNetInflowRatio',
          width: 70,
          render: (value?: number) => formatRatio(value),
        },
      ],
    },
    {
      title: (
        <div>
          今日中单净流入
        </div>
      ),
      key: 'mediumNetInflow',
      width: 140,
      children: [
        {
          title: '净额',
          dataIndex: 'mediumNetInflow',
          key: 'mediumNetInflow',
          width: 90,
          sorter: (a, b) => (a.mediumNetInflow || 0) - (b.mediumNetInflow || 0),
          render: (value?: number) => formatNetInflow(value),
        },
        {
          title: '净占比',
          dataIndex: 'mediumNetInflowRatio',
          key: 'mediumNetInflowRatio',
          width: 70,
          render: (value?: number) => formatRatio(value),
        },
      ],
    },
    {
      title: (
        <div>
          今日小单净流入
        </div>
      ),
      key: 'smallNetInflow',
      width: 140,
      children: [
        {
          title: '净额',
          dataIndex: 'smallNetInflow',
          key: 'smallNetInflow',
          width: 90,
          sorter: (a, b) => (a.smallNetInflow || 0) - (b.smallNetInflow || 0),
          render: (value?: number) => formatNetInflow(value),
        },
        {
          title: '净占比',
          dataIndex: 'smallNetInflowRatio',
          key: 'smallNetInflowRatio',
          width: 70,
          render: (value?: number) => formatRatio(value),
        },
      ],
    },
  ];

  return (
    <Layout className={styles.conceptSectorPage}>
      <Header className={styles.header}>
        <div className={styles.toolbar}>
          <Space size="middle">
            {/* 搜索框 - 使用 AutoComplete */}
            <div className="searchBarWrapper">
              <AutoComplete
                options={searchOptions}
                value={searchKeyword}
                onSearch={handleSearchChange}
                onSelect={handleSectorSelect}
                onOpenChange={(open) => setDropdownOpen(open)}
                placeholder="搜索概念板块"
                style={{ width: 220 }}
                filterOption={false}
              >
                <Input
                  prefix={<SearchOutlined style={{ marginRight: 8 }} />}
                  size="middle"
                  allowClear
                  onFocus={() => setDropdownOpen(true)}
                />
              </AutoComplete>
            </div>

            {/* 显示当前模式 */}
            {viewMode === 'detail' && selectedSector && (
              <Space>
                <Text type="secondary">当前查看:</Text>
                <Text strong>{selectedSector.name}</Text>
                <Button size="small" onClick={handleBackToList}>
                  返回列表
                </Button>
              </Space>
            )}

            <Select
              value={sortOrder}
              onChange={(value) => setSortOrder(value)}
              style={{ width: 100 }}
            >
              <Option value={1}>降序</Option>
              <Option value={0}>升序</Option>
            </Select>

            <Button
              icon={<ReloadOutlined />}
              onClick={() => loadData(1)}
              loading={loading}
            >
              刷新
            </Button>
          </Space>
        </div>
      </Header>

      <Content className={styles.content}>
        <Table
          columns={columns}
          dataSource={data}
          loading={loading}
          pagination={{
            current: currentPage,
            pageSize: pageSize,
            total: total,
            showSizeChanger: false,
            showQuickJumper: true,
            showTotal: (total) => `共 ${total} 条`,
            onChange: handlePageChange,
          }}
          rowKey={(record) => record.code}
          size="small"
          scroll={{ x: 1400, y: 'calc(100vh - 260px)' }}
          className={styles.sectorTable}
        />
      </Content>

      {/* 概念详情抽屉 */}
      {drawerSector && (
        <ConceptSectorStocksDrawer
          open={drawerOpen}
          sectorCode={drawerSector.code}
          sectorName={drawerSector.name}
          onClose={handleCloseDrawer}
        />
      )}
    </Layout>
  );
}
