/**
 * 历史回测页面
 * 基于本地 IndexDB 的全量历史数据进行策略回测
 */

import { useEffect, useState, useRef } from 'react';
import { Layout, Card, Button, Space, Table, Progress, Select, DatePicker, Tag, Row, Col, List, Input, Typography, App } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { ExperimentOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons';
import { getStocksHistory, getSignalBacktestsByCode } from '@/utils/storage/opportunityIndexedDB';
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
  const [marketType, setMarketType] = useState<string>('all');
  const workerRef = useRef<Worker | null>(null);
  const taskIdCounter = useRef(0);

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

  // 执行回测
  const handleStartBacktest = async () => {
    if (!workerRef.current) {
      message.error('回测引擎未就绪');
      return;
    }

    setBacktesting(true);
    setProgress(0);
    setResults([]);
    message.info('正在从 IndexDB 加载历史数据...');

    try {
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

  // 获取当前选中股票的信号
  const getCurrentStockSignals = () => {
    if (!selectedStockCode) return [];
    const stockGroup = groupedResults.find(g => g.code === selectedStockCode);
    return stockGroup ? stockGroup.signals : [];
  };

  // 过滤股票列表
  const getFilteredStockList = () => {
    let filtered = groupedResults;

    // 按市场类型过滤
    if (marketType !== 'all') {
      filtered = filtered.filter(item => {
        if (marketType === 'sh') return item.code.startsWith('6');
        if (marketType === 'sz') return item.code.startsWith('0') || item.code.startsWith('3');
        if (marketType === 'bj') return item.code.startsWith('8') || item.code.startsWith('4');
        return true;
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

  // 表格列定义
  const columns: ColumnsType<any> = [
    { title: '股票代码', dataIndex: 'code', key: 'code', width: 100 },
    { title: '股票名称', dataIndex: 'name', key: 'name', width: 100 },
    { title: '信号日期', dataIndex: 'signalDate', key: 'signalDate', width: 120 },
    {
      title: '3日收益',
      dataIndex: ['returns', 'day3'],
      key: 'day3',
      render: (val: number) => val !== null ? <span style={{ color: val > 0 ? '#cf1322' : '#3f8600' }}>{val}%</span> : '-'
    },
    {
      title: '5日收益',
      dataIndex: ['returns', 'day5'],
      key: 'day5',
      render: (val: number) => val !== null ? <span style={{ color: val > 0 ? '#cf1322' : '#3f8600' }}>{val}%</span> : '-'
    },
    {
      title: '两周收益',
      dataIndex: ['returns', 'day10'],
      key: 'day10',
      render: (val: number) => val !== null ? <span style={{ color: val > 0 ? '#cf1322' : '#3f8600' }}>{val}%</span> : '-'
    },
    {
      title: '一月收益',
      dataIndex: ['returns', 'day20'],
      key: 'day20',
      render: (val: number) => val !== null ? <span style={{ color: val > 0 ? '#cf1322' : '#3f8600' }}>{val}%</span> : '-'
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
          <Col span={6}>
            <Card title="股票列表" className={styles.stockListCard}>
              <div className={styles.filterSection}>
                <Select
                  value={marketType}
                  onChange={setMarketType}
                  className={styles.marketSelect}
                  options={[
                    { label: '全部市场', value: 'all' },
                    { label: '沪市', value: 'sh' },
                    { label: '深市', value: 'sz' },
                    { label: '北交所', value: 'bj' },
                  ]}
                />
                <Input
                  placeholder="搜索股票名称或代码"
                  prefix={<SearchOutlined />}
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  className={styles.searchInput}
                  allowClear
                />
              </div>
              <div className={styles.stockListContainer}>
                <List
                  dataSource={getFilteredStockList()}
                  renderItem={(item) => (
                    <List.Item
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
                    </List.Item>
                  )}
                  locale={{ emptyText: '暂无回测数据' }}
                />
              </div>
            </Card>
          </Col>
          <Col span={18}>
            <Card title="信号详情" className={styles.signalDetailCard}>
              <Table
                columns={columns}
                dataSource={getCurrentStockSignals()}
                rowKey={(record) => `${record.code}-${record.signalDate}`}
                pagination={{ pageSize: 100, showTotal: (total) => `共 ${total} 条信号` }}
                scroll={{ x: 800, y: 'calc(100vh - 280px)' }}
                size="small"
                locale={{ emptyText: selectedStockCode ? '该股票暂无信号' : '请选择左侧股票查看信号' }}
              />
            </Card>
          </Col>
        </Row>
      </Content>
    </Layout>
  );
}
