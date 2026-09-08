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
  upperShadowRatio?: number;
  bodyRatio?: number;
  closeStrength?: number;
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
  d4: number | null;
  d5: number | null;
  d6: number | null;
  d10?: number | null;
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
  oddsScore?: number;
  oddsTier?: 'S' | 'A' | 'B' | 'C';
  oddsReason?: string;
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
  { id: 'volume_mid_thrust', name: '中部放量启动', lift: 1.88 },
  { id: 'trend_continuation', name: '趋势中继', lift: 1.58 },
  { id: 'pullback_stabilize', name: '缩量回踩企稳反弹', lift: 1.42 },
];

export const HIGH_LIFT_IDS = new Set(HIGH_LIFT_SCENARIOS.map((s) => s.id));

const SCENARIO_ODDS_BASE: Record<ScenarioId, number> = {
  limit_up_trend: 75,
  trend_continuation: 64,
  volume_mid_thrust: 62,
  pullback_stabilize: 58,
  pullback_with_volume: 48,
  oversold_bounce: 45,
  weak_base: 38,
  volume_breakout: 26,
  soft_breakout: 18,
  other: 20,
};

const HORIZONS: Array<{ key: keyof ReturnSnapshot; days: number }> = [
  { key: 'd1', days: 1 },
  { key: 'd2', days: 2 },
  { key: 'd3', days: 3 },
  { key: 'd4', days: 4 },
  { key: 'd5', days: 5 },
  { key: 'd6', days: 6 },
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

function clampScore(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score)));
}

function resolveOddsTier(score: number): 'S' | 'A' | 'B' | 'C' {
  if (score >= 88) return 'S';
  if (score >= 74) return 'A';
  if (score >= 58) return 'B';
  return 'C';
}

function pushReason(reasons: string[], text: string): void {
  if (!reasons.includes(text)) {
    reasons.push(text);
  }
}

export function getLatestSignalOdds(classified: ClassifiedScenario): Pick<
  LatestScenarioSignal,
  'oddsScore' | 'oddsTier' | 'oddsReason'
