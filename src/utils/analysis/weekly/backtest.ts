/**
 * 六大战法历史回测
 *
 * 目的：用同一批「已收盘周K」，统计每个战法历史上出现类似信号之后的表现
 * （胜率、平均收益、盈亏比、最大浮亏、离场原因），回答
 * 「哪种战法胜率更高、适合持有 2-4 周」。
 *
 * 三条硬约束，与 factors.ts / panel.ts 保持一致：
 * 1. 信号只读 index <= i 的数据，绝不使用未来信息；
 * 2. 战法判定直接复用 detectSetups、离场复用 detectExitSignals，
 *    保证「回测跑的逻辑」与「页面显示的逻辑」是同一份实现；
 * 3. 入场取「信号次周开盘价」、出场取持有期末收盘价。
 *    不按信号当周收盘价成交，避免「本周收盘才知道信号、却按本周收盘价买入」的隐性前视。
 *
 * 样本独立性：同一只票、同一个战法，上一笔未离场前不会重复计数，
 * 否则一段连续三周的形态会变成三笔高度重叠的样本，把胜率稀释成假象。
 */

import type { KLineData } from '@/types/stock';
import { DEFAULT_WEEKLY_CONFIG, splitConfirmedWeeklyKlines } from './factors';
import { buildWeeklyPanel, type WeeklyPanel } from './panel';
import { detectSetups, setupGradeOf } from './setups';
import { computeStopLoss, detectExitSignals } from './exitRules';
import { safe } from './math';
import {
  WEEKLY_SETUP_LABELS,
  type SetupKey,
  type WeeklyConfig,
  type WeeklySetupGrade,
} from './types';

/** 战法键的固定顺序，保证统计表行的顺序稳定 */
export const BACKTEST_SETUP_KEYS = Object.keys(WEEKLY_SETUP_LABELS) as SetupKey[];

/** 出场方式 */
export type BacktestExitKind =
  /** 持有到期，收盘卖出 */
  | 'hold'
  /** 命中文档第四章卖出信号，提前当周收盘离场 */
  | 'signal'
  /** 盘中触及止损位 */
  | 'stop';

/** 出场策略 */
export type BacktestExitPolicy =
  /** 固定持有 N 周，到期收盘卖出：最纯粹地衡量「战法本身」 */
  | 'hold'
  /** 每周检查卖出信号，命中即离场：更接近文档第四章的实际操作 */
  | 'signal';

/** 一天的毫秒数：周K日历间隔与上市周数都按自然日换算 */
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * 相邻周K允许的最大日历间隔（天）。
 *
 * 正常为 7 天；春节等长假会让某一周完全没有交易日，接口直接缺一根，间隔可达 14 天，
 * 因此放宽到 21 天。超过它说明中间存在停牌或数据缺口——
 * 此时「相邻下标」并不等于「相邻一周」，「信号次周开盘买入」这条口径不再成立
 * （两个下标实际可能相隔数月，中间的全部涨跌都会被算成一笔样本，制造出 1000% 这种假收益）。
 */
const MAX_BAR_GAP_DAYS = 21;

/**
 * 收益合理区间的容忍倍数。
 *
 * 涨跌停价按「分」取整，小价格股连续涨停的实际复合涨幅会略高于 (1+limit)^n，
 * 故在理论极限上留 5% 余量，避免把真实连板票误判成数据异常。
 */
const RETURN_TOLERANCE_FACTOR = 1.05;

/** 剔除明细的收集上限（超出后不再收集，只计数） */
const MAX_EXCLUDED_SAMPLES = 200;
/** 剔除明细最终展示条数（按收益绝对值从大到小取前 N 条） */
const MAX_EXCLUDED_SAMPLES_SHOWN = 20;

/**
 * 剔除原因。
 *
 * 三类样本都存在「周K不连续或复权异常」，按「信号次周开盘买入」无法真实成交，
 * 留在统计里会把最佳收益 / 平均收益 / 胜率一起拉失真。
 */
