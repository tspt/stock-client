/**
 * 周线分析类型定义
 *
 * 与旧实现的核心差异：
 * 1. 因子按「趋势 / 动量 / 相对强度 / 位置 / 量能 / 波动 / 形态」分层，彼此尽量正交，
 *    避免旧实现里「站上MA10」既当门槛又当加分项的重复计数。
 * 2. 位置与乖离一律用 ATR 归一化，解决高波动股与低波动股不可比的问题。
 * 3. 评分是「三段式绝对分」，分段与《周线选股》文档章节一一对应：
 *    趋势健康度（第一章）+ 战法（第二章）+ 多周期共振（第三章）− 风险惩罚（第四章）。
 *    文档没有独立的「量价」章节（量能判定内嵌在各战法里），因此不再单列量价段，
 *    否则「缩量回踩」类战法会被系统性扣分。
 */

import type { NumberRange } from '@/types/opportunityFilter';

export type WeeklyStructure = 'up' | 'down' | 'sideways';

export const WEEKLY_STRUCTURE_LABELS: Record<WeeklyStructure, string> = {
  up: '上升趋势',
  down: '下降趋势',
  sideways: '横向震荡',
};

/** 六大买入战法 */
export type SetupKey =
  | 'platformBreakout'
  | 'pullbackBuy'
  | 'volumePile'
  | 'maGoldenCross'
  | 'oldDuckHead'
  | 'threeYangPullback';

export const WEEKLY_SETUP_LABELS: Record<SetupKey, string> = {
  platformBreakout: '平台突破',
  pullbackBuy: '回踩低吸',
  volumePile: '连续堆量',
  maGoldenCross: '均线金叉',
  oldDuckHead: '老鸭头',
  threeYangPullback: '三连阳回踩',
};

/**
 * 命中档位：对应各战法探测器里的分级分支（makeHit 的 ratio）。
 * - full    满分档：文档里的完整形态，全部条件成立
 * - partial 部分档：形态基本成型，但缺关键确认（尚未出止跌 K 线、尚未真正突破箱顶等）
 */
export type WeeklySetupGrade = 'full' | 'partial';

export const WEEKLY_SETUP_GRADE_LABELS: Record<WeeklySetupGrade, string> = {
  full: '满分档',
  partial: '部分档',
};

/**
 * 各战法满分（对应文档「二、核心买入战法」）。
 * 平台突破在文档里描述最细、且明确「平台整理越久突破力度越强」，给最高分；
 * 三连阳回踩属于短线性买点，给最低分。
 */
export const SETUP_MAX_SCORES: Record<SetupKey, number> = {
  platformBreakout: 14,
  pullbackBuy: 10,
  volumePile: 10,
  maGoldenCross: 10,
  oldDuckHead: 8,
  threeYangPullback: 6,
};

/**
 * 多战法同时命中时，最高分之外的战法按该系数计入。
 *
 * 直接 1:1 累加会失真：平台突破常同时伴随均线金叉、连续堆量，
 * 三者叠加能让单一形态冲到顶格。折半既保留「多战法共振」的溢价，
 * 又不让同向信号线性堆分。
 */
export const SETUP_SECONDARY_FACTOR = 0.5;

/** 战法段上限（文档第二章为主 alpha，占分最重） */
export const SETUP_TOTAL_CAP = 50;

