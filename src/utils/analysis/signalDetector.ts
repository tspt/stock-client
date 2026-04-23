/**
 * 交易信号检测工具
 * 基于多重指标共振逻辑，提高买卖点判断的准确率
 */

import type { KLineData, TradingSignal } from '@/types/stock';
import { calculateMA, calculateKDJ } from './indicators';

/**
 * 检测今日交易信号
 * @param klineData K线数据（至少需要60根以保证MA60准确）
 * @returns 交易信号对象
 */
export function detectTradingSignal(klineData: KLineData[]): TradingSignal | null {
  if (!klineData || klineData.length < 60) {
    return null;
  }

  const len = klineData.length;
  const today = klineData[len - 1];
  const yesterday = klineData[len - 2];

  // 1. 计算均线
  const ma5 = calculateMA(klineData, 5);
  const ma10 = calculateMA(klineData, 10);
  const ma20 = calculateMA(klineData, 20);
  const ma60 = calculateMA(klineData, 60);

  const todayMa5 = ma5[len - 1];
  const todayMa20 = ma20[len - 1];
  const todayMa60 = ma60[len - 1];
  const yesterdayMa5 = ma5[len - 2];
  const yesterdayMa20 = ma20[len - 2];

  // 2. 计算 KDJ
  const kdj = calculateKDJ(klineData);
  const todayJ = kdj.j[len - 1];
  const yesterdayJ = kdj.j[len - 2];
  const todayK = kdj.k[len - 1];
  const todayD = kdj.d[len - 1];

  // 3. 基础状态判断
  const isUptrend = todayMa20 > ma20[len - 5] && todayMa60 > ma60[len - 5]; // 中长期趋势向上
  const isGoldenCross = yesterdayMa5 <= yesterdayMa20 && todayMa5 > todayMa20; // 今日金叉
  const isPriceAboveMa60 = today.close > todayMa60; // 价格在牛熊线上方

  // 4. 评分逻辑 (0-100)
  let score = 50; // 基础分
  const reasons: string[] = [];

  // --- 买入加分项 ---
  if (isGoldenCross) {
    score += 20;
    reasons.push('MA金叉');
  }
  if (todayJ < 20 && todayJ > yesterdayJ) {
    // J值低位拐头向上
    score += 15;
    reasons.push('KDJ超卖反弹');
  }
  if (isUptrend && today.close > todayMa5) {
    score += 10;
    reasons.push('趋势向好');
  }
  if (isPriceAboveMa60) {
    score += 5;
  }
  // 成交量放大（今日量 > 5日均量）
  const volMa5 = klineData.slice(-5).reduce((a, b) => a + b.volume, 0) / 5;
  if (today.volume > volMa5 * 1.2) {
    score += 10;
    reasons.push('放量');
  }

  // --- 卖出减分项 ---
  if (yesterdayMa5 >= yesterdayMa20 && todayMa5 < todayMa20) {
    // 死叉
    score -= 30;
    reasons.push('MA死叉');
  }
  if (todayJ > 80 && todayJ < yesterdayJ) {
    // J值高位拐头向下
    score -= 15;
    reasons.push('KDJ超买回落');
  }
  if (!isPriceAboveMa60) {
    score -= 10;
  }

  // 5. 确定信号类型
  let type: TradingSignal['type'] = 'HOLD';
  if (score >= 85) type = 'STRONG_BUY';
  else if (score >= 70) type = 'BUY';
  else if (score <= 15) type = 'STRONG_SELL';
  else if (score <= 30) type = 'SELL';

  return {
    type,
    strength: Math.max(0, Math.min(100, score)),
    reason: reasons.join(' + ') || '无明显信号',
  };
}
