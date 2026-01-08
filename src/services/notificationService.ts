/**
 * 通知服务
 * 封装系统托盘通知和桌面通知
 */

import type { PriceAlert, StockQuote } from '@/types/stock';
import { formatPrice, formatChangePercent } from '@/utils/format';

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
        .then(() => {
        })
        .catch((error) => {
        })
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
        .then(() => {
        })
        .catch((error) => {
        })
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
  const { name, type, condition, targetValue, currentPrice } = {
    name: alert.name,
    type: alert.type,
    condition: alert.condition,
    targetValue: alert.targetValue,
    currentPrice: quote.price,
  };

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
  } else {
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
  }

  return { title, body };
}

/**
 * 初始化通知导航监听
 * @param onNavigate 导航回调函数
 */
export function initNotificationNavigation(onNavigate: (code: string) => void): () => void {
  if (!window.electronAPI) {
    return () => {};
  }

  window.electronAPI.onNavigateToStock(onNavigate);

  // 返回清理函数
  return () => {
    if (window.electronAPI) {
      window.electronAPI.removeNavigateToStockListener();
    }
  };
}
