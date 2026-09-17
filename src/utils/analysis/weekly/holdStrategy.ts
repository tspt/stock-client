/**
 * 周线持仓回测：当周收盘成交，锁仓 2 周，最长 6 周，行业上限，弱市不新开。
 */

import type { KLineData } from '@/types/stock';
import { DEFAULT_WEEKLY_CONFIG } from './factors';
import { startOfWeek } from './math';
import { buildWeeklyPanel, snapshotAt, type WeeklyPanel } from './panel';
import { createWeeklyScorer } from './score';
import { industryKeyOf, pickByIndustryCap } from './select';
import {
  WEEKLY_HOLD_DEFAULTS,
  type WeeklyAnalysis,
  type WeeklyConfig,
  type WeeklyFactors,
} from './types';

export interface HoldPositionView {
  code: string;
  name: string;
  industryCode: string;
  industryName: string;
  score: number;
  scoreRank?: number;
  ret13wSkip1?: number;
  ret1w?: number;
  heldWeeks: number;
  minHoldWeeks: number;
  maxHoldWeeks: number;
  action: '新开' | '持有' | '可卖' | '到期退出';
  overheated: boolean;
}

export interface HoldStrategyResult {
  stockCount: number;
  weeks: number;
  totalReturnPct: number;
  annualizedPct: number;
  maxDrawdownPct: number;
  benchReturnPct: number;
  excessReturnPct: number;
  excessMaxDrawdownPct: number;
  calmar: number;
  trades: number;
  winRate: number;
  avgHoldWeeks: number;
  avgPositions: number;
  defenseWeeks: number;
  defenseMode: boolean;
  runningWeek: boolean;
  equityCurve: number[];
  benchCurve: number[];
  currentPositions: HoldPositionView[];
  watchlist: HoldPositionView[];
  industryExposure: Array<{ name: string; count: number }>;
  warnings: string[];
}

export interface HoldStrategyOptions {
  industries?: Map<string, { code: string; name: string }>;
  minLiquidity?: number;
  maxHoldings?: number;
  maxPerIndustry?: number;
  minHoldWeeks?: number;
  maxHoldWeeks?: number;
  exitScoreRank?: number;
  defenseBreadth?: number;
  costPct?: number;
  initialCapital?: number;
  maxLookbackWeeks?: number;
  config?: WeeklyConfig;
  /** 本周是否未收盘：为 true 时名单仅作预览，不把未完成周当作成交周 */
  runningWeek?: boolean;
}

interface Position {
  pi: number;
  entryIndex: number;
  entryPrice: number;
  shares: number;
}

function maxDrawdownOf(curve: number[]): number {
  let peak = curve[0] ?? 1;
  let maxDD = 0;
  curve.forEach((v) => {
    if (v > peak) peak = v;
    if (peak > 0) {
      const dd = ((peak - v) / peak) * 100;
      if (dd > maxDD) maxDD = dd;
    }
  });
  return maxDD;
}

function isLimitUpWeek(p: WeeklyPanel, i: number): boolean {
  const close = p.close[i];
  const high = p.high[i];
  const ret1 = p.ret1w[i];
  if (!Number.isFinite(close) || !Number.isFinite(high) || high <= 0) return false;
  return (ret1 ?? 0) >= 9.5 && close >= high * 0.995;
}

function volumeGap8(p: WeeklyPanel, i: number): boolean {
  const from = Math.max(0, i - 7);
  for (let j = from; j <= i; j += 1) {
    if (!p.volume[j] || p.volume[j] <= 0) return true;
  }
  return false;
}

function actionOf(held: number, minHold: number, maxHold: number, shouldExit: boolean): HoldPositionView['action'] {
  if (held <= 0) return '新开';
  if (held >= maxHold) return '到期退出';
  if (held >= minHold && shouldExit) return '可卖';
  return '持有';
}

function viewFrom(
  f: WeeklyFactors,
  heldWeeks: number,
  minHold: number,
  maxHold: number,
  shouldExit: boolean,
  scoreRank?: number
): HoldPositionView {
  return {
    code: f.code,
    name: f.name,
    industryCode: f.industryCode ?? '',
    industryName: f.industryName ?? '未知',
    score: 0,
    scoreRank,
    ret13wSkip1: f.ret13wSkip1,
    ret1w: f.ret1w,
    heldWeeks,
    minHoldWeeks: minHold,
    maxHoldWeeks: maxHold,
    action: actionOf(heldWeeks, minHold, maxHold, shouldExit),
    overheated: (f.ret1w ?? 0) >= 10,
  };
}

