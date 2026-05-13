/**
 * 历史回测页面
 * 基于本地 IndexDB 的全量历史数据进行策略回测
 */

import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import React from 'react';
import { Layout, Card, Button, Space, Table, Progress, Select, DatePicker, Tag, Row, Col, Input, Typography, App, Drawer, Modal, Checkbox, InputNumber } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { ExperimentOutlined, ReloadOutlined, SearchOutlined, FilterOutlined, ClearOutlined, ExportOutlined, CopyOutlined } from '@ant-design/icons';
import VirtualList from 'rc-virtual-list';
import { getStocksHistory, getSignalBacktestsByCode, clearAllSignalBacktests, batchSaveSignalBacktests, getAllSignalBacktests, getStockHistory } from '@/utils/storage/opportunityIndexedDB';
import { getModelMetadata } from '@/utils/analysis/mlBuypointModel';
import { DEFAULT_EXPORT_STOCKS, getEnabledExportStocks, updateStocksFromScan, type ExportStockConfig } from '@/config/exportStocksConfig';
import { exportLatestSignalsToPng } from '@/utils/export/backtestExportUtils';
import { OPPORTUNITY_DEFAULT_INDUSTRY_SECTORS, OPPORTUNITY_DEFAULT_BASIC_FILTERS } from '@/utils/config/opportunityAnalysisDefaults';
import { getUnifiedSectorBasics } from '@/services/hot/unified-sectors';
import { logger } from '@/utils/business/logger';
import styles from './BacktestPage.module.css';

const { Header, Content } = Layout;
const { Text } = Typography;
const { RangePicker } = DatePicker;

// Memoized 列表项组件，防止不必要的重渲染
const StockListItem = React.memo(React.forwardRef<HTMLDivElement, {
  item: any;
  isSelected: boolean;
  onSelect: (code: string) => void;
  onExport: (code: string, name: string) => void;
  style?: React.CSSProperties;
}>(({ item, isSelected, onSelect, onExport, style }, ref) => {
  return (
    <div
      ref={ref}
      style={style}
      className={`${styles.stockListItem} ${isSelected ? styles.selected : ''}`}
      onClick={() => onSelect(item.code)}
    >
      <div className={styles.stockItemContent}>
        <div className={styles.stockInfo}>
          <div className={styles.stockName}>{item.name}</div>
          <div className={styles.stockCode}>{item.code}</div>
        </div>
        <Tag color="blue" className={styles.signalCount}>{item.signals.length}个信号</Tag>
      </div>
      <Button
        size="small"
        icon={<CopyOutlined />}
        onClick={(e) => {
          e.stopPropagation();
          onExport(item.code, item.name);
        }}
      >
        复制
      </Button>
    </div>
  );
}));

StockListItem.displayName = 'StockListItem';

