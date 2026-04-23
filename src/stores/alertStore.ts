/**
 * 价格提醒状态管理
 */

import { create } from 'zustand';
import type { PriceAlert, StockQuote, KLineData } from '@/types/stock';
import { getStorage, setStorage } from '@/utils/storage/storage';
import { STORAGE_KEYS } from '@/utils/config/constants';
import {
  identifySupportResistance,
  detectVolumeAnomaly,
  detectIndicatorCross,
} from '@/utils/analysis/alertEnhancements';

interface AlertState {
  // 提醒列表
  alerts: PriceAlert[];

  // Actions
  addAlert: (alert: Omit<PriceAlert, 'id' | 'createdAt' | 'triggered' | 'enabled'>) => void;
  updateAlert: (id: string, updates: Partial<PriceAlert>) => void;
  removeAlert: (id: string) => void;
  toggleAlert: (id: string) => void;
  loadAlerts: () => void;
  saveAlerts: () => void;
  checkAlerts: (
    quotes: Record<string, StockQuote>,
    klineDataMap?: Map<string, KLineData[]>
  ) => void;
  resetAlertTrigger: (id: string) => void;
  getAlertsByCode: (code: string) => PriceAlert[];
}

/**
 * 生成提醒ID
 */
function generateAlertId(): string {
  return `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * 检查时间周期是否有效
 */
function isTimePeriodValid(alert: PriceAlert): boolean {
  const now = new Date();
  const createdAt = new Date(alert.createdAt);

  switch (alert.timePeriod) {
    case 'day': {
      // 当天有效
      return (
        now.getFullYear() === createdAt.getFullYear() &&
        now.getMonth() === createdAt.getMonth() &&
        now.getDate() === createdAt.getDate()
      );
    }
    case 'week': {
      // 本周有效（周一到周日）
      const weekStart = new Date(createdAt);
      weekStart.setDate(createdAt.getDate() - createdAt.getDay() + 1); // 周一
      weekStart.setHours(0, 0, 0, 0);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6); // 周日
      weekEnd.setHours(23, 59, 59, 999);
      return now >= weekStart && now <= weekEnd;
    }
    case 'month': {
      // 本月有效
      return (
        now.getFullYear() === createdAt.getFullYear() && now.getMonth() === createdAt.getMonth()
      );
    }
    case 'permanent':
      // 永久有效
      return true;
    default:
      return false;
  }
}

/**
 * 检查价格提醒是否应该触发
 */
function shouldTriggerPriceAlert(alert: PriceAlert, currentPrice: number): boolean {
  const { condition, targetValue, triggered, lastTriggerPrice } = alert;

  if (condition === 'above') {
    // 涨到目标价格
    if (currentPrice >= targetValue) {
      if (!triggered) {
        // 首次触发
        return true;
      }
      // 需要回退机制：价格必须回退到目标价格以下，再涨到目标价格才再次触发
      if (lastTriggerPrice !== undefined && lastTriggerPrice < targetValue) {
        return true;
      }
    }
  } else {
    // 跌到目标价格
    if (currentPrice <= targetValue) {
      if (!triggered) {
        // 首次触发
        return true;
      }
      // 需要回退机制：价格必须回涨到目标价格以上，再跌到目标价格才再次触发
      if (lastTriggerPrice !== undefined && lastTriggerPrice > targetValue) {
        return true;
      }
    }
  }

  return false;
}

/**
 * 检查支撑阻力位突破提醒是否应该触发
 */
function shouldTriggerSupportResistanceAlert(
  alert: PriceAlert,
  currentPrice: number,
  klineData?: KLineData[]
): boolean {
  if (!klineData || klineData.length < 60) {
    // 支撑阻力位识别至少需要60天数据
    return false;
  }

  const { condition, triggered, lastTriggerPrice } = alert;

  // 识别支撑阻力位
  const srResult = identifySupportResistance(klineData);

  if (condition === 'breakout') {
    // 突破阻力位
    const nearestResistance = srResult.nearestResistance;
    if (nearestResistance && currentPrice >= nearestResistance) {
      if (!triggered) {
        return true;
      }
      // 回退机制：价格必须回落到阻力位下方，再突破才再次触发
      if (lastTriggerPrice !== undefined && lastTriggerPrice < nearestResistance) {
        return true;
      }
    }
  } else if (condition === 'breakdown') {
    // 跌破支撑位
    const nearestSupport = srResult.nearestSupport;
    if (nearestSupport && currentPrice <= nearestSupport) {
      if (!triggered) {
        return true;
      }
      // 回退机制：价格必须回升到支撑位上方，再跌破才再次触发
      if (lastTriggerPrice !== undefined && lastTriggerPrice > nearestSupport) {
        return true;
      }
    }
  }

  return false;
}

/**
 * 检查成交量异常提醒是否应该触发
 */
function shouldTriggerVolumeAnomalyAlert(
  alert: PriceAlert,
  currentPrice: number,
  klineData?: KLineData[]
): boolean {
  if (!klineData || klineData.length < 21) {
    // 至少需要 volumePeriod + 1 天数据
    return false;
  }

  const { volumeMultiplier = 2.0, volumePeriod = 20, triggered, lastTriggerPrice } = alert;

  // 检测成交量异常
  const anomalyResult = detectVolumeAnomaly(klineData, volumePeriod, volumeMultiplier);

  if (anomalyResult.isAnomaly) {
    if (!triggered) {
      // 首次触发
      return true;
    }
    // 回退机制：成交量必须回落到阈值以下，再异常才再次触发
    // 使用 lastTriggerPrice 记录上次触发时的成交量
    if (lastTriggerPrice !== undefined) {
      const historicalVolumes = klineData.slice(-volumePeriod - 1, -1).map((k) => k.volume);
      const avgVolume =
        historicalVolumes.reduce((sum, vol) => sum + vol, 0) / historicalVolumes.length;
      const lastVolumeRatio = lastTriggerPrice / avgVolume;

      // 如果上次触发后成交量已经回落到正常水平，则可以再次触发
      if (lastVolumeRatio < volumeMultiplier) {
        return true;
      }
    }
  }

  return false;
}

/**
 * 检查技术指标金叉/死叉提醒是否应该触发
 */
function shouldTriggerIndicatorCrossAlert(
  alert: PriceAlert,
  currentPrice: number,
  klineData?: KLineData[]
): boolean {
  if (!klineData || !alert.indicatorType) {
    return false;
  }

  const {
    condition,
    indicatorType,
    maFastPeriod = 5,
    maSlowPeriod = 20,
    triggered,
    lastTriggerPrice,
  } = alert;

  // 检测指标交叉
  const crossResult = detectIndicatorCross(klineData, indicatorType, maFastPeriod, maSlowPeriod);

  if (condition === 'golden_cross') {
    if (crossResult.isGoldenCross) {
      if (!triggered) {
        // 首次触发
        return true;
      }
      // 回退机制：快线必须回落至慢线下方，再金叉才再次触发
      if (lastTriggerPrice !== undefined && crossResult.fastValue <= crossResult.slowValue) {
        return true;
      }
    }
  }

  if (condition === 'death_cross') {
    if (crossResult.isDeathCross) {
      if (!triggered) {
        // 首次触发
        return true;
      }
      // 回退机制：快线必须回升至慢线上方，再死叉才再次触发
      if (lastTriggerPrice !== undefined && crossResult.fastValue >= crossResult.slowValue) {
        return true;
      }
    }
  }

  return false;
}

/**
 * 检查幅度提醒是否应该触发
 */
function shouldTriggerPercentAlert(alert: PriceAlert, currentPrice: number): boolean {
  const { condition, targetValue, basePrice, triggered, lastTriggerPrice } = alert;

  // 计算当前涨跌幅
  const currentPercent = ((currentPrice - basePrice) / basePrice) * 100;

  if (condition === 'above') {
    // 涨幅达到目标
    if (currentPercent >= targetValue) {
      if (!triggered) {
        // 首次触发
        return true;
      }
      // 需要回退机制：涨跌幅必须回退到目标以下，再涨到目标才再次触发
      if (lastTriggerPrice !== undefined) {
        const lastPercent = ((lastTriggerPrice - basePrice) / basePrice) * 100;
        if (lastPercent < targetValue) {
          return true;
        }
      }
    }
  } else {
    // 跌幅达到目标
    if (currentPercent <= targetValue) {
      if (!triggered) {
        // 首次触发
        return true;
      }
      // 需要回退机制：涨跌幅必须回涨到目标以上，再跌到目标才再次触发
      if (lastTriggerPrice !== undefined) {
        const lastPercent = ((lastTriggerPrice - basePrice) / basePrice) * 100;
        if (lastPercent > targetValue) {
          return true;
        }
      }
    }
  }

  return false;
}

export const useAlertStore = create<AlertState>((set, get) => ({
  alerts: [],

  addAlert: (alertData) => {
    const newAlert: PriceAlert = {
      ...alertData,
      id: generateAlertId(),
      createdAt: Date.now(),
      triggered: false,
      enabled: true,
    };
    const { alerts } = get();
    set({ alerts: [...alerts, newAlert] });
    get().saveAlerts();
  },

  updateAlert: (id, updates) => {
    const { alerts } = get();
    const updatedAlerts = alerts.map((alert) =>
      alert.id === id ? { ...alert, ...updates } : alert
    );
    set({ alerts: updatedAlerts });
    get().saveAlerts();
  },

  removeAlert: (id) => {
    const { alerts } = get();
    const filteredAlerts = alerts.filter((alert) => alert.id !== id);
    set({ alerts: filteredAlerts });
    get().saveAlerts();
  },

  toggleAlert: (id) => {
    const { alerts } = get();
    const updatedAlerts = alerts.map((alert) =>
      alert.id === id ? { ...alert, enabled: !alert.enabled } : alert
    );
    set({ alerts: updatedAlerts });
    get().saveAlerts();
  },

  loadAlerts: () => {
    const saved = getStorage<PriceAlert[]>(STORAGE_KEYS.PRICE_ALERTS, []);
    set({ alerts: saved });
  },

  saveAlerts: () => {
    const { alerts } = get();
    setStorage(STORAGE_KEYS.PRICE_ALERTS, alerts);
  },

  checkAlerts: (quotes, klineDataMap) => {
    const { alerts } = get();

    // 检查所有启用的提醒
    alerts.forEach((alert) => {
      if (!alert.enabled) {
        return;
      }

      // 检查时间周期
      if (!isTimePeriodValid(alert)) {
        // 时间周期过期，自动禁用
        get().updateAlert(alert.id, { enabled: false });
        return;
      }

      const quote = quotes[alert.code];
      if (!quote) {
        return;
      }

      const currentPrice = quote.price;
      let shouldTrigger = false;
      const klineData = klineDataMap?.get(alert.code);

      // 根据提醒类型检查
      if (alert.type === 'price') {
        shouldTrigger = shouldTriggerPriceAlert(alert, currentPrice);
      } else if (alert.type === 'percent') {
        shouldTrigger = shouldTriggerPercentAlert(alert, currentPrice);
      } else if (alert.type === 'support_resistance') {
        shouldTrigger = shouldTriggerSupportResistanceAlert(alert, currentPrice, klineData);
      } else if (alert.type === 'volume_anomaly') {
        shouldTrigger = shouldTriggerVolumeAnomalyAlert(alert, currentPrice, klineData);
      } else if (alert.type === 'indicator_cross') {
        shouldTrigger = shouldTriggerIndicatorCrossAlert(alert, currentPrice, klineData);
      }

      if (shouldTrigger) {
        // 触发提醒
        get().updateAlert(alert.id, {
          triggered: true,
          lastTriggerPrice: currentPrice,
        });

        // 发送通知
        import('@/services/alerts')
          .then(({ sendAlertNotification }) => {
            return sendAlertNotification(alert, quote);
          })
          .then(() => {})
          .catch(() => {});
      } else {
        // 更新 lastTriggerPrice（用于回退机制判断）
        // 只有当价格回退到目标价格另一侧时才更新
        if (alert.type === 'price') {
          const { condition, targetValue, lastTriggerPrice } = alert;
          if (condition === 'above') {
            // 涨到提醒：如果价格回退到目标以下，更新 lastTriggerPrice
            if (
              currentPrice < targetValue &&
              (lastTriggerPrice === undefined || lastTriggerPrice >= targetValue)
            ) {
              get().updateAlert(alert.id, { lastTriggerPrice: currentPrice });
            }
          } else {
            // 跌到提醒：如果价格回涨到目标以上，更新 lastTriggerPrice
            if (
              currentPrice > targetValue &&
              (lastTriggerPrice === undefined || lastTriggerPrice <= targetValue)
            ) {
              get().updateAlert(alert.id, { lastTriggerPrice: currentPrice });
            }
          }
        } else if (alert.type === 'percent') {
          // 幅度提醒的回退机制
          const { condition, targetValue, basePrice, lastTriggerPrice } = alert;
          const currentPercent = ((currentPrice - basePrice) / basePrice) * 100;

          if (condition === 'above') {
            // 涨幅提醒：如果涨跌幅回退到目标以下，更新 lastTriggerPrice
            if (
              currentPercent < targetValue &&
              (lastTriggerPrice === undefined ||
                ((lastTriggerPrice - basePrice) / basePrice) * 100 >= targetValue)
            ) {
              get().updateAlert(alert.id, { lastTriggerPrice: currentPrice });
            }
          } else {
            // 跌幅提醒：如果涨跌幅回涨到目标以上，更新 lastTriggerPrice
            if (
              currentPercent > targetValue &&
              (lastTriggerPrice === undefined ||
                ((lastTriggerPrice - basePrice) / basePrice) * 100 <= targetValue)
            ) {
              get().updateAlert(alert.id, { lastTriggerPrice: currentPrice });
            }
          }
        } else if (alert.type === 'volume_anomaly' && klineData) {
          // 成交量异常提醒的回退机制
          const { volumeMultiplier = 2.0, volumePeriod = 20, lastTriggerPrice } = alert;
          const historicalVolumes = klineData.slice(-volumePeriod - 1, -1).map((k) => k.volume);
          const avgVolume =
            historicalVolumes.reduce((sum, vol) => sum + vol, 0) / historicalVolumes.length;
          const currentVolumeRatio = klineData[klineData.length - 1].volume / avgVolume;

          // 如果成交量已经回落到阈值以下，更新 lastTriggerPrice
          if (
            currentVolumeRatio < volumeMultiplier &&
            (lastTriggerPrice === undefined || lastTriggerPrice >= avgVolume * volumeMultiplier)
          ) {
            get().updateAlert(alert.id, {
              lastTriggerPrice: klineData[klineData.length - 1].volume,
            });
          }
        } else if (alert.type === 'indicator_cross' && klineData) {
          // 指标交叉提醒的回退机制
          const {
            condition,
            indicatorType,
            maFastPeriod = 5,
            maSlowPeriod = 20,
            lastTriggerPrice,
          } = alert;
          const crossResult = detectIndicatorCross(
            klineData,
            indicatorType!,
            maFastPeriod,
            maSlowPeriod
          );

          if (condition === 'golden_cross') {
            // 金叉提醒：如果快线回落至慢线下方，更新 lastTriggerPrice
            if (
              crossResult.fastValue <= crossResult.slowValue &&
              (lastTriggerPrice === undefined || lastTriggerPrice === 1)
            ) {
              get().updateAlert(alert.id, { lastTriggerPrice: 0 });
            }
          } else if (condition === 'death_cross') {
            // 死叉提醒：如果快线回升至慢线上方，更新 lastTriggerPrice
            if (
              crossResult.fastValue >= crossResult.slowValue &&
              (lastTriggerPrice === undefined || lastTriggerPrice === 0)
            ) {
              get().updateAlert(alert.id, { lastTriggerPrice: 1 });
            }
          }
        }
        // 支撑阻力位提醒暂不需要额外的回退机制更新
      }
    });
  },

  resetAlertTrigger: (id) => {
    get().updateAlert(id, {
      triggered: false,
      lastTriggerPrice: undefined,
    });
  },

  getAlertsByCode: (code) => {
    const { alerts } = get();
    return alerts.filter((alert) => alert.code === code);
  },
}));