/** 命中的战法 */
export interface WeeklySetupHit {
  key: SetupKey;
  label: string;
  /** 该战法实得分数 */
  score: number;
  /** 满分，便于 UI 显示 x/y */
  max: number;
  /** 命中依据，便于解释「为什么进名单」 */
  reasons: string[];
}

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
  /**
   * 最近已收盘周的收盘价（不含进行中的本周）。
   * 供「只用完整周」模式下的价格筛选使用：勾选后筛选走该值，展示仍用实时 close。
   */
  confirmedClose?: number;
  /** 最新一周涨跌幅（%）：勾选「只用完整周」时回退为最近已收盘周涨幅 */
  weekChangePercent: number;

  // ===== 趋势 =====
  ma5?: number;
  ma7?: number;
  ma8?: number;
  ma10?: number;
  ma14?: number;
  ma20?: number;
  ma30?: number;
  ma34?: number;
  /** 60 周均线：牛熊分界与主升浪标志 */
  ma60?: number;
  pxAboveMa8: boolean;
  /** MA5>MA10>MA20 且 MA20 向上 */
  maStack: boolean;
  /**
   * 完整多头排列：MA5>MA10>MA20>MA60，且 MA20 向上，且「开口不大」。
   * 只判前三者的旧版会把 60 周线仍下压的反抽误判为趋势成立。
   */
  maBullStack: boolean;
  /** 多头排列开口度（%）：(MA5-MA60)/MA60，过大说明已发散、追高风险高 */
  maStackSpread?: number;
  /** MA20 近 4 周变化率（%），衡量中期趋势方向 */
  ma20Slope?: number;
  /** MA20 近 4 周向上拐头 */
  ma20TurnUp: boolean;
  /** MA10 近 2 周拐头向下（止损信号之一） */
  ma10TurnDown: boolean;
  /** MA60 近 8 周变化率（%）：走平或上翘才是主升浪标志 */
  ma60Slope?: number;
  /** MA60 走平或上翘（斜率 > -1%） */
  ma60FlatOrUp: boolean;
  /**
   * 均线粘合度（%）：(max(MA5,MA10,MA20) - min(MA5,MA10,MA20)) / close × 100。
   * 平台突破法要求「均线粘合」，数值越小越粘合。
   */
  maConverge?: number;
  pxAboveMa10: boolean;
  pxAboveMa20: boolean;
  /** 站上 5 周均线：多周期共振第一层「周线定方向」 */
  pxAboveMa5: boolean;
  /** 站上 60 周均线（牛熊线上方） */
  pxAboveMa60: boolean;

  // ===== 动量 =====
  /** 最近已收盘 1 周收益（%） */
  ret1w?: number;
  /** 26 周收益（%）：卖出信号用它近似「累计涨幅」 */
  ret26w?: number;
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
  /** 近 20 周平均周成交额（元），仅用于展示 */
  avgAmount20w?: number;
  /** 最新周成交额 / 近 8 周中位数：拥挤度原始值 */
  amountCrowd8w?: number;
  /** 所属行业代码（来自股票池，缺省为未知） */
  industryCode?: string;
  /** 所属行业名称 */
  industryName?: string;
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
  /** 当前价距箱顶的距离（%，正值=已突破，负值=仍在箱体内） */
  distToBoxHigh?: number;

  // ===== 估值（需额外拉取财报，缺省为 undefined） =====
  /** 市净率 = 最新价 / 每股净资产 */
  pb?: number;
  /** 市盈率(TTM) = 最新价 / 最近已披露 4 期每股收益之和 */
  peTtm?: number;
  /**
   * 总市值（亿元）：复用机会分析结果（StockOpportunityData.marketCap）。
   * 未跑机会分析或该股无详情数据时为 undefined。
   */
  marketCap?: number;
  /** 总股数（亿股）：由机会分析结果的 totalShares(股) 折算，缺省时用「总市值/最新价」兜底 */
  totalShares?: number;
  /**
   * 总营收（亿元）：来自机会分析「获取营收净利润」写入 IndexedDB 的财务指标，
   * 原始单位为元，这里统一折算成亿元。未拉取过该数据时为 undefined。
   */
  financeRevenue?: number;
  /** 归母净利润（亿元）：同上，原始单位为元，这里折算成亿元 */
  financeNetProfit?: number;
  /** 总营收增长率（%）：接口原值已是百分数 */
  financeRevenueGrowth?: number;
  /** 归母净利润增长率（%）：接口原值已是百分数 */
  financeNetProfitGrowth?: number;
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
  /** 底背离：股价创新低但 MACD 未同步新低，中级底部反转信号 */
  macdBottomDivergence: boolean;
  /** 顶背离：股价创新高但 MACD 未同步新高，见顶信号 */
  macdTopDivergence: boolean;

  // ===== 战法 =====
  /** 命中的买入战法（可能多个） */
  setups: WeeklySetupHit[];
  /** 战法得分合计（封顶 SETUP_TOTAL_CAP） */
  setupScore: number;

  // ===== 多周期共振 =====
  /** 日线站上 20 日均线（定主力控盘）。日线数据缺失时为 undefined */
  dailyAboveMa20?: boolean;

  // ===== 风控 =====
  /**
   * 建议止损位：MA20 与近期结构低点取更近者。
   * 文档止损原则「有效跌破 20 周均线或 10 周线拐头向下」。
   */
  stopLoss?: number;
  /** 当前价到止损位的距离（%） */
  riskPct?: number;
  /** 触发的卖出信号（见 exitRules） */
  exitSignals: string[];

  quality: WeeklyDataQuality;
}