export function BacktestPage() {
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);
  const [backtesting, setBacktesting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<any[]>([]);
  const [groupedResults, setGroupedResults] = useState<any[]>([]);
  const [selectedStockCode, setSelectedStockCode] = useState<string | null>(null);
  const [searchText, setSearchText] = useState('');
  // 市场筛选（多选）
  const [selectedMarket, setSelectedMarket] = useState<string[]>([...OPPORTUNITY_DEFAULT_BASIC_FILTERS.selectedMarket]);
  const [nameType, setNameType] = useState<string>('non_st');
  // 行业板块筛选
  const [industrySectors, setIndustrySectors] = useState<string[]>([...OPPORTUNITY_DEFAULT_INDUSTRY_SECTORS.excludedIndustries]);
  const [industrySectorInvert, setIndustrySectorInvert] = useState<boolean>(OPPORTUNITY_DEFAULT_INDUSTRY_SECTORS.invertEnabled);
  // 概念板块筛选
  const [conceptSectors, setConceptSectors] = useState<string[]>([]);
  const [conceptSectorInvert, setConceptSectorInvert] = useState<boolean>(false);
  // 板块选项
  const [industrySectorOptions, setIndustrySectorOptions] = useState<{ label: string; value: string }[]>([]);
  const [conceptSectorOptions, setConceptSectorOptions] = useState<{ label: string; value: string }[]>([]);
  // 股票板块映射
  const [stockSectorMapping, setStockSectorMapping] = useState<Map<string, { industry?: { code: string; name: string }; concepts?: { code: string; name: string }[] }>>(new Map());
  // 价格、市值、总股数范围
  const [priceRange, setPriceRange] = useState<{ min?: number; max?: number }>({ ...OPPORTUNITY_DEFAULT_BASIC_FILTERS.priceRange });
  const [marketCapRange, setMarketCapRange] = useState<{ min?: number; max?: number }>({ ...OPPORTUNITY_DEFAULT_BASIC_FILTERS.marketCapRange });
  const [totalSharesRange, setTotalSharesRange] = useState<{ min?: number; max?: number }>({ ...OPPORTUNITY_DEFAULT_BASIC_FILTERS.totalSharesRange });
  const [timeRange, setTimeRange] = useState<number>(0);
  const [minWinRate, setMinWinRate] = useState<number>(50); // 近3日胜率最低值
  const [minWinRateDay1, setMinWinRateDay1] = useState<number>(50); // 近1日胜率最低值
  const [minWinRateDay2, setMinWinRateDay2] = useState<number>(50); // 近2日胜率最低值
  const [filterDrawerOpen, setFilterDrawerOpen] = useState(false);
  const [exportDrawerOpen, setExportDrawerOpen] = useState(false);
  const [exportingStock, setExportingStock] = useState<{ code: string; name: string } | null>(null);
  const [exportAllModalOpen, setExportAllModalOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [selectedExportStocks, setSelectedExportStocks] = useState<string[]>([]);
  const [scanning, setScanning] = useState(false); // 扫描状态
  const [dateInput, setDateInput] = useState(''); // 多行文本输入
  const [saving, setSaving] = useState(false);
  const [exportingLatest, setExportingLatest] = useState(false); // 导出最新信号状态
  const workerRef = useRef<Worker | null>(null);
  const taskIdCounter = useRef(0);
  const listContainerRef = useRef<HTMLDivElement>(null);
  const [listHeight, setListHeight] = useState(600);

  // 获取模型元数据
  const modelMetadata = useMemo(() => getModelMetadata(), []);

  // 股票代码规范化函数：将纯数字代码转换为标准格式
  const normalizeStockCode = useCallback((code: string): string => {
    if (code.startsWith('SH') || code.startsWith('SZ')) {
      return code;
    }
    const prefix = code.substring(0, 2);
    if (['60', '68', '90'].includes(prefix)) {
      return `SH${code}`;
    } else if (['00', '30'].includes(prefix)) {
      return `SZ${code}`;
    }
    return code;
  }, []);

  // 加载板块映射
  useEffect(() => {
    const loadSectorMapping = async () => {
      try {
        const { getIndustrySectors, getConceptSectors } = await import('@/utils/storage/sectorStocksIndexedDB');

        const mapping = new Map<string, { industry?: { code: string; name: string }; concepts?: { code: string; name: string }[] }>();

        // 1. 加载行业板块
        const industrySectors = await getIndustrySectors();
        industrySectors.forEach((sector) => {
          sector.children?.forEach((stock) => {
            const normalizedCode = normalizeStockCode(stock.code);
            if (!mapping.has(normalizedCode)) {
              mapping.set(normalizedCode, {});
            }
            const info = mapping.get(normalizedCode)!;
            info.industry = { code: sector.code, name: sector.name };
          });
        });

        // 2. 加载概念板块
        const conceptSectors = await getConceptSectors();
        conceptSectors.forEach((sector) => {
          sector.children?.forEach((stock) => {
            const normalizedCode = normalizeStockCode(stock.code);
            if (!mapping.has(normalizedCode)) {
              mapping.set(normalizedCode, {});
            }
            const info = mapping.get(normalizedCode)!;
            if (!info.concepts) {
              info.concepts = [];
            }
            info.concepts.push({ code: sector.code, name: sector.name });
          });
        });

        setStockSectorMapping(mapping);
        logger.info(`[BacktestPage] 板块映射加载完成，共 ${mapping.size} 只股票`);
      } catch (error) {
        logger.error('[BacktestPage] 加载板块映射失败:', error);
      }
    };

    loadSectorMapping();
  }, [normalizeStockCode]);

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
    // 使用 Promise.all 并行加载，但确保状态更新的顺序性
    const initializeData = async () => {
      try {
        await Promise.all([
          loadSavedBacktestResults(),
          loadSectorOptions()
        ]);
      } catch (error) {
        logger.error('初始化数据失败:', error);
      }
    };

    initializeData();
  }, []);

  // 加载板块选项数据
  const loadSectorOptions = async () => {
    try {
      const { industry, concept } = await getUnifiedSectorBasics();
      setIndustrySectorOptions(industry.map((s) => ({ label: s.name, value: s.code })));
      setConceptSectorOptions(concept.map((s) => ({ label: s.name, value: s.code })));
    } catch (error) {
      logger.error('加载板块选项失败:', error);
    }
  };

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

        // 不在这里设置 selectedStockCode，让 useEffect 统一处理
        // 这样可以避免与筛选逻辑冲突导致的二次渲染
      }
    } catch (error) {
      logger.error('加载保存的回测结果失败:', error);
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
          const currentProgress = Math.round((processedCount / totalTasks) * 100);
          // 在最后一个任务完成前，进度最多显示99%，避免数字和进度条不匹配
          setProgress(processedCount === totalTasks ? 99 : Math.min(currentProgress, 99));

          if (processedCount === totalTasks) {
            setResults(allSignals);
            // 按股票分组
            const grouped = groupSignalsByStock(allSignals);
            setGroupedResults(grouped);
            // 不在这里设置 selectedStockCode，让 useEffect 统一处理
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
      logger.error(error);
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
      logger.error('保存回测结果失败:', error);
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

  // 打开导出抽屉
  const handleOpenExportDrawer = async (code: string, name: string) => {
    setExportingStock({ code, name });

    // 自动填充日期买点
    try {
      // 构建JSON文件路径（根据股票代码查找对应的JSON文件）
      const stockCode = code.replace(/^(SH|SZ)/, '');
      const jsonFileName = `${name}.json`;
      const jsonFilePath = window.electronAPI?.getStockDataPath?.(jsonFileName);

      if (jsonFilePath && window.electronAPI?.readStockBuyPoints) {
        // 读取JSON文件中的日期买点
        const buyPoints = await window.electronAPI.readStockBuyPoints(jsonFilePath);

        if (buyPoints && buyPoints.length > 0) {
          // 将日期格式从 YYYY/MM/DD 转换为 YYYYMMDD，每行一个
          const formattedDates = buyPoints
            .map((date: string) => date.replace(/\//g, ''))
            .join('\n');
          setDateInput(formattedDates);
        } else {
          setDateInput('');
        }
      } else {
        setDateInput('');
      }
    } catch (error) {
      logger.error('读取日期买点失败:', error);
      setDateInput('');
    }

    setExportDrawerOpen(true);
  };

  // 日期格式化函数：将 "20251222" 格式化为 "2025/12/22"
  const formatDateString = (input: string): string | null => {
    const trimmed = input.trim();
    if (!/^\d{8}$/.test(trimmed)) return null;

    const year = trimmed.substring(0, 4);
    const month = trimmed.substring(4, 6);
    const day = trimmed.substring(6, 8);

    // 验证日期有效性
    const date = new Date(`${year}-${month}-${day}`);
    if (isNaN(date.getTime())) return null;

    return `${year}/${month}/${day}`;
  };

  // 保存股票数据到本地文件
  const handleSaveStockData = async () => {
    if (!exportingStock || !window.electronAPI?.saveStockData) {
      message.error('保存功能不可用');
      return;
    }

    // 解析日期输入（按换行分割）
    const dateLines = dateInput.split('\n').filter((line) => line.trim());

    if (dateLines.length === 0) {
      message.warning('请至少输入一个日期');
      return;
    }

    // 验证并格式化日期
    const formattedDates: string[] = [];
    for (const line of dateLines) {
      const formatted = formatDateString(line);
      if (!formatted) {
        message.error(`日期格式错误: "${line}"，请输入8位数字（如20251222）`);
        return;
      }
      formattedDates.push(formatted);
    }

    try {
      setSaving(true);

      // 从 IndexedDB 获取股票历史数据
      const historyRecord = await getStockHistory(exportingStock.code);

      if (!historyRecord) {
        message.error('未找到该股票的历史数据');
        setSaving(false);
        return;
      }

      // 调用 Electron API 保存文件
      const result = await window.electronAPI.saveStockData({
        code: historyRecord.code,
        name: historyRecord.name,
        klineData: historyRecord.dailyLines,
        latestQuote: historyRecord.latestQuote,
        updatedAt: historyRecord.updatedAt,
        dates: dateLines, // 传递原始输入，由主进程格式化
      });

      if (result.success) {
        message.success(`保存成功！\n文件路径: ${result.filePath}`);
        setExportDrawerOpen(false);
        setDateInput('');
      } else {
        message.error('保存失败: ' + (result.error || '未知错误'));
      }
    } catch (error) {
      logger.error('保存股票数据失败:', error);
      message.error('保存失败: ' + (error as Error).message);
    } finally {
      setSaving(false);
    }
  };

  // 打开导出所有数据模态框（自动扫描目录）
  const handleOpenExportAllModal = async () => {
    setExportAllModalOpen(true);

    // 自动执行扫描
    await handleScanStockDirectory();
  };

  // 扫描股票数据目录获取最新股票列表
  const handleScanStockDirectory = async () => {
    if (!window.electronAPI?.scanStockDataDirectory) {
      message.error('扫描功能不可用');
      return;
    }

    try {
      setScanning(true);

      const result = await window.electronAPI.scanStockDataDirectory();

      if (result.success && result.stocks) {
        // 更新配置（临时，仅用于本次导出）
        updateStocksFromScan(result.stocks);

        // 选中所有股票
        setSelectedExportStocks(result.stocks.map((s: { code: string }) => s.code));
      } else {
        message.error('扫描失败: ' + (result.error || '未知错误'));
      }
    } catch (error) {
      logger.error('扫描目录失败:', error);
      message.error('扫描失败: ' + (error as Error).message);
    } finally {
      setScanning(false);
    }
  };

  // 切换股票选择状态
  const toggleStockSelection = (code: string) => {
    setSelectedExportStocks(prev =>
      prev.includes(code)
        ? prev.filter(c => c !== code)
        : [...prev, code]
    );
  };

  // 全选/取消全选
  const toggleSelectAll = () => {
    if (selectedExportStocks.length === DEFAULT_EXPORT_STOCKS.stocks.length) {
      setSelectedExportStocks([]);
    } else {
      setSelectedExportStocks(DEFAULT_EXPORT_STOCKS.stocks.map(s => s.code));
    }
  };

  // 导出数据为JSON格式
  const convertToJSON = (data: any[]) => {
    return JSON.stringify({
      exportTime: new Date().toISOString(),
      format: 'json',
      totalStocks: data.length,
      totalSignals: data.reduce((sum, item) => sum + (item.signals?.length || 0), 0),
      data: data
    }, null, 2);
  };

  // 执行批量导出
  const handleExportAllData = async () => {
    if (selectedExportStocks.length === 0) {
      message.warning('请至少选择一只股票');
      return;
    }

    try {
      setExporting(true);
      message.info('正在准备导出数据...');

      // 获取所有选中的股票回测数据
      const allResults = await getAllSignalBacktests();
      const filteredResults = allResults.filter(result =>
        selectedExportStocks.includes(result.code)
      );

      if (filteredResults.length === 0) {
        message.warning('选中的股票没有回测数据');
        setExporting(false);
        return;
      }

      // 转换为JSON格式
      const content = convertToJSON(filteredResults);
      // 使用固定文件名，每次覆盖更新
      const filename = `backtest_export_latest.json`;

      // 使用Electron API保存文件
      if (window.electronAPI?.saveStockData) {
        const result = await window.electronAPI.saveStockData({
          code: 'EXPORT_ALL',
          name: '批量导出',
          klineData: [],
          dates: [],
          // @ts-ignore - 添加额外字段用于导出
          exportContent: content,
          exportFilename: filename
        });

        if (result.success) {
          message.success(`导出成功！\n文件路径: ${result.filePath}`);
          setExportAllModalOpen(false);
        } else {
          message.error('导出失败: ' + (result.error || '未知错误'));
        }
      } else {
        // 降级方案：复制到剪贴板
        navigator.clipboard.writeText(content);
        message.success('数据已复制到剪贴板，请手动保存');
        setExportAllModalOpen(false);
      }
    } catch (error) {
      logger.error('导出失败:', error);
      message.error('导出失败: ' + (error as Error).message);
    } finally {
      setExporting(false);
    }
  };

  // 导出最新日期的信号股票为图片
  const handleExportLatestSignals = async () => {
    if (groupedResults.length === 0) {
      message.warning('暂无回测数据');
      return;
    }

    try {
      setExportingLatest(true);
      message.info('正在准备导出最新信号股票...');

      // 获取所有回测结果
      const allResults = await getAllSignalBacktests();

      if (allResults.length === 0) {
        message.warning('没有可用的回测数据');
        setExportingLatest(false);
        return;
      }

      // 调用导出函数，传入当前筛选条件
      await exportLatestSignalsToPng(allResults, {
        fileNamePrefix: '最新信号股票',
        selectedMarket,
        industrySectors,
        industrySectorInvert,
        conceptSectors,
        conceptSectorInvert,
        priceRange,
        marketCapRange,
        totalSharesRange,
      });

      message.success('导出成功！');
    } catch (error) {
      logger.error('导出最新信号股票失败:', error);
      message.error('导出失败: ' + (error as Error).message);
    } finally {
      setExportingLatest(false);
    }
  };
  const handleResetFilter = () => {
    setSelectedMarket([...OPPORTUNITY_DEFAULT_BASIC_FILTERS.selectedMarket]);
    setNameType('non_st');
    setIndustrySectors([...OPPORTUNITY_DEFAULT_INDUSTRY_SECTORS.excludedIndustries]);
    setIndustrySectorInvert(OPPORTUNITY_DEFAULT_INDUSTRY_SECTORS.invertEnabled);
    setConceptSectors([]);
    setConceptSectorInvert(false);
    setPriceRange({ ...OPPORTUNITY_DEFAULT_BASIC_FILTERS.priceRange });
    setMarketCapRange({ ...OPPORTUNITY_DEFAULT_BASIC_FILTERS.marketCapRange });
    setTotalSharesRange({ ...OPPORTUNITY_DEFAULT_BASIC_FILTERS.totalSharesRange });
    setTimeRange(0);
    setMinWinRate(0);
    setMinWinRateDay1(0);
    setMinWinRateDay2(0);
    setSearchText('');
    message.success('已重置筛选条件');
  };

  // 获取筛选摘要文本
  const getFilterSummary = () => {
    const parts: string[] = [];

    // 市场类型
    if (selectedMarket.length > 0) {
      const marketLabels = selectedMarket.map(m => {
        if (m === 'hs_main') return '沪深主板';
        if (m === 'sz_gem') return '创业板';
        return m;
      });
      parts.push(`市场:${marketLabels.join('、')}`);
    }

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
        day1: { total: 0, success: 0, rate: 0, incompleteCount: 0 },
        day2: { total: 0, success: 0, rate: 0, incompleteCount: 0 },
        day3: { total: 0, success: 0, rate: 0, incompleteCount: 0 },
        day5: { total: 0, success: 0, rate: 0, incompleteCount: 0 },
        day10: { total: 0, success: 0, rate: 0, incompleteCount: 0 },
        day20: { total: 0, success: 0, rate: 0, incompleteCount: 0 },
      };
    }

    const stats = {
      day1: { total: 0, success: 0, rate: 0, incompleteCount: 0 },
      day2: { total: 0, success: 0, rate: 0, incompleteCount: 0 },
      day3: { total: 0, success: 0, rate: 0, incompleteCount: 0 },
      day5: { total: 0, success: 0, rate: 0, incompleteCount: 0 },
      day10: { total: 0, success: 0, rate: 0, incompleteCount: 0 },
      day20: { total: 0, success: 0, rate: 0, incompleteCount: 0 },
    };

    // 优化：只遍历一次信号数组，同时计算所有时间段的统计
    signals.forEach((signal: any) => {
      const returns = signal.returns || {};

      // 处理所有时间段的数据
      const periods = [
        { key: 'day1', days: 1 },
        { key: 'day2', days: 2 },
        { key: 'day3', days: 3 },
        { key: 'day5', days: 5 },
        { key: 'day10', days: 10 },
        { key: 'day20', days: 20 }
      ];

      periods.forEach(({ key, days }) => {
        const periodData = returns[key];
        if (periodData) {
          stats[key as keyof typeof stats].total++;
          if (periodData.actualDays < days) {
            stats[key as keyof typeof stats].incompleteCount++;
          }
          if (periodData.value > 0) {
            stats[key as keyof typeof stats].success++;
          }
        }
      });
    });

    // 计算胜率
    Object.keys(stats).forEach(key => {
      const periodStats = stats[key as keyof typeof stats];
      periodStats.rate = periodStats.total > 0 ? (periodStats.success / periodStats.total) * 100 : 0;
    });

    return stats;
  }, [selectedStockCode, groupedResults]);

  // 过滤股票列表（使用 useMemo 优化性能）
  const filteredStockList = useMemo(() => {
    // 如果没有数据，直接返回空数组
    if (!groupedResults || groupedResults.length === 0) {
      return [];
    }

    let filtered = [...groupedResults]; // 创建副本以避免修改原数组

    // 1. 按市场类型过滤（多选）
    if (selectedMarket.length > 0) {
      filtered = filtered.filter(item => {
        const pureCode = item.code.replace(/^(SH|SZ|BJ)/, '');
        return selectedMarket.some(market => {
          if (market === 'hs_main') return pureCode.startsWith('60') || pureCode.startsWith('00');
          if (market === 'sz_gem') return pureCode.startsWith('30');
          return true;
        });
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

    // 3. 按近1日胜率过滤
    if (minWinRateDay1 > 0) {
      filtered = filtered.filter(item => {
        // 计算该股票的近1日胜率
        const totalSignals = item.signals.length;
        if (totalSignals === 0) return false;

        let successCount = 0;
        let validCount = 0;

        item.signals.forEach((signal: any) => {
          // 只统计完整周期（actualDays >= 1）
          if (signal.returns.day1 && signal.returns.day1.actualDays >= 1) {
            validCount++;
            if (signal.returns.day1.value > 0) {
              successCount++;
            }
          }
        });

        if (validCount === 0) return false;
        const winRate = (successCount / validCount) * 100;
        return winRate >= minWinRateDay1;
      });
    }

    // 4. 按近2日胜率过滤
    if (minWinRateDay2 > 0) {
      filtered = filtered.filter(item => {
        // 计算该股票的近2日胜率
        const totalSignals = item.signals.length;
        if (totalSignals === 0) return false;

        let successCount = 0;
        let validCount = 0;

        item.signals.forEach((signal: any) => {
          // 只统计完整周期（actualDays >= 2）
          if (signal.returns.day2 && signal.returns.day2.actualDays >= 2) {
            validCount++;
            if (signal.returns.day2.value > 0) {
              successCount++;
            }
          }
        });

        if (validCount === 0) return false;
        const winRate = (successCount / validCount) * 100;
        return winRate >= minWinRateDay2;
      });
    }

    // 5. 按近3日胜率过滤
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

    // 6. 按时间范围过滤（筛选近期出现的信号）
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

    // 7. 按价格范围过滤（需要异步获取股票历史数据）
    // 注意：这里简化处理，实际应该从 IndexedDB 获取最新价格
    // 由于 groupedResults 中没有价格信息，暂时跳过此过滤
    // TODO: 如果需要价格过滤，需要从 getStocksHistory 获取数据

    // 8. 按市值范围过滤
    // TODO: 需要从 stock history 中获取市值信息

    // 9. 按总股数范围过滤
    // TODO: 需要从 stock history 中获取总股数信息

    // 10. 按行业板块过滤
    if (industrySectors.length > 0) {
      filtered = filtered.filter(item => {
        const stockCode = normalizeStockCode(item.code);
        const sectorInfo = stockSectorMapping.get(stockCode);
        const stockIndustry = sectorInfo?.industry;

        if (!stockIndustry) {
          // 没有行业信息的股票，根据 invert 决定是否保留
          return industrySectorInvert; // 如果排除选中，则保留；否则过滤掉
        }

        const isSelected = industrySectors.includes(stockIndustry.code);

        if (industrySectorInvert) {
          // 排除选中：选中的行业不显示
          return !isSelected;
        } else {
          // 包含选中：只显示选中的行业
          return isSelected;
        }
      });
    }

    // 11. 按概念板块过滤
    if (conceptSectors.length > 0) {
      filtered = filtered.filter(item => {
        const stockCode = normalizeStockCode(item.code);
        const sectorInfo = stockSectorMapping.get(stockCode);
        const stockConcepts = sectorInfo?.concepts || [];

        if (stockConcepts.length === 0) {
          // 没有概念信息的股票，根据 invert 决定是否保留
          return conceptSectorInvert;
        }

        // 检查股票是否有选中的概念
        const hasSelectedConcept = stockConcepts.some(c => conceptSectors.includes(c.code));

        if (conceptSectorInvert) {
          // 排除选中：有选中的概念则不显示
          return !hasSelectedConcept;
        } else {
          // 包含选中：必须有选中的概念
          return hasSelectedConcept;
        }
      });
    }

    return filtered;
  }, [
    groupedResults,
    selectedMarket,
    nameType,
    minWinRateDay1,
    minWinRateDay2,
    minWinRate,
    timeRange,
    searchText,
    priceRange,
    marketCapRange,
    totalSharesRange,
    industrySectors,
    industrySectorInvert,
    conceptSectors,
    conceptSectorInvert,
    stockSectorMapping,
    normalizeStockCode,
  ]);

  // 使用 ref 跟踪上一次的选中状态，避免不必要的更新
  const prevFilteredStockListRef = useRef<any[]>([]);
  const prevSelectedStockCodeRef = useRef<string | null>(null);
  const selectionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isInitialLoadRef = useRef(true); // 标记是否是首次加载

  // 当筛选结果变化时，如果当前选中的股票不在结果中，自动选中第一个
  useEffect(() => {
    // 清除之前的定时器
    if (selectionTimerRef.current) {
      clearTimeout(selectionTimerRef.current);
    }

    // 如果是首次加载且有数据，立即选中第一个，不等待防抖
    if (isInitialLoadRef.current && filteredStockList.length > 0 && !selectedStockCode) {
      setSelectedStockCode(filteredStockList[0].code);
      isInitialLoadRef.current = false;
      prevFilteredStockListRef.current = filteredStockList;
      prevSelectedStockCodeRef.current = filteredStockList[0].code;
      return;
    }

    // 非首次加载，使用防抖
    selectionTimerRef.current = setTimeout(() => {
      // 检查是否有实际变化，避免不必要的更新
      const hasListChanged = filteredStockList.length !== prevFilteredStockListRef.current.length ||
        JSON.stringify(filteredStockList.map(item => item.code)) !==
        JSON.stringify(prevFilteredStockListRef.current.map(item => item.code));

      const hasSelectionChanged = selectedStockCode !== prevSelectedStockCodeRef.current;

      if (hasListChanged || hasSelectionChanged) {
        if (filteredStockList.length > 0) {
          // 如果当前选中的股票不在筛选结果中，选中第一个
          const isCurrentSelected = filteredStockList.some(item => item.code === selectedStockCode);
          if (!isCurrentSelected) {
            setSelectedStockCode(filteredStockList[0].code);
          }
        } else {
          // 如果没有筛选结果，清空选中
          if (selectedStockCode !== null) {
            setSelectedStockCode(null);
          }
        }

        // 更新 refs
        prevFilteredStockListRef.current = filteredStockList;
        prevSelectedStockCodeRef.current = selectedStockCode;
      }
    }, 100); // 100ms 防抖延迟

    // 清理函数
    return () => {
      if (selectionTimerRef.current) {
        clearTimeout(selectionTimerRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredStockList]);

  // 表格列定义
  const columns: ColumnsType<any> = [
    { title: '股票代码', dataIndex: 'code', key: 'code', width: 100 },
    { title: '股票名称', dataIndex: 'name', key: 'name', width: 100 },
    {
      title: '信号日期',
      dataIndex: 'signalDate',
      key: 'signalDate',
      width: 180,
      render: (val: string) => (
        <Space size={4}>
          <span>{val}</span>
          <Tag color="cyan" style={{ fontSize: 11, margin: 0 }}>
            ML {modelMetadata.version}
          </Tag>
        </Space>
      )
    },
    {
      title: '1日收益',
      dataIndex: ['returns', 'day1'],
      key: 'day1',
      render: (val: any) => {
        if (!val) return '-';
        const isComplete = val.actualDays >= 1;
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
      title: '2日收益',
      dataIndex: ['returns', 'day2'],
      key: 'day2',
      render: (val: any) => {
        if (!val) return '-';
        const isComplete = val.actualDays >= 2;
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
              icon={<ExportOutlined />}
              onClick={handleOpenExportAllModal}
              disabled={groupedResults.length === 0}
            >
              导出指定股票
            </Button>
            <Button
              icon={<ExportOutlined />}
              onClick={handleExportLatestSignals}
              disabled={groupedResults.length === 0 || exportingLatest}
              loading={exportingLatest}
            >
              导出最新信号股票
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
        {/* 模型信息卡片 */}
        <Card className={styles.modelInfoCard} style={{ marginBottom: 16 }}>
          <Space size="large" wrap>
            <Tag color="blue" style={{ fontSize: 14, padding: '4px 12px' }}>
              ML模型 {modelMetadata.version}
            </Tag>
            <Text type="secondary">
              训练时间: {modelMetadata.trainingDate}
            </Text>
            <Text type="secondary">
              准确率: <Text strong style={{ color: '#52c41a' }}>{modelMetadata.performance.accuracy}%</Text>
            </Text>
            <Text type="secondary">
              召回率: <Text strong style={{ color: '#52c41a' }}>{modelMetadata.performance.recall}%</Text>
            </Text>
            <Text type="secondary">
              F1分数: <Text strong style={{ color: '#52c41a' }}>{modelMetadata.performance.f1}</Text>
            </Text>
            <Text type="secondary">
              训练样本: {modelMetadata.trainingSamples.total}个
              （{modelMetadata.trainingSamples.positive}正 + {modelMetadata.trainingSamples.negative}负）
            </Text>
          </Space>
        </Card>

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
              strokeColor="#1890ff"
              trailColor="rgba(0, 0, 0, 0.06)"
              size="small"
              style={{ borderRadius: 4 }}
            />
          </div>
        )}

        <Row gutter={0} className={styles.mainRow}>
          <Col span={6} className={styles.stockListCol}>
            <Card
              title={
                <Space>
                  <span>股票列表</span>
                  <Tag color="blue" style={{ fontSize: 12, padding: '2px 8px' }}>
                    {filteredStockList.length} 只
                  </Tag>
                </Space>
              }
              className={styles.stockListCard}
            >
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
                {filteredStockList.length === 0 ? (
                  <div className={styles.emptyText}>暂无回测数据</div>
                ) : (
                  <VirtualList
                    data={filteredStockList}
                    height={listHeight}
                    itemHeight={64}
                    itemKey="code"
                    // 添加稳定性优化，防止不必要的重渲染
                    style={{ outline: 'none' }}
                  >
                    {(item, index, { style }) => (
                      <StockListItem
                        key={item.code}
                        item={item}
                        isSelected={selectedStockCode === item.code}
                        onSelect={setSelectedStockCode}
                        onExport={handleOpenExportDrawer}
                        style={style}
                      />
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
                    <div className={styles.statLabel}>1日胜率</div>
                    <div className={styles.statValue} style={{
                      color: signalStatistics.day1.total > 0
                        ? (signalStatistics.day1.rate > 50 ? '#ff4d4f' : 'var(--ant-color-text-secondary)')
                        : 'var(--ant-color-text-tertiary)'
                    }}>
                      {signalStatistics.day1.total > 0
                        ? `${signalStatistics.day1.rate.toFixed(1)}%`
                        : '—'}
                    </div>
                    <div className={styles.statDetail}>
                      {signalStatistics.day1.success}/{signalStatistics.day1.total}
                      {signalStatistics.day1.incompleteCount > 0 && (
                        <span className={styles.incompleteTag}>
                          ({signalStatistics.day1.incompleteCount}个不完整)
                        </span>
                      )}
                    </div>
                  </div>
                  <div className={styles.statItem}>
                    <div className={styles.statLabel}>2日胜率</div>
                    <div className={styles.statValue} style={{
                      color: signalStatistics.day2.total > 0
                        ? (signalStatistics.day2.rate > 50 ? '#ff4d4f' : 'var(--ant-color-text-secondary)')
                        : 'var(--ant-color-text-tertiary)'
                    }}>
                      {signalStatistics.day2.total > 0
                        ? `${signalStatistics.day2.rate.toFixed(1)}%`
                        : '—'}
                    </div>
                    <div className={styles.statDetail}>
                      {signalStatistics.day2.success}/{signalStatistics.day2.total}
                      {signalStatistics.day2.incompleteCount > 0 && (
                        <span className={styles.incompleteTag}>
                          ({signalStatistics.day2.incompleteCount}个不完整)
                        </span>
                      )}
                    </div>
                  </div>
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
                scroll={{ x: 800, y: 'calc(100vh - 500px)' }}
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
        width={500}
        open={filterDrawerOpen}
        onClose={() => setFilterDrawerOpen(false)}
        destroyOnHidden
        styles={{ body: { padding: '16px 16px', height: 'calc(100vh - 64px)', display: 'flex', flexDirection: 'column' } }}
      >
        <div style={{ flex: 1, overflow: 'auto' }}>
          {/* 市场类型（多选） */}
          <div className={styles.filterRow}>
            <div className={styles.filterItem}>
              <span className={styles.filterLabel}>市场类型：</span>
              <Select
                mode="multiple"
                value={selectedMarket}
                onChange={setSelectedMarket}
                style={{ width: '100%' }}
                placeholder="请选择市场"
                options={[
                  { label: '沪深主板', value: 'hs_main' },
                  { label: '创业板', value: 'sz_gem' },
                ]}
                maxTagCount="responsive"
              />
            </div>
          </div>

          {/* 名称类型 */}
          <div className={styles.filterRow}>
            <div className={styles.filterItem}>
              <span className={styles.filterLabel}>名称类型：</span>
              <Select
                value={nameType}
                onChange={setNameType}
                style={{ width: '100%' }}
                options={[
                  { label: '非ST', value: 'non_st' },
                  { label: 'ST', value: 'st' },
                  { label: '不限', value: 'all' },
                ]}
              />
            </div>
          </div>

          {/* 行业板块 */}
          <div className={styles.filterRow}>
            <div className={styles.filterItem}>
              <span className={styles.filterLabel}>行业板块：</span>
              <div style={{ flex: 1, display: 'flex', gap: '8px', alignItems: 'center' }}>
                <Select
                  mode="multiple"
                  value={industrySectors}
                  onChange={setIndustrySectors}
                  style={{ flex: 1 }}
                  placeholder="选择行业板块"
                  options={industrySectorOptions}
                  maxTagCount="responsive"
                />
                <Checkbox
                  checked={industrySectorInvert}
                  onChange={(e) => setIndustrySectorInvert(e.target.checked)}
                >
                  排除选中
                </Checkbox>
              </div>
            </div>
          </div>

          {/* 概念板块 */}
          <div className={styles.filterRow}>
            <div className={styles.filterItem}>
              <span className={styles.filterLabel}>概念板块：</span>
              <div style={{ flex: 1, display: 'flex', gap: '8px', alignItems: 'center' }}>
                <Select
                  mode="multiple"
                  value={conceptSectors}
                  onChange={setConceptSectors}
                  style={{ flex: 1 }}
                  placeholder="选择概念板块"
                  options={conceptSectorOptions}
                  maxTagCount="responsive"
                />
                <Checkbox
                  checked={conceptSectorInvert}
                  onChange={(e) => setConceptSectorInvert(e.target.checked)}
                >
                  排除选中
                </Checkbox>
              </div>
            </div>
          </div>

          {/* 价格范围 */}
          <div className={styles.filterRow}>
            <div className={styles.filterItem}>
              <span className={styles.filterLabel}>价格范围（元）：</span>
              <Space style={{ width: '100%' }}>
                <InputNumber
                  placeholder="最小"
                  value={priceRange.min}
                  onChange={(value) => setPriceRange({ ...priceRange, min: value ?? undefined })}
                  style={{ flex: 1 }}
                  min={0}
                />
                <span>-</span>
                <InputNumber
                  placeholder="最大"
                  value={priceRange.max}
                  onChange={(value) => setPriceRange({ ...priceRange, max: value ?? undefined })}
                  style={{ flex: 1 }}
                  min={0}
                />
              </Space>
            </div>
          </div>

          {/* 市值范围 */}
          <div className={styles.filterRow}>
            <div className={styles.filterItem}>
              <span className={styles.filterLabel}>总市值（亿）：</span>
              <Space style={{ width: '100%' }}>
                <InputNumber
                  placeholder="最小"
                  value={marketCapRange.min}
                  onChange={(value) => setMarketCapRange({ ...marketCapRange, min: value ?? undefined })}
                  style={{ flex: 1 }}
                  min={0}
                />
                <span>-</span>
                <InputNumber
                  placeholder="最大"
                  value={marketCapRange.max}
                  onChange={(value) => setMarketCapRange({ ...marketCapRange, max: value ?? undefined })}
                  style={{ flex: 1 }}
                  min={0}
                />
              </Space>
            </div>
          </div>

          {/* 总股数范围 */}
          <div className={styles.filterRow}>
            <div className={styles.filterItem}>
              <span className={styles.filterLabel}>总股数（亿）：</span>
              <Space style={{ width: '100%' }}>
                <InputNumber
                  placeholder="最小"
                  value={totalSharesRange.min}
                  onChange={(value) => setTotalSharesRange({ ...totalSharesRange, min: value ?? undefined })}
                  style={{ flex: 1 }}
                  min={0}
                />
                <span>-</span>
                <InputNumber
                  placeholder="最大"
                  value={totalSharesRange.max}
                  onChange={(value) => setTotalSharesRange({ ...totalSharesRange, max: value ?? undefined })}
                  style={{ flex: 1 }}
                  min={0}
                />
              </Space>
            </div>
          </div>

          {/* 时间范围 */}
          <div className={styles.filterRow}>
            <div className={styles.filterItem}>
              <span className={styles.filterLabel}>时间范围：</span>
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

          {/* 近1日胜率 */}
          <div className={styles.filterRow}>
            <div className={styles.filterItem}>
              <span className={styles.filterLabel}>近1日胜率 ≥ (%)：</span>
              <Input
                type="number"
                value={minWinRateDay1}
                onChange={(e) => {
                  const value = Number(e.target.value);
                  if (value >= 0 && value <= 100) {
                    setMinWinRateDay1(value);
                  }
                }}
                min={0}
                max={100}
                placeholder="0-100"
                style={{ width: 120 }}
              />
            </div>
          </div>

          {/* 近2日胜率 */}
          <div className={styles.filterRow}>
            <div className={styles.filterItem}>
              <span className={styles.filterLabel}>近2日胜率 ≥ (%)：</span>
              <Input
                type="number"
                value={minWinRateDay2}
                onChange={(e) => {
                  const value = Number(e.target.value);
                  if (value >= 0 && value <= 100) {
                    setMinWinRateDay2(value);
                  }
                }}
                min={0}
                max={100}
                placeholder="0-100"
                style={{ width: 120 }}
              />
            </div>
          </div>

          {/* 近3日胜率 */}
          <div className={styles.filterRow}>
            <div className={styles.filterItem}>
              <span className={styles.filterLabel}>近3日胜率 ≥ (%)：</span>
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
                placeholder="0-100"
                style={{ width: 120 }}
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

      {/* 导出股票数据抽屉 */}
      <Drawer
        title="导出股票K线数据"
        placement="right"
        width={500}
        open={exportDrawerOpen}
        onClose={() => setExportDrawerOpen(false)}
        destroyOnHidden
      >
        <div style={{ marginBottom: 16 }}>
          <div style={{ marginBottom: 8 }}>
            <Text strong>股票名称：</Text>
            <Text>{exportingStock?.name}</Text>
          </div>
          <div style={{ marginBottom: 8 }}>
            <Text strong>股票代码：</Text>
            <Text>{exportingStock?.code}</Text>
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <Text strong>日期买点（每行一个日期，仅输入8位数字）：</Text>
          <Text type="secondary" style={{ display: 'block', marginTop: 4 }}>
            示例：20251222
          </Text>
          <Input.TextArea
            rows={6}
            value={dateInput}
            onChange={(e) => setDateInput(e.target.value)}
            style={{ marginTop: 8, resize: 'none' }}
          />
        </div>

        <div style={{ textAlign: 'right' }}>
          <Space>
            <Button onClick={() => setExportDrawerOpen(false)}>
              取消
            </Button>
            <Button
              type="primary"
              onClick={handleSaveStockData}
              loading={saving}
            >
              保存
            </Button>
          </Space>
        </div>
      </Drawer>

      {/* 导出指定股票模态框 */}
      <Modal
        title="导出指定股票回测数据"
        open={exportAllModalOpen}
        onCancel={() => setExportAllModalOpen(false)}
        onOk={handleExportAllData}
        confirmLoading={exporting}
        width={800}
        okText="导出"
        cancelText="取消"
      >
        <div style={{ marginBottom: 16 }}>
          <div style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <Text strong>选择股票 ({selectedExportStocks.length}/{DEFAULT_EXPORT_STOCKS.stocks.length})：</Text>
              <Button
                size="small"
                onClick={toggleSelectAll}
              >
                {selectedExportStocks.length === DEFAULT_EXPORT_STOCKS.stocks.length ? '取消全选' : '全选'}
              </Button>
            </div>
            <div style={{
              maxHeight: 300,
              overflow: 'auto',
              border: '1px solid #d9d9d9',
              borderRadius: 4,
              padding: 8
            }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8 }}>
                {DEFAULT_EXPORT_STOCKS.stocks.map(stock => (
                  <div
                    key={stock.code}
                    style={{
                      padding: '6px 8px',
                      border: selectedExportStocks.includes(stock.code) ? '1px solid #1890ff' : '1px solid #d9d9d9',
                      borderRadius: 4,
                      cursor: 'pointer',
                      backgroundColor: selectedExportStocks.includes(stock.code) ? '#e6f7ff' : 'transparent',
                      fontSize: 12
                    }}
                    onClick={() => toggleStockSelection(stock.code)}
                  >
                    <div style={{ fontWeight: 500 }}>{stock.name}</div>
                    <div style={{ color: '#8c8c8c', fontSize: 11 }}>{stock.code}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div style={{ marginTop: 12 }}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              提示：默认导出股票数据目录中的股票，可手动调整选择。数据将保存到 docs/回测优化/历史回测数据 目录，格式为JSON。
            </Text>
          </div>
        </div>
      </Modal>
    </Layout>
  );
}
