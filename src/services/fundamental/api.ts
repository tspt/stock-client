/**
 * 基本面分析API服务
 * 获取财务报表、估值分析、行业对比、机构研报等数据
 */

import axios from 'axios';
import type {
  FundamentalAnalysis,
  FinancialStatement,
  ValuationAnalysis,
  IndustryComparison,
  ResearchReportSummary,
} from '@/types/stock';
import { getPureCode, getMarketFromCode } from '@/utils/format/format';
import { apiCache } from '@/utils/storage/apiCache';
import { API_BASE } from '@/config/environment';
import { logger } from '@/utils/business/logger';
import { API_TIMEOUT, DEFAULT_CACHE_TTL } from '@/utils/config/constants';

/**
 * 获取股票基本面分析数据
 * @param code 股票代码（统一格式：SH600000, SZ000001）
 */
export async function getFundamentalAnalysis(code: string): Promise<FundamentalAnalysis | null> {
  if (!code) {
    return null;
  }

  // 生成缓存 key
  const cacheKey = `fundamental:${code}`;

  // 尝试从缓存获取（5分钟 TTL，财务数据更新频率较低）
  const cached = apiCache.get<FundamentalAnalysis>(cacheKey);
  if (cached) {
    return cached;
  }

  try {
    const pureCode = getPureCode(code);
    const market = getMarketFromCode(code);

    if (!market) {
      logger.error('无法识别市场类型:', code);
      return null;
    }

    // 并行获取各类数据
    const [financials, valuation, industry, reports] = await Promise.allSettled([
      getFinancialStatements(pureCode, market),
      getValuationAnalysis(pureCode, market),
      getIndustryComparison(pureCode, market),
      getResearchReports(pureCode, market),
    ]);

    const result: FundamentalAnalysis = {
      updatedAt: Date.now(),
    };

    if (financials.status === 'fulfilled' && financials.value) {
      result.financialHistory = financials.value;
      result.latestFinancials = financials.value[0];
    }

    if (valuation.status === 'fulfilled' && valuation.value) {
      result.valuation = valuation.value;
    }

    if (industry.status === 'fulfilled' && industry.value) {
      result.industryComparison = industry.value;
    }

    if (reports.status === 'fulfilled' && reports.value) {
      result.researchReports = reports.value;
    }

    // 将结果存入缓存（5分钟 TTL）
    apiCache.set(cacheKey, result, DEFAULT_CACHE_TTL);

    return result;
  } catch (error) {
    logger.error('获取基本面分析数据失败:', error);
    return null;
  }
}

/**
 * 获取财务报表数据
 * 使用东方财富API获取主要财务指标
 */
async function getFinancialStatements(
  pureCode: string,
  market: 'SH' | 'SZ'
): Promise<FinancialStatement[]> {
  try {
    // 东方财富财务指标API
    const secid = market === 'SH' ? `1.${pureCode}` : `0.${pureCode}`;
    const url = `${API_BASE.EASTMONEY}/api/data/v1/get`;

    const response = await axios.get(url, {
      params: {
        reportName: 'RPT_F10_FINANCE_MAINFINADATA',
        columns:
          'REPORT_DATE,BASIC_EPS,WEIGHTED_ROE,NETPROFIT,GROSSSALES,MGSGRO,OPERATE_CASHFLOW,TOTAL_ASSETS,NET_ASSETS',
        filter: `(SECUCODE="${secid}")`,
        pageNumber: 1,
        pageSize: 8, // 最近8个季度
        sortTypes: '-1',
        sortColumns: 'REPORT_DATE',
      },
      timeout: API_TIMEOUT,
    });

    if (response.data?.result?.data && Array.isArray(response.data.result.data)) {
      return response.data.result.data.map((item: any) => ({
        reportPeriod: item.REPORT_DATE,
        eps: parseFloat(item.BASIC_EPS) || undefined,
        roe: parseFloat(item.WEIGHTED_ROE) || undefined,
        netProfit: parseFloat(item.NETPROFIT) || undefined,
        revenue: parseFloat(item.GROSSSALES) || undefined,
        grossMargin: parseFloat(item.MGSGRO) || undefined,
        operatingCashFlow: parseFloat(item.OPERATE_CASHFLOW) || undefined,
        totalAssets: parseFloat(item.TOTAL_ASSETS) || undefined,
        netAssets: parseFloat(item.NET_ASSETS) || undefined,
      }));
    }

    return [];
  } catch (error) {
    logger.error('获取财务报表数据失败:', error);
    return [];
  }
}

/**
 * 获取估值分析数据
 * 使用东方财富API获取估值指标和历史分位数
 */
