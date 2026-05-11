/**
 * 股票记录管理服务
 * 用于管理机会分析中的股票上榜记录
 */

import type {
  StockOpportunityData,
  StockRecord,
  StockRecordItem,
  StockStatistics,
} from '@/types/stock';
import {
  saveStockRecord,
  getStockRecordByDate,
  getAllStockRecords,
  deleteStockRecord,
} from '@/utils/storage/opportunityIndexedDB';
import { logger } from '@/utils/business/logger';

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
    concepts: [], // TODO: 后续可以从其他服务获取概念板块信息
    industry: undefined, // TODO: 后续可以从其他服务获取行业板块信息
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

    // 直接创建新记录，覆盖同一天的旧数据
    const record: StockRecord = {
      date: date,
      stocks: newItems,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await saveStockRecord(record);
    logger.info(`成功更新 ${date} 的股票记录，共 ${stocks.length} 只股票`);
  } catch (error) {
    logger.error('更新股票记录失败:', error);
    throw error;
  }
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

    // 如果指定了日期范围，则过滤
    if (dateRange) {
      allRecords = allRecords.filter((record) => {
        return record.date >= dateRange.startDate && record.date <= dateRange.endDate;
      });
    }

    // 按股票代码聚合统计
    const statsMap = new Map<string, StockStatistics>();

    allRecords.forEach((record) => {
      record.stocks.forEach((item) => {
        const existing = statsMap.get(item.code);

        if (existing) {
          // 更新统计
          existing.count += 1;
          existing.dates.push(record.date);

          // 更新最新日期
          if (record.date > existing.latestDate) {
            existing.latestDate = record.date;
          }

          // 合并概念板块（去重）
          if (item.concepts) {
            // 使用 code 作为唯一标识进行去重
            const existingConceptCodes = new Set(existing.concepts.map((c) => c.code));
            const newConcepts = item.concepts.filter((c) => !existingConceptCodes.has(c.code));
            existing.concepts = [...existing.concepts, ...newConcepts];
          }

          // 更新行业（取最新的）
          if (item.industry) {
            existing.industry = item.industry;
          }
        } else {
          // 新建统计
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

    // 转换为数组并按出现次数降序排序
    const statistics = Array.from(statsMap.values());
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
    await deleteStockRecord(date);
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
    const allRecords = await getAllStockRecords();

    // 逐个删除所有记录
    for (const record of allRecords) {
      await deleteStockRecord(record.date);
    }

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

    // 过滤指定日期范围的记录
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

    // 如果指定了日期范围，则过滤
    if (dateRange) {
      allRecords = allRecords.filter((record) => {
        return record.date >= dateRange.startDate && record.date <= dateRange.endDate;
      });
    }

    // 按日期排序
    allRecords.sort((a, b) => a.date.localeCompare(b.date));

    // 转换为趋势数据
    return allRecords.map((record) => ({
      date: record.date,
      count: record.stocks.length,
    }));
  } catch (error) {
    logger.error('计算趋势数据失败:', error);
    throw error;
  }
}
