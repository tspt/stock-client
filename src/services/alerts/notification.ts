/**
 * 通知服务
 * 封装系统托盘通知和桌面通知
 */

import type { PriceAlert, StockQuote } from '@/types/stock';
import { formatPrice, formatChangePercent } from '@/utils/format/format';

/**
 * 发送提醒通知
 * @param alert 提醒规则
 * @param quote 股票行情数据
 */
export async function sendAlertNotification(alert: PriceAlert, quote: StockQuote): Promise<void> {
  if (!window.electronAPI) {
    return;
  }

  // 构建通知标题和内容
  const { title, body } = buildNotificationContent(alert, quote);

  // 根据用户配置发送通知
  const promises: Promise<void>[] = [];

  if (alert.notifications.tray) {
    promises.push(
      window.electronAPI
        .showTrayNotification({
          title,
          body,
          code: alert.code,
        })
        .then(() => {})
        .catch(() => {})
    );
  }

  if (alert.notifications.desktop) {
    promises.push(
      window.electronAPI
        .showDesktopNotification({
          title,
          body,
          code: alert.code,
        })
        .then(() => {})
        .catch(() => {})
    );
  }

  if (promises.length === 0) {
    return;
  }

  // 并行发送所有通知
  await Promise.allSettled(promises);
}

/**
 * 构建通知内容
 */
function buildNotificationContent(
  alert: PriceAlert,
  quote: StockQuote
): { title: string; body: string } {
  const { name, type, condition, targetValue } = {
    name: alert.name,
    type: alert.type,
    condition: alert.condition,
    targetValue: alert.targetValue,
  };
  const currentPrice = quote.price;

  let title = '';
  let body = '';

  if (type === 'price') {
    // 价格提醒
    if (condition === 'above') {
      title = `${name} 价格提醒`;
      body = `当前价格 ${formatPrice(currentPrice)} 元，已涨到目标价格 ${formatPrice(
        targetValue
      )} 元`;
    } else {
      title = `${name} 价格提醒`;
      body = `当前价格 ${formatPrice(currentPrice)} 元，已跌到目标价格 ${formatPrice(
        targetValue
      )} 元`;
    }
  } else if (type === 'percent') {
    // 幅度提醒
    const currentPercent = ((currentPrice - alert.basePrice) / alert.basePrice) * 100;
    if (condition === 'above') {
      title = `${name} 涨幅提醒`;
      body = `当前价格 ${formatPrice(currentPrice)} 元，涨幅 ${formatChangePercent(
        currentPercent
      )}，已达到目标涨幅 ${formatChangePercent(targetValue)}`;
    } else {
      title = `${name} 跌幅提醒`;
      body = `当前价格 ${formatPrice(currentPrice)} 元，跌幅 ${formatChangePercent(
        currentPercent
      )}，已达到目标跌幅 ${formatChangePercent(targetValue)}`;
    }
  } else if (type === 'support_resistance') {
    // 支撑阻力位突破提醒
    if (condition === 'breakout') {
      title = `${name} 阻力位突破提醒`;
      body = `当前价格 ${formatPrice(currentPrice)} 元，已突破阻力位 ${formatPrice(
        alert.resistanceLevel || targetValue
      )} 元`;
    } else {
      title = `${name} 支撑位跌破提醒`;
      body = `当前价格 ${formatPrice(currentPrice)} 元，已跌破支撑位 ${formatPrice(
        alert.supportLevel || targetValue
      )} 元`;
    }
  } else if (type === 'volume_anomaly') {
    // 成交量异常提醒
    const multiplier = alert.volumeMultiplier || 2.0;
    title = `${name} 成交量异常提醒`;
    body = `当前成交量达到历史均量的 ${multiplier} 倍以上，出现异常放量`;
  } else if (type === 'indicator_cross') {
    // 技术指标金叉/死叉提醒
    const indicatorName = getIndicatorName(alert.indicatorType);
    if (condition === 'golden_cross') {
      title = `${name} ${indicatorName}金叉提醒`;
      body = `${indicatorName}指标出现金叉信号，可能预示上涨趋势`;
    } else {
      title = `${name} ${indicatorName}死叉提醒`;
      body = `${indicatorName}指标出现死叉信号，可能预示下跌趋势`;
    }
  }

  return { title, body };
}

/**
 * 获取指标名称
 */
function getIndicatorName(indicatorType?: string): string {
  switch (indicatorType) {
    case 'MACD':
      return 'MACD';
    case 'KDJ':
      return 'KDJ';
    case 'RSI':
      return 'RSI';
    case 'MA':
      return '均线';
    default:
      return '技术指标';
  }
}
