/**
 * 历史回测页面
 * 基于本地 IndexDB 的全量历史数据进行策略回测
 */

import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { Layout, Card, Button, Space, Table, Progress, Select, DatePicker, Tag, Row, Col, Input, Typography, App, Drawer } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { ExperimentOutlined, ReloadOutlined, SearchOutlined, FilterOutlined, ClearOutlined } from '@ant-design/icons';
import VirtualList from 'rc-virtual-list';
import { getStocksHistory, getSignalBacktestsByCode, clearAllSignalBacktests, batchSaveSignalBacktests, getAllSignalBacktests } from '@/utils/storage/opportunityIndexedDB';
import styles from './BacktestPage.module.css';

const { Header, Content } = Layout;
const { Text } = Typography;
const { RangePicker } = DatePicker;

export function BacktestPage() {
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);
  const [backtesting, setBacktesting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<any[]>([]);
  const [groupedResults, setGroupedResults] = useState<any[]>([]);
  const [selectedStockCode, setSelectedStockCode] = useState<string | null>(null);
  const [searchText, setSearchText] = useState('');
  const [marketType, setMarketType] = useState<string>('hs_main');
  const [nameType, setNameType] = useState<string>('non_st');
  const [timeRange, setTimeRange] = useState<number>(7);
  const [minWinRate, setMinWinRate] = useState<number>(75); // 近3日胜率最低值
  const [filterDrawerOpen, setFilterDrawerOpen] = useState(false);
  const workerRef = useRef<Worker | null>(null);
  const taskIdCounter = useRef(0);
  const listContainerRef = useRef<HTMLDivElement>(null);
  const [listHeight, setListHeight] = useState(600);

  // 动态计算列表高度
  useEffect(() => {
    const updateHeight = () => {
      if (listContainerRef.current) {
        const containerRect = listContainerRef.current.getBoundingClientRect();
        setListHeight(containerRect.height);
      }
    };

    updateHeight();
    window.addEventListener('resize', updateHeight);
    return () => window.removeEventListener('resize', updateHeight);
  }, []);

  // 初始化 Worker
  useEffect(() => {
    const worker = new Worker(new URL('@/workers/backtestWorker.ts', import.meta.url), {
      type: 'module',
    });
    workerRef.current = worker;

    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

  // 页面加载时从 IndexedDB 读取已保存的回测结果
  useEffect(() => {
    loadSavedBacktestResults();
  }, []);

  // 从 IndexedDB 加载已保存的回测结果
  const loadSavedBacktestResults = async () => {
    try {
      setLoading(true);

      const allResults = await getAllSignalBacktests();
      if (allResults.length > 0) {
        // 将按股票分组的数据展平为信号列表
        const allSignals: any[] = [];
        allResults.forEach(result => {
          result.signals.forEach(signal => {
            allSignals.push({
              code: result.code,
              name: result.name,
              signalDate: signal.signalDate,
              entryPrice: signal.entryPrice,
              returns: signal.returns,
            });
          });
        });

        setResults(allSignals);
        const grouped = groupSignalsByStock(allSignals);
        setGroupedResults(grouped);
        // 默认选中第一个有信号的股票
        if (grouped.length > 0) {
          setSelectedStockCode(grouped[0].code);
        }
      }
    } catch (error) {
      console.error('加载保存的回测结果失败:', error);
    } finally {
      setLoading(false);
    }
  };

  // 执行回测
  const handleStartBacktest = async () => {
    if (!workerRef.current) {
      message.error('回测引擎未就绪');
      return;
    }

    setBacktesting(true);
    setProgress(0);
    setResults([]);
    message.info('正在清除旧的回测数据...');

    try {
      // 清除之前的回测结果
      await clearAllSignalBacktests();

      message.info('正在从 IndexDB 加载历史数据...');
      const histories = await getStocksHistory([]);

      if (histories.length === 0) {
        message.warning('当前没有可用的历史数据，请先在机会分析页触发数据同步');
        setBacktesting(false);
        return;
      }

      message.info(`开始回测 ${histories.length} 只股票的历史表现...`);
      let processedCount = 0;
      const allSignals: any[] = [];
      const totalTasks = histories.length;

      // 统一的消息监听器
      const onMessage = (e: MessageEvent) => {
        const { type, requestId, progress: stockProgress, signals } = e.data;

        // 查找对应的任务索引（简单匹配 requestId 前缀）
        const code = requestId.split('_').pop();
        const history = histories.find(h => h.code === code);

        if (!history) return;

        if (type === 'progress') {
          // 简化进度计算：按已完成股票数 + 当前股票进度估算
          const currentStockIndex = histories.indexOf(history);
          const estimatedProgress = ((currentStockIndex + stockProgress / 100) / totalTasks) * 100;
          setProgress(Math.min(Math.round(estimatedProgress), 99));
        } else if (type === 'result') {
          allSignals.push(...signals);
          processedCount++;
          setProgress(Math.round((processedCount / totalTasks) * 100));

          if (processedCount === totalTasks) {
            setResults(allSignals);
            // 按股票分组
            const grouped = groupSignalsByStock(allSignals);
            setGroupedResults(grouped);
            // 默认选中第一个有信号的股票
            if (grouped.length > 0) {
              setSelectedStockCode(grouped[0].code);
            }
            setBacktesting(false);
            workerRef.current?.removeEventListener('message', onMessage);

            // 保存回测结果到 IndexedDB
            saveBacktestResultsToIndexedDB(allSignals);

            message.success(`回测完成！共发现 ${allSignals.length} 个信号`);
          }
        }
      };

      workerRef.current.addEventListener('message', onMessage);

      // 批量发送任务
      for (const history of histories) {
        const currentTaskId = `bt_${taskIdCounter.current++}_${history.code}`;
        workerRef.current.postMessage({
          requestId: currentTaskId,
          code: history.code,
          name: history.name,
          klineData: history.dailyLines,
        });
      }
    } catch (error) {
      message.error('回测执行失败');
      console.error(error);
      setBacktesting(false);
    }
  };

  // 保存回测结果到 IndexedDB
  const saveBacktestResultsToIndexedDB = async (signals: any[]) => {
    try {
      message.info('正在保存回测结果到本地存储...');

      // 按股票代码分组信号
      const groupedSignals = signals.reduce((acc, signal) => {
        if (!acc[signal.code]) {
          acc[signal.code] = {
            code: signal.code,
            name: signal.name,
            signals: []
          };
        }
        acc[signal.code].signals.push({
          signalDate: signal.signalDate,
          entryPrice: signal.entryPrice,
          returns: signal.returns,
        });
        return acc;
      }, {} as Record<string, any>);

      // 转换为 IndexedDB 存储格式
      const backtestResults = Object.values(groupedSignals).map((group: any) => ({
        code: group.code,
        name: group.name,
        signals: group.signals,
        calculatedAt: Date.now(),
      }));

      await batchSaveSignalBacktests(backtestResults);
      message.success('回测结果已保存到本地存储');
    } catch (error) {
      console.error('保存回测结果失败:', error);
      message.error('保存回测结果失败');
    }
  };

  // 按股票代码分组信号
  const groupSignalsByStock = (signals: any[]) => {
    interface StockGroup {
      code: string;
      name: string;
      signals: any[];
    }

    const grouped = signals.reduce((acc, signal) => {
      if (!acc[signal.code]) {
        acc[signal.code] = {
          code: signal.code,
          name: signal.name,
          signals: []
        };
      }
      acc[signal.code].signals.push(signal);
      return acc;
    }, {} as Record<string, StockGroup>);

    const values: StockGroup[] = Object.values(grouped);
    return values.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
  };

  // 重置筛选条件
  const handleResetFilter = () => {
    setMarketType('hs_main');
    setNameType('non_st');
    setTimeRange(7);
    setMinWinRate(75);
    setSearchText('');
    message.success('已重置筛选条件');
  };

  // 获取筛选摘要文本
  const getFilterSummary = () => {
    const parts: string[] = [];

    // 市场类型
    const marketLabel = marketType === 'hs_main' ? '沪深主板' : marketType === 'sz_gem' ? '创业板' : '全部';
    parts.push(`市场:${marketLabel}`);

    // 名称类型
    const nameLabel = nameType === 'st' ? 'ST' : nameType === 'non_st' ? '非ST' : '不限';
    parts.push(`名称:${nameLabel}`);

    return parts.join(' · ');
  };

  // 获取当前选中股票的信号
  const getCurrentStockSignals = () => {
    if (!selectedStockCode) return [];
    const stockGroup = groupedResults.find(g => g.code === selectedStockCode);
    if (!stockGroup) return [];
    // 按信号日期倒序排列
    return [...stockGroup.signals].sort((a, b) => b.signalDate.localeCompare(a.signalDate));
  };

  // 计算信号胜率统计（使用 useMemo 缓存）
  const signalStatistics = useMemo(() => {
    const signals = getCurrentStockSignals();
    if (signals.length === 0) {
      return {
        day3: { total: 0, success: 0, rate: 0, incompleteCount: 0 },
        day5: { total: 0, success: 0, rate: 0, incompleteCount: 0 },
        day10: { total: 0, success: 0, rate: 0, incompleteCount: 0 },
        day20: { total: 0, success: 0, rate: 0, incompleteCount: 0 },
      };
    }

    const stats = {
      day3: { total: 0, success: 0, rate: 0, incompleteCount: 0 },
      day5: { total: 0, success: 0, rate: 0, incompleteCount: 0 },
      day10: { total: 0, success: 0, rate: 0, incompleteCount: 0 },
      day20: { total: 0, success: 0, rate: 0, incompleteCount: 0 },
    };

    signals.forEach((signal: any) => {
      // 3日收益
      if (signal.returns.day3) {
        stats.day3.total++;
        if (signal.returns.day3.actualDays < 3) {
          stats.day3.incompleteCount++;
        }
        if (signal.returns.day3.value > 0) stats.day3.success++;
      }
      // 5日收益
      if (signal.returns.day5) {
        stats.day5.total++;
        if (signal.returns.day5.actualDays < 5) {
          stats.day5.incompleteCount++;
        }
        if (signal.returns.day5.value > 0) stats.day5.success++;
      }
      // 两周（约10天）收益
      if (signal.returns.day10) {
        stats.day10.total++;
        if (signal.returns.day10.actualDays < 10) {
          stats.day10.incompleteCount++;
        }
        if (signal.returns.day10.value > 0) stats.day10.success++;
      }
      // 一个月（约20天）收益
      if (signal.returns.day20) {
        stats.day20.total++;
        if (signal.returns.day20.actualDays < 20) {
          stats.day20.incompleteCount++;
        }
        if (signal.returns.day20.value > 0) stats.day20.success++;
      }
    });

    // 计算胜率
    stats.day3.rate = stats.day3.total > 0 ? (stats.day3.success / stats.day3.total) * 100 : 0;
    stats.day5.rate = stats.day5.total > 0 ? (stats.day5.success / stats.day5.total) * 100 : 0;
    stats.day10.rate = stats.day10.total > 0 ? (stats.day10.success / stats.day10.total) * 100 : 0;
    stats.day20.rate = stats.day20.total > 0 ? (stats.day20.success / stats.day20.total) * 100 : 0;

    return stats;
  }, [selectedStockCode, groupedResults]);

  // 过滤股票列表
  const getFilteredStockList = () => {
    let filtered = groupedResults;

    // 1. 按市场类型过滤
    if (marketType !== 'all') {
      filtered = filtered.filter(item => {
        // 去除市场前缀（SH/SZ/BJ）
        const pureCode = item.code.replace(/^(SH|SZ|BJ)/, '');
        if (marketType === 'hs_main') return pureCode.startsWith('60') || pureCode.startsWith('00');
        if (marketType === 'sz_gem') return pureCode.startsWith('30');
        return true;
      });
    }

    // 2. 按名称类型过滤（ST筛选）
    if (nameType !== 'all') {
      filtered = filtered.filter(item => {
        const isST = item.name.includes('ST');
        if (nameType === 'st') return isST;
        if (nameType === 'non_st') return !isST;
        return true;
      });
    }

    // 3. 按近3日胜率过滤
    if (minWinRate > 0) {
      filtered = filtered.filter(item => {
        // 计算该股票的近3日胜率
        const totalSignals = item.signals.length;
        if (totalSignals === 0) return false;

        let successCount = 0;
        let validCount = 0;

        item.signals.forEach((signal: any) => {
          // 只统计完整周期（actualDays >= 3）
          if (signal.returns.day3 && signal.returns.day3.actualDays >= 3) {
            validCount++;
            if (signal.returns.day3.value > 0) {
              successCount++;
            }
          }
        });

        if (validCount === 0) return false;
        const winRate = (successCount / validCount) * 100;
        return winRate >= minWinRate;
      });
    }

    // 4. 按时间范围过滤（筛选近期出现的信号）
    if (timeRange > 0) {
      const now = new Date();
      const cutoffDate = new Date(now.getTime() - timeRange * 24 * 60 * 60 * 1000);

      filtered = filtered.filter(item => {
        // 检查该股票是否有在时间范围内的信号
        return item.signals.some((signal: any) => {
          const signalDate = new Date(signal.signalDate);
          return signalDate >= cutoffDate;
        });
      });
    }

    // 按搜索文本过滤
    if (searchText) {
      const searchLower = searchText.toLowerCase();
      filtered = filtered.filter(item =>
        item.name.toLowerCase().includes(searchLower) ||
        item.code.toLowerCase().includes(searchLower)
      );
    }

    return filtered;
  };

  // 当筛选结果变化时，如果当前选中的股票不在结果中，自动选中第一个
  useEffect(() => {
    const filteredList = getFilteredStockList();
    if (filteredList.length > 0) {
      // 如果当前选中的股票不在筛选结果中，选中第一个
      const isCurrentSelected = filteredList.some(item => item.code === selectedStockCode);
      if (!isCurrentSelected) {
        setSelectedStockCode(filteredList[0].code);
      }
    } else {
      // 如果没有筛选结果，清空选中
      setSelectedStockCode(null);
    }
  }, [marketType, nameType, searchText, minWinRate, timeRange, groupedResults]);

  // 表格列定义
  const columns: ColumnsType<any> = [
    { title: '股票代码', dataIndex: 'code', key: 'code', width: 100 },
    { title: '股票名称', dataIndex: 'name', key: 'name', width: 100 },
    { title: '信号日期', dataIndex: 'signalDate', key: 'signalDate', width: 120 },
    {
      title: '3日收益',
      dataIndex: ['returns', 'day3'],
      key: 'day3',
      render: (val: any) => {
        if (!val) return '-';
        const isComplete = val.actualDays >= 3;
        return (
          <span>
            <span style={{ color: val.value > 0 ? '#ff4d4f' : '#52c41a' }}>
              {val.value > 0 ? '+' : ''}{val.value}%
            </span>
            {!isComplete && (
              <span className={styles.actualDaysTag}>({val.actualDays}天)</span>
            )}
          </span>
        );
      }
    },
    {
      title: '5日收益',
      dataIndex: ['returns', 'day5'],
      key: 'day5',
      render: (val: any) => {
        if (!val) return '-';
        const isComplete = val.actualDays >= 5;
        return (
          <span>
            <span style={{ color: val.value > 0 ? '#ff4d4f' : '#52c41a' }}>
              {val.value > 0 ? '+' : ''}{val.value}%
            </span>
            {!isComplete && (
              <span className={styles.actualDaysTag}>({val.actualDays}天)</span>
            )}
          </span>
        );
      }
    },
    {
      title: '两周收益',
      dataIndex: ['returns', 'day10'],
      key: 'day10',
      render: (val: any) => {
        if (!val) return '-';
        const isComplete = val.actualDays >= 10;
        return (
          <span>
            <span style={{ color: val.value > 0 ? '#ff4d4f' : '#52c41a' }}>
              {val.value > 0 ? '+' : ''}{val.value}%
            </span>
            {!isComplete && (
              <span className={styles.actualDaysTag}>({val.actualDays}天)</span>
            )}
          </span>
        );
      }
    },
    {
      title: '一月收益',
      dataIndex: ['returns', 'day20'],
      key: 'day20',
      render: (val: any) => {
        if (!val) return '-';
        const isComplete = val.actualDays >= 20;
        return (
          <span>
            <span style={{ color: val.value > 0 ? '#ff4d4f' : '#52c41a' }}>
              {val.value > 0 ? '+' : ''}{val.value}%
            </span>
            {!isComplete && (
              <span className={styles.actualDaysTag}>({val.actualDays}天)</span>
            )}
          </span>
        );
      }
    },
  ];

  return (
    <Layout className={styles.backtestPage}>
      <Header className={styles.header}>
        <div className={styles.headerContent}>
          <div className={styles.headerLeft}>
            <Text className={styles.pageTitle}>历史回测</Text>
            <Text type="secondary" className={styles.pageSubtitle}>
              基于本地历史数据的策略回测分析
            </Text>
          </div>
          <Space>
            <Button icon={<FilterOutlined />} onClick={() => setFilterDrawerOpen(true)}>
              筛选条件
            </Button>
            <Button
              type="primary"
              icon={<ExperimentOutlined />}
              onClick={handleStartBacktest}
              disabled={backtesting}
            >
              {backtesting ? '回测中...' : '执行全量回测'}
            </Button>
          </Space>
        </div>
      </Header>

      <Content className={styles.content}>
        {backtesting && progress > 0 && (
          <div className={styles.progressOverlay}>
            <div className={styles.progressInfo}>
              <Text strong>回测进行中...</Text>
              <Text type="secondary">已完成 {progress}%</Text>
            </div>
            <Progress
              percent={progress}
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

        <Row gutter={0} className={styles.mainRow}>
          <Col span={6} className={styles.stockListCol}>
            <Card title="股票列表" className={styles.stockListCard}>
              <div className={styles.filterSection}>
                <Input
                  placeholder="搜索股票名称或代码"
                  prefix={<SearchOutlined />}
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  className={styles.searchInput}
                  allowClear
                />
              </div>
              <div ref={listContainerRef} className={styles.stockListContainer}>
                {getFilteredStockList().length === 0 ? (
                  <div className={styles.emptyText}>暂无回测数据</div>
                ) : (
                  <VirtualList
                    data={getFilteredStockList()}
                    height={listHeight}
                    itemHeight={64}
                    itemKey="code"
                  >
                    {(item, index, { style }) => (
                      <div
                        key={item.code}
                        style={style}
                        className={`${styles.stockListItem} ${selectedStockCode === item.code ? styles.selected : ''}`}
                        onClick={() => setSelectedStockCode(item.code)}
                      >
                        <div className={styles.stockItemContent}>
                          <div className={styles.stockInfo}>
                            <div className={styles.stockName}>{item.name}</div>
                            <div className={styles.stockCode}>{item.code}</div>
                          </div>
                          <Tag color="blue" className={styles.signalCount}>{item.signals.length}个信号</Tag>
                        </div>
                      </div>
                    )}
                  </VirtualList>
                )}
              </div>
            </Card>
          </Col>
          <Col span={18}>
            <Card title="信号详情" className={styles.signalDetailCard}>
              {/* 胜率统计汇总 */}
              {selectedStockCode && (
                <div className={styles.statisticsSummary}>
                  <div className={styles.statItem}>
                    <div className={styles.statLabel}>3日胜率</div>
                    <div className={styles.statValue} style={{
                      color: signalStatistics.day3.total > 0
                        ? (signalStatistics.day3.rate > 50 ? '#ff4d4f' : 'var(--ant-color-text-secondary)')
                        : 'var(--ant-color-text-tertiary)'
                    }}>
                      {signalStatistics.day3.total > 0
                        ? `${signalStatistics.day3.rate.toFixed(1)}%`
                        : '—'}
                    </div>
                    <div className={styles.statDetail}>
                      {signalStatistics.day3.success}/{signalStatistics.day3.total}
                      {signalStatistics.day3.incompleteCount > 0 && (
                        <span className={styles.incompleteTag}>
                          ({signalStatistics.day3.incompleteCount}个不完整)
                        </span>
                      )}
                    </div>
                  </div>
                  <div className={styles.statItem}>
                    <div className={styles.statLabel}>5日胜率</div>
                    <div className={styles.statValue} style={{
                      color: signalStatistics.day5.total > 0
                        ? (signalStatistics.day5.rate > 50 ? '#ff4d4f' : 'var(--ant-color-text-secondary)')
                        : 'var(--ant-color-text-tertiary)'
                    }}>
                      {signalStatistics.day5.total > 0
                        ? `${signalStatistics.day5.rate.toFixed(1)}%`
                        : '—'}
                    </div>
                    <div className={styles.statDetail}>
                      {signalStatistics.day5.success}/{signalStatistics.day5.total}
                      {signalStatistics.day5.incompleteCount > 0 && (
                        <span className={styles.incompleteTag}>
                          ({signalStatistics.day5.incompleteCount}个不完整)
                        </span>
                      )}
                    </div>
                  </div>
                  <div className={styles.statItem}>
                    <div className={styles.statLabel}>两周胜率</div>
                    <div className={styles.statValue} style={{
                      color: signalStatistics.day10.total > 0
                        ? (signalStatistics.day10.rate > 50 ? '#ff4d4f' : 'var(--ant-color-text-secondary)')
                        : 'var(--ant-color-text-tertiary)'
                    }}>
                      {signalStatistics.day10.total > 0
                        ? `${signalStatistics.day10.rate.toFixed(1)}%`
                        : '—'}
                    </div>
                    <div className={styles.statDetail}>
                      {signalStatistics.day10.success}/{signalStatistics.day10.total}
                      {signalStatistics.day10.incompleteCount > 0 && (
                        <span className={styles.incompleteTag}>
                          ({signalStatistics.day10.incompleteCount}个不完整)
                        </span>
                      )}
                    </div>
                  </div>
                  <div className={styles.statItem}>
                    <div className={styles.statLabel}>一月胜率</div>
                    <div className={styles.statValue} style={{
                      color: signalStatistics.day20.total > 0
                        ? (signalStatistics.day20.rate > 50 ? '#ff4d4f' : 'var(--ant-color-text-secondary)')
                        : 'var(--ant-color-text-tertiary)'
                    }}>
                      {signalStatistics.day20.total > 0
                        ? `${signalStatistics.day20.rate.toFixed(1)}%`
                        : '—'}
                    </div>
                    <div className={styles.statDetail}>
                      {signalStatistics.day20.success}/{signalStatistics.day20.total}
                      {signalStatistics.day20.incompleteCount > 0 && (
                        <span className={styles.incompleteTag}>
                          ({signalStatistics.day20.incompleteCount}个不完整)
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )}
              <Table
                columns={columns}
                dataSource={getCurrentStockSignals()}
                rowKey={(record) => `${record.code}-${record.signalDate}`}
                pagination={{ pageSize: 100, showTotal: (total) => `共 ${total} 条信号` }}
                scroll={{ x: 800, y: 'calc(100vh - 400px)' }}
                size="small"
                locale={{ emptyText: selectedStockCode ? '该股票暂无信号' : '请选择左侧股票查看信号' }}
              />
            </Card>
          </Col>
        </Row>
      </Content>

      {/* 筛选条件抽屉 */}
      <Drawer
        title="筛选条件"
        placement="right"
        width={400}
        open={filterDrawerOpen}
        onClose={() => setFilterDrawerOpen(false)}
        destroyOnHidden
        styles={{ body: { padding: '16px 16px', height: 'calc(100vh - 64px)', display: 'flex', flexDirection: 'column' } }}
      >
        <div style={{ flex: 1, overflow: 'auto' }}>
          {/* 市场类型 */}
          <div className={styles.filterRow}>
            <div className={styles.filterItem}>
              <span className={styles.filterLabel}>市场类型</span>
              <Select
                value={marketType}
                onChange={setMarketType}
                options={[
                  { label: '沪深主板', value: 'hs_main' },
                  { label: '创业板', value: 'sz_gem' },
                  { label: '全部', value: 'all' },
                ]}
              />
            </div>
          </div>

          {/* 名称类型 */}
          <div className={styles.filterRow}>
            <div className={styles.filterItem}>
              <span className={styles.filterLabel}>名称类型</span>
              <Select
                value={nameType}
                onChange={setNameType}
                options={[
                  { label: '非ST', value: 'non_st' },
                  { label: 'ST', value: 'st' },
                  { label: '不限', value: 'all' },
                ]}
              />
            </div>
          </div>

          {/* 时间范围 */}
          <div className={styles.filterRow}>
            <div className={styles.filterItem}>
              <span className={styles.filterLabel}>时间范围</span>
              <Select
                value={timeRange}
                onChange={setTimeRange}
                options={[
                  { label: '近7天', value: 7 },
                  { label: '近14天', value: 14 },
                  { label: '近30天', value: 30 },
                  { label: '近60天', value: 60 },
                  { label: '近90天', value: 90 },
                  { label: '不限', value: 0 },
                ]}
              />
            </div>
          </div>

          {/* 近3日胜率 */}
          <div className={styles.filterRow}>
            <div className={styles.filterItem}>
              <span className={styles.filterLabel}>近3日胜率 ≥ (%)</span>
              <Input
                type="number"
                value={minWinRate}
                onChange={(e) => {
                  const value = Number(e.target.value);
                  if (value >= 0 && value <= 100) {
                    setMinWinRate(value);
                  }
                }}
                min={0}
                max={100}
                placeholder="输入 0-100 的数值，0表示不限"
              />
            </div>
          </div>

          {/* 重置按钮 */}
          <div className={styles.filterRow}>
            <Button onClick={handleResetFilter}>
              重置筛选
            </Button>
          </div>
        </div>
      </Drawer>
    </Layout>
  );
}
