/**
 * 历史回测数据导出工具
 */

import type {
  SignalBacktestResult,
  StockHistoryRecord,
} from '@/utils/storage/opportunityIndexedDB';
import { getStocksHistory } from '@/utils/storage/opportunityIndexedDB';
import { exportStockNamesToPng } from './stockNamesExportUtils';
import { logger } from '../business/logger';
import { getPureCode } from '../format/format';
import { getAllStocks } from '@/services/stocks/api';

/**
 * 从回测结果中提取最新日期的所有信号股票（带过滤条件）
 * @param results 回测结果数组
 * @param options 过滤选项
 * @returns 最新日期的信号股票列表（包含 code 和 name）
 */
export async function getLatestDateSignals(
  results: SignalBacktestResult[],
  options?: {
    selectedMarket?: string[]; // 选中的市场类型
    industrySectors?: string[]; // 选中的行业板块
    industrySectorInvert?: boolean; // 行业反选
    conceptSectors?: string[]; // 选中的概念板块
    conceptSectorInvert?: boolean; // 概念反选
    priceRange?: { min?: number; max?: number }; // 价格范围
    marketCapRange?: { min?: number; max?: number }; // 市值范围
    totalSharesRange?: { min?: number; max?: number }; // 总股数范围
  }
): Promise<Array<{ code: string; name: string }>> {
  if (!results || results.length === 0) {
    return [];
  }

  // 收集所有信号的日期，找出最新日期
  let latestDate = '';
  results.forEach((result) => {
    result.signals.forEach((signal) => {
      if (signal.signalDate > latestDate) {
        latestDate = signal.signalDate;
      }
    });
  });

  if (!latestDate) {
    return [];
  }

  // 获取所有股票的历史数据（用于获取价格和行业信息）
  const stockCodes = results.map((r) => r.code);
  const historyRecords = await getStocksHistory(stockCodes);
  const historyMap = new Map<string, StockHistoryRecord>();
  historyRecords.forEach((record) => {
    historyMap.set(record.code, record);
  });

  // 获取所有股票的基础信息（用于获取行业信息）
  const allStocks = await getAllStocks();
  const stockInfoMap = new Map<string, { industry?: { code: string; name: string } }>();
  allStocks.forEach((stock) => {
    stockInfoMap.set(stock.code, {
      industry: stock.industry,
    });
  });

  // 筛选出最新日期的所有信号股票，并应用过滤条件
  const latestSignals: Array<{ code: string; name: string }> = [];
  const seenCodes = new Set<string>();

  results.forEach((result) => {
    // 检查是否有最新日期的信号
    const hasLatestSignal = result.signals.some((signal) => signal.signalDate === latestDate);
    if (!hasLatestSignal || seenCodes.has(result.code)) {
      return;
    }

    // 获取股票历史数据
    const history = historyMap.get(result.code);
    if (!history) {
      logger.warn(`未找到股票 ${result.code} 的历史数据，跳过`);
      return;
    }

    // 过滤条件2: 市场类型筛选
    if (options?.selectedMarket && options.selectedMarket.length > 0) {
      const pureCode = getPureCode(result.code);
      const matchesMarket = options.selectedMarket.some((market) => {
        if (market === 'hs_main') return pureCode.startsWith('60') || pureCode.startsWith('00');
        if (market === 'sz_gem') return pureCode.startsWith('30');
        return true;
      });
      if (!matchesMarket) {
        return;
      }
    }

    // 过滤条件3: 非ST
    if (result.name.includes('ST')) {
      return;
    }

    // 过滤条件4: 行业板块筛选
    if (options?.industrySectors && options.industrySectors.length > 0) {
      const stockInfo = stockInfoMap.get(result.code);
      const hasIndustry =
        stockInfo?.industry && options.industrySectors.includes(stockInfo.industry.code);

      // 使用反选模式：如果启用反选且股票属于选中的行业，则跳过
      if (options.industrySectorInvert && hasIndustry) {
        logger.info(`排除股票 ${result.name}，所属行业: ${stockInfo!.industry!.name}`);
        return;
      }
      // 如果不启用反选且股票不属于选中的行业，也跳过
      if (!options.industrySectorInvert && !hasIndustry) {
        return;
      }
    }

    // 过滤条件5: 概念板块筛选（暂时跳过，因为 StockHistoryRecord 中没有概念信息）
    // TODO: 如果需要概念过滤，需要从其他数据源获取概念信息

    // 过滤条件6: 价格范围
    if (options?.priceRange && (options.priceRange.min != null || options.priceRange.max != null)) {
      const currentPrice = history.latestQuote?.price || 0;
      if (options.priceRange.min != null && currentPrice < options.priceRange.min) {
        return;
      }
      if (options.priceRange.max != null && currentPrice > options.priceRange.max) {
        return;
      }
    }

    // 过滤条件7: 市值范围
    if (
      options?.marketCapRange &&
      (options.marketCapRange.min != null || options.marketCapRange.max != null)
    ) {
      const marketCap = history.latestDetail?.marketCap; // 单位：元
      if (marketCap != null) {
        const marketCapInYi = marketCap / 1e8; // 转换为亿
        if (options.marketCapRange.min != null && marketCapInYi < options.marketCapRange.min) {
          return;
        }
        if (options.marketCapRange.max != null && marketCapInYi > options.marketCapRange.max) {
          return;
        }
      }
    }

    // 过滤条件8: 总股数范围（暂时跳过，因为 StockDetail 中没有总股数字段）
    // TODO: 如果需要总股数过滤，需要从其他数据源获取

    // 通过所有过滤条件，添加到结果列表
    latestSignals.push({
      code: result.code,
      name: result.name,
    });
    seenCodes.add(result.code);
  });

  // 按股票名称排序
  latestSignals.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));

  logger.info(`找到 ${latestSignals.length} 只在 ${latestDate} 出现信号的股票（已应用过滤条件）`);
  return latestSignals;
}

