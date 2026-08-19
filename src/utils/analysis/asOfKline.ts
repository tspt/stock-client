/**
 * 机会分析「截止日」模式：按日期截断日 K
 */

import type { KLineData } from '@/types/stock';

/** 将 K 线时间戳格式化为 YYYY-MM-DD（本地时区） */
export function formatKLineDate(time: number): string {
  const d = new Date(time);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * 截断到截止日（含当日）：仅保留 date <= asOfDate 的 K 线
 */
export function truncateKLinesToAsOfDate(klineData: KLineData[], asOfDate: string): KLineData[] {
  if (!asOfDate || klineData.length === 0) {
    return klineData;
  }
  return klineData.filter((bar) => formatKLineDate(bar.time) <= asOfDate);
}

/**
 * 由截止日最后一根 K 线构造分析用行情（替代实时行情）
 */
export function quoteFromAsOfKline(
  code: string,
  name: string,
  klineData: KLineData[]
): {
  code: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  high: number;
  low: number;
  volume: number;
  amount: number;
} | null {
  if (!klineData.length) {
    return null;
  }
  const last = klineData[klineData.length - 1];
  const prev = klineData.length >= 2 ? klineData[klineData.length - 2] : undefined;
  const prevClose = prev?.close ?? last.open;
  const change = last.close - prevClose;
  const changePercent = prevClose !== 0 ? (change / prevClose) * 100 : 0;
  return {
    code,
    name,
    price: last.close,
    change,
    changePercent,
    high: last.high,
    low: last.low,
    volume: last.volume,
    amount: 0,
  };
}

/**
 * 市值近似：用「当前/缓存市值」按价格比例缩放到截止日收盘
 * totalShares 用未缩放市值 ÷ 参考价（股本相对稳定）
 */
export function approximateFundamentalsAsOf(
  detailMarketCap: number | undefined,
  detailCirculatingMarketCap: number | undefined,
  asOfPrice: number,
  referencePrice: number | undefined
): {
  marketCap?: number;
  circulatingMarketCap?: number;
  totalShares?: number;
} {
  if (!detailMarketCap || !asOfPrice || asOfPrice <= 0) {
    return {
      marketCap: detailMarketCap,
      circulatingMarketCap: detailCirculatingMarketCap,
      totalShares:
        detailMarketCap && asOfPrice ? (detailMarketCap * 1e8) / asOfPrice : undefined,
    };
  }
  const ref = referencePrice && referencePrice > 0 ? referencePrice : asOfPrice;
  const totalShares = (detailMarketCap * 1e8) / ref;
  const scale = asOfPrice / ref;
  return {
    marketCap: detailMarketCap * scale,
    circulatingMarketCap: detailCirculatingMarketCap
      ? detailCirculatingMarketCap * scale
      : undefined,
    totalShares,
  };
}
