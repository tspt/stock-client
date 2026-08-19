import type { KLineData } from '@/types/stock';
import type { StockHistoryRecord } from '@/utils/storage/opportunityIndexedDB';
import { formatKLineDate, truncateKLinesToAsOfDate } from '@/utils/analysis/asOfKline';

export type ScenarioId =
  | 'limit_up_trend'
  | 'volume_breakout'
  | 'soft_breakout'
  | 'volume_mid_thrust'
  | 'trend_continuation'
  | 'pullback_stabilize'
  | 'pullback_with_volume'
  | 'oversold_bounce'
  | 'weak_base'
  | 'other';

export interface ScenarioDefinition {
  id: ScenarioId;
  name: string;
  lift?: number;
}

export interface ScenarioFeatures {
  dayReturn?: number;
  volumeRatio?: number | null;
  lowerShadowRatio?: number;
  bodyRatio?: number;
  pullbackFromHigh20?: number | null;
  ret3?: number | null;
  ret10?: number | null;
  ret20?: number | null;
  limitUpCount5?: number;
  nearHigh20?: boolean;
  aboveMa10?: boolean;
  nearMa20?: boolean;
}

export interface ClassifiedScenario {
  scenario: ScenarioId;
  scenarioName: string;
  matchedRule: string;
  features: ScenarioFeatures;
}

export interface ReturnSnapshot {
  d1: number | null;
  d2: number | null;
  d3: number | null;
  d5: number | null;
  d10: number | null;
}

export interface BuyPointSignal extends ClassifiedScenario {
  code: string;
  name: string;
  industry?: { code: string; name: string } | null;
  date: string;
  timestamp: number;
  entryPrice: number;
  hitCount: number;
  returns: ReturnSnapshot;
}

export interface LatestScenarioSignal extends ClassifiedScenario {
  code: string;
  name: string;
  industry?: { code: string; name: string } | null;
  date: string;
  timestamp: number;
  close: number;
  lift?: number;
  returns: ReturnSnapshot;
}

export const SCENARIOS: ScenarioDefinition[] = [
  { id: 'limit_up_trend', name: '连板/强趋势' },
  { id: 'volume_breakout', name: '放量突破续涨' },
  { id: 'soft_breakout', name: '温和过前高' },
  { id: 'volume_mid_thrust', name: '中部放量启动' },
  { id: 'trend_continuation', name: '趋势中继' },
  { id: 'pullback_stabilize', name: '缩量回踩企稳反弹' },
  { id: 'pullback_with_volume', name: '回撤后放量企稳' },
  { id: 'oversold_bounce', name: '超跌强反' },
  { id: 'weak_base', name: '弱势蓄势' },
  { id: 'other', name: '未归类' },
];

export const HIGH_LIFT_SCENARIOS: ScenarioDefinition[] = [
  { id: 'limit_up_trend', name: '连板/强趋势', lift: 3.18 },
  { id: 'volume_breakout', name: '放量突破续涨', lift: 1.847 },
  { id: 'soft_breakout', name: '温和过前高', lift: 1.814 },
  { id: 'trend_continuation', name: '趋势中继', lift: 1.577 },
  { id: 'volume_mid_thrust', name: '中部放量启动', lift: 1.298 },
];

export const HIGH_LIFT_IDS = new Set(HIGH_LIFT_SCENARIOS.map((s) => s.id));

const HORIZONS: Array<{ key: keyof ReturnSnapshot; days: number }> = [
  { key: 'd1', days: 1 },
  { key: 'd2', days: 2 },
  { key: 'd3', days: 3 },
  { key: 'd5', days: 5 },
  { key: 'd10', days: 10 },
];

