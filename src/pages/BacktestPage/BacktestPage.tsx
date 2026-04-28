/**
 * 历史回测页面
 * 基于本地 IndexDB 的全量历史数据进行策略回测
 */

import { useEffect, useState, useRef } from 'react';
import { Layout, Card, Button, Space, Table, message, Progress, Select, DatePicker, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { ExperimentOutlined, ReloadOutlined } from '@ant-design/icons';
import { getStocksHistory, getSignalBacktestsByCode } from '@/utils/storage/opportunityIndexedDB';
import styles from './BacktestPage.module.css';

const { Header, Content } = Layout;
const { RangePicker } = DatePicker;

export function BacktestPage() {
  const [loading, setLoading] = useState(false);
  const [backtesting, setBacktesting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<any[]>([]);
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
          <h2 className={styles.title}>历史回测</h2>
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
        {backtesting && (
          <Card className={styles.progressCard}>
            <Progress percent={progress} status="active" />
          </Card>
        )}

        <Card className={styles.mainCard}>
          <Table
            columns={columns}
            dataSource={results}
            rowKey={(record) => `${record.code}-${record.signalDate}`}
            pagination={{ pageSize: 20, showTotal: (total) => `共 ${total} 条信号` }}
            scroll={{ x: 800, y: 500 }}
            size="small"
          />
        </Card>
      </Content>
    </Layout>
  );
}