export type BacktestExclusionReason =
  /** 上市初期：信号周距序列首根不足指定的自然周数 */
  | 'newStock'
  /** 停牌/缺周：持有窗口内相邻周K的日历间隔超过 MAX_BAR_GAP_DAYS */
  | 'calendarGap'
  /** 收益超出涨跌幅物理极限（含复权缺失导致的跳空） */
  | 'extremeReturn';

export const BACKTEST_EXCLUSION_LABELS: Record<BacktestExclusionReason, string> = {
  newStock: '上市初期',
  calendarGap: '停牌/缺周',
  extremeReturn: '超出涨跌幅极限',
};

/** 被剔除的样本明细：用于人工核对到底是不是新股 / 停牌股 */
export interface WeeklyBacktestExcludedSample {
  code: string;
  name: string;
  /** 信号周时间戳 */
  signalTime: number;
  /** 该笔本应产生的收益（%，仅供核对，不计入统计） */
  returnPct: number;
  reason: BacktestExclusionReason;
}

export interface WeeklyBacktestExclusions {
  /** 被剔除的笔数（按「战法命中」计数，与 trades 同口径） */
  total: number;
  byReason: Record<BacktestExclusionReason, number>;
  /** 明细：按 |收益| 从大到小最多 MAX_EXCLUDED_SAMPLES_SHOWN 条 */
  samples: WeeklyBacktestExcludedSample[];
}

/** 去掉市场前缀，取纯数字代码（周K缓存的 code 可能是 sh600000 / SZ300123） */
function pureCodeOf(code: string): string {
  return code.replace(/^(sh|sz|bj)/i, '');
}

/**
 * 单日涨跌幅限制（%）。
 *
 * 回测池取自 IndexedDB 全量周K缓存，可能混有创业板与 ST，上限各不相同：
 * 主板 10% / 创业板与科创板 20% / 北交所 30% / ST 5%。
 * 统一按 10% 判断会把创业板的真实连板票误杀，所以必须按板块区分。
 */
function dailyLimitPct(code: string, name: string): number {
  if (name.includes('ST')) return 5;
  const pure = pureCodeOf(code);
  if (pure.startsWith('30') || pure.startsWith('68')) return 20;
  if (pure.startsWith('4') || pure.startsWith('8')) return 30;
  return 10;
}

/**
 * 持有窗口的收益理论边界（%）。
 *
 * 入场是「次周开盘」、出场是「末周收盘」，窗口覆盖 weeks 个完整交易周，
 * 按每周 5 个交易日、每日涨跌停复利推算：
 * 主板 2 周 = 1.1^10 − 1 = +159.4%，创业板 = 1.2^10 − 1 = +519.4%。
 * 超出这个边界的收益在物理上不可能出现，只能是缺周或复权异常。
 */
function theoreticalReturnBounds(
  limitPct: number,
  weeks: number
): { maxGain: number; maxLoss: number } {
  const days = Math.max(1, Math.round(weeks * 5));
  const rate = limitPct / 100;
  return {
    maxGain: ((1 + rate) ** days - 1) * 100,
    maxLoss: (1 - (1 - rate) ** days) * 100,
  };
}

/** 区间内相邻周K是否存在超长日历间隔（停牌 / 缺周） */
function hasCalendarGap(bars: KLineData[], from: number, to: number): boolean {
  for (let k = Math.max(1, from + 1); k <= to; k += 1) {
    if ((bars[k].time - bars[k - 1].time) / DAY_MS > MAX_BAR_GAP_DAYS) return true;
  }
  return false;
}