export function formatKlineDate(ts: number): string {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}/${m}/${day}`;
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function toPercent(n: number): number {
  return Number((n * 100).toFixed(2));
}

export function calculateFutureReturns(lines: KLineData[], index: number): ReturnSnapshot {
  const entry = lines[index]?.close;
  const returns: ReturnSnapshot = { d1: null, d2: null, d3: null, d5: null, d10: null };
  if (!entry || entry <= 0) return returns;

  HORIZONS.forEach((h) => {
    const target = lines[index + h.days];
    if (!target || target.close == null) return;
    returns[h.key] = toPercent((target.close - entry) / entry);
  });

  return returns;
}

export function countReturnHits(returns: ReturnSnapshot, threshold = 5): number {
  return Object.values(returns).filter((v) => v != null && v > threshold).length;
}

export function classifyOneDay(lines: KLineData[], i: number): ClassifiedScenario {
  if (i < 1 || !lines[i] || !lines[i].close) {
    return {
      scenario: 'other',
      scenarioName: '未归类',
      matchedRule: 'insufficient_history',
      features: {},
    };
  }

  const cur = lines[i];
  const prev = lines[i - 1];
  const close = cur.close;
  const open = cur.open;
  const high = cur.high;
  const low = cur.low;
  const volume = cur.volume || 0;
  const prevClose = prev.close || open;
  const dayReturn = prevClose > 0 ? (close - prevClose) / prevClose : 0;
  const range = high - low;
  const lowerShadowRatio = range > 0 ? (Math.min(open, close) - low) / range : 0;
  const bodyRatio = range > 0 ? Math.abs(close - open) / range : 0;
  const volMa5 = mean(
    lines.slice(Math.max(0, i - 5), i).map((item) => item.volume || 0)
  );
  const volumeRatio = volMa5 && volMa5 > 0 ? volume / volMa5 : null;

  const ma = (period: number): number | null => {
    if (i + 1 < period) return null;
    return mean(lines.slice(i - period + 1, i + 1).map((item) => item.close));
  };

  const ma10 = ma(10);
  const ma20 = ma(20);
  const high20Prev =
    i >= 1
      ? Math.max(...lines.slice(Math.max(0, i - 20), i).map((item) => item.high))
      : null;
  const high20Incl = Math.max(...lines.slice(Math.max(0, i - 19), i + 1).map((item) => item.high));
  const pullbackFromHigh20 = high20Incl > 0 ? (high20Incl - close) / high20Incl : null;
  const ret3 = i >= 3 && lines[i - 3].close > 0 ? (close - lines[i - 3].close) / lines[i - 3].close : null;
  const ret10 = i >= 10 && lines[i - 10].close > 0 ? (close - lines[i - 10].close) / lines[i - 10].close : null;
  const ret20 = i >= 20 && lines[i - 20].close > 0 ? (close - lines[i - 20].close) / lines[i - 20].close : null;

  let limitUpCount5 = 0;
  for (let k = Math.max(1, i - 4); k <= i; k++) {
    const pc = lines[k - 1].close;
    if (!pc) continue;
    if ((lines[k].close - pc) / pc >= 0.095) limitUpCount5++;
  }

  const nearHigh20 = high20Prev != null && high20Prev > 0 ? close >= high20Prev * 0.99 : false;
  const aboveMa10 = ma10 != null ? close >= ma10 : false;
  const nearMa20 = ma20 != null && ma20 > 0 ? Math.abs(close - ma20) / ma20 <= 0.05 : false;
  const features: ScenarioFeatures = {
    dayReturn: toPercent(dayReturn),
    volumeRatio: volumeRatio == null ? null : Number(volumeRatio.toFixed(2)),
    lowerShadowRatio: Number(lowerShadowRatio.toFixed(3)),
    bodyRatio: Number(bodyRatio.toFixed(3)),
    pullbackFromHigh20: pullbackFromHigh20 == null ? null : toPercent(pullbackFromHigh20),
    ret3: ret3 == null ? null : toPercent(ret3),
    ret10: ret10 == null ? null : toPercent(ret10),
    ret20: ret20 == null ? null : toPercent(ret20),
    limitUpCount5,
    nearHigh20,
    aboveMa10,
    nearMa20,
  };

  if (limitUpCount5 >= 2 || (ret3 != null && ret3 >= 0.2)) {
    return {
      scenario: 'limit_up_trend',
      scenarioName: '连板/强趋势',
      matchedRule:
        limitUpCount5 >= 2
          ? `近5日近似涨停根数=${limitUpCount5}≥2`
          : `近3日累计涨幅=${toPercent(ret3 || 0).toFixed(1)}%≥20%`,
      features,
    };
  }

  if (nearHigh20 && volumeRatio != null && volumeRatio >= 1.5 && dayReturn >= 0.02) {
    return {
      scenario: 'volume_breakout',
      scenarioName: '放量突破续涨',
      matchedRule: `接近/突破近20日高点且量比=${volumeRatio.toFixed(2)}≥1.5且当日涨幅=${toPercent(dayReturn).toFixed(1)}%≥2%`,
      features,
    };
  }

  if (nearHigh20 && volumeRatio != null && volumeRatio >= 1.0 && volumeRatio < 1.5 && dayReturn >= 0.01) {
    return {
      scenario: 'soft_breakout',
      scenarioName: '温和过前高',
      matchedRule: `近20日高且量比=${volumeRatio.toFixed(2)}∈[1.0,1.5)且当日涨幅=${toPercent(dayReturn).toFixed(1)}%≥1%`,
      features,
    };
  }

  if (!nearHigh20 && volumeRatio != null && volumeRatio >= 1.5 && dayReturn >= 0.02) {
    return {
      scenario: 'volume_mid_thrust',
      scenarioName: '中部放量启动',
      matchedRule: `未近20日高且量比=${volumeRatio.toFixed(2)}≥1.5且当日涨幅=${toPercent(dayReturn).toFixed(1)}%≥2%`,
      features,
    };
  }

  if (ret3 != null && ret3 >= 0.05 && ret3 < 0.2 && limitUpCount5 < 2 && dayReturn >= 0) {
    return {
      scenario: 'trend_continuation',
      scenarioName: '趋势中继',
      matchedRule: `近3日累计=${toPercent(ret3).toFixed(1)}%∈[5,20)且当日不跌`,
      features,
    };
  }

  const maSupport = nearMa20 || aboveMa10;
  if (
    pullbackFromHigh20 != null &&
    pullbackFromHigh20 >= 0.08 &&
    pullbackFromHigh20 <= 0.25 &&
    volumeRatio != null &&
    volumeRatio <= 0.9 &&
    dayReturn > 0 &&
    (lowerShadowRatio >= 0.25 || dayReturn >= 0.005) &&
    maSupport
  ) {
    return {
      scenario: 'pullback_stabilize',
      scenarioName: '缩量回踩企稳反弹',
      matchedRule: `回撤=${toPercent(pullbackFromHigh20).toFixed(1)}%∈[8,25]%且量比≤0.9且收涨企稳`,
      features,
    };
  }

  if (
    pullbackFromHigh20 != null &&
    pullbackFromHigh20 >= 0.08 &&
    dayReturn > 0 &&
    volumeRatio != null &&
    volumeRatio > 1.0 &&
    maSupport
  ) {
    return {
      scenario: 'pullback_with_volume',
      scenarioName: '回撤后放量企稳',
      matchedRule: `回撤=${toPercent(pullbackFromHigh20).toFixed(1)}%≥8%且放量收涨`,
      features,
    };
  }

  const deepDrop = (ret10 != null && ret10 <= -0.12) || (ret20 != null && ret20 <= -0.18);
  if (deepDrop && dayReturn >= 0.03 && volumeRatio != null && volumeRatio >= 1.2) {
    return {
      scenario: 'oversold_bounce',
      scenarioName: '超跌强反',
      matchedRule: `超跌后当日涨=${toPercent(dayReturn).toFixed(1)}%≥3%且量比=${volumeRatio.toFixed(2)}≥1.2`,
      features,
    };
  }

  const mildDay = dayReturn < 0.01;
  const basePosition =
    aboveMa10 ||
    nearMa20 ||
    (pullbackFromHigh20 != null && pullbackFromHigh20 >= 0.05 && pullbackFromHigh20 <= 0.15);
  if (mildDay && basePosition) {
    return {
      scenario: 'weak_base',
      scenarioName: '弱势蓄势',
      matchedRule: `当日涨跌=${toPercent(dayReturn).toFixed(1)}%<1%且处于均线/回撤中继位置`,
      features,
    };
  }

  return {
    scenario: 'other',
    scenarioName: '未归类',
    matchedRule: '未命中既有场景规则',
    features,
  };
}

export function scanHistoricalBuyPoints(
  histories: StockHistoryRecord[],
  options: { minHitCount?: number; threshold?: number; includeOther?: boolean } = {}
): BuyPointSignal[] {
  const minHitCount = options.minHitCount ?? 3;
  const threshold = options.threshold ?? 5;
  const includeOther = options.includeOther ?? true;
  const signals: BuyPointSignal[] = [];

  histories.forEach((history) => {
    const lines = history.dailyLines || [];
    for (let i = 0; i < lines.length - 1; i++) {
      const returns = calculateFutureReturns(lines, i);
      const hitCount = countReturnHits(returns, threshold);
      if (hitCount < minHitCount) continue;

      const classified = classifyOneDay(lines, i);
      if (!includeOther && classified.scenario === 'other') continue;
      signals.push({
        ...classified,
        code: history.code,
        name: history.name,
        industry: history.industry || null,
        date: formatKlineDate(lines[i].time),
        timestamp: lines[i].time,
        entryPrice: Number(lines[i].close.toFixed(4)),
        hitCount,
        returns,
      });
    }
  });

  return signals;
}

export function scanLatestScenarioSignals(
  histories: StockHistoryRecord[],
  options: { highLiftOnly?: boolean; asOfDate?: string } = {}
): LatestScenarioSignal[] {
  const highLiftOnly = options.highLiftOnly ?? true;
  const asOfDate = options.asOfDate;
  const signals: LatestScenarioSignal[] = [];

  histories.forEach((history) => {
    let lines = history.dailyLines || [];
    if (lines.length < 2) return;

    if (asOfDate) {
      const truncated = truncateKLinesToAsOfDate(lines, asOfDate);
      if (truncated.length < 2) return;
      // 截止日当天无 K 线（停牌/缺数据）则跳过
      if (formatKLineDate(truncated[truncated.length - 1].time) !== asOfDate) return;
      lines = truncated;
    }

    const index = lines.length - 1;
    const classified = classifyOneDay(lines, index);
    const highLift = HIGH_LIFT_SCENARIOS.find((s) => s.id === classified.scenario);
    if (highLiftOnly && !highLift) return;

    signals.push({
      ...classified,
      code: history.code,
      name: history.name,
      industry: history.industry || null,
      date: formatKlineDate(lines[index].time),
      timestamp: lines[index].time,
      close: lines[index].close,
      lift: highLift?.lift,
      returns: calculateFutureReturns(lines, index),
    });
  });

  return signals;
}
