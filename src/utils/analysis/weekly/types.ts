/**
 * 周线分析类型定义
 *
 * 与旧实现的核心差异：
 * 1. 因子按「趋势 / 动量 / 相对强度 / 位置 / 量能 / 波动 / 形态」分层，彼此尽量正交，
 *    避免旧实现里「站上MA10」既当门槛又当加分项的重复计数。
 * 2. 位置与乖离一律用 ATR 归一化，解决高波动股与低波动股不可比的问题。
 * 3. 评分基于全样本分位而非绝对阈值，含义是「在全市场中处于什么水平」。
 */

export type WeeklyStructure = 'up' | 'down' | 'sideways';

export const WEEKLY_STRUCTURE_LABELS: Record<WeeklyStructure, string> = {
  up: '上升趋势',
  down: '下降趋势',
  sideways: '横向震荡',
};

/** 数据质量检查结果 */
export interface WeeklyDataQuality {
  /** 是否满足最低分析要求 */
  ok: boolean;
  /** 判定依据说明 */
  reasons: string[];
  /** 疑似异常跳空周数（复权缺失、停牌、数据错误都会表现为跳空） */
  suspectedGaps: number;
  /** 最近 52 周内零成交（停牌）周数 */
  pausedWeeks: number;
}

/** 单只股票的原始因子（只依赖自身数据，不含横截面信息） */
export interface WeeklyFactors {
  code: string;
  name: string;

  /** 原始周K根数 */
  bars: number;
  /** 已收盘周K根数 */
  confirmedBars: number;
  /** 最后一根是否为「进行中的本周」 */
  runningWeekIncluded: boolean;
  lastWeekTime: number;

  /** 最新价（含未完成周） */
  close: number;
  /** 最新一周涨跌幅（%） */
  weekChangePercent: number;

  // ===== 趋势 =====
  ma5?: number;
  ma10?: number;
  ma20?: number;
  ma30?: number;
  /** MA5>MA10>MA20 且 MA20 向上 */
  maStack: boolean;
  /** MA20 近 4 周变化率（%），衡量中期趋势方向 */
  ma20Slope?: number;
  pxAboveMa10: boolean;
  pxAboveMa20: boolean;

  // ===== 动量 =====
  ret13w?: number;
  ret26w?: number;
  ret52w?: number;

  // ===== 位置 =====
  high52w?: number;
  low52w?: number;
  /** 当前价在 52 周区间中的百分位（0=最低，100=最高） */
  pos52w?: number;
  /** 相对 MA20 的乖离（%），保留用于展示 */
  bias20?: number;
  /** 相对 MA20 的乖离，以 ATR 为单位（可比性更强，>3 通常已透支） */
  extBias?: number;

  // ===== 量能 =====
  /** 近 20 周平均周成交额（元），用于流动性过滤 */
  avgAmount20w?: number;
  /** 最新周量能 / 前 5 周均量 */
  volRatio5?: number;

  // ===== 波动与风险 =====
  /** ATR20 / 收盘价（%），周波动率 */
  atrPct?: number;
  /** 52 周最大回撤（%） */
  maxDD52w?: number;

  // ===== 形态 =====
  boxHigh?: number;
  boxLow?: number;
  boxAmplitude?: number;
  /** 箱顶突破（含量能确认） */
  boxBreakout: boolean;
  /** 首次突破：前一周收盘仍在箱顶之下，避免把「连涨三周」当成突破 */
  boxBreakoutFirst: boolean;
  structure: WeeklyStructure;
  /** 趋势回归年化斜率（%） */
  annualSlope?: number;
  /** 趋势回归拟合优度 0~1 */
  trendR2?: number;

  // ===== MACD（只保留「最近一次」交叉状态） =====
  macdDif?: number;
  macdDea?: number;
  macdBar?: number;
  /** 近 N 周内最近一次交叉为金叉 */
  macdGoldenCross: boolean;
  /** 最近一次金叉发生在零轴上方 */
  macdGoldenAboveZero: boolean;
  /** 近 N 周内最近一次交叉为死叉 */
  macdDeathCross: boolean;
  /**
   * 当前处于 MACD 多头状态：DIF>DEA 且双线均在零轴上方。
   * 只看「最近是否金叉」会漏掉长期多头排列的强趋势股（它们近几周根本没有交叉），
   * 因此状态与交叉分开表达。
   */
  macdBullish: boolean;

  quality: WeeklyDataQuality;
}