export function backtestHoldStrategy(
  klines: Map<string, KLineData[]>,
  names: Map<string, string>,
  poolCodes: Set<string> | null,
  options: HoldStrategyOptions = {}
): HoldStrategyResult {
  const config = options.config ?? DEFAULT_WEEKLY_CONFIG;
  const minBars = config.minConfirmedBars;
  const minLiq = options.minLiquidity ?? WEEKLY_HOLD_DEFAULTS.minLiquidity;
  const maxHoldings = options.maxHoldings ?? WEEKLY_HOLD_DEFAULTS.maxHoldings;
  const maxPerIndustry = options.maxPerIndustry ?? WEEKLY_HOLD_DEFAULTS.maxPerIndustry;
  const minHold = options.minHoldWeeks ?? WEEKLY_HOLD_DEFAULTS.minHoldWeeks;
  const maxHold = options.maxHoldWeeks ?? WEEKLY_HOLD_DEFAULTS.maxHoldWeeks;
  const exitRank = options.exitScoreRank ?? WEEKLY_HOLD_DEFAULTS.exitScoreRank;
  const defenseBreadth = options.defenseBreadth ?? WEEKLY_HOLD_DEFAULTS.defenseBreadth;
  const cost = (options.costPct ?? 0.15) / 100;
  const initialCapital = options.initialCapital ?? 100;
  const maxLookback = options.maxLookbackWeeks ?? 156;
  const industries = options.industries;
  const runningWeek = options.runningWeek ?? false;

  const empty: HoldStrategyResult = {
    stockCount: 0,
    weeks: 0,
    totalReturnPct: 0,
    annualizedPct: 0,
    maxDrawdownPct: 0,
    benchReturnPct: 0,
    excessReturnPct: 0,
    excessMaxDrawdownPct: 0,
    calmar: 0,
    trades: 0,
    winRate: 0,
    avgHoldWeeks: 0,
    avgPositions: 0,
    defenseWeeks: 0,
    defenseMode: false,
    runningWeek,
    equityCurve: [],
    benchCurve: [],
    currentPositions: [],
    watchlist: [],
    industryExposure: [],
    warnings: [],
  };

  const entries = Array.from(klines.entries()).filter(([code, bars]) => {
    if (poolCodes && !poolCodes.has(code)) return false;
    return bars.length >= minBars + 8;
  });
  if (entries.length < 20) {
    return { ...empty, stockCount: entries.length, warnings: ['有效样本不足，无法回测'] };
  }

  const panels: WeeklyPanel[] = entries.map(([code, bars]) => {
    const sorted = bars.slice().sort((a, b) => a.time - b.time);
    return buildWeeklyPanel(code, names.get(code) ?? '', sorted, config);
  });

  const industryByPi = panels.map((p) => industries?.get(p.code));

  const weekSet = new Set<number>();
  panels.forEach((p) => {
    p.bars.forEach((bar) => weekSet.add(startOfWeek(bar.time)));
  });
  const allWeeks = Array.from(weekSet).sort((a, b) => a - b);
  const weeks = allWeeks.slice(Math.max(0, allWeeks.length - maxLookback));

  const indexAt: Array<Map<number, number>> = panels.map((p) => {
    const map = new Map<number, number>();
    p.bars.forEach((bar, i) => map.set(startOfWeek(bar.time), i));
    return map;
  });

  let cash = initialCapital;
  const positions: Position[] = [];
  const equityCurve: number[] = [];
  const benchCurve: number[] = [];
  let benchNav = 1;
  let trades = 0;
  let wins = 0;
  let totalHoldWeeks = 0;
  let positionSum = 0;
  let defenseWeeks = 0;
  let lastDefense = false;
  let lastWatch: WeeklyAnalysis[] = [];
  const warnings: string[] = [];

  const attachIndustry = (f: WeeklyFactors, pi: number): WeeklyFactors => {
    const ind = industryByPi[pi];
    return {
      ...f,
      industryCode: ind?.code,
      industryName: ind?.name,
    };
  };

  for (const weekTime of weeks) {
    const snapshots: Array<{ pi: number; i: number; f: WeeklyFactors }> = [];
    let aboveMa20 = 0;
    let breadthN = 0;
    let univRetSum = 0;
    let univRetN = 0;

    panels.forEach((p, pi) => {
      const i = indexAt[pi].get(weekTime);
      if (i === undefined || i < minBars) return;
      if (volumeGap8(p, i)) return;
      const f0 = attachIndustry(snapshotAt(p, i), pi);
      const liq = (f0.amount8wMedian ?? f0.avgAmount20w) ?? 0;
      if (liq < minLiq) return;
      snapshots.push({ pi, i, f: f0 });
      breadthN += 1;
      if (f0.pxAboveMa20) aboveMa20 += 1;
      if (f0.ret1w !== undefined) {
        univRetSum += f0.ret1w;
        univRetN += 1;
      }
    });

    const defense = breadthN > 0 ? (aboveMa20 / breadthN) * 100 < defenseBreadth : false;
    if (defense) defenseWeeks += 1;
    lastDefense = defense;

    const univRet = univRetN > 0 ? univRetSum / univRetN / 100 : 0;
    benchNav *= 1 + univRet;
    benchCurve.push(benchNav);

    if (snapshots.length < 10) {
      let equity = cash;
      positions.forEach((pos) => {
        const i = indexAt[pos.pi].get(weekTime);
        if (i === undefined) return;
        const price = panels[pos.pi].close[i];
        if (Number.isFinite(price)) equity += pos.shares * price;
      });
      equityCurve.push(equity / initialCapital);
      positionSum += positions.length;
      continue;
    }

    const scorer = createWeeklyScorer(snapshots.map((s) => s.f), config);
    const scored: WeeklyAnalysis[] = snapshots.map((s) => {
      const core = scorer.score(s.f);
      const score = core?.score ?? 0;
      const rsRank = core?.rsRank ?? 50;
      return {
        ...s.f,
        score,
        rs: core?.rs ?? 0,
        rsRank,
        parts: core?.parts ?? { momentum: 50, lowVol: 50, reversal: 50, crowding: 50 },
        gates: { dataOk: true, liquidity: true, notDowntrend: true, notOverheated: true },
        passed: true,
        signals: [],
        warnings: [],
        insufficientData: false,
      };
    });
    const rankTable = scored.map((r) => r.score).sort((a, b) => a - b);
    const percentile = (score: number): number => {
      if (rankTable.length === 0) return 50;
      let lo = 0;
      let hi = rankTable.length - 1;
      if (score <= rankTable[0]) return 0;
      if (score >= rankTable[hi]) return 100;
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (rankTable[mid] <= score) lo = mid;
        else hi = mid;
      }
      return (lo / (rankTable.length - 1)) * 100;
    };
    scored.forEach((row) => {
      row.scoreRank = percentile(row.score);
    });
    const scoreByPi = new Map<number, WeeklyAnalysis>();
    snapshots.forEach((s, idx) => scoreByPi.set(s.pi, scored[idx]));

    for (let pi = positions.length - 1; pi >= 0; pi -= 1) {
      const pos = positions[pi];
      const i = indexAt[pos.pi].get(weekTime);
      if (i === undefined) continue;
      const p = panels[pos.pi];
      const price = p.close[i];
      if (!Number.isFinite(price) || price <= 0) continue;
      const held = i - pos.entryIndex;
      if (held < minHold) continue;
      if (held >= maxHold) {
        cash += pos.shares * price * (1 - cost);
        if (price > pos.entryPrice) wins += 1;
        trades += 1;
        totalHoldWeeks += held;
        positions.splice(pi, 1);
        continue;
      }
      const row = scoreByPi.get(pos.pi);
      const belowMa8 = Number.isFinite(p.ma8[i]) && price < p.ma8[i];
      const rankLow = row !== undefined && (row.scoreRank ?? 0) < exitRank;
      if (belowMa8 || rankLow) {
        cash += pos.shares * price * (1 - cost);
        if (price > pos.entryPrice) wins += 1;
        trades += 1;
        totalHoldWeeks += held;
        positions.splice(pi, 1);
      }
    }

    lastWatch = pickByIndustryCap(scored, {
      maxPerIndustry,
      maxHoldings,
    });

    if (!defense && positions.length < maxHoldings) {
      let equity = cash;
      positions.forEach((pos) => {
        const i = indexAt[pos.pi].get(weekTime);
        if (i === undefined) return;
        const price = panels[pos.pi].close[i];
        if (Number.isFinite(price)) equity += pos.shares * price;
      });
      const heldIndustry = new Map<string, number>();
      positions.forEach((pos) => {
        const row = scoreByPi.get(pos.pi);
        const key = row ? industryKeyOf(row) : 'unknown';
        heldIndustry.set(key, (heldIndustry.get(key) ?? 0) + 1);
      });

      const fills = pickByIndustryCap(scored, {
        maxPerIndustry,
        maxHoldings: maxHoldings - positions.length,
        excludeCodes: new Set(positions.map((pos) => panels[pos.pi].code)),
      });

      for (const cand of fills) {
        if (positions.length >= maxHoldings) break;
        const snap = snapshots.find((s) => s.f.code === cand.code);
        if (!snap) continue;
        if (isLimitUpWeek(panels[snap.pi], snap.i)) continue;
        const key = industryKeyOf(cand);
        if ((heldIndustry.get(key) ?? 0) >= maxPerIndustry) continue;
        const price = panels[snap.pi].close[snap.i];
        if (!Number.isFinite(price) || price <= 0) continue;
        const slot = Math.min(cash, equity / maxHoldings);
        if (slot < equity * 0.02) continue;
        const shares = slot / price;
        cash -= shares * price * (1 + cost);
        positions.push({ pi: snap.pi, entryIndex: snap.i, entryPrice: price, shares });
        heldIndustry.set(key, (heldIndustry.get(key) ?? 0) + 1);
      }
    }

    let equity = cash;
    positions.forEach((pos) => {
      const i = indexAt[pos.pi].get(weekTime);
      if (i === undefined) return;
      const price = panels[pos.pi].close[i];
      if (Number.isFinite(price)) equity += pos.shares * price;
    });
    equityCurve.push(equity / initialCapital);
    positionSum += positions.length;
  }

  const lastWeek = weeks[weeks.length - 1];
  const currentPositions: HoldPositionView[] = [];
  const exposure = new Map<string, { name: string; count: number }>();
  positions.forEach((pos) => {
    const i = lastWeek !== undefined ? indexAt[pos.pi].get(lastWeek) : undefined;
    const p = panels[pos.pi];
    const held = i !== undefined ? i - pos.entryIndex : 0;
    const snap = i !== undefined ? attachIndustry(snapshotAt(p, i), pos.pi) : undefined;
    const row = lastWatch.find((r) => r.code === p.code);
    const scoreRank = row?.scoreRank;
    const price = i !== undefined ? p.close[i] : 0;
    const belowMa8 = i !== undefined && Number.isFinite(p.ma8[i]) && price < p.ma8[i];
    const rankLow = (scoreRank ?? 100) < exitRank;
    const shouldExit = held >= maxHold || (held >= minHold && (belowMa8 || rankLow));
    const view = viewFrom(
      snap ?? {
        ...snapshotAt(p, p.n - 1),
        industryCode: industryByPi[pos.pi]?.code,
        industryName: industryByPi[pos.pi]?.name,
      },
      held,
      minHold,
      maxHold,
      shouldExit,
      scoreRank
    );
    view.score = row?.score ?? 0;
    view.scoreRank = scoreRank;
    currentPositions.push(view);
    const name = view.industryName || '未知';
    const prev = exposure.get(name);
    exposure.set(name, { name, count: (prev?.count ?? 0) + 1 });
  });

  const heldCodes = new Set(currentPositions.map((p) => p.code));
  const watchlist: HoldPositionView[] = lastWatch.map((row) => {
    const held = currentPositions.find((p) => p.code === row.code);
    if (held) return held;
    const view = viewFrom(row, 0, minHold, maxHold, false, row.scoreRank);
    view.score = row.score;
    view.action = heldCodes.has(row.code) ? '持有' : '新开';
    return view;
  });

  const weeksN = equityCurve.length;
  const finalEquity = equityCurve[weeksN - 1] ?? 1;
  const totalReturnPct = (finalEquity - 1) * 100;
  const annualizedPct = weeksN > 0 ? (Math.pow(finalEquity, 52 / weeksN) - 1) * 100 : 0;
  const maxDrawdownPct = maxDrawdownOf(equityCurve);
  const benchReturnPct = ((benchCurve[benchCurve.length - 1] ?? 1) - 1) * 100;
  const excessCurve = equityCurve.map((v, i) => {
    const b = benchCurve[i] || 1;
    return b > 0 ? v / b : v;
  });
  const excessReturnPct = totalReturnPct - benchReturnPct;
  const excessMaxDrawdownPct = maxDrawdownOf(excessCurve);

  if (runningWeek) {
    warnings.push('本周周K尚未收盘：名单为预览，回测成交只用已收盘周');
  }

  return {
    stockCount: panels.length,
    weeks: weeksN,
    totalReturnPct,
    annualizedPct,
    maxDrawdownPct,
    benchReturnPct,
    excessReturnPct,
    excessMaxDrawdownPct,
    calmar: maxDrawdownPct > 0 ? annualizedPct / maxDrawdownPct : 0,
    trades,
    winRate: trades > 0 ? (wins / trades) * 100 : 0,
    avgHoldWeeks: trades > 0 ? totalHoldWeeks / trades : 0,
    avgPositions: weeksN > 0 ? positionSum / weeksN : 0,
    defenseWeeks,
    defenseMode: lastDefense,
    runningWeek,
    equityCurve,
    benchCurve,
    currentPositions,
    watchlist,
    industryExposure: Array.from(exposure.values()).sort((a, b) => b.count - a.count),
    warnings,
  };
}
