/**
 * 机会分析页面
 */

import { useEffect, useState, useMemo, useRef, useCallback, useLayoutEffect } from 'react';
import { Layout, Card, Button, Space, Progress, Select, Collapse, message, InputNumber, Checkbox } from 'antd';
import {
  PlayCircleOutlined,
  StopOutlined,
  ExportOutlined,
  SettingOutlined,
  ExclamationCircleOutlined,
  FilterOutlined,
  ClearOutlined,
} from '@ant-design/icons';
import { useOpportunityStore } from '@/stores/opportunityStore';
import { calculateConsolidation } from '@/utils/consolidationAnalysis';
import { OpportunityTable } from '@/components/OpportunityTable/OpportunityTable';
import { ColumnSettings } from '@/components/ColumnSettings/ColumnSettings';
import { exportOpportunityToExcel } from '@/utils/opportunityExportUtils';
import type { KLinePeriod, StockInfo, KLineData } from '@/types/stock';
import { useAllStocks } from '@/hooks/useAllStocks';
import { getPureCode } from '@/utils/format';
import { getStockQuotes } from '@/services/stockApi';
import styles from './OpportunityPage.module.css';

const { Header, Content } = Layout;
const { Panel } = Collapse;

const PERIOD_OPTIONS: { label: string; value: KLinePeriod }[] = [
  { label: '日', value: 'day' },
  { label: '周', value: 'week' },
  { label: '月', value: 'month' },
  { label: '年', value: 'year' },
];

const MARKET_OPTIONS: { label: string; value: string }[] = [
  { label: '沪市主板', value: 'sh_main' },
  { label: '深市主板', value: 'sz_main' },
  { label: '创业板', value: 'sz_gem' },
];

const NAME_TYPE_OPTIONS: { label: string; value: string }[] = [
  { label: '不限', value: 'all' },
  { label: 'ST', value: 'st' },
  { label: '非ST', value: 'non_st' },
];