export interface WeeklyBacktestOptions {
  config?: WeeklyConfig;
  /** 最少已收盘周K根数，不足的股票跳过（默认与评分一致 60 根） */
  minBars?: number;
  /** 持有周数（默认 2） */
  holdWeeks?: number;
  /** 出场策略，默认 'hold' */
  exitPolicy?: BacktestExitPolicy;
  /** 是否在信号周确定止损位（MA20 与近 8 周结构低点取更近者），盘中跌破即离场 */
  useStopLoss?: boolean;
  /**
   * 是否剔除极端样本（默认 true）。
   *
   * 剔除的三类样本（见 BacktestExclusionReason）周K不连续或复权异常，
   * 「次周开盘买入」无法真实成立，留着会把最佳收益 / 平均收益拉到失真
   * （例如出现「持有两周收益 1000%」这种物理上不可能的值）。
   */
  filterExtremes?: boolean;
  /**
   * 上市初期保护：信号周距序列首根不足该自然周数时剔除，默认 0 = 不启用。
   *
   * 注意 minBars 默认 60，信号循环起点即第 60 根，
   * 因此对「凑够根数」的次新股，其最早信号也已在上市 59 周之后，
   * 该开关主要在调低 minBars 时才有意义。
   */
  newStockMinWeeks?: number;
  /**
   * 只看某一档位：'full' 满分档 / 'partial' 部分分档；不传表示不限。
   *
   * 过滤只作用于「输出的样本」——冷却期（同一战法上一笔未离场前不重复计数）与
   * 共振计数仍按完整信号序列推进。这样做的意义：
   * 1.「不限档位」的样本数 = 「满分档」+「部分档」；
   * 2. 两个档位共用同一条交易序列，胜率可以直接对照，不会因为冷却期互相让位而产生偏差。
   */
  grade?: WeeklySetupGrade;
  /**
   * 是否套用页面的硬门槛：非空头排列 + 站上 60 周线 + 当前周不过热。
   * 默认 false——战法回测应衡量「战法本身」，过早叠加趋势门槛会把
   * 「低位横盘后的平台突破」这类形态系统性排除。
   */
  applyGates?: boolean;
  /** 同一战法两笔样本之间的额外冷却周数（默认 0，即上一笔离场后即可再次计数） */
  minSignalGapWeeks?: number;
  /** 参考时间，用于判定最后一根周K是否仍在本周（缺省 Date.now()） */
  now?: number;
}

/** 单笔回测样本 */
export interface WeeklyBacktestTrade {
  code: string;
  name: string;
  /** 命中的战法 */
  key: SetupKey;
  label: string;
  grade: WeeklySetupGrade;
  /** 该战法实得分 / 满分 */
  score: number;
  max: number;
  /** 该周同时命中的战法数量（用于「多战法共振」分组） */
  hitCount: number;

  /** 信号周（第 i 周收盘确认信号） */
  signalIndex: number;
  signalTime: number;
  /** 入场周（i+1）开盘价 */
  entryIndex: number;
  entryTime: number;
  entryPrice: number;
  /** 实际出场周与价格 */
  exitIndex: number;
  exitTime: number;
  exitPrice: number;

  /** 收益（%） */
  returnPct: number;
  /** 持有期内最大浮亏（%，正数） */
  maxAdversePct: number;
  /** 持有期内最大浮盈（%） */
  maxFavorablePct: number;
  /** 实际持有周数 */
  holdWeeks: number;
  /** 出场方式 */
  exitedBy: BacktestExitKind;
  /** 触发离场的卖出信号明细 */
  exitSignals: string[];
  /** 信号周给出的止损位 */
  stopLoss?: number;
}

/** 分组统计结果 */
export interface WeeklyBacktestStats {
  /** 分组键：'all' / SetupKey / `${SetupKey}:${grade}` / 'hits:1' / 'hits:2+' */
  key: string;
  label: string;
  /** 样本数 */
  trades: number;
  wins: number;
  /** 胜率（%），收益 > 0 计为盈利 */
  winRate: number;
  avgReturn: number;
  medianReturn: number;
  /** 平均盈利幅度（%） */
  avgWin: number;
  /** 平均亏损幅度（%，正数） */
  avgLoss: number;
  /** 总盈利 / 总亏损；无亏损且盈利 > 0 时为 Infinity */
  profitFactor: number;
  bestReturn: number;
  worstReturn: number;
  /** 平均持有期内最大浮亏（%），衡量「拿不拿得住」 */
  avgMaxAdverse: number;
  /** 平均实际持有周数 */
  avgHoldWeeks: number;
  /** 触发止损离场的比例（%） */
  stopRate: number;
  /** 因卖出信号提前离场的比例（%） */
  signalRate: number;
}

