/**
 * 龙虎榜数据服务
 */

import { logger } from '@/utils/business/logger';
import CookiePoolManager from '@/utils/storage/cookiePoolManager';
import {
  saveBillboardCache,
  getBillboardCache,
  isCacheValid,
} from '@/utils/storage/billboardIndexedDB';
import type { BillboardStockData, StatisticsCycle, BillboardResponse } from '@/types/billboard';

const BASE_URL = 'https://datacenter-web.eastmoney.com/api/data/v1/get';

interface FetchBillboardParams {
  statisticsCycle: StatisticsCycle;
  pageNumber?: number;
  pageSize?: number;
}

/**
 * 获取龙虎榜个股统计数据（带缓存）
 * @param params 查询参数
 * @param forceRefresh 是否强制刷新（忽略缓存）
 * @returns 包含数据和分页信息的对象
 */
export async function fetchBillboardData(
  params: FetchBillboardParams,
  forceRefresh: boolean = false
): Promise<{ data: BillboardStockData[]; total: number; pages: number }> {
  const { statisticsCycle, pageNumber = 1, pageSize = 50 } = params;

  // 仅在第一页时尝试使用缓存
  if (pageNumber === 1 && !forceRefresh) {
    try {
      const cached = await getBillboardCache(statisticsCycle);
      if (cached && isCacheValid(cached.cachedAt)) {
        logger.info(`[BillboardService] 使用缓存数据: ${statisticsCycle}`);
        return {
          data: cached.data,
          total: cached.total,
          pages: cached.pages,
        };
      } else if (cached) {
        logger.info(`[BillboardService] 缓存已过期，重新请求: ${statisticsCycle}`);
      }
    } catch (error) {
      logger.warn('[BillboardService] 读取缓存失败，将重新请求:', error);
    }
  }

  try {
    // 从Cookie池获取可用Cookie
    const cookiePool = CookiePoolManager.getInstance();
    const cookieValue = cookiePool.getNextCookie();

    if (!cookieValue) {
      throw new Error('没有可用的东方财富Cookie，请先在Cookie管理页面添加');
    }

    // 构建请求URL
    const url = new URL(BASE_URL);
    url.searchParams.set('sortColumns', 'BILLBOARD_TIMES,LATEST_TDATE,SECURITY_CODE');
    url.searchParams.set('sortTypes', '-1,-1,1');
    url.searchParams.set('pageSize', pageSize.toString());
    url.searchParams.set('pageNumber', pageNumber.toString());
    url.searchParams.set('reportName', 'RPT_BILLBOARD_TRADEALLNEW');
    url.searchParams.set('columns', 'ALL');
    url.searchParams.set('source', 'WEB');
    url.searchParams.set('client', 'WEB');
    url.searchParams.set('filter', `(STATISTICS_CYCLE="${statisticsCycle}")`);

    logger.info('[BillboardService] 请求龙虎榜数据:', {
      url: url.toString(),
      statisticsCycle,
      pageNumber,
      pageSize,
    });

    // 发送请求（使用统一的UA和Cookie）
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        Accept: '*/*',
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
        Referer: 'https://data.eastmoney.com/stock/stockstatistic.html',
        Cookie: cookieValue,
      },
    });

    if (!response.ok) {
      // 如果返回403或500，标记Cookie失效
      if (response.status === 403 || response.status === 500) {
        await cookiePool.reportFailure(cookieValue);
        logger.warn('[BillboardService] Cookie可能已失效，已标记为失败');
      }
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const text = await response.text();

    // 处理JSONP响应
    let jsonString = text;
    const jsonpMatch = text.match(/jQuery\d+_\d+\((.*)\)/);
    if (jsonpMatch && jsonpMatch[1]) {
      jsonString = jsonpMatch[1];
    }

    const data: BillboardResponse = JSON.parse(jsonString);

    logger.info('[BillboardService] 获取龙虎榜数据成功:', {
      totalRecords: data.result.count,
      totalPages: data.result.pages,
      currentPage: pageNumber,
      pageSize,
    });

    const result = {
      data: data.result.data,
      total: data.result.count,
      pages: data.result.pages,
    };

    // 仅在第一页时保存缓存
    if (pageNumber === 1) {
      try {
        await saveBillboardCache(statisticsCycle, result.data, result.total, result.pages);
      } catch (error) {
        logger.warn('[BillboardService] 保存缓存失败:', error);
      }
    }

    return result;
  } catch (error) {
    logger.error('[BillboardService] 获取龙虎榜数据失败:', error);
    throw error;
  }
}

/**
 * 格式化金额显示
 * @param amount 金额（元）
 * @returns 格式化后的金额字符串
 */
export function formatAmount(amount: number): string {
  if (amount === 0) return '0';

  const absAmount = Math.abs(amount);
  let formatted: string;

  if (absAmount >= 1e8) {
    formatted = `${(amount / 1e8).toFixed(2)}亿`;
  } else if (absAmount >= 1e4) {
    formatted = `${(amount / 1e4).toFixed(2)}万`;
  } else {
    formatted = amount.toFixed(2);
  }

  return formatted;
}

/**
 * 格式化百分比显示
 * @param value 百分比值
 * @returns 格式化后的百分比字符串
 */
export function formatPercent(value: number): string {
  if (value === 0) return '0.00%';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

/**
 * 格式化日期显示
 * @param dateStr 日期字符串
 * @returns 格式化后的日期字符串
 */
export function formatDate(dateStr: string): string {
  if (!dateStr) return '-';
  return dateStr.split(' ')[0]; // 只保留日期部分
}