export function OpportunityPage() {
  const {
    analysisData,
    loading,
    progress,
    currentPeriod,
    currentCount,
    columnConfig,
    sortConfig,
    errors,
    klineDataCache,
    startAnalysis,
    cancelAnalysis,
    loadCachedData,
    updateColumnConfig,
    updateSortConfig,
    resetColumnConfig,
  } = useOpportunityStore();

  const { allStocks } = useAllStocks();
  const [columnSettingsVisible, setColumnSettingsVisible] = useState(false);
  const [selectedMarket, setSelectedMarket] = useState<string>('sh_main');
  const [priceRange, setPriceRange] = useState<{ min?: number; max?: number }>({});
  const [nameType, setNameType] = useState<string>('all');
  const [filteringQuotes, setFilteringQuotes] = useState(false);

  // 筛选条件状态
  const [marketCapRange, setMarketCapRange] = useState<{ min?: number; max?: number }>({});
  const [circulatingMarketCapRange, setCirculatingMarketCapRange] = useState<{ min?: number; max?: number }>({});
  const [turnoverRateRange, setTurnoverRateRange] = useState<{ min?: number; max?: number }>({});
  const [peRatioRange, setPeRatioRange] = useState<{ min?: number; max?: number }>({});
  const [filterVisible, setFilterVisible] = useState(true);

  // 涨停/跌停筛选状态
  const [recentLimitUpCount, setRecentLimitUpCount] = useState<number | undefined>();
  const [recentLimitDownCount, setRecentLimitDownCount] = useState<number | undefined>();
  const [limitUpPeriod, setLimitUpPeriod] = useState<number>(10);
  const [limitDownPeriod, setLimitDownPeriod] = useState<number>(10);

  // 横盘筛选状态
  const [consolidationMethods, setConsolidationMethods] = useState<string[]>([]);
  const [consolidationFilterMode, setConsolidationFilterMode] = useState<'and' | 'or'>('and');
  const [consolidationPeriod, setConsolidationPeriod] = useState<number>(10);
  const [priceVolatilityThreshold, setPriceVolatilityThreshold] = useState<number>(5);
  const [maSpreadThreshold, setMaSpreadThreshold] = useState<number>(3);
  const [volumeShrinkingThreshold, setVolumeShrinkingThreshold] = useState<number>(80);
  const [requireVolumeShrinking, setRequireVolumeShrinking] = useState<boolean>(false);
  const [strengthRange, setStrengthRange] = useState<{ min?: number; max?: number }>({});
  const [consolidationFilterVisible, setConsolidationFilterVisible] = useState(true);

  // 价格位置和趋势筛选状态
  const [trendPeriod, setTrendPeriod] = useState<number>(30);
  const [pricePositionRange, setPricePositionRange] = useState<{
    relativeToHigh?: { min?: number; max?: number };
    relativeToLow?: { min?: number; max?: number };
    positionInRange?: { min?: number; max?: number };
  }>({});
  const [trendDirection, setTrendDirection] = useState<string>('all'); // 'all' | 'up' | 'down' | 'sideways' | 'volatile'
  const [trendChangePercentRange, setTrendChangePercentRange] = useState<{ min?: number; max?: number }>({});
  const [hasDeepDrop, setHasDeepDrop] = useState<boolean | undefined>(undefined);
  const [hasRebound, setHasRebound] = useState<boolean | undefined>(undefined);
  const [volatileTypes, setVolatileTypes] = useState<string[]>([]); // 反复震荡类型多选
  const [quickFilter, setQuickFilter] = useState<string>('all'); // 快速筛选：'all' | 'case1' | 'case2' | 'case3' | 'case4'
  const [trendFilterVisible, setTrendFilterVisible] = useState<boolean>(true); // 价格位置和趋势筛选显示状态
  const [tableHeight, setTableHeight] = useState<number>(400); // 表格高度
  const tableCardRef = useRef<HTMLDivElement>(null); // 表格Card的引用

  useEffect(() => {
    loadCachedData();
  }, [loadCachedData]);

  // 计算表格高度
  const updateTableHeight = useCallback(() => {
    if (!tableCardRef.current) {
      return;
    }

    const cardBody = tableCardRef.current.querySelector('.ant-card-body') as HTMLElement;
    if (!cardBody) {
      return;
    }

    const bodyHeight = cardBody.clientHeight;
    if (bodyHeight > 0) {
      // 查找分页器
      const pagination = cardBody.querySelector('.ant-pagination') as HTMLElement;
      const paginationHeight = pagination ? pagination.offsetHeight : 64;

      // 表格可用高度 = body高度 - 分页器高度 - 一些边距
      const height = bodyHeight - paginationHeight - 40 - 38 - 10;
      setTableHeight(Math.max(100, height));
    }
  }, []);

  // 使用useLayoutEffect在DOM更新后立即计算高度
  useLayoutEffect(() => {
    if (analysisData.length === 0) {
      return;
    }
    updateTableHeight();
  }, [analysisData.length, filterVisible, consolidationFilterVisible, trendFilterVisible, loading, errors.length, updateTableHeight]);

  // 使用ResizeObserver监听表格Card大小变化
  useEffect(() => {
    if (!tableCardRef.current || analysisData.length === 0) {
      return;
    }

    const resizeObserver = new ResizeObserver(() => {
      updateTableHeight();
    });

    resizeObserver.observe(tableCardRef.current);

    return () => {
      resizeObserver.disconnect();
    };
  }, [updateTableHeight, analysisData.length]);

  // 根据选择的市场类型和名称类型筛选股票
  const filteredStocks = useMemo<StockInfo[]>(() => {
    if (allStocks.length === 0) {
      return [];
    }

    return allStocks.filter((stock) => {
      const pureCode = getPureCode(stock.code);
      const isST = stock.name.includes('ST');

      // 市场类型过滤
      let marketMatch = false;
      switch (selectedMarket) {
        case 'sh_main':
          // 沪市主板：60开头
          marketMatch = pureCode.startsWith('60');
          break;
        case 'sz_main':
          // 深市主板：00开头
          marketMatch = pureCode.startsWith('00');
          break;
        case 'sz_gem':
          // 创业板：30开头
          marketMatch = pureCode.startsWith('30');
          break;
        default:
          marketMatch = false;
      }

      // 名称类型过滤
      let nameTypeMatch = false;
      switch (nameType) {
        case 'all':
          // 不限
          nameTypeMatch = true;
          break;
        case 'st':
          // ST股票
          nameTypeMatch = isST;
          break;
        case 'non_st':
          // 非ST股票
          nameTypeMatch = !isST;
          break;
        default:
          nameTypeMatch = true;
      }

      return marketMatch && nameTypeMatch;
    });
  }, [allStocks, selectedMarket, nameType]);

  // 计算最近N天内的涨停和跌停数量
  const countLimitUpDown = (klineData: KLineData[], period: number, isST: boolean): { limitUp: number; limitDown: number } => {
    if (!klineData || klineData.length < 2) {
      return { limitUp: 0, limitDown: 0 };
    }

    // 涨停/跌停阈值：普通股票10%，ST股票5%
    const limitThreshold = isST ? 4.5 : 9.5; // 使用4.5%和9.5%作为阈值，避免浮点数精度问题

    // 取最近period天的数据
    const recentData = klineData.slice(-period);
    let limitUpCount = 0;
    let limitDownCount = 0;

    // 从第二个数据点开始，因为需要前一天的收盘价来计算涨跌幅
    for (let i = 1; i < recentData.length; i++) {
      const current = recentData[i];
      const prev = recentData[i - 1];

      // 计算涨跌幅：(当前收盘价 - 前一天收盘价) / 前一天收盘价 * 100
      if (prev.close > 0) {
        const changePercent = ((current.close - prev.close) / prev.close) * 100;

        // 判断涨停：涨幅 >= 阈值
        if (changePercent >= limitThreshold) {
          limitUpCount++;
        }
        // 判断跌停：跌幅 <= -阈值
        else if (changePercent <= -limitThreshold) {
          limitDownCount++;
        }
      }
    }

    return { limitUp: limitUpCount, limitDown: limitDownCount };
  };

  // 根据用户参数重新计算横盘结果
  const analysisDataWithRecalculatedConsolidation = useMemo(() => {
    if (analysisData.length === 0 || klineDataCache.size === 0) {
      return analysisData;
    }

    // 如果用户没有选择任何横盘筛选方法，直接返回原数据
    if (consolidationMethods.length === 0) {
      return analysisData;
    }

    return analysisData.map((item) => {
      // 如果没有K线数据缓存，使用原始数据
      const klineData = klineDataCache.get(item.code);
      if (!klineData || klineData.length === 0) {
        return item;
      }

      // 使用用户参数重新计算横盘结果
      try {
        const recalculatedConsolidation = calculateConsolidation(klineData, {
          period: consolidationPeriod,
          priceVolatilityThreshold: priceVolatilityThreshold,
          maSpreadThreshold: maSpreadThreshold,
          volumeShrinkingThreshold: volumeShrinkingThreshold,
          currentPrice: item.price,
          trendPeriod: trendPeriod,
        });

        return {
          ...item,
          consolidation: recalculatedConsolidation,
        };
      } catch (error) {
        console.warn(`[${item.code}] 重新计算横盘结果失败:`, error);
        return item;
      }
    });
  }, [
    analysisData,
    klineDataCache,
    consolidationMethods,
    consolidationPeriod,
    priceVolatilityThreshold,
    maSpreadThreshold,
    volumeShrinkingThreshold,
    trendPeriod,
  ]);

  // 对分析数据进行二次筛选
  const filteredAnalysisData = useMemo(() => {
    if (analysisDataWithRecalculatedConsolidation.length === 0) {
      return [];
    }

    return analysisDataWithRecalculatedConsolidation.filter((item) => {
      // 总市值筛选
      if (marketCapRange.min !== undefined && item.marketCap !== null && item.marketCap !== undefined) {
        if (item.marketCap < marketCapRange.min) return false;
      }
      if (marketCapRange.max !== undefined && item.marketCap !== null && item.marketCap !== undefined) {
        if (item.marketCap > marketCapRange.max) return false;
      }

      // 流通市值筛选
      if (circulatingMarketCapRange.min !== undefined && item.circulatingMarketCap !== null && item.circulatingMarketCap !== undefined) {
        if (item.circulatingMarketCap < circulatingMarketCapRange.min) return false;
      }
      if (circulatingMarketCapRange.max !== undefined && item.circulatingMarketCap !== null && item.circulatingMarketCap !== undefined) {
        if (item.circulatingMarketCap > circulatingMarketCapRange.max) return false;
      }

      // 换手率筛选
      if (turnoverRateRange.min !== undefined && item.turnoverRate !== null && item.turnoverRate !== undefined) {
        if (item.turnoverRate < turnoverRateRange.min) return false;
      }
      if (turnoverRateRange.max !== undefined && item.turnoverRate !== null && item.turnoverRate !== undefined) {
        if (item.turnoverRate > turnoverRateRange.max) return false;
      }

      // 市盈率筛选
      if (peRatioRange.min !== undefined && item.peRatio !== null && item.peRatio !== undefined) {
        if (item.peRatio < peRatioRange.min) return false;
      }
      if (peRatioRange.max !== undefined && item.peRatio !== null && item.peRatio !== undefined) {
        if (item.peRatio > peRatioRange.max) return false;
      }

      // 横盘筛选（使用重新计算的结果）
      if (consolidationMethods.length > 0) {
        if (!item.consolidation) {
          // 如果没有横盘数据，跳过
          return false;
        }

        const { priceVolatility, maConvergence, combined, volumeAnalysis } = item.consolidation;

        // 判断是否满足横盘条件
        let isConsolidation = false;
        if (consolidationMethods.length === 1) {
          // 只选一种方法
          if (consolidationMethods.includes('priceVolatility')) {
            isConsolidation = priceVolatility.isConsolidation;
          } else if (consolidationMethods.includes('maConvergence')) {
            isConsolidation = maConvergence.isConsolidation;
          }
        } else {
          // 两种方法都选
          if (consolidationFilterMode === 'and') {
            // 都满足
            isConsolidation = priceVolatility.isConsolidation && maConvergence.isConsolidation;
          } else {
            // 任一满足
            isConsolidation = priceVolatility.isConsolidation || maConvergence.isConsolidation;
          }
        }

        // 如果必须缩量，则横盘判断必须同时满足缩量条件
        if (requireVolumeShrinking && !volumeAnalysis.isVolumeShrinking) {
          isConsolidation = false;
        }

        if (!isConsolidation) return false;

        // 强度范围筛选：根据选中的方法动态选择强度
        let strength: number;
        if (consolidationMethods.length === 1) {
          // 只选一种方法，使用该方法的强度
          if (consolidationMethods.includes('priceVolatility')) {
            strength = priceVolatility.strength;
          } else {
            strength = maConvergence.strength;
          }
        } else {
          // 两种方法都选，使用综合强度（平均值）
          strength = combined.strength;
        }

        if (strengthRange.min !== undefined && strength < strengthRange.min) return false;
        if (strengthRange.max !== undefined && strength > strengthRange.max) return false;
      }

      // 价格位置筛选
      if (item.consolidation?.pricePosition) {
        const { relativeToHigh, relativeToLow, positionInRange } = item.consolidation.pricePosition;

        // 相对高点位置筛选
        if (pricePositionRange.relativeToHigh?.min !== undefined && relativeToHigh < pricePositionRange.relativeToHigh.min) {
          return false;
        }
        if (pricePositionRange.relativeToHigh?.max !== undefined && relativeToHigh > pricePositionRange.relativeToHigh.max) {
          return false;
        }

        // 相对低点位置筛选
        if (pricePositionRange.relativeToLow?.min !== undefined && relativeToLow < pricePositionRange.relativeToLow.min) {
          return false;
        }
        if (pricePositionRange.relativeToLow?.max !== undefined && relativeToLow > pricePositionRange.relativeToLow.max) {
          return false;
        }

        // 当前价在价格区间位置筛选
        if (pricePositionRange.positionInRange?.min !== undefined && positionInRange < pricePositionRange.positionInRange.min) {
          return false;
        }
        if (pricePositionRange.positionInRange?.max !== undefined && positionInRange > pricePositionRange.positionInRange.max) {
          return false;
        }
      }

      // 横盘前趋势筛选
      if (item.consolidation?.trendBefore) {
        const trend = item.consolidation.trendBefore;

        // 快速筛选：4种情况
        if (quickFilter !== 'all') {
          let match = false;
          switch (quickFilter) {
            case 'case1': // 横盘→上涨→下跌→横盘
              // 有上涨→下跌模式，且最后是下跌
              match = trend.hasUpThenDown === true && trend.direction === 'down';
              break;
            case 'case2': // 整体下跌→横盘
              // 整体下跌，没有深跌和反弹（平稳下跌）
              match = trend.direction === 'down' && !trend.hasDeepDrop && !trend.hasRebound;
              break;
            case 'case3': // 整体下跌→深跌→反弹→横盘
              // 有深跌和反弹
              match = trend.direction === 'down' && trend.hasDeepDrop && trend.hasRebound;
              break;
            case 'case4': // 近期反复涨跌
              // 反复震荡
              match = trend.isVolatile;
              break;
          }
          if (!match) return false;
        }

        // 趋势方向筛选
        if (trendDirection !== 'all' && trend.direction !== trendDirection) {
          return false;
        }

        // 横盘前涨跌幅范围筛选
        if (trendChangePercentRange.min !== undefined && trend.changePercent < trendChangePercentRange.min) {
          return false;
        }
        if (trendChangePercentRange.max !== undefined && trend.changePercent > trendChangePercentRange.max) {
          return false;
        }

        // 深跌筛选
        if (hasDeepDrop !== undefined && trend.hasDeepDrop !== hasDeepDrop) {
          return false;
        }

        // 反弹筛选
        if (hasRebound !== undefined && trend.hasRebound !== hasRebound) {
          return false;
        }

        // 反复震荡类型筛选
        if (volatileTypes.length > 0 && trend.isVolatile && trend.volatileType) {
          if (!volatileTypes.includes(trend.volatileType)) {
            return false;
          }
        }
      }

      // 涨停/跌停筛选
      if (recentLimitUpCount !== undefined || recentLimitDownCount !== undefined) {
        const klineData = klineDataCache.get(item.code);
        if (klineData && klineData.length > 0) {
          const isST = item.name.includes('ST');

          // 计算涨停数量
          if (recentLimitUpCount !== undefined) {
            const { limitUp } = countLimitUpDown(klineData, limitUpPeriod, isST);
            if (limitUp < recentLimitUpCount) {
              return false;
            }
          }

          // 计算跌停数量
          if (recentLimitDownCount !== undefined) {
            const { limitDown } = countLimitUpDown(klineData, limitDownPeriod, isST);
            if (limitDown < recentLimitDownCount) {
              return false;
            }
          }
        } else {
          // 如果没有K线数据，且设置了涨停/跌停筛选，则过滤掉
          if (recentLimitUpCount !== undefined || recentLimitDownCount !== undefined) {
            return false;
          }
        }
      }

      return true;
    });
  }, [
    analysisDataWithRecalculatedConsolidation,
    marketCapRange,
    circulatingMarketCapRange,
    turnoverRateRange,
    peRatioRange,
    consolidationMethods,
    consolidationFilterMode,
    requireVolumeShrinking,
    strengthRange,
    pricePositionRange,
    quickFilter,
    trendDirection,
    trendChangePercentRange,
    hasDeepDrop,
    hasRebound,
    volatileTypes,
    recentLimitUpCount,
    recentLimitDownCount,
    limitUpPeriod,
    limitDownPeriod,
    klineDataCache,
  ]);

  // 重置所有筛选条件
  const handleResetFilters = () => {
    setMarketCapRange({});
    setCirculatingMarketCapRange({});
    setTurnoverRateRange({});
    setPeRatioRange({});
    setStrengthRange({});
    setRecentLimitUpCount(1);
    setRecentLimitDownCount(1);
    setLimitUpPeriod(10);
    setLimitDownPeriod(10);
    message.info('筛选条件已重置');
  };

  const handleAnalyze = async () => {
    if (filteredStocks.length === 0) {
      message.warning('当前市场暂无股票数据');
      return;
    }

    // 如果设置了价格范围，需要先获取行情进行筛选
    const hasPriceFilter = priceRange.min !== undefined || priceRange.max !== undefined;

    if (hasPriceFilter) {
      setFilteringQuotes(true);
      try {
        // Step 1: 分批获取行情（每批最多100个）
        const QUOTES_BATCH_SIZE = 100;
        const batches: StockInfo[][] = [];
        for (let i = 0; i < filteredStocks.length; i += QUOTES_BATCH_SIZE) {
          batches.push(filteredStocks.slice(i, i + QUOTES_BATCH_SIZE));
        }

        const allQuotes: Array<{ stock: StockInfo; price: number }> = [];

        for (const batch of batches) {
          const codes = batch.map((s) => s.code);
          const quotes = await getStockQuotes(codes);

          quotes.forEach((quote) => {
            const stock = batch.find((s) => s.code === quote.code);
            if (stock) {
              allQuotes.push({ stock, price: quote.price });
            }
          });
        }

        // Step 2: 根据价格范围筛选
        const finalStocks = allQuotes
          .filter((item) => {
            const price = item.price;
            if (priceRange.min !== undefined && price < priceRange.min) {
              return false;
            }
            if (priceRange.max !== undefined && price > priceRange.max) {
              return false;
            }
            return true;
          })
          .map((item) => item.stock);

        if (finalStocks.length === 0) {
          message.warning('没有股票满足价格范围条件');
          setFilteringQuotes(false);
          return;
        }

        // Step 3: 对筛选后的股票进行分析
        await startAnalysis(currentPeriod, finalStocks, currentCount);
      } catch (error) {
        console.error('获取行情失败:', error);
        message.error('获取行情数据失败，请重试');
      } finally {
        setFilteringQuotes(false);
      }
    } else {
      // 没有设置价格范围，直接使用所有股票进行分析
      await startAnalysis(currentPeriod, filteredStocks, currentCount);
    }
  };

  const handleCancel = () => {
    cancelAnalysis();
    message.info('分析已取消');
  };

  const handleExport = async (format: 'excel') => {
    if (filteredAnalysisData.length === 0) {
      message.warning('没有数据可导出');
      return;
    }

    try {
      if (format === 'excel') {
        await exportOpportunityToExcel(filteredAnalysisData, columnConfig);
        message.success('Excel导出成功');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '导出失败';
      message.error(errorMessage);
      console.error('导出失败:', error);
    }
  };

  const handleColumnSettingsOk = (columns: typeof columnConfig) => {
    updateColumnConfig(columns);
    setColumnSettingsVisible(false);
  };

  return (
    <Layout className={styles.opportunityPage}>
      <Header className={styles.header}>
        <div className={styles.headerContent}>
          <Space>
            <Space.Compact className={styles.spaceCompact}>
              <span className={styles.label}>市场：</span>
              <Select
                value={selectedMarket}
                onChange={(value: string) => {
                  setSelectedMarket(value);
                  if (analysisData.length > 0) {
                    message.info('市场已更改，请重新分析');
                  }
                }}
                options={MARKET_OPTIONS}
                style={{ width: 120 }}
                disabled={loading}
              />
            </Space.Compact>
            <Space.Compact className={styles.spaceCompact}>
              <span className={styles.label}>周期：</span>
              <Select
                value={currentPeriod}
                onChange={(value: KLinePeriod) => {
                  useOpportunityStore.setState({ currentPeriod: value });
                  if (analysisData.length > 0) {
                    message.info('周期已更改，请重新分析');
                  }
                }}
                options={PERIOD_OPTIONS}
                style={{ width: 100 }}
                disabled={loading}
              />
            </Space.Compact>
            <Space className={styles.spaceCompact}>
              <span className={styles.label}>K线数量：</span>
              <InputNumber
                value={currentCount}
                min={50}
                max={1000}
                step={10}
                style={{ width: 120 }}
                placeholder="count"
                disabled={loading || filteringQuotes}
                onChange={(v) => {
                  const next = typeof v === 'number' && isFinite(v) ? Math.floor(v) : 500;
                  useOpportunityStore.setState({ currentCount: next });
                  if (analysisData.length > 0) {
                    message.info('count已更改，请重新分析');
                  }
                }}
              />
            </Space>
            <Space.Compact className={styles.spaceCompact}>
              <span className={styles.label}>名称类型：</span>
              <Select
                value={nameType}
                onChange={(value: string) => {
                  setNameType(value);
                  if (analysisData.length > 0) {
                    message.info('名称类型已更改，请重新分析');
                  }
                }}
                options={NAME_TYPE_OPTIONS}
                style={{ width: 120 }}
                disabled={loading || filteringQuotes}
              />
            </Space.Compact>
            <Space.Compact className={styles.spaceCompact}>
              <span className={styles.label}>价格范围：</span>
              <InputNumber
                value={priceRange.min}
                min={0}
                step={0.01}
                precision={2}
                style={{ width: 100 }}
                placeholder="最低价"
                disabled={loading || filteringQuotes}
                onChange={(v) => {
                  setPriceRange((prev) => ({
                    ...prev,
                    min: typeof v === 'number' && isFinite(v) ? v : undefined,
                  }));
                  if (analysisData.length > 0) {
                    message.info('价格范围已更改，请重新分析');
                  }
                }}
              />
              <span style={{ margin: '0 4px' }}>~</span>
              <InputNumber
                value={priceRange.max}
                min={0}
                step={0.01}
                precision={2}
                style={{ width: 100 }}
                placeholder="最高价"
                disabled={loading || filteringQuotes}
                onChange={(v) => {
                  setPriceRange((prev) => ({
                    ...prev,
                    max: typeof v === 'number' && isFinite(v) ? v : undefined,
                  }));
                  if (analysisData.length > 0) {
                    message.info('价格范围已更改，请重新分析');
                  }
                }}
              />
              {(priceRange.min !== undefined || priceRange.max !== undefined) && (
                <Button
                  size="small"
                  style={{ marginLeft: 8 }}
                  onClick={() => {
                    setPriceRange({});
                    if (analysisData.length > 0) {
                      message.info('价格范围已清除，请重新分析');
                    }
                  }}
                  disabled={loading || filteringQuotes}
                >
                  不限
                </Button>
              )}
            </Space.Compact>
            <Button
              type="primary"
              icon={<PlayCircleOutlined />}
              onClick={handleAnalyze}
              loading={loading || filteringQuotes}
              disabled={loading || filteringQuotes || filteredStocks.length === 0}
            >
              一键分析
            </Button>
            {loading && (
              <Button icon={<StopOutlined />} onClick={handleCancel}>
                取消
              </Button>
            )}
            <Button icon={<ExportOutlined />} onClick={() => handleExport('excel')} disabled={analysisData.length === 0}>
              导出Excel
            </Button>
            <Button icon={<SettingOutlined />} onClick={() => setColumnSettingsVisible(true)}>
              列设置
            </Button>
          </Space>
        </div >
      </Header >

      <Content className={styles.content}>
        {loading && (
          <Card className={styles.progressCard}>
            <div className={styles.progressInfo}>
              <Progress
                percent={progress.percent}
                status={loading ? 'active' : 'success'}
                format={(percent) => `${percent?.toFixed(1)}%`}
              />
              <div className={styles.progressText}>
                进度: {progress.completed} / {progress.total} (失败: {progress.failed})
              </div>
            </div>
          </Card>
        )}

        {errors.length > 0 && (
          <Card className={styles.errorCard} size="small">
            <Collapse>
              <Panel
                header={
                  <span>
                    <ExclamationCircleOutlined style={{ color: '#ff4d4f', marginRight: 8 }} />
                    分析失败 ({errors.length} 只股票)
                  </span>
                }
                key="errors"
              >
                <div className={styles.errorList}>
                  {errors.map((err, index) => (
                    <div key={index} className={styles.errorItem}>
                      <span className={styles.errorStock}>
                        {err.stock.name} ({err.stock.code})
                      </span>
                      <span className={styles.errorMessage}>{err.error}</span>
                    </div>
                  ))}
                </div>
              </Panel>
            </Collapse>
          </Card>
        )}

        {analysisData.length > 0 ? (
          <>
            {/* 筛选区域容器 */}
            <div className={styles.filterContainer}>
              {/* 筛选区域 */}
              <Card className={styles.filterCard} size="small">
                <div className={styles.filterHeader}>
                  <Space>
                    <FilterOutlined />
                    <span>数据筛选</span>
                    <Button
                      type="text"
                      size="small"
                      icon={filterVisible ? <ExclamationCircleOutlined /> : null}
                      onClick={() => setFilterVisible(!filterVisible)}
                    >
                      {filterVisible ? '收起' : '展开'}
                    </Button>
                  </Space>
                  <Button
                    size="small"
                    icon={<ClearOutlined />}
                    onClick={handleResetFilters}
                    disabled={!filterVisible}
                  >
                    重置
                  </Button>
                </div>
                {filterVisible && (
                  <div className={styles.filterContent}>
                    <div className={styles.filterRow}>
                      <div className={styles.filterItem}>
                        <span className={styles.filterLabel}>总市值(亿)：</span>
                        <InputNumber
                          value={marketCapRange.min}
                          min={0}
                          step={0.01}
                          precision={2}
                          style={{ width: 100 }}
                          placeholder="最小值"
                          onChange={(v) => {
                            setMarketCapRange((prev) => ({
                              ...prev,
                              min: typeof v === 'number' && isFinite(v) ? v : undefined,
                            }));
                          }}
                        />
                        <span style={{ margin: '0 4px' }}>~</span>
                        <InputNumber
                          value={marketCapRange.max}
                          min={0}
                          step={0.01}
                          precision={2}
                          style={{ width: 100 }}
                          placeholder="最大值"
                          onChange={(v) => {
                            setMarketCapRange((prev) => ({
                              ...prev,
                              max: typeof v === 'number' && isFinite(v) ? v : undefined,
                            }));
                          }}
                        />
                      </div>
                      <div className={styles.filterItem}>
                        <span className={styles.filterLabel}>流通市值(亿)：</span>
                        <InputNumber
                          value={circulatingMarketCapRange.min}
                          min={0}
                          step={0.01}
                          precision={2}
                          style={{ width: 100 }}
                          placeholder="最小值"
                          onChange={(v) => {
                            setCirculatingMarketCapRange((prev) => ({
                              ...prev,
                              min: typeof v === 'number' && isFinite(v) ? v : undefined,
                            }));
                          }}
                        />
                        <span style={{ margin: '0 4px' }}>~</span>
                        <InputNumber
                          value={circulatingMarketCapRange.max}
                          min={0}
                          step={0.01}
                          precision={2}
                          style={{ width: 100 }}
                          placeholder="最大值"
                          onChange={(v) => {
                            setCirculatingMarketCapRange((prev) => ({
                              ...prev,
                              max: typeof v === 'number' && isFinite(v) ? v : undefined,
                            }));
                          }}
                        />
                      </div>
                      <div className={styles.filterItem}>
                        <span className={styles.filterLabel}>换手率(%)：</span>
                        <InputNumber
                          value={turnoverRateRange.min}
                          min={0}
                          max={100}
                          step={0.01}
                          precision={2}
                          style={{ width: 100 }}
                          placeholder="最小值"
                          onChange={(v) => {
                            setTurnoverRateRange((prev) => ({
                              ...prev,
                              min: typeof v === 'number' && isFinite(v) ? v : undefined,
                            }));
                          }}
                        />
                        <span style={{ margin: '0 4px' }}>~</span>
                        <InputNumber
                          value={turnoverRateRange.max}
                          min={0}
                          max={100}
                          step={0.01}
                          precision={2}
                          style={{ width: 100 }}
                          placeholder="最大值"
                          onChange={(v) => {
                            setTurnoverRateRange((prev) => ({
                              ...prev,
                              max: typeof v === 'number' && isFinite(v) ? v : undefined,
                            }));
                          }}
                        />
                      </div>
                      <div className={styles.filterItem}>
                        <span className={styles.filterLabel}>市盈率：</span>
                        <InputNumber
                          value={peRatioRange.min}
                          min={0}
                          step={0.01}
                          precision={2}
                          style={{ width: 100 }}
                          placeholder="最小值"
                          onChange={(v) => {
                            setPeRatioRange((prev) => ({
                              ...prev,
                              min: typeof v === 'number' && isFinite(v) ? v : undefined,
                            }));
                          }}
                        />
                        <span style={{ margin: '0 4px' }}>~</span>
                        <InputNumber
                          value={peRatioRange.max}
                          min={0}
                          step={0.01}
                          precision={2}
                          style={{ width: 100 }}
                          placeholder="最大值"
                          onChange={(v) => {
                            setPeRatioRange((prev) => ({
                              ...prev,
                              max: typeof v === 'number' && isFinite(v) ? v : undefined,
                            }));
                          }}
                        />
                      </div>
                    </div>
                    <div className={styles.filterRow}>
                      <div className={styles.filterItem}>
                        <span className={styles.filterLabel}>最近涨停数：</span>
                        <InputNumber
                          value={recentLimitUpCount}
                          min={0}
                          step={1}
                          style={{ width: 100 }}
                          onChange={(v) => {
                            setRecentLimitUpCount(typeof v === 'number' && isFinite(v) ? Math.floor(v) : undefined);
                          }}
                        />
                      </div>
                      <div className={styles.filterItem}>
                        <span className={styles.filterLabel}>涨停周期范围：</span>
                        <InputNumber
                          value={limitUpPeriod}
                          min={1}
                          max={100}
                          step={1}
                          style={{ width: 100 }}
                          onChange={(v) => {
                            const next = typeof v === 'number' && isFinite(v) ? Math.floor(v) : 10;
                            setLimitUpPeriod(next);
                          }}
                        />
                        <span style={{ marginLeft: 4 }}>天</span>
                      </div>
                      <div className={styles.filterItem}>
                        <span className={styles.filterLabel}>最近跌停数：</span>
                        <InputNumber
                          value={recentLimitDownCount}
                          min={0}
                          step={1}
                          style={{ width: 100 }}
                          onChange={(v) => {
                            setRecentLimitDownCount(typeof v === 'number' && isFinite(v) ? Math.floor(v) : undefined);
                          }}
                        />
                      </div>
                      <div className={styles.filterItem}>
                        <span className={styles.filterLabel}>跌停周期范围：</span>
                        <InputNumber
                          value={limitDownPeriod}
                          min={1}
                          max={100}
                          step={1}
                          style={{ width: 100 }}
                          onChange={(v) => {
                            const next = typeof v === 'number' && isFinite(v) ? Math.floor(v) : 10;
                            setLimitDownPeriod(next);
                          }}
                        />
                        <span style={{ marginLeft: 4 }}>天</span>
                      </div>
                    </div>
                    <div className={styles.filterResult}>
                      {filteredAnalysisData.length !== analysisDataWithRecalculatedConsolidation.length && (
                        <span>
                          筛选结果：{filteredAnalysisData.length} / {analysisDataWithRecalculatedConsolidation.length} 条
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </Card>

              {/* 横盘筛选区域 */}
              <Card className={styles.filterCard} size="small">
                <div className={styles.filterHeader}>
                  <Space>
                    <FilterOutlined />
                    <span>横盘筛选</span>
                    <Button
                      type="text"
                      size="small"
                      icon={consolidationFilterVisible ? <ExclamationCircleOutlined /> : null}
                      onClick={() => setConsolidationFilterVisible(!consolidationFilterVisible)}
                    >
                      {consolidationFilterVisible ? '收起' : '展开'}
                    </Button>
                  </Space>
                </div>
                {consolidationFilterVisible && (
                  <div className={styles.filterContent}>
                    <div className={styles.filterRow}>
                      <div className={styles.filterItem}>
                        <span className={styles.filterLabel}>判断方法：</span>
                        <Checkbox.Group
                          value={consolidationMethods}
                          onChange={(values) => {
                            const checkedValues = values as string[];
                            setConsolidationMethods(checkedValues);
                            // 如果两种方法都选，显示筛选模式；否则隐藏
                          }}
                        >
                          <Checkbox value="priceVolatility">价格波动率法</Checkbox>
                          <Checkbox value="maConvergence">MA收敛法</Checkbox>
                        </Checkbox.Group>
                      </div>
                      {consolidationMethods.length === 2 && (
                        <div className={styles.filterItem}>
                          <span className={styles.filterLabel}>筛选模式：</span>
                          <Select
                            value={consolidationFilterMode}
                            onChange={(value) => setConsolidationFilterMode(value)}
                            style={{ width: 120 }}
                            options={[
                              { label: '都满足（AND）', value: 'and' },
                              { label: '任一满足（OR）', value: 'or' },
                            ]}
                          />
                        </div>
                      )}
                    </div>
                    <div className={styles.filterRow}>
                      <div className={styles.filterItem}>
                        <span className={styles.filterLabel}>周期数：</span>
                        <InputNumber
                          value={consolidationPeriod}
                          min={5}
                          max={100}
                          step={1}
                          style={{ width: 100 }}
                          onChange={(v) => {
                            const next = typeof v === 'number' && isFinite(v) ? Math.floor(v) : 10;
                            setConsolidationPeriod(next);
                          }}
                        />
                      </div>
                      {consolidationMethods.includes('priceVolatility') && (
                        <div className={styles.filterItem}>
                          <span className={styles.filterLabel}>价格波动阈值(%)：</span>
                          <InputNumber
                            value={priceVolatilityThreshold}
                            min={0}
                            max={50}
                            step={0.1}
                            precision={1}
                            style={{ width: 100 }}
                            onChange={(v) => {
                              const next = typeof v === 'number' && isFinite(v) ? v : 5;
                              setPriceVolatilityThreshold(next);
                            }}
                          />
                        </div>
                      )}
                      {consolidationMethods.includes('maConvergence') && (
                        <div className={styles.filterItem}>
                          <span className={styles.filterLabel}>MA离散度阈值(%)：</span>
                          <InputNumber
                            value={maSpreadThreshold}
                            min={0}
                            max={50}
                            step={0.1}
                            precision={1}
                            style={{ width: 100 }}
                            onChange={(v) => {
                              const next = typeof v === 'number' && isFinite(v) ? v : 3;
                              setMaSpreadThreshold(next);
                            }}
                          />
                        </div>
                      )}
                    </div>
                    <div className={styles.filterRow}>
                      <div className={styles.filterItem}>
                        <span className={styles.filterLabel}>缩量阈值(%)：</span>
                        <InputNumber
                          value={volumeShrinkingThreshold}
                          min={0}
                          max={200}
                          step={1}
                          style={{ width: 100 }}
                          onChange={(v) => {
                            const next = typeof v === 'number' && isFinite(v) ? v : 80;
                            setVolumeShrinkingThreshold(next);
                          }}
                        />
                      </div>
                      <div className={styles.filterItem}>
                        <Checkbox
                          checked={requireVolumeShrinking}
                          onChange={(e) => setRequireVolumeShrinking(e.target.checked)}
                        >
                          必须缩量（作为必要条件）
                        </Checkbox>
                      </div>
                    </div>
                    <div className={styles.filterRow}>
                      <div className={styles.filterItem}>
                        <span className={styles.filterLabel}>横盘强度范围：</span>
                        <InputNumber
                          value={strengthRange.min}
                          min={0}
                          max={100}
                          step={1}
                          style={{ width: 100 }}
                          placeholder="最小值"
                          onChange={(v) => {
                            setStrengthRange((prev) => ({
                              ...prev,
                              min: typeof v === 'number' && isFinite(v) ? v : undefined,
                            }));
                          }}
                        />
                        <span style={{ margin: '0 4px' }}>~</span>
                        <InputNumber
                          value={strengthRange.max}
                          min={0}
                          max={100}
                          step={1}
                          style={{ width: 100 }}
                          placeholder="最大值"
                          onChange={(v) => {
                            setStrengthRange((prev) => ({
                              ...prev,
                              max: typeof v === 'number' && isFinite(v) ? v : undefined,
                            }));
                          }}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </Card>

              {/* 价格位置和趋势筛选区域 */}
              <Card className={styles.filterCard} size="small">
                <div className={styles.filterHeader}>
                  <Space>
                    <FilterOutlined />
                    <span>价格位置和趋势筛选</span>
                    <Button
                      type="text"
                      size="small"
                      icon={trendFilterVisible ? <ExclamationCircleOutlined /> : null}
                      onClick={() => setTrendFilterVisible(!trendFilterVisible)}
                    >
                      {trendFilterVisible ? '收起' : '展开'}
                    </Button>
                  </Space>
                </div>
                {trendFilterVisible && (
                  <div className={styles.filterContent}>
                    <div className={styles.filterRow}>
                      <div className={styles.filterItem}>
                        <span className={styles.filterLabel}>快速筛选：</span>
                        <Select
                          value={quickFilter}
                          onChange={(value) => setQuickFilter(value)}
                          style={{ width: 200 }}
                          options={[
                            { label: '不限', value: 'all' },
                            { label: '情况1：横盘→上涨→下跌→横盘', value: 'case1' },
                            { label: '情况2：整体下跌→横盘', value: 'case2' },
                            { label: '情况3：深跌反弹→横盘', value: 'case3' },
                            { label: '情况4：近期反复涨跌', value: 'case4' },
                          ]}
                        />
                      </div>
                      <div className={styles.filterItem}>
                        <span className={styles.filterLabel}>趋势分析周期：</span>
                        <InputNumber
                          value={trendPeriod}
                          min={10}
                          max={100}
                          step={5}
                          style={{ width: 100 }}
                          onChange={(v) => {
                            const next = typeof v === 'number' && isFinite(v) ? Math.floor(v) : 30;
                            setTrendPeriod(next);
                          }}
                        />
                        <span style={{ marginLeft: 4 }}>天</span>
                      </div>
                    </div>

                    <div className={styles.filterRow}>
                      <div className={styles.filterItem}>
                        <span className={styles.filterLabel}>相对高点位置(%)：</span>
                        <InputNumber
                          value={pricePositionRange.relativeToHigh?.min}
                          min={0}
                          max={100}
                          step={0.1}
                          precision={1}
                          style={{ width: 100 }}
                          placeholder="最小值"
                          onChange={(v) => {
                            setPricePositionRange((prev) => ({
                              ...prev,
                              relativeToHigh: {
                                ...prev.relativeToHigh,
                                min: typeof v === 'number' && isFinite(v) ? v : undefined,
                              },
                            }));
                          }}
                        />
                        <span style={{ margin: '0 4px' }}>~</span>
                        <InputNumber
                          value={pricePositionRange.relativeToHigh?.max}
                          min={0}
                          max={100}
                          step={0.1}
                          precision={1}
                          style={{ width: 100 }}
                          placeholder="最大值"
                          onChange={(v) => {
                            setPricePositionRange((prev) => ({
                              ...prev,
                              relativeToHigh: {
                                ...prev.relativeToHigh,
                                max: typeof v === 'number' && isFinite(v) ? v : undefined,
                              },
                            }));
                          }}
                        />
                        <span style={{ marginLeft: 4, fontSize: 12, color: '#999' }}>
                          (从高点下跌幅度)
                        </span>
                      </div>
                      <div className={styles.filterItem}>
                        <span className={styles.filterLabel}>相对低点位置(%)：</span>
                        <InputNumber
                          value={pricePositionRange.relativeToLow?.min}
                          min={0}
                          max={100}
                          step={0.1}
                          precision={1}
                          style={{ width: 100 }}
                          placeholder="最小值"
                          onChange={(v) => {
                            setPricePositionRange((prev) => ({
                              ...prev,
                              relativeToLow: {
                                ...prev.relativeToLow,
                                min: typeof v === 'number' && isFinite(v) ? v : undefined,
                              },
                            }));
                          }}
                        />
                        <span style={{ margin: '0 4px' }}>~</span>
                        <InputNumber
                          value={pricePositionRange.relativeToLow?.max}
                          min={0}
                          max={100}
                          step={0.1}
                          precision={1}
                          style={{ width: 100 }}
                          placeholder="最大值"
                          onChange={(v) => {
                            setPricePositionRange((prev) => ({
                              ...prev,
                              relativeToLow: {
                                ...prev.relativeToLow,
                                max: typeof v === 'number' && isFinite(v) ? v : undefined,
                              },
                            }));
                          }}
                        />
                        <span style={{ marginLeft: 4, fontSize: 12, color: '#999' }}>
                          (从低点上涨幅度)
                        </span>
                      </div>
                    </div>

                    <div className={styles.filterRow}>
                      <div className={styles.filterItem}>
                        <span className={styles.filterLabel}>当前价位置(%)：</span>
                        <InputNumber
                          value={pricePositionRange.positionInRange?.min}
                          min={0}
                          max={100}
                          step={1}
                          style={{ width: 100 }}
                          placeholder="最小值"
                          onChange={(v) => {
                            setPricePositionRange((prev) => ({
                              ...prev,
                              positionInRange: {
                                ...prev.positionInRange,
                                min: typeof v === 'number' && isFinite(v) ? v : undefined,
                              },
                            }));
                          }}
                        />
                        <span style={{ margin: '0 4px' }}>~</span>
                        <InputNumber
                          value={pricePositionRange.positionInRange?.max}
                          min={0}
                          max={100}
                          step={1}
                          style={{ width: 100 }}
                          placeholder="最大值"
                          onChange={(v) => {
                            setPricePositionRange((prev) => ({
                              ...prev,
                              positionInRange: {
                                ...prev.positionInRange,
                                max: typeof v === 'number' && isFinite(v) ? v : undefined,
                              },
                            }));
                          }}
                        />
                        <span style={{ marginLeft: 4, fontSize: 12, color: '#999' }}>
                          (在价格区间位置，0=最低，100=最高)
                        </span>
                      </div>
                    </div>

                    <div className={styles.filterRow}>
                      <div className={styles.filterItem}>
                        <span className={styles.filterLabel}>横盘前趋势方向：</span>
                        <Select
                          value={trendDirection}
                          onChange={(value) => setTrendDirection(value)}
                          style={{ width: 150 }}
                          options={[
                            { label: '不限', value: 'all' },
                            { label: '上涨后横盘', value: 'up' },
                            { label: '下跌后横盘', value: 'down' },
                            { label: '横盘后横盘', value: 'sideways' },
                            { label: '反复震荡', value: 'volatile' },
                          ]}
                        />
                      </div>
                      <div className={styles.filterItem}>
                        <span className={styles.filterLabel}>横盘前涨跌幅(%)：</span>
                        <InputNumber
                          value={trendChangePercentRange.min}
                          min={-100}
                          max={100}
                          step={0.1}
                          precision={1}
                          style={{ width: 100 }}
                          placeholder="最小值"
                          onChange={(v) => {
                            setTrendChangePercentRange((prev) => ({
                              ...prev,
                              min: typeof v === 'number' && isFinite(v) ? v : undefined,
                            }));
                          }}
                        />
                        <span style={{ margin: '0 4px' }}>~</span>
                        <InputNumber
                          value={trendChangePercentRange.max}
                          min={-100}
                          max={100}
                          step={0.1}
                          precision={1}
                          style={{ width: 100 }}
                          placeholder="最大值"
                          onChange={(v) => {
                            setTrendChangePercentRange((prev) => ({
                              ...prev,
                              max: typeof v === 'number' && isFinite(v) ? v : undefined,
                            }));
                          }}
                        />
                      </div>
                    </div>

                    <div className={styles.filterRow}>
                      <div className={styles.filterItem}>
                        <span className={styles.filterLabel}>特殊形态：</span>
                        <Checkbox
                          checked={hasDeepDrop === true}
                          indeterminate={hasDeepDrop === undefined}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setHasDeepDrop(true);
                            } else {
                              setHasDeepDrop(undefined);
                            }
                          }}
                        >
                          包含深跌
                        </Checkbox>
                        <Checkbox
                          checked={hasRebound === true}
                          indeterminate={hasRebound === undefined}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setHasRebound(true);
                            } else {
                              setHasRebound(undefined);
                            }
                          }}
                          style={{ marginLeft: 16 }}
                        >
                          包含反弹
                        </Checkbox>
                      </div>
                      <div className={styles.filterItem}>
                        <span className={styles.filterLabel}>反复震荡类型：</span>
                        <Select
                          mode="multiple"
                          value={volatileTypes}
                          onChange={(values) => setVolatileTypes(values)}
                          style={{ width: 300 }}
                          placeholder="选择震荡类型"
                          options={[
                            { label: '上涨→下跌→上涨', value: 'up_down' },
                            { label: '下跌→上涨→下跌', value: 'down_up' },
                            { label: '横盘→上涨', value: 'sideways_up' },
                            { label: '横盘→下跌', value: 'sideways_down' },
                            { label: '多次震荡', value: 'multiple' },
                          ]}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </Card>
            </div>

            {/* 表格区域 */}
            <Card className={styles.tableCard} ref={tableCardRef}>
              <OpportunityTable
                data={filteredAnalysisData}
                columns={columnConfig}
                sortConfig={sortConfig}
                onSortChange={updateSortConfig}
                tableHeight={tableHeight}
              />
            </Card>
          </>
        ) : (
          <Card className={styles.emptyCard}>
            <div className={styles.emptyText}>
              {filteredStocks.length === 0 ? '当前市场暂无股票数据' : '点击"一键分析"按钮开始分析'}
            </div>
          </Card>
        )}
      </Content>

      <ColumnSettings
        visible={columnSettingsVisible}
        columns={columnConfig}
        onOk={handleColumnSettingsOk}
        onCancel={() => setColumnSettingsVisible(false)}
        onReset={resetColumnConfig}
        title="机会列表列设置"
      />
    </Layout >
  );
}


