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
  ma8?: number;
  ma10?: number;
  ma20?: number;
  ma30?: number;
  pxAboveMa8: boolean;
  /** MA5>MA10>MA20 且 MA20 向上 */
  maStack: boolean;
  /** MA20 近 4 周变化率（%），衡量中期趋势方向 */
  ma20Slope?: number;
  pxAboveMa10: boolean;
  pxAboveMa20: boolean;

  // ===== 动量 =====
  ret13w?: number;
  /** 13 周动量但丢掉最近 1 周（skip last week） */
  ret13wSkip1?: number;
  /** 最近已收盘 1 周收益（%） */
  ret1w?: number;
  ret26w?: number;
  ret52w?: number;
  /** 近 13 周周收益标准差（%） */
  vol13w?: number;

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
  /** 近 8 周成交额中位数（元） */
  amount8wMedian?: number;
  /** 最新周成交额 / 近 8 周中位数：拥挤度原始值 */
  amountCrowd8w?: number;
  /** 所属行业代码（来自股票池，缺省为未知） */
  industryCode?: string;
  /** 所属行业名称 */
  industryName?: string;
  /** 最新周量能 / 前 5 周均量 */
  volRatio5?: number;
  /** 近 4 周均量 / 近 26 周均量：衡量量能是趋势性放大还是单周脉冲 */
  volTrend4_26?: number;

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
  /** 当前价距箱顶的距离（%，正值=已突破，负值=仍在箱体内） */
  distToBoxHigh?: number;

  // ===== 估值（需额外拉取财报，缺省为 undefined） =====
  /** 市净率 = 最新价 / 每股净资产 */
  pb?: number;
  /** 市盈率(TTM) = 最新价 / 最近已披露 4 期每股收益之和 */
  peTtm?: number;
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

/**
 * 评分各分项（均为 0~100）
 */
export interface WeeklyScoreParts {
  /** 中期动量：13 周 skip-1 的正向分位 */
  momentum: number;
  /** 低波动：近 13 周波动的反向分位 */
  lowVol: number;
  /** 短期反转：近 1 周涨幅的反向分位（过热降权） */
  reversal: number;
  /** 拥挤：近 1 周成交额相对 8 周中位数的反向分位 */
  crowding: number;
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
  /** 综合分在有效样本中的分位（100=最高） */
  scoreRank?: number;
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

/**
 * 评分权重：中期动量、低波动、近 1 周过热反向、拥挤反向
 */
export interface WeeklyScoreWeights {
  momentum: number;
  lowVol: number;
  reversal: number;
  crowding: number;
}

/** 持仓与组合层默认参数 */
export const WEEKLY_HOLD_DEFAULTS = {
  minHoldWeeks: 2,
  maxHoldWeeks: 6,
  maxHoldings: 10,
  maxPerIndustry: 2,
  /** 满 2 周后，分数分位低于该值则退出（60 = 掉出前 40%） */
  exitScoreRank: 60,
  /** 站上周MA20 的占比低于该值时进入防御：停止新开仓 */
  defenseBreadth: 50,
  minConfirmedBars: 26,
  minLiquidity: 3e8,
} as const;

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
  /** 近 8 周成交额中位数下限（元） */
  minAvgAmount: number;
}
