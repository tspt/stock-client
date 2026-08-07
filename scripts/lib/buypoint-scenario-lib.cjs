/**
 * 买点场景规则库（历史归类与最新日判别共用）
 * 规则只使用 lines[0..i]，不偷看未来。
 */

const SCENARIOS = [
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

/** 对照 lift>1，优先作为可交易信号场景 */
const HIGH_LIFT_SCENARIOS = [
  { id: 'limit_up_trend', name: '连板/强趋势', lift: 3.18 },
  { id: 'volume_breakout', name: '放量突破续涨', lift: 1.847 },
  { id: 'soft_breakout', name: '温和过前高', lift: 1.814 },
  { id: 'trend_continuation', name: '趋势中继', lift: 1.577 },
  { id: 'volume_mid_thrust', name: '中部放量启动', lift: 1.298 },
];

const HIGH_LIFT_IDS = new Set(HIGH_LIFT_SCENARIOS.map((s) => s.id));

function fmtDate(ts) {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}/${m}/${day}`;
}

function mean(arr) {
  if (!arr.length) return null;
  let s = 0;
  for (const v of arr) s += v;
  return s / arr.length;
}

/**
 * 仅使用 lines[0..i] 计算特征与场景
 */
function classifyOneDay(lines, i) {
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

  const volWindow = [];
  for (let k = Math.max(0, i - 5); k < i; k++) {
    volWindow.push(lines[k].volume || 0);
  }
  const volMa5 = mean(volWindow);
  const volumeRatio = volMa5 && volMa5 > 0 ? volume / volMa5 : null;

  function ma(period) {
    if (i + 1 < period) return null;
    let s = 0;
    for (let k = i - period + 1; k <= i; k++) s += lines[k].close;
    return s / period;
  }
  const ma10 = ma(10);
  const ma20 = ma(20);

  let high20Prev = null;
  if (i >= 1) {
    high20Prev = -Infinity;
    for (let k = Math.max(0, i - 20); k < i; k++) {
      if (lines[k].high > high20Prev) high20Prev = lines[k].high;
    }
    if (high20Prev === -Infinity) high20Prev = null;
  }

  let high20Incl = close;
  for (let k = Math.max(0, i - 19); k <= i; k++) {
    if (lines[k].high > high20Incl) high20Incl = lines[k].high;
  }
  const pullbackFromHigh20 =
    high20Incl > 0 ? (high20Incl - close) / high20Incl : null;

  let ret3 = null;
  if (i >= 3 && lines[i - 3].close > 0) {
    ret3 = (close - lines[i - 3].close) / lines[i - 3].close;
  }

  let limitUpCount5 = 0;
  for (let k = Math.max(1, i - 4); k <= i; k++) {
    const pc = lines[k - 1].close;
    if (!pc) continue;
    const r = (lines[k].close - pc) / pc;
    if (r >= 0.095) limitUpCount5++;
  }

  let ret10 = null;
  if (i >= 10 && lines[i - 10].close > 0) {
    ret10 = (close - lines[i - 10].close) / lines[i - 10].close;
  }
  let ret20 = null;
  if (i >= 20 && lines[i - 20].close > 0) {
    ret20 = (close - lines[i - 20].close) / lines[i - 20].close;
  }

  const nearHigh20 =
    high20Prev != null && high20Prev > 0 ? close >= high20Prev * 0.99 : false;
  const aboveMa10 = ma10 != null ? close >= ma10 : false;
  const nearMa20 =
    ma20 != null && ma20 > 0 ? Math.abs(close - ma20) / ma20 <= 0.05 : false;

  const features = {
    dayReturn: Number((dayReturn * 100).toFixed(2)),
    volumeRatio: volumeRatio == null ? null : Number(volumeRatio.toFixed(2)),
    lowerShadowRatio: Number(lowerShadowRatio.toFixed(3)),
    bodyRatio: Number(bodyRatio.toFixed(3)),
    pullbackFromHigh20:
      pullbackFromHigh20 == null ? null : Number((pullbackFromHigh20 * 100).toFixed(2)),
    ret3: ret3 == null ? null : Number((ret3 * 100).toFixed(2)),
    ret10: ret10 == null ? null : Number((ret10 * 100).toFixed(2)),
    ret20: ret20 == null ? null : Number((ret20 * 100).toFixed(2)),
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
          : `近3日累计涨幅=${(ret3 * 100).toFixed(1)}%≥20%`,
      features,
    };
  }

  if (
    nearHigh20 &&
    volumeRatio != null &&
    volumeRatio >= 1.5 &&
    dayReturn >= 0.02
  ) {
    return {
      scenario: 'volume_breakout',
      scenarioName: '放量突破续涨',
      matchedRule: `接近/突破近20日高点且量比=${volumeRatio.toFixed(2)}≥1.5且当日涨幅=${(dayReturn * 100).toFixed(1)}%≥2%`,
      features,
    };
  }

  if (
    nearHigh20 &&
    volumeRatio != null &&
    volumeRatio >= 1.0 &&
    volumeRatio < 1.5 &&
    dayReturn >= 0.01
  ) {
    return {
      scenario: 'soft_breakout',
      scenarioName: '温和过前高',
      matchedRule: `近20日高且量比=${volumeRatio.toFixed(2)}∈[1.0,1.5)且当日涨幅=${(dayReturn * 100).toFixed(1)}%≥1%`,
      features,
    };
  }

  if (
    !nearHigh20 &&
    volumeRatio != null &&
    volumeRatio >= 1.5 &&
    dayReturn >= 0.02
  ) {
    return {
      scenario: 'volume_mid_thrust',
      scenarioName: '中部放量启动',
      matchedRule: `未近20日高且量比=${volumeRatio.toFixed(2)}≥1.5且当日涨幅=${(dayReturn * 100).toFixed(1)}%≥2%`,
      features,
    };
  }

  if (
    ret3 != null &&
    ret3 >= 0.05 &&
    ret3 < 0.2 &&
    limitUpCount5 < 2 &&
    dayReturn >= 0
  ) {
    return {
      scenario: 'trend_continuation',
      scenarioName: '趋势中继',
      matchedRule: `近3日累计=${(ret3 * 100).toFixed(1)}%∈[5,20)且当日不跌`,
      features,
    };
  }

  const volShrink = volumeRatio != null && volumeRatio <= 0.9;
  const maSupport = nearMa20 || aboveMa10;
  if (
    pullbackFromHigh20 != null &&
    pullbackFromHigh20 >= 0.08 &&
    pullbackFromHigh20 <= 0.25 &&
    volShrink &&
    dayReturn > 0 &&
    (lowerShadowRatio >= 0.25 || dayReturn >= 0.005) &&
    maSupport
  ) {
    return {
      scenario: 'pullback_stabilize',
      scenarioName: '缩量回踩企稳反弹',
      matchedRule: `回撤=${(pullbackFromHigh20 * 100).toFixed(1)}%∈[8,25]%且量比≤0.9且收涨企稳`,
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
      matchedRule: `回撤=${(pullbackFromHigh20 * 100).toFixed(1)}%≥8%且放量收涨`,
      features,
    };
  }

  const deepDrop =
    (ret10 != null && ret10 <= -0.12) || (ret20 != null && ret20 <= -0.18);
  if (
    deepDrop &&
    dayReturn >= 0.03 &&
    volumeRatio != null &&
    volumeRatio >= 1.2
  ) {
    return {
      scenario: 'oversold_bounce',
      scenarioName: '超跌强反',
      matchedRule: `超跌后当日涨=${(dayReturn * 100).toFixed(1)}%≥3%且量比=${volumeRatio.toFixed(2)}≥1.2`,
      features,
    };
  }

  const mildDay = dayReturn < 0.01;
  const basePosition =
    aboveMa10 ||
    nearMa20 ||
    (pullbackFromHigh20 != null &&
      pullbackFromHigh20 >= 0.05 &&
      pullbackFromHigh20 <= 0.15);
  if (mildDay && basePosition) {
    return {
      scenario: 'weak_base',
      scenarioName: '弱势蓄势',
      matchedRule: `当日涨跌=${(dayReturn * 100).toFixed(1)}%<1%且处于均线/回撤中继位置`,
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

function isHighLiftScenario(scenarioId) {
  return HIGH_LIFT_IDS.has(scenarioId);
}

module.exports = {
  SCENARIOS,
  HIGH_LIFT_SCENARIOS,
  HIGH_LIFT_IDS,
  fmtDate,
  classifyOneDay,
  isHighLiftScenario,
};