> {
  const features = classified.features || {};
  let score = SCENARIO_ODDS_BASE[classified.scenario] ?? 20;
  const reasons: string[] = [];

  const dayReturn = features.dayReturn;
  if (dayReturn != null) {
    if (dayReturn >= 7) {
      score += 18;
      pushReason(reasons, '当日动能很强');
    } else if (dayReturn >= 5) {
      score += 13;
      pushReason(reasons, '当日动能偏强');
    } else if (dayReturn >= 2) {
      score += 7;
      pushReason(reasons, '当日延续上涨');
    } else if (dayReturn < 0) {
      score -= 16;
      pushReason(reasons, '当日转弱');
    } else {
      score -= 6;
      pushReason(reasons, '当日动能一般');
    }
  }

  if (features.aboveMa10 === true) {
    score += 4;
    pushReason(reasons, '仍站在10日线之上');
  } else if (features.aboveMa10 === false) {
    score -= 12;
    pushReason(reasons, '跌回10日线下');
  }

  if (features.nearHigh20 === true) {
    if (classified.scenario === 'soft_breakout' || classified.scenario === 'volume_breakout') {
      score -= 12;
      pushReason(reasons, '接近前高但容易追高');
    } else {
      score += 2;
      pushReason(reasons, '处于相对强势位置');
    }
  } else if (
    features.nearHigh20 === false &&
    (classified.scenario === 'limit_up_trend' || classified.scenario === 'trend_continuation')
  ) {
    score += 8;
    pushReason(reasons, '不贴前高，仍有上攻空间');
  }

  const volumeRatio = features.volumeRatio;
  if (volumeRatio != null) {
    if (classified.scenario === 'soft_breakout') {
      if (volumeRatio >= 1 && volumeRatio < 1.5) {
        score -= 8;
        pushReason(reasons, '温和放量突破赔率偏低');
      } else if (volumeRatio >= 1.5) {
        score -= 4;
      }
    } else if (classified.scenario === 'volume_breakout') {
      if (volumeRatio >= 1.5 && volumeRatio < 2.5) {
        score -= 7;
        pushReason(reasons, '突破放量但承接一般');
      } else if (volumeRatio >= 2.5) {
        score -= 3;
      }
    } else if (classified.scenario === 'volume_mid_thrust') {
      if (volumeRatio >= 1.5 && volumeRatio < 2.5) {
        score += 4;
        pushReason(reasons, '中部放量启动较健康');
      } else if (volumeRatio >= 2.5) {
        score -= 5;
        pushReason(reasons, '放量过猛需防分歧');
      }
    } else if (classified.scenario === 'limit_up_trend' || classified.scenario === 'trend_continuation') {
      if (volumeRatio < 1) {
        score += 8;
        pushReason(reasons, '缩量延续更利于赔率');
      } else if (volumeRatio >= 2.5) {
        score -= 4;
        pushReason(reasons, '爆量后次日分歧风险偏高');
      }
    }
  }

  const closeStrength = features.closeStrength;
  if (closeStrength != null) {
    if (closeStrength >= 0.75) {
      score += 6;
      pushReason(reasons, '收盘靠近日内高位');
    } else if (closeStrength <= 0.45) {
      score -= 8;
      pushReason(reasons, '收盘偏弱');
    }
  }

  const upperShadowRatio = features.upperShadowRatio;
  if (upperShadowRatio != null && upperShadowRatio >= 0.35) {
    score -= 8;
    pushReason(reasons, '上影较重');
  }

  const limitUpCount5 = features.limitUpCount5;
  if (classified.scenario === 'limit_up_trend' && typeof limitUpCount5 === 'number') {
    if (limitUpCount5 >= 3) {
      score += 8;
      pushReason(reasons, '短线连板龙头主升');
    } else if (limitUpCount5 === 2) {
      if (dayReturn != null && dayReturn >= 5) {
        score += 8;
        pushReason(reasons, '2板加速确立主升');
      } else if (dayReturn != null && dayReturn < 0) {
        score -= 12;
        pushReason(reasons, '连板后转弱分歧');
      }
    }
  }

  // 方案C 通道1: 首板/首阳启动前移买点（前期平稳蓄势，当天首根放量启动阳线）
  const ret3 = features.ret3;
  if (limitUpCount5 === 1 && dayReturn != null && dayReturn >= 7) {
    if (ret3 != null && ret3 <= 15) {
      score += 15;
      pushReason(reasons, '首板突破第一买点');
    }
  } else if (classified.scenario === 'volume_mid_thrust') {
    if (ret3 != null && ret3 <= 8 && dayReturn != null && dayReturn >= 4) {
      score += 10;
      pushReason(reasons, '低位首阳放量起爆');
    }
  }

  // 方案C 排雷1: 买点偏晚排雷（前3天涨幅透支过大但当天动能衰竭滞涨）
  if (ret3 != null && ret3 >= 18 && dayReturn != null && dayReturn < 3) {
    score -= 16;
    pushReason(reasons, '前期涨幅过大短线滞涨');
  }

  // 方案C 排雷2: 假突破与冲高受阻严重排雷
  if (features.nearHigh20 === true) {
    if (upperShadowRatio != null && upperShadowRatio >= 0.28) {
      score -= 14;
      pushReason(reasons, '逼近前高但受阻明显');
    }
  }

  if (classified.scenario === 'trend_continuation' && ret3 != null) {
    if (ret3 >= 10 && ret3 < 18) {
      score += 6;
      pushReason(reasons, '3日趋势斜率适中健康');
    } else if (ret3 < 7) {
      score -= 6;
      pushReason(reasons, '3日趋势动能偏弱');
    }
  }

  // 方案二：主升龙头确定性溢价加分（近5日有板且当日强阳收高）
  if (limitUpCount5 != null && limitUpCount5 >= 1 && dayReturn != null && dayReturn >= 3 && (upperShadowRatio == null || upperShadowRatio <= 0.2)) {
    score += 8;
    pushReason(reasons, '龙头主升动能强劲');
  }

  // 方案一：硬核动能门槛一票否决——坚决清洗平庸滞涨股
  // 1. 当日涨幅不足2% 或 3日动能疲软(<7%)，绝不允许流入 A 档（A档阈值为74分，限制最高不超过73分流入B档）
  if ((dayReturn == null || dayReturn < 2) || (ret3 == null || ret3 < 7)) {
    if (score >= 74) {
      score = 73;
      pushReason(reasons, '动能不足降级');
    }
  }
  // 2. 当日收跌且无近5日涨停支撑，限制最高不超过57分（降为C档）
  if (dayReturn != null && dayReturn < 0 && (limitUpCount5 == null || limitUpCount5 === 0)) {
    if (score >= 58) {
      score = 57;
      pushReason(reasons, '收跌走弱降级');
    }
  }

  const oddsScore = clampScore(score);
  const oddsTier = resolveOddsTier(oddsScore);
  const oddsReason = reasons.slice(-3).join(' / ') || reasons.slice(0, 3).join(' / ') || '场景基础赔率';

  return { oddsScore, oddsTier, oddsReason };
}

export function calculateFutureReturns(lines: KLineData[], index: number): ReturnSnapshot {
  const entry = lines[index]?.close;
  const returns: ReturnSnapshot = { d1: null, d2: null, d3: null, d4: null, d5: null, d6: null };
  if (!entry || entry <= 0) return returns;

  HORIZONS.forEach((h) => {
    const target = lines[index + h.days];
    if (!target || target.close == null) return;
    returns[h.key] = toPercent((target.close - entry) / entry);
  });

  return returns;
}

export function countReturnHits(returns: ReturnSnapshot, threshold = 5): number {
  return Object.values(returns).filter((v) => v != null && v >= threshold).length;
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
  const upperShadowRatio = range > 0 ? (high - Math.max(open, close)) / range : 0;
  const bodyRatio = range > 0 ? Math.abs(close - open) / range : 0;
  const closeStrength = range > 0 ? (close - low) / range : 0;
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
    upperShadowRatio: Number(upperShadowRatio.toFixed(3)),
    bodyRatio: Number(bodyRatio.toFixed(3)),
    closeStrength: Number(closeStrength.toFixed(3)),
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
  const minHitCount = options.minHitCount ?? 2;
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
    const odds = getLatestSignalOdds(classified);

    signals.push({
      ...classified,
      ...odds,
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
