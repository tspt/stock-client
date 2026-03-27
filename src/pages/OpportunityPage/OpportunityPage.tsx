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
import {
  analyzeAfterSurgeDrop,
  analyzeAfterSurgeRise,
  calculateConsolidationInLookback,
  CONSOLIDATION_TYPE_LABELS,
} from '@/utils/consolidationAnalysis';
import { calculateTrendLineInLookback } from '@/utils/trendLineAnalysis';
import { OpportunityTable } from '@/components/OpportunityTable/OpportunityTable';
import { ColumnSettings } from '@/components/ColumnSettings/ColumnSettings';
import { exportOpportunityToExcel } from '@/utils/opportunityExportUtils';
import type { ConsolidationType, KLinePeriod, StockInfo, KLineData } from '@/types/stock';
import { useAllStocks } from '@/hooks/useAllStocks';
import { getPureCode } from '@/utils/format';
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
  { label: '沪深主板', value: 'hs_main' },
  { label: '创业板', value: 'sz_gem' },
];

const NAME_TYPE_OPTIONS: { label: string; value: string }[] = [
  { label: '不限', value: 'all' },
  { label: 'ST', value: 'st' },
  { label: '非ST', value: 'non_st' },
];

const CONSOLIDATION_TYPE_OPTIONS: { label: string; value: ConsolidationType }[] = [
  { label: CONSOLIDATION_TYPE_LABELS.low_stable, value: 'low_stable' },
  { label: CONSOLIDATION_TYPE_LABELS.high_stable, value: 'high_stable' },
  { label: CONSOLIDATION_TYPE_LABELS.box, value: 'box' },
];

const DEFAULT_CONSOLIDATION_TYPES: ConsolidationType[] = CONSOLIDATION_TYPE_OPTIONS.map((item) => item.value);