export interface WeeklyBacktestResult {
  trades: WeeklyBacktestTrade[];
  /** 全部信号 */
  overall: WeeklyBacktestStats;
  /** 按战法汇总（六个战法都有行，无样本时为 0） */
  bySetup: WeeklyBacktestStats[];
  /** 按「战法 × 档位」汇总（只含样本 > 0 的组合） */
  bySetupGrade: WeeklyBacktestStats[];
  /** 按共振强度汇总：单战法 vs 2 个及以上 */
  byHitCount: WeeklyBacktestStats[];
  /** 本次生效的档位过滤（未过滤时为 undefined） */
  grade?: WeeklySetupGrade;
  /** 被剔除的极端样本（停牌缺周 / 超出涨跌幅极限 / 上市初期） */
  excluded: WeeklyBacktestExclusions;
  /** 参与统计的股票数 */
  scannedStocks: number;
  /** 因数据不足被跳过的股票数 */
  skippedStocks: number;
  holdWeeks: number;
  exitPolicy: BacktestExitPolicy;
}

const EMPTY_STATS = (key: string, label: string): WeeklyBacktestStats => ({
  key,
  label,
  trades: 0,
  wins: 0,
  winRate: 0,
  avgReturn: 0,
  medianReturn: 0,
  avgWin: 0,
  avgLoss: 0,
  profitFactor: 0,
  bestReturn: 0,
  worstReturn: 0,
  avgMaxAdverse: 0,
  avgHoldWeeks: 0,
  stopRate: 0,
  signalRate: 0,
});

/** 把一批样本聚合成统计行 */
export function summarizeBacktestTrades(
  trades: WeeklyBacktestTrade[],
  key: string,
  label: string
): WeeklyBacktestStats {
  const n = trades.length;
  if (n === 0) return EMPTY_STATS(key, label);

  const returns = trades.map((t) => t.returnPct);
  const sorted = returns.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const medianReturn =
    sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];

  const winList = returns.filter((r) => r > 0);
  const lossList = returns.filter((r) => r <= 0);
  const grossWin = winList.reduce((acc, r) => acc + r, 0);
  const grossLoss = Math.abs(lossList.reduce((acc, r) => acc + r, 0));

  return {
    key,
    label,
    trades: n,
    wins: winList.length,
    winRate: (winList.length / n) * 100,
    avgReturn: returns.reduce((acc, r) => acc + r, 0) / n,
    medianReturn,
    avgWin: winList.length > 0 ? grossWin / winList.length : 0,
    avgLoss: lossList.length > 0 ? grossLoss / lossList.length : 0,
    profitFactor: grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? Infinity : 0,
    bestReturn: sorted[sorted.length - 1],
    worstReturn: sorted[0],
    avgMaxAdverse: trades.reduce((acc, t) => acc + t.maxAdversePct, 0) / n,
    avgHoldWeeks: trades.reduce((acc, t) => acc + t.holdWeeks, 0) / n,
    stopRate: (trades.filter((t) => t.exitedBy === 'stop').length / n) * 100,
    signalRate: (trades.filter((t) => t.exitedBy === 'signal').length / n) * 100,
  };
}

/**
 * 页面硬门槛（与 select.ts / score.ts 的 gates 保持一致）：
 * 非空头排列 + 站上 60 周线 + 当前周不过热。
 */
function panelPassesGates(p: WeeklyPanel, i: number, config: WeeklyConfig): boolean {
  if (p.structure[i] === 'down') return false;

  const ma5 = safe(p.ma5, i);
  const ma10 = safe(p.ma10, i);
  const ma20 = safe(p.ma20, i);
  const ma60 = safe(p.ma60, i);
  if (
    ma5 !== undefined &&
    ma10 !== undefined &&
    ma20 !== undefined &&
    ma60 !== undefined &&
    ma5 < ma10 &&
    ma10 < ma20 &&
    ma20 < ma60
  ) {
    return false;
  }

  if (!p.pxAboveMa60[i]) return false;

  const ret1w = p.ret1w[i];
  if (ret1w !== undefined && ret1w >= config.overheatRet1w) return false;

  return true;
}