/**
 * 导出最新日期的信号股票为 PNG 图片
 * @param results 回测结果数组
 * @param options 导出选项
 */
export async function exportLatestSignalsToPng(
  results: SignalBacktestResult[],
  options?: {
    fileNamePrefix?: string;
    selectedMarket?: string[]; // 选中的市场类型
    industrySectors?: string[]; // 选中的行业板块
    industrySectorInvert?: boolean; // 行业反选
    conceptSectors?: string[]; // 选中的概念板块
    conceptSectorInvert?: boolean; // 概念反选
    priceRange?: { min?: number; max?: number }; // 价格范围
    marketCapRange?: { min?: number; max?: number }; // 市值范围
    totalSharesRange?: { min?: number; max?: number }; // 总股数范围
  }
): Promise<void> {
  try {
    const latestSignals = await getLatestDateSignals(results, {
      selectedMarket: options?.selectedMarket,
      industrySectors: options?.industrySectors,
      industrySectorInvert: options?.industrySectorInvert,
      conceptSectors: options?.conceptSectors,
      conceptSectorInvert: options?.conceptSectorInvert,
      priceRange: options?.priceRange,
      marketCapRange: options?.marketCapRange,
      totalSharesRange: options?.totalSharesRange,
    });

    if (latestSignals.length === 0) {
      throw new Error('没有找到符合过滤条件的最新日期信号股票');
    }

    // 提取股票名称列表
    const stockNames = latestSignals.map((signal) => signal.name);

    // 构建筛选条件摘要（显示最新日期、股票数量和过滤条件）
    const latestDate = latestSignals[0]?.code
      ? results.find((r) => r.code === latestSignals[0].code)?.signals.find((s) => s.signalDate)
          ?.signalDate
      : '';

    const filterConditions: string[] = [];

    // 市场类型
    if (options?.selectedMarket && options.selectedMarket.length > 0) {
      const marketLabels = options.selectedMarket.map((m) => {
        if (m === 'hs_main') return '沪深主板';
        if (m === 'sz_gem') return '创业板';
        return m;
      });
      filterConditions.push(`市场:${marketLabels.join('、')}`);
    }

    // 非ST
    filterConditions.push('非ST');

    // 行业板块
    if (options?.industrySectors && options.industrySectors.length > 0) {
      const mode = options.industrySectorInvert ? '排除' : '包含';
      filterConditions.push(`${mode}${options.industrySectors.length}个行业`);
    }

    // 价格范围
    if (options?.priceRange && (options.priceRange.min != null || options.priceRange.max != null)) {
      const min = options.priceRange.min ?? 0;
      const max = options.priceRange.max ?? '∞';
      filterConditions.push(`价格:${min}-${max}元`);
    }

    // 市值范围
    if (
      options?.marketCapRange &&
      (options.marketCapRange.min != null || options.marketCapRange.max != null)
    ) {
      const min = options.marketCapRange.min ?? 0;
      const max = options.marketCapRange.max ?? '∞';
      filterConditions.push(`市值:${min}-${max}亿`);
    }

    const filterSummary = `最新信号日期：${latestDate}\n股票数量：${
      stockNames.length
    } 只\n过滤条件：${filterConditions.join('、')}`;

    // 调用现有的图片导出函数
    await exportStockNamesToPng(stockNames, {
      maxPerColumn: 20,
      fileNamePrefix: options?.fileNamePrefix || '最新信号股票',
      filterSummary,
    });

    logger.info('成功导出最新信号股票图片');
  } catch (error) {
    logger.error('导出最新信号股票失败:', error);
    throw error;
  }
}