/**
 * 评分三段式：趋势健康度 + 战法 + 多周期共振 − 风险惩罚。
 * 每个加分段都能指向《周线选股》文档的一句原话，段上限均为「实际可达」值。
 *
 * 与旧版（动量/低波/反转/拥挤的横截面加权分位）的差异：
 * 旧版回答「这只票在全市场排第几」，新版回答「这只票符合文档哪几条、能打几分」。
 * 绝对分制的代价是阈值需要人工标定，好处是不再随池子构成漂移，
 * 且单只股票可以独立计算——池子只剩一只时也给出稳定结论。
 */
export interface WeeklyScoreParts {
  /** 趋势健康度 0~30（文档第一章） */
  trend: number;
  /** 战法 0~50（文档第二章） */
  setup: number;
  /** 多周期共振 0~20（文档第三章） */
  resonance: number;
  /** 风险惩罚（正数，已从总分中扣除，上限 config.maxRiskPenalty） */
  penalty: number;
}

/** 硬性门槛通过情况 */
export interface WeeklyGates {
  dataOk: boolean;
  /** 剔除周线空头排列个股 */
  notDowntrend: boolean;
  /** 站上 60 周均线 */
  aboveMa60: boolean;
  /** 20 周均线向上拐头 */
  ma20Up: boolean;
  /** 是否至少命中一个战法（是否作为硬门槛由 filters.requireSetup 决定） */
  hasSetup: boolean;
  /** 日线共振：日线站上 20 日均线（无日线数据时不阻断） */
  dailyOk: boolean;
  notOverheated: boolean;
}

export interface WeeklyAnalysis extends WeeklyFactors {
  /** 综合评分 0~100（三段式绝对分，见 WeeklyScoreParts） */
  score: number;
  /** 综合分在有效样本中的分位（100=最高） */
  scoreRank?: number;
  parts: WeeklyScoreParts;
  gates: WeeklyGates;
  /** 是否通过全部硬性门槛 */
  passed: boolean;

  signals: string[];
  warnings: string[];
  insufficientData: boolean;
}

/** 三段式评分各段上限（对应文档前三章） */
export interface WeeklyScoreWeights {
  /** 趋势健康度上限（文档第一章） */
  trend: number;
  /** 战法上限（文档第二章，段内按 SETUP_MAX_SCORES 分配） */
  setup: number;
  /** 多周期共振上限（文档第三章「周线选股，日线买股」） */
  resonance: number;
}

/** 持仓与组合层默认参数 */
export const WEEKLY_HOLD_DEFAULTS = {
  minHoldWeeks: 2,
  maxHoldWeeks: 6,
  maxHoldings: 10,
  maxPerIndustry: 2,
  /** 满 2 周后，分数分位低于该值则退出（60 = 掉出前 40%） */
  exitScoreRank: 60,
  /**
   * 60 根已收盘周K：MA60 是本轮的核心门槛（牛熊分界线），
   * 26 根只能算到 MA20，无法判定主升浪。代价是剔除上市不足约 15 个月的新股。
   */
  minConfirmedBars: 60,
  /** 持仓期间跌破该绝对分则退出（对应旧版 exitScoreRank=60 分位） */
  exitScore: 45,
} as const;