/** 与下方 useState 初始值保持一致，供「重置」同步恢复 */
const INITIAL_FILTER_STATE = {
  selectedMarket: 'hs_main' as const,
  nameType: 'non_st' as const,
  priceRange: { min: 3, max: 30 } as { min?: number; max?: number },
  marketCapRange: { min: 30, max: 500 } as { min?: number; max?: number },
  turnoverRateRange: { min: 1 } as { min?: number; max?: number },
  peRatioRange: {} as { min?: number; max?: number },
  kdjJRange: {} as { min?: number; max?: number },
  recentLimitUpCount: undefined as number | undefined,
  recentLimitDownCount: undefined as number | undefined,
  limitUpPeriod: 20,
  limitDownPeriod: 20,
  consolidationTypes: DEFAULT_CONSOLIDATION_TYPES,
  consolidationLookback: 10,
  consolidationConsecutive: 3,
  consolidationThreshold: 1.5,
  /** 连续 N 根横盘段内每日收盘价是否要求 ≥ 当日 MA10 */
  consolidationRequireAboveMa10: false,
  /** 是否按横盘条件过滤列表（与趋势线可同时开启，关系为 AND） */
  consolidationFilterEnabled: true,
  trendLineLookback: 10,
  trendLineConsecutive: 3,
  trendLineFilterEnabled: false,
  volumeSurgeDropEnabled: false,
  volumeSurgeRiseEnabled: false,
  volumeSurgePeriod: 10,
  dropRisePercentRange: '5-10' as const,
  afterDropType: 'all' as const,
  afterRiseType: 'all' as const,
  afterDropPercentRange: '5-10' as const,
  afterRisePercentRange: '5-10' as const,
};

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
  const [selectedMarket, setSelectedMarket] = useState<string>(INITIAL_FILTER_STATE.selectedMarket);
  const [priceRange, setPriceRange] = useState<{ min?: number; max?: number }>(INITIAL_FILTER_STATE.priceRange);
  const [nameType, setNameType] = useState<string>(INITIAL_FILTER_STATE.nameType);

  // 筛选条件状态
  const [marketCapRange, setMarketCapRange] = useState<{ min?: number; max?: number }>(
    INITIAL_FILTER_STATE.marketCapRange
  );
  const [turnoverRateRange, setTurnoverRateRange] = useState<{ min?: number; max?: number }>(
    INITIAL_FILTER_STATE.turnoverRateRange
  );
  const [peRatioRange, setPeRatioRange] = useState<{ min?: number; max?: number }>(INITIAL_FILTER_STATE.peRatioRange);
  const [kdjJRange, setKdjJRange] = useState<{ min?: number; max?: number }>(INITIAL_FILTER_STATE.kdjJRange);
  const [filterVisible, setFilterVisible] = useState(true);

  // 涨停/跌停筛选状态
  const [recentLimitUpCount, setRecentLimitUpCount] = useState<number | undefined>(
    INITIAL_FILTER_STATE.recentLimitUpCount
  );
  const [recentLimitDownCount, setRecentLimitDownCount] = useState<number | undefined>(
    INITIAL_FILTER_STATE.recentLimitDownCount
  );
  const [limitUpPeriod, setLimitUpPeriod] = useState<number>(INITIAL_FILTER_STATE.limitUpPeriod);
  const [limitDownPeriod, setLimitDownPeriod] = useState<number>(INITIAL_FILTER_STATE.limitDownPeriod);

  // 横盘筛选状态
  const [consolidationTypes, setConsolidationTypes] = useState<ConsolidationType[]>(
    INITIAL_FILTER_STATE.consolidationTypes
  );
  /** 从末尾向前检索的 K 线根数 M */
  const [consolidationLookback, setConsolidationLookback] = useState<number>(INITIAL_FILTER_STATE.consolidationLookback);
  /** 连续 N 根需满足横盘结构 */
  const [consolidationConsecutive, setConsolidationConsecutive] = useState<number>(
    INITIAL_FILTER_STATE.consolidationConsecutive
  );
  const [consolidationThreshold, setConsolidationThreshold] = useState<number>(INITIAL_FILTER_STATE.consolidationThreshold);
  const [consolidationRequireAboveMa10, setConsolidationRequireAboveMa10] = useState<boolean>(
    INITIAL_FILTER_STATE.consolidationRequireAboveMa10
  );
  const [consolidationFilterEnabled, setConsolidationFilterEnabled] = useState<boolean>(
    INITIAL_FILTER_STATE.consolidationFilterEnabled
  );
  const [consolidationFilterVisible, setConsolidationFilterVisible] = useState(true);

  const [trendLineLookback, setTrendLineLookback] = useState<number>(INITIAL_FILTER_STATE.trendLineLookback);
  const [trendLineConsecutive, setTrendLineConsecutive] = useState<number>(
    INITIAL_FILTER_STATE.trendLineConsecutive
  );
  const [trendLineFilterEnabled, setTrendLineFilterEnabled] = useState<boolean>(
    INITIAL_FILTER_STATE.trendLineFilterEnabled
  );
  const [trendLineFilterVisible, setTrendLineFilterVisible] = useState(true);

  // 放量急跌/拉升筛选显示状态
  const [volumeSurgeFilterVisible, setVolumeSurgeFilterVisible] = useState<boolean>(true);
  const [tableHeight, setTableHeight] = useState<number>(400); // 表格高度
  const tableCardRef = useRef<HTMLDivElement>(null); // 表格Card的引用

  // 急跌/急涨筛选状态（单日模式，去掉放量逻辑）
  const [volumeSurgeDropEnabled, setVolumeSurgeDropEnabled] = useState<boolean>(
    INITIAL_FILTER_STATE.volumeSurgeDropEnabled
  );
  const [volumeSurgeRiseEnabled, setVolumeSurgeRiseEnabled] = useState<boolean>(
    INITIAL_FILTER_STATE.volumeSurgeRiseEnabled
  );
  const [volumeSurgePeriod, setVolumeSurgePeriod] = useState<number>(INITIAL_FILTER_STATE.volumeSurgePeriod);
  const [dropRisePercentRange, setDropRisePercentRange] = useState<string>(INITIAL_FILTER_STATE.dropRisePercentRange);
  const [afterDropType, setAfterDropType] = useState<string>(INITIAL_FILTER_STATE.afterDropType);
  const [afterRiseType, setAfterRiseType] = useState<string>(INITIAL_FILTER_STATE.afterRiseType);
  const [afterDropPercentRange, setAfterDropPercentRange] = useState<string>(INITIAL_FILTER_STATE.afterDropPercentRange);
  const [afterRisePercentRange, setAfterRisePercentRange] = useState<string>(INITIAL_FILTER_STATE.afterRisePercentRange);

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
  }, [
    analysisData.length,
    filterVisible,
    consolidationFilterVisible,
    trendLineFilterVisible,
    volumeSurgeFilterVisible,
    loading,
    errors.length,
    updateTableHeight,
  ]);

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
        case 'hs_main':
          // 沪深主板：60开头或00开头
          marketMatch = pureCode.startsWith('60') || pureCode.startsWith('00');
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

    return analysisData.map((item) => {
      // 如果没有K线数据缓存，使用原始数据
      const klineData = klineDataCache.get(item.code);
      if (!klineData || klineData.length === 0) {
        return item;
      }

      // 使用用户参数重新计算横盘结果
      try {
        const recalculatedConsolidation = calculateConsolidationInLookback(klineData, {
          lookback: consolidationLookback,
          consecutive: consolidationConsecutive,
          threshold: consolidationThreshold,
          requireClosesAboveMa10: consolidationRequireAboveMa10,
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
    consolidationLookback,
    consolidationConsecutive,
    consolidationThreshold,
    consolidationRequireAboveMa10,
  ]);

  // 根据用户设置的周期重新计算急跌/急涨后的横盘结果
  const analysisDataWithRecalculatedVolumeSurge = useMemo(() => {
    if (analysisDataWithRecalculatedConsolidation.length === 0 || klineDataCache.size === 0) {
      return analysisDataWithRecalculatedConsolidation;
    }

    // 如果用户没有启用急跌/急涨筛选，直接返回原数据
    if (!volumeSurgeDropEnabled && !volumeSurgeRiseEnabled) {
      return analysisDataWithRecalculatedConsolidation;
    }

    return analysisDataWithRecalculatedConsolidation.map((item) => {
      const patterns = item.volumeSurgePatterns;
      if (!patterns) {
        return item;
      }

      const klineData = klineDataCache.get(item.code);
      if (!klineData || klineData.length === 0) {
        return item;
      }

      // 使用用户设置的周期重新计算急跌后的横盘结果
      const recalculatedAfterDropAnalyses = patterns.afterDropAnalyses.map(({ period, analysis }) => {
        try {
          const newAnalysis = analyzeAfterSurgeDrop(klineData, period, {
            period: volumeSurgePeriod,
            threshold: consolidationThreshold,
          });
          return { period, analysis: newAnalysis };
        } catch (error) {
          console.warn(`[${item.code}] 重新计算急跌后横盘结果失败:`, error);
          return { period, analysis };
        }
      });

      // 使用用户设置的周期重新计算急涨后的横盘结果
      const recalculatedAfterRiseAnalyses = patterns.afterRiseAnalyses.map(({ period, analysis }) => {
        try {
          const newAnalysis = analyzeAfterSurgeRise(klineData, period, {
            period: volumeSurgePeriod,
            threshold: consolidationThreshold,
          });
          return { period, analysis: newAnalysis };
        } catch (error) {
          console.warn(`[${item.code}] 重新计算急涨后横盘结果失败:`, error);
          return { period, analysis };
        }
      });

      return {
        ...item,
        volumeSurgePatterns: {
          ...patterns,
          afterDropAnalyses: recalculatedAfterDropAnalyses,
          afterRiseAnalyses: recalculatedAfterRiseAnalyses,
        },
      };
    });
  }, [
    analysisDataWithRecalculatedConsolidation,
    klineDataCache,
    volumeSurgeDropEnabled,
    volumeSurgeRiseEnabled,
    volumeSurgePeriod,
    consolidationThreshold,
  ]);

  const analysisDataWithRecalculatedTrendLine = useMemo(() => {
    if (analysisDataWithRecalculatedVolumeSurge.length === 0 || klineDataCache.size === 0) {
      return analysisDataWithRecalculatedVolumeSurge;
    }

    return analysisDataWithRecalculatedVolumeSurge.map((item) => {
      const klineData = klineDataCache.get(item.code);
      if (!klineData || klineData.length === 0) {
        return item;
      }

      try {
        const trendLine = calculateTrendLineInLookback(klineData, {
          lookback: trendLineLookback,
          consecutive: trendLineConsecutive,
        });
        return { ...item, trendLine };
      } catch (error) {
        console.warn(`[${item.code}] 重新计算趋势线失败:`, error);
        return item;
      }
    });
  }, [
    analysisDataWithRecalculatedVolumeSurge,
    klineDataCache,
    trendLineLookback,
    trendLineConsecutive,
  ]);

  // 对分析数据进行二次筛选
  const filteredAnalysisData = useMemo(() => {
    if (analysisDataWithRecalculatedTrendLine.length === 0) {
      return [];
    }

    return analysisDataWithRecalculatedTrendLine.filter((item) => {
      // 价格范围筛选
      if (priceRange.min !== undefined && item.price < priceRange.min) return false;
      if (priceRange.max !== undefined && item.price > priceRange.max) return false;

      // 总市值筛选
      if (marketCapRange.min !== undefined && item.marketCap !== null && item.marketCap !== undefined) {
        if (item.marketCap < marketCapRange.min) return false;
      }
      if (marketCapRange.max !== undefined && item.marketCap !== null && item.marketCap !== undefined) {
        if (item.marketCap > marketCapRange.max) return false;
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

      // KDJ-J筛选：未计算出值时按需求保留
      if (item.kdjJ !== null && item.kdjJ !== undefined) {
        if (kdjJRange.min !== undefined && item.kdjJ < kdjJRange.min) return false;
        if (kdjJRange.max !== undefined && item.kdjJ > kdjJRange.max) return false;
      }

      // 横盘筛选（启用且至少选一种类型时生效）
      if (consolidationFilterEnabled && consolidationTypes.length > 0) {
        if (!item.consolidation || !item.consolidation.isConsolidation) {
          return false;
        }

        const hasMatchedType = item.consolidation.matchedTypes.some((type) =>
          consolidationTypes.includes(type)
        );

        if (!hasMatchedType) {
          return false;
        }
      }

      if (trendLineFilterEnabled) {
        if (!item.trendLine?.isHit) {
          return false;
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

      // 急跌/急涨筛选（单日模式，去掉放量逻辑）
      if (volumeSurgeDropEnabled || volumeSurgeRiseEnabled) {
        const patterns = item.volumeSurgePatterns;
        if (!patterns) {
          return false;
        }

        // 解析急跌/急涨幅度范围
        const getPercentRange = (range: string): { min: number; max?: number } => {
          if (range === '5-10') {
            return { min: 5, max: 10 };
          } else if (range === '10+') {
            return { min: 10 };
          }
          return { min: 5, max: 10 };
        };

        const percentRange = getPercentRange(dropRisePercentRange);

        // 急跌筛选
        if (volumeSurgeDropEnabled) {
          // 检查是否有符合条件的急跌周期（单日模式，只要有一天满足即可）
          const matchingDrops = patterns.dropPeriods.filter((drop) => {
            const percentMatch =
              Math.abs(drop.changePercent) >= percentRange.min &&
              (percentRange.max === undefined || Math.abs(drop.changePercent) <= percentRange.max);
            return percentMatch;
          });

          if (matchingDrops.length === 0) {
            return false;
          }

          // 如果设置了急跌后类型筛选
          if (afterDropType !== 'all') {
            const afterPercentRange = getPercentRange(afterDropPercentRange);
            const hasMatchingAfterType = matchingDrops.some((drop) => {
              const analysis = patterns.afterDropAnalyses.find(
                (a) => a.period.startIndex === drop.startIndex && a.period.endIndex === drop.endIndex
              );
              if (!analysis) return false;

              if (afterDropType === 'consolidation') {
                return analysis.analysis.type === 'consolidation';
              } else if (afterDropType === 'consolidation_with_rise') {
                if (analysis.analysis.type !== 'consolidation_with_rise') return false;
                // 检查幅度是否满足条件
                if (analysis.analysis.reboundInfo) {
                  const changePercent = analysis.analysis.reboundInfo.changePercent;
                  return (
                    changePercent >= afterPercentRange.min &&
                    (afterPercentRange.max === undefined || changePercent <= afterPercentRange.max)
                  );
                }
                return false;
              } else if (afterDropType === 'consolidation_with_drop') {
                if (analysis.analysis.type !== 'consolidation_with_drop') return false;
                // 检查幅度是否满足条件
                if (analysis.analysis.reboundInfo) {
                  const changePercent = Math.abs(analysis.analysis.reboundInfo.changePercent);
                  return (
                    changePercent >= afterPercentRange.min &&
                    (afterPercentRange.max === undefined || changePercent <= afterPercentRange.max)
                  );
                }
                return false;
              }
              return false;
            });

            if (!hasMatchingAfterType) {
              return false;
            }
          }
        }

        // 急涨筛选
        if (volumeSurgeRiseEnabled) {
          // 检查是否有符合条件的急涨周期（单日模式，只要有一天满足即可）
          const matchingRises = patterns.risePeriods.filter((rise) => {
            const percentMatch =
              rise.changePercent >= percentRange.min &&
              (percentRange.max === undefined || rise.changePercent <= percentRange.max);
            return percentMatch;
          });

          if (matchingRises.length === 0) {
            return false;
          }

          // 如果设置了急涨后类型筛选
          if (afterRiseType !== 'all') {
            const afterPercentRange = getPercentRange(afterRisePercentRange);
            const hasMatchingAfterType = matchingRises.some((rise) => {
              const analysis = patterns.afterRiseAnalyses.find(
                (a) => a.period.startIndex === rise.startIndex && a.period.endIndex === rise.endIndex
              );
              if (!analysis) return false;

              if (afterRiseType === 'consolidation') {
                return analysis.analysis.type === 'consolidation';
              } else if (afterRiseType === 'consolidation_with_rise') {
                if (analysis.analysis.type !== 'consolidation_with_rise') return false;
                // 检查幅度是否满足条件
                if (analysis.analysis.reboundInfo) {
                  const changePercent = analysis.analysis.reboundInfo.changePercent;
                  return (
                    changePercent >= afterPercentRange.min &&
                    (afterPercentRange.max === undefined || changePercent <= afterPercentRange.max)
                  );
                }
                return false;
              } else if (afterRiseType === 'consolidation_with_drop') {
                if (analysis.analysis.type !== 'consolidation_with_drop') return false;
                // 检查幅度是否满足条件
                if (analysis.analysis.reboundInfo) {
                  const changePercent = Math.abs(analysis.analysis.reboundInfo.changePercent);
                  return (
                    changePercent >= afterPercentRange.min &&
                    (afterPercentRange.max === undefined || changePercent <= afterPercentRange.max)
                  );
                }
                return false;
              }
              return false;
            });

            if (!hasMatchingAfterType) {
              return false;
            }
          }
        }
      }

      return true;
    });
  }, [
    analysisDataWithRecalculatedTrendLine,
    priceRange,
    marketCapRange,
    turnoverRateRange,
    peRatioRange,
    kdjJRange,
    consolidationFilterEnabled,
    consolidationTypes,
    trendLineFilterEnabled,
    recentLimitUpCount,
    recentLimitDownCount,
    limitUpPeriod,
    limitDownPeriod,
    klineDataCache,
    volumeSurgeDropEnabled,
    volumeSurgeRiseEnabled,
    volumeSurgePeriod,
    dropRisePercentRange,
    afterDropType,
    afterRiseType,
    afterDropPercentRange,
    afterRisePercentRange,
  ]);

  // 重置所有筛选条件（与 INITIAL_FILTER_STATE / 各区块初始 UI 一致）
  const handleResetFilters = () => {
    const s = INITIAL_FILTER_STATE;
    setSelectedMarket(s.selectedMarket);
    setNameType(s.nameType);
    setPriceRange({ ...s.priceRange });
    setMarketCapRange({ ...s.marketCapRange });
    setTurnoverRateRange({ ...s.turnoverRateRange });
    setPeRatioRange({ ...s.peRatioRange });
    setKdjJRange({ ...s.kdjJRange });
    setFilterVisible(true);
    setRecentLimitUpCount(s.recentLimitUpCount);
    setRecentLimitDownCount(s.recentLimitDownCount);
    setLimitUpPeriod(s.limitUpPeriod);
    setLimitDownPeriod(s.limitDownPeriod);
    setConsolidationTypes([...s.consolidationTypes]);
    setConsolidationLookback(s.consolidationLookback);
    setConsolidationConsecutive(s.consolidationConsecutive);
    setConsolidationThreshold(s.consolidationThreshold);
    setConsolidationRequireAboveMa10(s.consolidationRequireAboveMa10);
    setConsolidationFilterEnabled(s.consolidationFilterEnabled);
    setTrendLineLookback(s.trendLineLookback);
    setTrendLineConsecutive(s.trendLineConsecutive);
    setTrendLineFilterEnabled(s.trendLineFilterEnabled);
    setConsolidationFilterVisible(true);
    setTrendLineFilterVisible(true);
    setVolumeSurgeFilterVisible(true);
    setVolumeSurgeDropEnabled(s.volumeSurgeDropEnabled);
    setVolumeSurgeRiseEnabled(s.volumeSurgeRiseEnabled);
    setVolumeSurgePeriod(s.volumeSurgePeriod);
    setDropRisePercentRange(s.dropRisePercentRange);
    setAfterDropType(s.afterDropType);
    setAfterRiseType(s.afterRiseType);
    setAfterDropPercentRange(s.afterDropPercentRange);
    setAfterRisePercentRange(s.afterRisePercentRange);
    message.info('筛选条件已重置');
  };

  const handleAnalyze = async () => {
    if (filteredStocks.length === 0) {
      message.warning('当前市场暂无股票数据');
      return;
    }

    await startAnalysis(currentPeriod, filteredStocks, currentCount);
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
                disabled={loading}
                onChange={(v) => {
                  const next = typeof v === 'number' && isFinite(v) ? Math.floor(v) : 500;
                  useOpportunityStore.setState({ currentCount: next });
                  if (analysisData.length > 0) {
                    message.info('count已更改，请重新分析');
                  }
                }}
              />
            </Space>
            <Button
              type="primary"
              icon={<PlayCircleOutlined />}
              onClick={handleAnalyze}
              loading={loading}
              disabled={loading || filteredStocks.length === 0}
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
                        <span className={styles.filterLabel}>价格范围：</span>
                        <InputNumber
                          value={priceRange.min}
                          min={0}
                          step={0.01}
                          precision={2}
                          style={{ width: 100 }}
                          placeholder="最低价"
                          onChange={(v) => {
                            setPriceRange((prev) => ({
                              ...prev,
                              min: typeof v === 'number' && isFinite(v) ? v : undefined,
                            }));
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
                          onChange={(v) => {
                            setPriceRange((prev) => ({
                              ...prev,
                              max: typeof v === 'number' && isFinite(v) ? v : undefined,
                            }));
                          }}
                        />
                      </div>
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
                      <div className={styles.filterItem}>
                        <span className={styles.filterLabel}>KDJ-J：</span>
                        <InputNumber
                          value={kdjJRange.min}
                          step={0.01}
                          precision={2}
                          style={{ width: 100 }}
                          placeholder="最小值"
                          onChange={(v) => {
                            setKdjJRange((prev) => ({
                              ...prev,
                              min: typeof v === 'number' && isFinite(v) ? v : undefined,
                            }));
                          }}
                        />
                        <span style={{ margin: '0 4px' }}>~</span>
                        <InputNumber
                          value={kdjJRange.max}
                          step={0.01}
                          precision={2}
                          style={{ width: 100 }}
                          placeholder="最大值"
                          onChange={(v) => {
                            setKdjJRange((prev) => ({
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
                        <Checkbox
                          checked={consolidationFilterEnabled}
                          onChange={(e) => setConsolidationFilterEnabled(e.target.checked)}
                        >
                          启用横盘筛选（关闭后不按横盘过滤列表）
                        </Checkbox>
                      </div>
                    </div>
                    <div className={styles.filterRow}>
                      <div className={styles.filterItem}>
                        <span className={styles.filterLabel}>横盘类型：</span>
                        <Checkbox.Group
                          value={consolidationTypes}
                          onChange={(values) => {
                            setConsolidationTypes(values as ConsolidationType[]);
                          }}
                        >
                          {CONSOLIDATION_TYPE_OPTIONS.map((item) => (
                            <Checkbox key={item.value} value={item.value}>
                              {item.label}
                            </Checkbox>
                          ))}
                        </Checkbox.Group>
                      </div>
                    </div>
                    <div className={styles.filterRow}>
                      <div className={styles.filterItem}>
                        <span className={styles.filterLabel}>检索根数：</span>
                        <InputNumber
                          value={consolidationLookback}
                          min={3}
                          max={500}
                          step={1}
                          style={{ width: 100 }}
                          onChange={(v) => {
                            const next = typeof v === 'number' && isFinite(v) ? Math.floor(v) : 10;
                            const clamped = Math.min(500, Math.max(3, next));
                            setConsolidationLookback(clamped);
                            if (consolidationConsecutive > clamped) {
                              setConsolidationConsecutive(Math.max(3, clamped));
                            }
                          }}
                        />
                        <span style={{ marginLeft: 4 }}>根（从最新K线向前）</span>
                      </div>
                      <div className={styles.filterItem}>
                        <span className={styles.filterLabel}>连续根数：</span>
                        <InputNumber
                          value={consolidationConsecutive}
                          min={3}
                          max={consolidationLookback}
                          step={1}
                          style={{ width: 100 }}
                          onChange={(v) => {
                            const next = typeof v === 'number' && isFinite(v) ? Math.floor(v) : 3;
                            const maxN = Math.max(3, consolidationLookback);
                            setConsolidationConsecutive(Math.min(maxN, Math.max(3, next)));
                          }}
                        />
                      </div>
                      <div className={styles.filterItem}>
                        <span className={styles.filterLabel}>波动阈值(%)：</span>
                        <InputNumber
                          value={consolidationThreshold}
                          min={0}
                          max={20}
                          step={0.1}
                          precision={1}
                          style={{ width: 100 }}
                          onChange={(v) => {
                            const next = typeof v === 'number' && isFinite(v) ? v : 2;
                            setConsolidationThreshold(next);
                          }}
                        />
                      </div>
                    </div>
                    <div className={styles.filterRow}>
                      <div className={styles.filterItem}>
                        <Checkbox
                          checked={consolidationRequireAboveMa10}
                          onChange={(e) => setConsolidationRequireAboveMa10(e.target.checked)}
                        >
                          连续根数段内每日收盘价均在MA10之上
                        </Checkbox>
                      </div>
                    </div>
                    <div className={styles.filterRow}>
                      <div className={styles.filterItem}>
                        <span className={styles.filterLabel}>命中说明：</span>
                        <span>
                          检索窗内任一段「连续根数」满足横盘即命中；勾选 MA10 则该段每日收盘≥当日 MA10。类型见左列，本列为简要波动与位置。
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </Card>

              {/* 趋势线筛选 */}
              <Card className={styles.filterCard} size="small">
                <div className={styles.filterHeader}>
                  <Space>
                    <FilterOutlined />
                    <span>趋势线筛选</span>
                    <Button
                      type="text"
                      size="small"
                      icon={trendLineFilterVisible ? <ExclamationCircleOutlined /> : null}
                      onClick={() => setTrendLineFilterVisible(!trendLineFilterVisible)}
                    >
                      {trendLineFilterVisible ? '收起' : '展开'}
                    </Button>
                  </Space>
                </div>
                {trendLineFilterVisible && (
                  <div className={styles.filterContent}>
                    <div className={styles.filterRow}>
                      <div className={styles.filterItem}>
                        <Checkbox
                          checked={trendLineFilterEnabled}
                          onChange={(e) => setTrendLineFilterEnabled(e.target.checked)}
                        >
                          启用趋势线筛选（与横盘同时开启时为 AND）
                        </Checkbox>
                      </div>
                    </div>
                    <div className={styles.filterRow}>
                      <div className={styles.filterItem}>
                        <span className={styles.filterLabel}>检索根数：</span>
                        <InputNumber
                          value={trendLineLookback}
                          min={3}
                          max={500}
                          step={1}
                          style={{ width: 100 }}
                          onChange={(v) => {
                            const next = typeof v === 'number' && isFinite(v) ? Math.floor(v) : 10;
                            const clamped = Math.min(500, Math.max(3, next));
                            setTrendLineLookback(clamped);
                            if (trendLineConsecutive > clamped) {
                              setTrendLineConsecutive(Math.max(3, clamped));
                            }
                          }}
                        />
                        <span style={{ marginLeft: 4 }}>根</span>
                      </div>
                      <div className={styles.filterItem}>
                        <span className={styles.filterLabel}>连续根数：</span>
                        <InputNumber
                          value={trendLineConsecutive}
                          min={3}
                          max={trendLineLookback}
                          step={1}
                          style={{ width: 100 }}
                          onChange={(v) => {
                            const next = typeof v === 'number' && isFinite(v) ? Math.floor(v) : 3;
                            const maxN = Math.max(3, trendLineLookback);
                            setTrendLineConsecutive(Math.min(maxN, Math.max(3, next)));
                          }}
                        />
                      </div>
                    </div>
                    <div className={styles.filterRow}>
                      <div className={styles.filterItem}>
                        <span className={styles.filterLabel}>说明：</span>
                        <span>
                          窗内取<strong>最靠后</strong>一段连续 N 根：每日收盘≥昨收且≥当日 MA5（当前K线周期下的
                          5 周期均线）。
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </Card>

              {/* 急跌/急涨筛选区域（单日模式） */}
              <Card className={styles.filterCard} size="small">
                <div className={styles.filterHeader}>
                  <Space>
                    <FilterOutlined />
                    <span>急跌/急涨筛选（单日模式）</span>
                    <Button
                      type="text"
                      size="small"
                      icon={volumeSurgeFilterVisible ? <ExclamationCircleOutlined /> : null}
                      onClick={() => setVolumeSurgeFilterVisible(!volumeSurgeFilterVisible)}
                    >
                      {volumeSurgeFilterVisible ? '收起' : '展开'}
                    </Button>
                  </Space>
                </div>
                {volumeSurgeFilterVisible && (
                  <div className={styles.filterContent}>
                    <div className={styles.filterRow}>
                      <div className={styles.filterItem}>
                        <Checkbox
                          checked={volumeSurgeDropEnabled}
                          onChange={(e) => setVolumeSurgeDropEnabled(e.target.checked)}
                        >
                          启用急跌筛选
                        </Checkbox>
                        <Checkbox
                          checked={volumeSurgeRiseEnabled}
                          onChange={(e) => setVolumeSurgeRiseEnabled(e.target.checked)}
                          style={{ marginLeft: 16 }}
                        >
                          启用急涨筛选
                        </Checkbox>
                      </div>
                    </div>

                    {(volumeSurgeDropEnabled || volumeSurgeRiseEnabled) && (
                      <>
                        <div className={styles.filterRow}>
                          <div className={styles.filterItem}>
                            <span className={styles.filterLabel}>周期：</span>
                            <InputNumber
                              value={volumeSurgePeriod}
                              min={5}
                              max={30}
                              step={1}
                              style={{ width: 100 }}
                              onChange={(v) => {
                                const next = typeof v === 'number' && isFinite(v) ? Math.floor(v) : 10;
                                setVolumeSurgePeriod(next);
                              }}
                            />
                            <span style={{ marginLeft: 4 }}>天</span>
                          </div>
                          <div className={styles.filterItem}>
                            <span className={styles.filterLabel}>急跌/急涨幅度：</span>
                            <Select
                              value={dropRisePercentRange}
                              onChange={(value) => setDropRisePercentRange(value)}
                              style={{ width: 150 }}
                              options={[
                                { label: '5-10%', value: '5-10' },
                                { label: '10%以上', value: '10+' },
                              ]}
                            />
                          </div>
                        </div>

                        {volumeSurgeDropEnabled && (
                          <>
                            <div className={styles.filterRow}>
                              <div className={styles.filterItem}>
                                <span className={styles.filterLabel}>急跌后类型：</span>
                                <Select
                                  value={afterDropType}
                                  onChange={(value) => setAfterDropType(value)}
                                  style={{ width: 200 }}
                                  options={[
                                    { label: '不限', value: 'all' },
                                    { label: '横盘', value: 'consolidation' },
                                    { label: '横盘后上涨', value: 'consolidation_with_rise' },
                                    { label: '横盘后下跌', value: 'consolidation_with_drop' },
                                  ]}
                                />
                              </div>
                            </div>
                            {(afterDropType === 'consolidation_with_rise' || afterDropType === 'consolidation_with_drop') && (
                              <div className={styles.filterRow}>
                                <div className={styles.filterItem}>
                                  <span className={styles.filterLabel}>横盘后幅度：</span>
                                  <Select
                                    value={afterDropPercentRange}
                                    onChange={(value) => setAfterDropPercentRange(value)}
                                    style={{ width: 150 }}
                                    options={[
                                      { label: '5-10%', value: '5-10' },
                                      { label: '10%以上', value: '10+' },
                                    ]}
                                  />
                                </div>
                              </div>
                            )}
                          </>
                        )}

                        {volumeSurgeRiseEnabled && (
                          <>
                            <div className={styles.filterRow}>
                              <div className={styles.filterItem}>
                                <span className={styles.filterLabel}>急涨后类型：</span>
                                <Select
                                  value={afterRiseType}
                                  onChange={(value) => setAfterRiseType(value)}
                                  style={{ width: 200 }}
                                  options={[
                                    { label: '不限', value: 'all' },
                                    { label: '横盘', value: 'consolidation' },
                                    { label: '横盘后上涨', value: 'consolidation_with_rise' },
                                    { label: '横盘后下跌', value: 'consolidation_with_drop' },
                                  ]}
                                />
                              </div>
                            </div>
                            {(afterRiseType === 'consolidation_with_rise' || afterRiseType === 'consolidation_with_drop') && (
                              <div className={styles.filterRow}>
                                <div className={styles.filterItem}>
                                  <span className={styles.filterLabel}>横盘后幅度：</span>
                                  <Select
                                    value={afterRisePercentRange}
                                    onChange={(value) => setAfterRisePercentRange(value)}
                                    style={{ width: 150 }}
                                    options={[
                                      { label: '5-10%', value: '5-10' },
                                      { label: '10%以上', value: '10+' },
                                    ]}
                                  />
                                </div>
                              </div>
                            )}
                          </>
                        )}
                      </>
                    )}
                  </div>
                )}
              </Card>

              {/* 筛选结果提示 */}
              {analysisDataWithRecalculatedTrendLine.length > 0 && (
                <div className={styles.filterResult}>
                  <span>
                    {filteredAnalysisData.length !== analysisDataWithRecalculatedTrendLine.length ? (
                      <>
                        筛选结果：<strong>{filteredAnalysisData.length}</strong> /{' '}
                        {analysisDataWithRecalculatedTrendLine.length} 条
                      </>
                    ) : (
                      <>
                        共 <strong>{filteredAnalysisData.length}</strong> 条数据
                      </>
                    )}
                  </span>
                </div>
              )}
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


