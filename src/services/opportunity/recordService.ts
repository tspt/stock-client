/**
 * 股票记录管理服务
 * 用于管理机会分析中的股票上榜记录
 * 存储：docs/回测优化/机会记录/{YYYY-MM-DD}.json
 */

import type {
  StockOpportunityData,
  StockRecord,
  StockRecordItem,
  StockStatistics,
} from '@/types/stock';
import {
  saveStockRecordToFile,
  getAllStockRecordsFromFiles,
  deleteStockRecordFile,
  clearAllStockRecordFiles,
} from '@/utils/storage/opportunityRecordFiles';
import { logger } from '@/utils/business/logger';

/**
 * 获取全部机会记录（供回测页等直接消费）
 */
export async function getAllStockRecords(): Promise<StockRecord[]> {
  return getAllStockRecordsFromFiles();
}

/**
 * 获取指定日期的日期字符串 (YYYY-MM-DD)
 * @param timestamp 时间戳，如果不提供则使用当前时间
 */
function getDateDateString(timestamp?: number): string {
  const date = timestamp ? new Date(timestamp) : new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * 从机会分析数据中提取股票记录项
 */
function extractRecordItems(stocks: StockOpportunityData[]): StockRecordItem[] {
  return stocks.map((stock) => ({
    code: stock.code,
    name: stock.name,
    concepts: stock.concepts ?? [],
    industry: stock.industry,
    timestamp: Date.now(),
  }));
}

/**
 * 添加股票记录到指定日期
 * 直接覆盖同一天的旧数据
 * @param stocks 股票数据列表
 * @param timestamp 可选的时间戳,如果不提供则使用当前时间
 */
export async function addStocksToTodayRecord(
  stocks: StockOpportunityData[],
  timestamp?: number
): Promise<void> {
  try {
    const date = getDateDateString(timestamp);
    const newItems = extractRecordItems(stocks);

    const record: StockRecord = {
      date: date,
      stocks: newItems,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await saveStockRecordToFile(record);
    logger.info(`成功更新 ${date} 的股票记录，共 ${stocks.length} 只股票`);
  } catch (error) {
    logger.error('更新股票记录失败:', error);
    throw error;
  }
}

/**
 * 计算股票在记录日期序列末尾的连续上榜天数
 * 仅当股票在最新记录日也上榜时返回连续天数，否则为 0
 */
export function calcConsecutiveStreakAtEnd(
  stockDates: string[],
  allRecordDates: string[]
): number {
  if (stockDates.length === 0 || allRecordDates.length === 0) {
    return 0;
  }

  const dateSet = new Set(stockDates);
  const latestStockDate = stockDates.reduce((max, d) => (d > max ? d : max), stockDates[0]);
  const globalLatest = allRecordDates[allRecordDates.length - 1];

  if (latestStockDate !== globalLatest) {
    return 0;
  }

  let streak = 1;
  let idx = allRecordDates.length - 1;

  while (idx > 0) {
    const prevDate = allRecordDates[idx - 1];
    if (dateSet.has(prevDate)) {
      streak += 1;
      idx -= 1;
    } else {
      break;
    }
  }

  return streak;
}

/**
 * 计算股票统计信息
 * 聚合所有日期的记录，统计每只股票的出现次数、最新日期等
 */
export async function calculateStockStatistics(dateRange?: {
  startDate: string;
  endDate: string;
}): Promise<StockStatistics[]> {
  try {
    let allRecords = await getAllStockRecords();

    if (dateRange) {
      allRecords = allRecords.filter((record) => {
        return record.date >= dateRange.startDate && record.date <= dateRange.endDate;
      });
    }

    const statsMap = new Map<string, StockStatistics>();

    allRecords.forEach((record) => {
      record.stocks.forEach((item) => {
        const existing = statsMap.get(item.code);

        if (existing) {
          existing.count += 1;
          existing.dates.push(record.date);

          if (record.date > existing.latestDate) {
            existing.latestDate = record.date;
          }

          if (item.concepts) {
            const existingConceptCodes = new Set(existing.concepts.map((c) => c.code));
            const newConcepts = item.concepts.filter((c) => !existingConceptCodes.has(c.code));
            existing.concepts = [...existing.concepts, ...newConcepts];
          }

          if (item.industry) {
            existing.industry = item.industry;
          }
        } else {
          statsMap.set(item.code, {
            code: item.code,
            name: item.name,
            count: 1,
            latestDate: record.date,
            concepts: item.concepts || [],
            industry: item.industry,
            dates: [record.date],
          });
        }
      });
    });

    const allRecordDates = [...new Set(allRecords.map((record) => record.date))].sort();

    const statistics = Array.from(statsMap.values());
    statistics.forEach((stat) => {
      stat.consecutiveDays = calcConsecutiveStreakAtEnd(stat.dates, allRecordDates);
    });
    statistics.sort((a, b) => b.count - a.count);

    return statistics;
  } catch (error) {
    logger.error('计算股票统计信息失败:', error);
    throw error;
  }
}

/**
 * 删除指定日期的记录
 */
export async function removeRecordByDate(date: string): Promise<void> {
  try {
    await deleteStockRecordFile(date);
    logger.info(`成功删除日期 ${date} 的记录`);
  } catch (error) {
    logger.error('删除记录失败:', error);
    throw error;
  }
}

/**
 * 清空所有记录
 */
export async function clearAllRecords(): Promise<void> {
  try {
    await clearAllStockRecordFiles();
    logger.info('成功清空所有股票记录');
  } catch (error) {
    logger.error('清空记录失败:', error);
    throw error;
  }
}

/**
 * 获取指定日期范围的记录
 */
export async function getRecordsByDateRange(
  startDate: string,
  endDate: string
): Promise<StockRecord[]> {
  try {
    const allRecords = await getAllStockRecords();

    return allRecords.filter((record) => {
      return record.date >= startDate && record.date <= endDate;
    });
  } catch (error) {
    logger.error('获取日期范围记录失败:', error);
    throw error;
  }
}

/**
 * 计算趋势图数据
 * 返回每个日期的股票数量，用于绘制趋势图
 */
export async function calculateTrendData(dateRange?: {
  startDate: string;
  endDate: string;
}): Promise<Array<{ date: string; count: number }>> {
  try {
    let allRecords = await getAllStockRecords();

    if (dateRange) {
      allRecords = allRecords.filter((record) => {
        return record.date >= dateRange.startDate && record.date <= dateRange.endDate;
      });
    }

    allRecords.sort((a, b) => a.date.localeCompare(b.date));

    return allRecords.map((record) => ({
      date: record.date,
      count: record.stocks.length,
    }));
  } catch (error) {
    logger.error('计算趋势数据失败:', error);
    throw error;
  }
}
