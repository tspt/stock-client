/**
 * 周线评分：中期动量 + 低波动 + 近 1 周过热惩罚 + 拥挤惩罚
 *
 * 持有期约 2–6 周，分数是池内分位加权，含义是「当前市场池里排第几」。
 */

import {
  buildRankTable,
  clamp,
  percentileOfSorted,
} from './math';
import { DEFAULT_WEEKLY_CONFIG } from './factors';
import { WEEKLY_HOLD_DEFAULTS } from './types';
import type {
  WeeklyAnalysis,
  WeeklyConfig,
  WeeklyFactors,
  WeeklyGates,
  WeeklyScoreParts,
} from './types';

function riskPenalty(
  f: WeeklyFactors,
  config: WeeklyConfig
): { penalty: number; warnings: string[] } {
  const warnings: string[] = [];
  let penalty = 0;

  if (f.quality.suspectedGaps > config.maxSuspectedGaps) {
    penalty += 10;
    warnings.push('检测到异常跳空，数据可能未复权，结果仅供参考');
  }
  if (f.ret1w !== undefined && f.ret1w >= 15) {
    penalty += 8;
    warnings.push(`近 1 周涨幅 ${f.ret1w.toFixed(1)}%，过热`);
  }
  if (f.amountCrowd8w !== undefined && f.amountCrowd8w >= 3) {
    penalty += 6;
    warnings.push('本周成交额相对近 8 周中位数显著放大，拥挤');
  }
  return { penalty, warnings };
}

function buildSignals(f: WeeklyFactors): string[] {
  const out: string[] = [];
  if (f.ret13wSkip1 !== undefined && f.ret13wSkip1 > 0) out.push('中期动量为正');
  if (f.ret1w !== undefined && f.ret1w < 0) out.push('近 1 周回踩');
  if (f.pxAboveMa8) out.push('站上周MA8');
  if (f.vol13w !== undefined && f.vol13w < 6) out.push('波动偏低');
  return out;
}

function emptyAnalysis(f: WeeklyFactors): WeeklyAnalysis {
  return {
    ...f,
    score: 0,
    parts: { momentum: 0, lowVol: 0, reversal: 0, crowding: 0 },
    gates: { dataOk: false, liquidity: false, notDowntrend: true, notOverheated: true },
    passed: false,
    signals: [],
    warnings: f.quality.reasons.slice(),
    insufficientData: true,
  };
}

export interface WeeklyScoreCore {
  score: number;
  rsRank: number;
  rs: number;
  parts: WeeklyScoreParts;
}

export interface WeeklyScorer {
  validCount: number;
  score(f: WeeklyFactors): WeeklyScoreCore | null;
}

export function createWeeklyScorer(
  factors: WeeklyFactors[],
  config: WeeklyConfig = DEFAULT_WEEKLY_CONFIG
): WeeklyScorer {
  const valid = factors.filter((f) => f.quality.ok);
  if (valid.length < 10) {
    return { validCount: valid.length, score: () => null };
  }

  const ret13Table = buildRankTable(valid.map((f) => f.ret13w));
  const ret26Table = buildRankTable(valid.map((f) => f.ret26w));
  const ret52Table = buildRankTable(valid.map((f) => f.ret52w));

  const rsRaw = new Map<string, number>();
  valid.forEach((f) => {
    const p13 = f.ret13w === undefined ? 50 : percentileOfSorted(ret13Table, f.ret13w);
    const p26 = f.ret26w === undefined ? 50 : percentileOfSorted(ret26Table, f.ret26w);
    const p52 = f.ret52w === undefined ? 50 : percentileOfSorted(ret52Table, f.ret52w);
    const rs = 0.25 * (p13 - 50) + 0.5 * (p26 - 50) + 0.25 * (p52 - 50);
    rsRaw.set(f.code, rs);
  });
  const rsTable = buildRankTable(valid.map((f) => rsRaw.get(f.code) ?? 0));

  const momTable = buildRankTable(valid.map((f) => f.ret13wSkip1));
  const volTable = buildRankTable(valid.map((f) => f.vol13w));
  const ret1Table = buildRankTable(valid.map((f) => f.ret1w));
  const crowdTable = buildRankTable(valid.map((f) => f.amountCrowd8w));
  const w = config.weights;

  return {
    validCount: valid.length,
    score(f) {
      if (!f.quality.ok) return null;

      const rs = rsRaw.get(f.code) ?? 0;
      const rsRank = percentileOfSorted(rsTable, rs);

      const momentum =
        f.ret13wSkip1 === undefined ? 50 : percentileOfSorted(momTable, f.ret13wSkip1);
      const lowVol =
        f.vol13w === undefined ? 50 : 100 - percentileOfSorted(volTable, f.vol13w);
      const reversal =
        f.ret1w === undefined ? 50 : 100 - percentileOfSorted(ret1Table, f.ret1w);
      const crowding =
        f.amountCrowd8w === undefined
          ? 50
          : 100 - percentileOfSorted(crowdTable, f.amountCrowd8w);

      const parts: WeeklyScoreParts = {
        momentum: clamp(momentum, 0, 100),
        lowVol: clamp(lowVol, 0, 100),
        reversal: clamp(reversal, 0, 100),
        crowding: clamp(crowding, 0, 100),
      };

      const weighted =
        parts.momentum * w.momentum +
        parts.lowVol * w.lowVol +
        parts.reversal * w.reversal +
        parts.crowding * w.crowding;

      const { penalty } = riskPenalty(f, config);
      return {
        score: Math.round(clamp(weighted - penalty, 0, 100)),
        rsRank,
        rs,
        parts,
      };
    },
  };
}

function liquidityOk(f: WeeklyFactors, minAmount: number): boolean {
  const amt = f.amount8wMedian ?? f.avgAmount20w;
  return amt !== undefined && amt >= minAmount;
}

/**
 * 对一批因子做横截面评分。
 */
export function scoreWeeklyFactors(
  factors: WeeklyFactors[],
  config: WeeklyConfig = DEFAULT_WEEKLY_CONFIG,
  minAmount: number = WEEKLY_HOLD_DEFAULTS.minLiquidity
): WeeklyAnalysis[] {
  const valid = factors.filter((f) => f.quality.ok);

  if (valid.length < 10) {
    return factors.map((f) => emptyAnalysis(f));
  }

  const scorer = createWeeklyScorer(factors, config);
  const scored = factors.map((f) => {
    if (!f.quality.ok) return emptyAnalysis(f);

    const core = scorer.score(f);
    if (!core) return emptyAnalysis(f);
    const { score, rsRank, rs, parts } = core;
    const { warnings } = riskPenalty(f, config);
    const liq = liquidityOk(f, minAmount);

    const gates: WeeklyGates = {
      dataOk: f.quality.ok,
      liquidity: liq,
      notDowntrend: true,
      notOverheated: !(f.ret1w !== undefined && f.ret1w >= 20),
    };

    return {
      ...f,
      score,
      rs,
      rsRank,
      parts,
      gates,
      passed: gates.dataOk && gates.liquidity,
      signals: buildSignals(f),
      warnings,
      insufficientData: false,
    };
  });

  const rankTable = buildRankTable(
    scored.filter((r) => !r.insufficientData).map((r) => r.score)
  );
  return scored.map((row) => {
    if (row.insufficientData) return row;
    return {
      ...row,
      scoreRank: percentileOfSorted(rankTable, row.score),
    };
  });
}
