/**
 * 数据格式化工具函数
 */

/**
 * 格式化价格（保留2位小数）
 */
export function formatPrice(price: number): string {
  return price.toFixed(2);
}

/**
 * 格式化涨跌幅（保留2位小数，带%）
 */
export function formatChangePercent(percent: number): string {
  const sign = percent >= 0 ? '+' : '';
  return `${sign}${percent.toFixed(2)}%`;
}

/**
 * 格式化成交量（转换为万或亿）
 */
export function formatVolume(volume: number): string {
  if (volume >= 100000000) {
    // 超过1亿，用亿作为单位
    return `${(volume / 100000000).toFixed(2)}亿`;
  }
  if (volume >= 10000) {
    return `${(volume / 10000).toFixed(2)}万`;
  }
  return volume.toString();
}

/**
 * 格式化成交量（亿单位，保留2位小数）
 * 用于数据概况页面，数据已经是亿单位（在overviewService中已转换）
 */
export function formatVolumeInBillion(volume: number): string {
  if (volume === null || volume === undefined || volume === 0) {
    return '-';
  }
  // volume已经是亿单位，直接格式化
  return `${volume.toFixed(2)}`;
}

/**
 * 格式化成交额（转换为万或亿）
 */
export function formatAmount(amount: number): string {
  if (amount >= 100000000) {
    return `${(amount / 100000000).toFixed(2)}亿`;
  }
  if (amount >= 10000) {
    return `${(amount / 10000).toFixed(2)}万`;
  }
  return amount.toFixed(2);
}

/**
 * 格式化成交额（亿单位，保留2位小数）
 * 用于数据概况页面，数据已经是亿单位（在overviewService中已转换）
 */
export function formatAmountInBillion(amount: number): string {
  if (amount === null || amount === undefined || amount === 0) {
    return '-';
  }
  // amount已经是亿单位，直接格式化
  return `${amount.toFixed(2)}`;
}

/**
 * 统一股票代码格式（转换为 SH600000 或 SZ000001 格式）
 */
export function normalizeStockCode(code: string): string {
  // 移除可能的空格和特殊字符
  const cleanCode = code.trim().replace(/[^0-9]/g, '');

  if (cleanCode.length !== 6) {
    return code; // 如果格式不对，返回原值
  }

  // 判断市场
  const firstChar = cleanCode[0];
  if (['6', '9'].includes(firstChar)) {
    return `SH${cleanCode}`;
  } else if (['0', '1', '2', '3'].includes(firstChar)) {
    return `SZ${cleanCode}`;
  }

  return code;
}

/**
 * 从统一格式代码中提取市场标识
 */
export function getMarketFromCode(code: string): 'SH' | 'SZ' | null {
  if (code.startsWith('SH')) {
    return 'SH';
  } else if (code.startsWith('SZ')) {
    return 'SZ';
  }
  return null;
}

/**
 * 从统一格式代码中提取纯数字代码
 */
export function getPureCode(code: string): string {
  return code.replace(/^(SH|SZ)/, '');
}

/**
 * 格式化市值（转换为万、亿）
 */
export function formatMarketCap(marketCap: number): string {
  if (marketCap >= 100000000) {
    return `${(marketCap / 100000000).toFixed(2)}亿`;
  }
  if (marketCap >= 10000) {
    return `${(marketCap / 10000).toFixed(2)}万`;
  }
  return `${marketCap.toFixed(2)}亿`;
}

/**
 * 格式化比率（PE、PB等，保留2位小数）
 */
export function formatRatio(ratio: number): string {
  if (ratio === 0 || !isFinite(ratio)) {
    return '-';
  }
  return ratio.toFixed(2);
}

/**
 * 格式化换手率（保留2位小数，带%）
 */
export function formatTurnoverRate(rate: number): string {
  if (rate === 0 || !isFinite(rate)) {
    return '-';
  }
  return `${rate.toFixed(2)}%`;
}
