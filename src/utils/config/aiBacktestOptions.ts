/**
 * AI 胜率回评的常量（唯一数据源）
 *
 * 这里的数值共同定义「回测评测口径」：采样多少个截面、需要多少根预热 K 线、
 * 分桶边界、达标阈值。任何一处调整都会直接改变结论，因此集中在此、不在页面内联。
 */

/** 前向收益口径（回测统计用的周期） */
export type AiBacktestHorizon = 'd1' | 'd2' | 'd3' | 'd4' | 'd5' | 'd6';

/** 主口径下拉选项 */
export const AI_BACKTEST_HORIZON_OPTIONS: Array<{ label: string; value: AiBacktestHorizon }> = [
  { label: '1 日', value: 'd1' },
  { label: '2 日', value: 'd2' },
  { label: '3 日', value: 'd3' },
  { label: '4 日', value: 'd4' },
  { label: '5 日', value: 'd5' },
  { label: '6 日', value: 'd6' },
];

/** 默认主口径（胜率 / 平均收益 / IC 都用它） */
export const AI_BACKTEST_DEFAULT_HORIZON: AiBacktestHorizon = 'd5';

/** 默认参与回测的股票数上限（先小后大：跑通后再放开到全量） */
export const AI_BACKTEST_DEFAULT_UNIVERSE_LIMIT = 1000;

/** 股票数上限可选项 */
export const AI_BACKTEST_UNIVERSE_LIMIT_OPTIONS: Array<{ label: string; value: number }> = [
  { label: '500 只', value: 500 },
  { label: '1000 只', value: 1000 },
  { label: '2000 只', value: 2000 },
  { label: '全量', value: 0 },
];

/** 默认采样截面数 */
export const AI_BACKTEST_DEFAULT_SECTION_COUNT = 20;

/** 默认采样步长：每 N 个交易日取一个截面 */
export const AI_BACKTEST_DEFAULT_SECTION_STEP = 5;

/** 采样步长可选项 */
export const AI_BACKTEST_SECTION_STEP_OPTIONS: Array<{ label: string; value: number }> = [
  { label: '每 1 个交易日', value: 1 },
  { label: '每 3 个交易日', value: 3 },
  { label: '每 5 个交易日', value: 5 },
  { label: '每 10 个交易日', value: 10 },
  { label: '每 20 个交易日', value: 20 },
];

/** 采样截面数可选项 */
export const AI_BACKTEST_SECTION_COUNT_OPTIONS: Array<{ label: string; value: number }> = [
  { label: '10 个截面', value: 10 },
  { label: '20 个截面', value: 20 },
  { label: '40 个截面', value: 40 },
  { label: '60 个截面', value: 60 },
];

/**
 * 参与回测所需的最少预热 K 线根数。
 *
 * 低于该值的截面直接跳过：AI 依赖 MA20/布林(20)/MACD，根数太少时指标未稳定，
 * 强行打分只会污染统计。
 */
export const AI_BACKTEST_MIN_WARMUP_BARS = 120;

/** 尾部预留：截面日之后至少要有这么多根 K 线，才可能算出 d1~d6 收益 */
export const AI_BACKTEST_TAIL_RESERVE_BARS = 10;

/** 分桶样本数低于该值时，胜率等比例指标标记为「样本不足」，不参与结论 */
export const AI_BACKTEST_MIN_BUCKET_SAMPLES = 30;

/**
 * 缺口检测：打分窗口回看的根数。
 *
 * 用于剔除「除权跳空落在指标窗口内」的样本。取 30 是因为打分时指标最多回看约 30 根
 * （MA20 / 布林(20) / MACD 26+9），更早的跳空对当前指标影响已可忽略。
 */
export const AI_BACKTEST_GAP_LOOKBACK_BARS = 30;

/**
 * 缺口检测：前向收益窗口的根数。
 *
 * 固定取最长的 d6（6 根），**不随主口径变化**。这样剔除规则与主口径解耦，
 * 样本集在切换口径时保持不变，口径切换可以只做本地重聚合、不必重跑回评。
 */
export const AI_BACKTEST_GAP_FORWARD_BARS = 6;

/**
 * 缺口判定缓冲（%）。
 *
 * 单日跌幅超过「所属板跌停限制 + 该缓冲」才判定为除权跳空：
 * A 股单日跌幅有硬上限，超过它就不可能是正常交易造成的（复权缺口、上市首日、
 * 长期停牌复牌等无涨跌幅限制的情形会落入此区间，误剔除无害）。
 */
export const AI_BACKTEST_GAP_LIMIT_BUFFER = 1;

/**
 * 各板单日最大跌幅（%）。
 *
 * 创业板/科创板 20%、北交所 30%、主板 10%、ST 5%。
 * 判定顺序：先看板别，再看 ST（创业板 ST 仍是 20%）。
 */
export const AI_BACKTEST_LIMIT_DOWN = {
  /** 创业板 / 科创板 */
  star: 20,
  /** 北交所 */
  beijing: 30,
  /** 主板 ST */
  st: 5,
  /** 主板 */
  main: 10,
} as const;

/** 达标阈值（%），与买点场景统计口径保持一致 */
export const AI_BACKTEST_HIT_THRESHOLD = 5;

/** 达标所需最少次数（d1~d6 中达到阈值的个数） */
export const AI_BACKTEST_MIN_HIT_COUNT = 1;

/**
 * 置信度分桶边界（左闭右开，最后一桶右闭）。
 * 边界个数 = 桶数 + 1，与标签数组一一对应。
 */
export const AI_BACKTEST_CONFIDENCE_EDGES: readonly number[] = [0, 0.4, 0.5, 0.6, 0.7, 1.001];

/** 置信度分桶标签 */
export const AI_BACKTEST_CONFIDENCE_BUCKET_LABELS: readonly string[] = [
  '<40%',
  '40%~50%',
  '50%~60%',
  '60%~70%',
  '≥70%',
];

/**
 * 评分分桶（综合评分与四个分项）已改为**等频五分桶**，边界由 `quantileEdges`
 * 按数据分布现算，不再使用固定边界。
 *
 * 原先用固定边界 0/40/60/70/80，实测会产出退化桶（「70~80」仅 44 条、「≥80」0 条），
 * 无法判断单调性；等频桶每桶样本量接近，单调性才可测。
 */