/** 评分各分项（均为 0~100 分位或离散分） */
export interface WeeklyScoreParts {
  /** 相对强度分位 */
  rs: number;
  /** 趋势分位 */
  trend: number;
  /** 动量分位 */
  momentum: number;
  /** 量能分位 */
  volume: number;
  /** 形态离散分 */
  pattern: number;
  /** 位置分（倒 U 型：过低=弱势，过高=过热） */
  position: number;
}

/** 硬性门槛通过情况 */
export interface WeeklyGates {
  dataOk: boolean;
  liquidity: boolean;
  notDowntrend: boolean;
  notOverheated: boolean;
}

export interface WeeklyAnalysis extends WeeklyFactors {
  /** 综合评分 0~100（横截面加权分位） */
  score: number;
  /** 相对强度原始值（-50~50，正数表示跑赢市场中位数） */
  rs?: number;
  /** 相对强度分位 0~100 */
  rsRank?: number;
  parts: WeeklyScoreParts;
  gates: WeeklyGates;
  /** 是否通过全部硬性门槛 */
  passed: boolean;

  /** 建议止损位：MA20 与近期结构低点取更近者 */
  stopLoss?: number;
  /** 当前价到止损位的距离（%） */
  riskPct?: number;

  signals: string[];
  warnings: string[];
  insufficientData: boolean;
}

/** 评分权重配置 */
export interface WeeklyScoreWeights {
  rs: number;
  trend: number;
  momentum: number;
  volume: number;
  pattern: number;
  position: number;
}

/** 分析与筛选配置 */
export interface WeeklyConfig {
  /** 完成判定所需的最少已收盘周K */
  minConfirmedBars: number;
  /** 箱体回看周数 */
  boxLookback: number;
  /** 箱体振幅下限（%），剔除「织布机」式极窄箱体 */
  boxAmplitudeMin: number;
  /** 箱体振幅上限（%），剔除单边趋势 */
  boxAmplitudeMax: number;
  /** 突破量能倍数下限 */
  breakoutVolumeRatio: number;
  /** 极端乖离阈值（ATR 倍数） */
  extBiasWarn: number;
  /** 严重乖离阈值（ATR 倍数） */
  extBiasSevere: number;
  /** 52 周分位过热阈值 */
  pos52wOverheat: number;
  /** 周波动率上限（%），超过视为投机品种 */
  atrPctMax: number;
  /** MACD 交叉回溯周数 */
  macdCrossLookback: number;
  /** 趋势回归回看周数 */
  trendLookback: number;
  /** 回归 R² 门槛：低于该值不认定为趋势 */
  trendR2Min: number;
  /** 回归年化斜率门槛（%），用于区分上升/下降 */
  trendSlopeMin: number;
  /** 疑似异常跳空阈值（单周涨跌幅绝对值，%） */
  gapThreshold: number;
  /** 单周涨跌幅超过该值即视为异常跳空 */
  maxSuspectedGaps: number;
  weights: WeeklyScoreWeights;
}

/** 筛选条件（UI 层） */
export interface WeeklyFilterOptions {
  /** 最小综合评分 */
  minScore: number;
  /** 最低周均成交额（元） */
  minAvgAmount: number;
  /** 最小相对强度分位 */
  minRsRank: number;
  /** 52 周分位上限（排除绝对高位） */
  maxPos52w: number;
  /** ATR 归一化乖离上限 */
  maxExtBias: number;
  /** 最大周波动率（%） */
  maxAtrPct: number;
  /** 要求中期趋势向上 */
  requireUptrend: boolean;
  /** 要求站上周 MA20 */
  requireAboveMa20: boolean;
  /** 要求出现形态信号（箱体突破或趋势确立） */
  requirePattern: boolean;
  /** 排除下降结构 */
  excludeDowntrend: boolean;
}

/** 单持有期的回测统计 */
export interface BacktestHorizonStat {
  /** 持有周数 */
  weeks: number;
  /** 信号样本数 */
  samples: number;
  /** 胜率（%） */
  winRate: number;
  /** 平均收益（%） */
  avgReturn: number;
  /** 收益中位数（%） */
  medianReturn: number;
  /** 同期全市场中位收益（%），即「什么都不做」的基准 */
  benchmarkReturn: number;
  /** 超额收益（%，avgReturn - benchmarkReturn） */
  excessReturn: number;
  /** 盈亏比（平均盈利 / 平均亏损） */
  profitFactor: number;
  /** 最差单笔（%） */
  worstReturn: number;
}

/** 回测汇总结果 */
export interface WeeklyBacktestResult {
  /** 参与回测的股票数 */
  stockCount: number;
  /** 触发信号的总次数 */
  signalCount: number;
  /** 各持有期统计 */
  horizons: BacktestHorizonStat[];
  /** 抽样提示 */
  sampled: boolean;
}