/** 分块执行的会话：一次只处理一批股票，避免整批同步计算把 UI 卡死 */
export interface WeeklyBacktestSession {
  /** 参与回测的股票总数 */
  readonly total: number;
  /** 已处理的股票数 */
  readonly processed: number;
  /** 是否已全部处理完 */
  readonly finished: boolean;
  /** 处理下一批，返回 true 表示还有剩余 */
  step(batchSize?: number): boolean;
  /** 取当前累计结果（O(样本数 × 分组数)，建议跑完后调用一次） */
  getResult(): WeeklyBacktestResult;
}

/**
 * 创建回测会话。
 *
 * 使用方式：
 *   const session = createWeeklyBacktestSession(klines, names, { holdWeeks: 2 });
 *   while (session.step(20)) { 更新进度 }
 *   const result = session.getResult();
 */
export function createWeeklyBacktestSession(
  klines: Map<string, KLineData[]>,
  names: Map<string, string>,
  options: WeeklyBacktestOptions = {}
): WeeklyBacktestSession {
  const config = options.config ?? DEFAULT_WEEKLY_CONFIG;
  const holdWeeks = Math.max(1, Math.floor(options.holdWeeks ?? 2));
  const minBars = Math.max(2, Math.floor(options.minBars ?? config.minConfirmedBars));
  const exitPolicy = options.exitPolicy ?? 'hold';
  const useStopLoss = options.useStopLoss ?? false;
  const applyGates = options.applyGates ?? false;
  const gradeFilter = options.grade;
  const gapWeeks = Math.max(0, Math.floor(options.minSignalGapWeeks ?? 0));
  const now = options.now ?? Date.now();
  const filterExtremes = options.filterExtremes ?? true;
  const newStockMinWeeks = Math.max(0, Math.floor(options.newStockMinWeeks ?? 0));

  const entries = Array.from(klines.entries());
  const trades: WeeklyBacktestTrade[] = [];
  let cursor = 0;
  let skipped = 0;

  /** 极端样本剔除统计（与页面「已剔除 N 笔」提示一一对应） */
  const exclusions: WeeklyBacktestExclusions = {
    total: 0,
    byReason: { newStock: 0, calendarGap: 0, extremeReturn: 0 },
    samples: [],
  };
  /** 同一股票 + 同一信号周 + 同一原因只保留一条明细，避免多战法命中时刷屏 */
  const excludedSampleKeys = new Set<string>();

  function recordExclusion(
    reason: BacktestExclusionReason,
    code: string,
    name: string,
    signalTime: number,
    returnPct: number
  ): void {
    exclusions.total += 1;
    exclusions.byReason[reason] += 1;
    const sampleKey = `${code}|${signalTime}|${reason}`;
    if (excludedSampleKeys.has(sampleKey)) return;
    excludedSampleKeys.add(sampleKey);
    if (exclusions.samples.length >= MAX_EXCLUDED_SAMPLES) return;
    exclusions.samples.push({ code, name, signalTime, returnPct, reason });
  }

  /** 扫描单只股票的全部历史周，产出样本 */
  function runStock(code: string, raw: KLineData[]): void {
    const { confirmed } = splitConfirmedWeeklyKlines(raw, now);
    if (confirmed.length < minBars + holdWeeks + 1) {
      skipped += 1;
      return;
    }

    const panel = buildWeeklyPanel(code, names.get(code) ?? '', confirmed, config);
    const n = panel.n;
    const name = names.get(code) ?? '';

    /** 同一战法上一次的离场周，用于避免重叠样本重复计数 */
    const lastExitByKey = new Map<SetupKey, number>();

    // i 是信号周：入场用 i+1，出场最晚用 i+holdWeeks，因此必须 i+holdWeeks <= n-1
    for (let i = minBars - 1; i + holdWeeks <= n - 1; i += 1) {
      const hits = detectSetups(panel, i, config);
      if (hits.length === 0) continue;
      if (applyGates && !panelPassesGates(panel, i, config)) continue;

      const entryIndex = i + 1;
      const plannedExitIndex = i + holdWeeks;
      const entryBar = panel.bars[entryIndex];
      const entryPrice = entryBar?.open;
      if (entryPrice === undefined || !Number.isFinite(entryPrice) || entryPrice <= 0) continue;

      // 止损位在信号周确定（与页面展示一致）
      const stopLoss = useStopLoss ? computeStopLoss(panel, i).stopLoss : undefined;

      // 找出场点：止损优先（盘中触及），其次卖出信号，都没有则持有到期
      let exitIndex = plannedExitIndex;
      let exitedBy: BacktestExitKind = 'hold';
      let exitPriceOverride: number | undefined;
      const exitSignals: string[] = [];

      for (let j = entryIndex; j <= plannedExitIndex; j += 1) {
        const lowJ = panel.low[j];
        if (stopLoss !== undefined && Number.isFinite(lowJ) && lowJ <= stopLoss) {
          exitIndex = j;
          exitedBy = 'stop';
          const openJ = panel.bars[j]?.open;
          // 跳空跌破止损时按开盘价成交，不按止损价「理想成交」
          exitPriceOverride =
            openJ !== undefined && Number.isFinite(openJ) && openJ <= stopLoss ? openJ : stopLoss;
          break;
        }

        if (exitPolicy === 'signal') {
          const closeJ = panel.close[j];
          const gainPct =
            Number.isFinite(closeJ) && closeJ > 0
              ? ((closeJ - entryPrice) / entryPrice) * 100
              : undefined;
          const signals = detectExitSignals(panel, j, config, { gainPctSinceEntry: gainPct });
          if (signals.length > 0) {
            exitIndex = j;
            exitedBy = 'signal';
            exitSignals.push(...signals);
            break;
          }
        }
      }

      const exitPrice = exitPriceOverride ?? panel.close[exitIndex];
      if (!Number.isFinite(exitPrice) || exitPrice <= 0) continue;

      // 持有期内的最大浮亏 / 浮盈
      let maxAdversePct = 0;
      let maxFavorablePct = 0;
      for (let j = entryIndex; j <= exitIndex; j += 1) {
        const lowJ = panel.low[j];
        if (Number.isFinite(lowJ)) {
          maxAdversePct = Math.max(maxAdversePct, ((entryPrice - lowJ) / entryPrice) * 100);
        }
        const highJ = panel.high[j];
        if (Number.isFinite(highJ)) {
          maxFavorablePct = Math.max(maxFavorablePct, ((highJ - entryPrice) / entryPrice) * 100);
        }
      }

      const returnPct = ((exitPrice - entryPrice) / entryPrice) * 100;
      const hitCount = hits.length;

      /**
       * 极端样本判定：三类样本都不进统计，但仍按完整信号序列推进冷却期
       * （与档位过滤同理，保证不同参数下的信号序列完全一致，可横向对照）。
       *
       * 判定顺序按「最可能的根因」排：先看周K是否连续，再看收益是否超出物理极限。
       */
      let exclusionReason: BacktestExclusionReason | null = null;
      if (filterExtremes) {
        const windowWeeks = exitIndex - entryIndex + 1;
        const bounds = theoreticalReturnBounds(dailyLimitPct(code, name), windowWeeks);
        if (hasCalendarGap(panel.bars, i, exitIndex)) {
          exclusionReason = 'calendarGap';
        } else if (
          returnPct > bounds.maxGain * RETURN_TOLERANCE_FACTOR ||
          returnPct < -bounds.maxLoss * RETURN_TOLERANCE_FACTOR
        ) {
          exclusionReason = 'extremeReturn';
        } else if (
          newStockMinWeeks > 0 &&
          (panel.bars[i].time - panel.bars[0].time) / DAY_MS < newStockMinWeeks * 7
        ) {
          exclusionReason = 'newStock';
        }
      }

      hits.forEach((hit) => {
        const lastExit = lastExitByKey.get(hit.key);
        // 上一笔尚未离场（或仍在冷却期）时，同一战法不重复计数
        if (lastExit !== undefined && i < lastExit + 1 + gapWeeks) return;
        // 冷却期按「完整信号序列」推进，与档位过滤无关，保证两个档位可直接对照
        lastExitByKey.set(hit.key, exitIndex);

        if (exclusionReason !== null) {
          recordExclusion(exclusionReason, code, name, panel.bars[i].time, returnPct);
          return;
        }

        const grade = setupGradeOf(hit);
        if (gradeFilter !== undefined && grade !== gradeFilter) return;

        trades.push({
          code,
          name,
          key: hit.key,
          label: hit.label,
          grade,
          score: hit.score,
          max: hit.max,
          hitCount,
          signalIndex: i,
          signalTime: panel.bars[i].time,
          entryIndex,
          entryTime: panel.bars[entryIndex].time,
          entryPrice,
          exitIndex,
          exitTime: panel.bars[exitIndex].time,
          exitPrice,
          returnPct,
          maxAdversePct,
          maxFavorablePct,
          holdWeeks: exitIndex - entryIndex + 1,
          exitedBy,
          exitSignals,
          stopLoss,
        });
      });
    }
  }

  function getResult(): WeeklyBacktestResult {
    const bySetup = BACKTEST_SETUP_KEYS.map((key) =>
      summarizeBacktestTrades(
        trades.filter((t) => t.key === key),
        key,
        WEEKLY_SETUP_LABELS[key]
      )
    );

    // 已按档位过滤时，档位拆分表与汇总表完全重复，不再计算（页面也无需展示）
    const bySetupGrade: WeeklyBacktestStats[] = [];
    if (gradeFilter === undefined) {
      BACKTEST_SETUP_KEYS.forEach((key) => {
        (['full', 'partial'] as WeeklySetupGrade[]).forEach((grade) => {
          const list = trades.filter((t) => t.key === key && t.grade === grade);
          if (list.length === 0) return;
          bySetupGrade.push(
            summarizeBacktestTrades(
              list,
              `${key}:${grade}`,
              `${WEEKLY_SETUP_LABELS[key]} · ${grade === 'full' ? '满分档' : '部分档'}`
            )
          );
        });
      });
    }

    const byHitCount: WeeklyBacktestStats[] = [];
    const single = trades.filter((t) => t.hitCount === 1);
    const multi = trades.filter((t) => t.hitCount >= 2);
    if (single.length > 0) {
      byHitCount.push(summarizeBacktestTrades(single, 'hits:1', '单战法命中'));
    }
    if (multi.length > 0) {
      byHitCount.push(summarizeBacktestTrades(multi, 'hits:2+', '2 个及以上战法共振'));
    }

    return {
      trades,
      overall: summarizeBacktestTrades(trades, 'all', '全部信号'),
      bySetup,
      bySetupGrade,
      byHitCount,
      scannedStocks: cursor,
      skippedStocks: skipped,
      holdWeeks,
      exitPolicy,
      grade: gradeFilter,
      excluded: {
        total: exclusions.total,
        byReason: { ...exclusions.byReason },
        // 明细按「收益异常程度」排序：越离谱的越值得人眼核对一次
        samples: exclusions.samples
          .slice()
          .sort((a, b) => Math.abs(b.returnPct) - Math.abs(a.returnPct))
          .slice(0, MAX_EXCLUDED_SAMPLES_SHOWN),
      },
    };
  }

  return {
    get total() {
      return entries.length;
    },
    get processed() {
      return cursor;
    },
    get finished() {
      return cursor >= entries.length;
    },
    step(batchSize = 20): boolean {
      const end = Math.min(entries.length, cursor + Math.max(1, batchSize));
      for (; cursor < end; cursor += 1) {
        const [code, kline] = entries[cursor];
        if (!kline || kline.length === 0) {
          skipped += 1;
          continue;
        }
        runStock(code, kline);
      }
      return cursor < entries.length;
    },
    getResult,
  };
}

/**
 * 一次性跑完整批回测（小数据集或脚本场景使用）。
 * 页面里建议用 createWeeklyBacktestSession 分块执行，避免阻塞渲染。
 */
export function backtestWeeklySetups(
  klines: Map<string, KLineData[]>,
  names: Map<string, string>,
  options: WeeklyBacktestOptions = {}
): WeeklyBacktestResult {
  const session = createWeeklyBacktestSession(klines, names, options);
  while (session.step(Math.max(1, session.total))) {
    // 循环直到处理完
  }
  return session.getResult();
}