async function getValuationAnalysis(
  pureCode: string,
  market: 'SH' | 'SZ'
): Promise<ValuationAnalysis | null> {
  try {
    const secid = market === 'SH' ? `1.${pureCode}` : `0.${pureCode}`;

    // 获取当前估值指标
    const url = `${API_BASE.EASTMONEY}/api/data/v1/get`;
    const response = await axios.get(url, {
      params: {
        reportName: 'RPT_F10_NEW_VALUATION_ANALYSIS',
        columns: 'PE_TTM,PB,PS,DIVIDEND_YIELD,EV_EBITDA',
        filter: `(SECUCODE="${secid}")`,
        pageNumber: 1,
        pageSize: 1,
      },
      timeout: API_TIMEOUT,
    });

    if (response.data?.result?.data && response.data.result.data.length > 0) {
      const item = response.data.result.data[0];

      // 获取历史分位数（需要额外的API调用）
      const percentiles = await getValuationPercentiles(secid);

      return {
        peTtm: parseFloat(item.PE_TTM) || undefined,
        pb: parseFloat(item.PB) || undefined,
        ps: parseFloat(item.PS) || undefined,
        dividendYield: parseFloat(item.DIVIDEND_YIELD) || undefined,
        evEbitda: parseFloat(item.EV_EBITDA) || undefined,
        ...percentiles,
      };
    }

    return null;
  } catch (error) {
    logger.error('获取估值分析数据失败:', error);
    return null;
  }
}

/**
 * 获取估值历史分位数
 */
async function getValuationPercentiles(secid: string): Promise<{
  pePercentile?: number;
  pbPercentile?: number;
  psPercentile?: number;
}> {
  try {
    // 这里简化处理，实际应该查询历史数据进行计算
    // 暂时返回模拟数据，后续可以接入更详细的历史数据API
    return {
      pePercentile: undefined,
      pbPercentile: undefined,
      psPercentile: undefined,
    };
  } catch (error) {
    return {};
  }
}

/**
 * 获取行业对比数据
 * 使用东方财富API获取行业估值中位数和排名
 */
async function getIndustryComparison(
  pureCode: string,
  market: 'SH' | 'SZ'
): Promise<IndustryComparison | null> {
  try {
    const secid = market === 'SH' ? `1.${pureCode}` : `0.${pureCode}`;

    // 获取行业和板块信息
    const url = `${API_BASE.EASTMONEY}/api/data/v1/get`;
    const response = await axios.get(url, {
      params: {
        reportName: 'RPT_F10_CORE_INDUSTRIES',
        columns: 'INDUSTRY_NAME,INDUSTRY_CODE',
        filter: `(SECUCODE="${secid}")`,
        pageNumber: 1,
        pageSize: 1,
      },
      timeout: API_TIMEOUT,
    });

    if (response.data?.result?.data && response.data.result.data.length > 0) {
      const item = response.data.result.data[0];
      const industryName = item.INDUSTRY_NAME;

      // 获取行业估值中位数
      const industryData = await getIndustryValuationMedian(industryName);

      return {
        industryName,
        ...industryData,
      };
    }

    return null;
  } catch (error) {
    logger.error('获取行业对比数据失败:', error);
    return null;
  }
}

/**
 * 获取行业估值中位数
 */
async function getIndustryValuationMedian(industryName: string): Promise<{
  industryPeMedian?: number;
  industryPbMedian?: number;
  industryPsMedian?: number;
  totalCompanies?: number;
}> {
  try {
    // 这里简化处理，实际应该查询行业内所有公司的估值数据并计算中位数
    // 暂时返回模拟数据
    return {
      industryPeMedian: undefined,
      industryPbMedian: undefined,
      industryPsMedian: undefined,
      totalCompanies: undefined,
    };
  } catch (error) {
    return {};
  }
}

/**
 * 获取机构研报摘要
 * 使用东方财富研报中心API
 */
async function getResearchReports(
  pureCode: string,
  market: 'SH' | 'SZ'
): Promise<ResearchReportSummary[]> {
  try {
    const secid = market === 'SH' ? `1.${pureCode}` : `0.${pureCode}`;

    // 东方财富研报API
    const url = `${API_BASE.EASTMONEY}/api/data/v1/get`;
    const response = await axios.get(url, {
      params: {
        reportName: 'RPT_RESEARCH_REPORT_LIST',
        columns: 'TITLE,ORG_NAME,PUBLISH_DATE,RATING,TARGET_PRICE,URL,SUMMARY',
        filter: `(SECUCODE="${secid}")`,
        pageNumber: 1,
        pageSize: 5, // 最近5条研报
        sortTypes: '-1',
        sortColumns: 'PUBLISH_DATE',
      },
      timeout: API_TIMEOUT,
    });

    if (response.data?.result?.data && Array.isArray(response.data.result.data)) {
      return response.data.result.data.map((item: any) => ({
        title: item.TITLE,
        institution: item.ORG_NAME,
        publishDate: item.PUBLISH_DATE,
        rating: item.RATING,
        targetPrice: parseFloat(item.TARGET_PRICE) || undefined,
        summary: item.SUMMARY,
        url: item.URL,
      }));
    }

    return [];
  } catch (error) {
    logger.error('获取机构研报失败:', error);
    return [];
  }
}