/** 分析与筛选配置 */
export interface WeeklyConfig {
  /** 完成判定所需的最少已收盘周K */
  minConfirmedBars: number;
  /** 箱体回看周数：对应「低位横盘 8–12 周」 */
  boxLookback: number;
  /** 箱体振幅下限（%），剔除「织布机」式极窄箱体 */
  boxAmplitudeMin: number;
  /** 箱体振幅上限（%），对应「波动幅度≤20%」，剔除单边趋势 */
  boxAmplitudeMax: number;
  /** 突破量能倍数下限：对应「达近 5 周均量 1.5 倍」 */
  breakoutVolumeRatio: number;
  /** 突破当周最小涨幅（%）：对应「收中长阳」 */
  breakoutMinWeekGain: number;
  /** 均线粘合度上限（%）：平台突破要求均线粘合 */
  maConvergeMax: number;
  /** 多头排列开口度上限（%）：(MA5-MA60)/MA60，对应「开口不大」 */
  maStackSpreadMax: number;
  /** MA20 向上拐头的回看周数 */
  maTurnUpWeeks: number;
  /** MA10 拐头向下的回看周数 */
  ma10TurnDownWeeks: number;
  /** MA60 斜率的回看周数 */
  ma60SlopeWeeks: number;
  /** MA60 走平判定下限（%）：斜率高于它即视为走平或上翘 */
  ma60FlatMin: number;
  /** 连续堆量所需周数 */
  pileWeeks: number;
  /** 堆量周的量能倍数下限（相对前 8 周均量） */
  pileVolumeRatio: number;
  /** 回踩低吸的缩量上限（相对近 8 周均量） */
  pullbackVolumeRatio: number;
  /** 回踩低吸判定「靠近均线」的 ATR 容差 */
  pullbackAtrTolerance: number;
  /** 三连阳回踩：成交量相对前三周均量的上限 */
  threeYangVolumeRatio: number;
  /** 老鸭头回溯周数 */
  duckHeadLookback: number;
  /** 均线金叉：MA7×MA14 回溯周数 */
  goldenCrossLookback: number;
  /** 均线金叉：MA14×MA60/MA34 回溯周数 */
  goldenCrossLongLookback: number;
  /** MACD 背离回溯周数 */
  divergenceLookback: number;
  /** 累计涨幅超过该值后启动见顶观察（%） */
  exitGainPct: number;
  /** 上涨时间达到该周数后考虑卖出 */
  exitHoldWeeks: number;
  /** 极端乖离阈值（ATR 倍数） */
  extBiasWarn: number;
  /** 严重乖离阈值（ATR 倍数） */
  extBiasSevere: number;
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
  /**
   * 单周涨幅达到该值（%）视为过热：既计入风险惩罚，也排除出 passed。
   * 文档未提及此项，属工程性风控；两个判定共用同一阈值，避免自相矛盾。
   */
  overheatRet1w: number;
  /** 风险惩罚上限，避免多项轻扣分把分数直接打到 0 而失去排序能力 */
  maxRiskPenalty: number;
  weights: WeeklyScoreWeights;
}

/** 筛选条件（UI 层） */
export interface WeeklyFilterOptions {
  /** 最小综合评分 */
  minScore: number;
  /** 是否要求至少命中一个买入战法（关闭时战法只加分不当门槛） */
  requireSetup?: boolean;
  /** 战法白名单：只在名单内的战法才算命中 */
  allowedSetups?: SetupKey[];
  /**
   * 档位过滤：只保留命中指定档位战法的个股（单选传一个值，不传表示不限）。
   * 与 allowedSetups 作用于「同一个战法」，且本身即隐含「命中战法」。
   */
  setupGrades?: WeeklySetupGrade[];
  /** 是否要求站上 60 周均线 */
  requireAboveMa60?: boolean;
  /** 是否剔除周线空头排列个股 */
  excludeDowntrend?: boolean;
  /** 是否要求日线站上 20 日均线（无日线数据时自动跳过） */
  requireDailyAboveMa20?: boolean;
  /** 数据筛选：价格范围（元），基于最新周收盘价；range 已设置但缺值即排除 */
  priceRange?: NumberRange;
  /** 数据筛选：总市值范围（亿元） */
  marketCapRange?: NumberRange;
  /** 数据筛选：总股数范围（亿股） */
  totalSharesRange?: NumberRange;
  /** 数据筛选：总营收范围（亿元） */
  financeRevenueRange?: NumberRange;
  /** 数据筛选：归母净利润范围（亿元） */
  financeNetProfitRange?: NumberRange;
  /** 数据筛选：总营收增长率范围（%） */
  financeRevenueGrowthRange?: NumberRange;
  /** 数据筛选：归母净利润增长率范围（%） */
  financeNetProfitGrowthRange?: NumberRange;
  /**
   * 只用完整周：价格筛选改用最近已收盘周收盘价（confirmedClose），
   * 不再使用可能含「进行中的本周」的最新价，保证结果可复现。
   */
  completeWeeksOnly?: boolean;

  // ===== 名称筛选（与机会分析页「名称筛选」面板同口径） =====
  /** 是否启用「排除名称包含关键词」（false 时忽略 excludedNameKeywords） */
  enableNameKeywordFilter?: boolean;
  /** 排除名称包含这些关键词的股票 */
  excludedNameKeywords?: string[];
  /** 是否启用「短期排除股票名称」（false 时忽略 excludedShortTermNames） */
  enableShortTermNameFilter?: boolean;
  /** 短期排除的股票名称（全名精确匹配，忽略空白字符） */
  excludedShortTermNames?: string[];
  /** 名称筛选：行业分组对应的行业板块代码（独立于顶部「行业」筛选） */
  nameFilterIndustryCodes?: string[];
  /** 名称筛选：行业分组反选（排除选中分组内的个股） */
  nameFilterIndustryInvert?: boolean;
}
