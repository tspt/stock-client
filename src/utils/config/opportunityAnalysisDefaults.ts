/**
 * 机会分析：横盘/趋势线/单日异动首次计算与侧栏筛选面板默认值一致（单源）
 *
 * 注意：常量顺序按照界面显示顺序排列
 */

// ==================== 1. 数据筛选 ====================

/** 基础筛选默认配置 */
export const OPPORTUNITY_DEFAULT_BASIC_FILTERS = {
  /** 选择市场（多选） */
  selectedMarket: ['hs_main', 'sz_gem'] as const,
  /** 股票名称类型 */
  nameType: 'non_st' as const,
  /** 价格 */
  priceRange: { min: 3, max: 100 },
  /** 市值范围（亿） */
  marketCapRange: { min: 30, max: 1000 },
  /** 总股本范围（亿） */
  totalSharesRange: { min: 1, max: 50 },
  /** 换手率范围（%） */
  turnoverRateRange: { min: 1 },
} as const;

/** 涨跌停筛选默认配置 */
export const OPPORTUNITY_DEFAULT_LIMIT_MOVES = {
  /** 涨停/跌停统计周期 */
  period: 20,
} as const;

/** 行业板块筛选默认配置 */
export const OPPORTUNITY_DEFAULT_INDUSTRY_SECTORS = {
  /** 默认选中的行业代码列表（排除这些传统行业） */
  excludedIndustries: [
    'BK1020', // 航空机场
    'BK0421', // 铁路公路
    'BK0422', // 物流
    'BK0450', // 航运港口
    'BK0451', // 房地产开发
    // 'BK0465', // 化学制药
    'BK0473', // 证券Ⅱ
    'BK0474', // 保险Ⅱ
    'BK0475', // 银行Ⅱ
    'BK0482', // 一般零售
    'BK0727', // 医疗服务
    'BK0732', // 贵金属
    'BK0734', // 饰品
    'BK0740', // 教育
    'BK1027', // 小金属
    'BK1028', // 燃气Ⅱ
    'BK1040', // 中药Ⅱ
    'BK1041', // 医疗器械
    'BK1042', // 医药商业
    'BK1044', // 生物制品
    'BK1045', // 房地产服务
    'BK1222', // 影视院线
    'BK1226', // 普钢
    'BK1227', // 特钢Ⅱ
    'BK1228', // 冶钢原料
    'BK1243', // 其他家电Ⅱ
    'BK1239', // 白色家电
    'BK1241', // 黑色家电
    'BK1240', // 厨卫电器
    'BK1244', // 小家电
    'BK1249', // 焦炭Ⅱ
    'BK1250', // 煤炭开采
    'BK1251', // 个护用品
    'BK1252', // 化妆品
    'BK1253', // 医疗美容
    'BK1254', // 动物保健Ⅱ
    'BK1256', // 农产品加工
    'BK1257', // 农业综合Ⅱ
    'BK1258', // 饲料
    'BK1259', // 养殖业
    'BK1260', // 渔业
    'BK1261', // 种植业
    'BK1269', // 旅游零售Ⅱ
    'BK1270', // 专业连锁Ⅱ
    'BK1271', // 酒店餐饮
    'BK1272', // 旅游及景区
    'BK1274', // 炼化及贸易
    'BK1275', // 油服工程
    'BK1276', // 油气开采Ⅱ
    'BK1277', // 白酒Ⅱ
    'BK1279', // 非白酒
    'BK1280', // 食品加工
    'BK1281', // 休闲食品
    'BK1282', // 饮料乳品
  ],
  /** 默认启用排除选中模式 */
  invertEnabled: true,
} as const;

// ==================== 2. AI分析筛选 ====================

/** AI分析筛选默认配置 */
export const OPPORTUNITY_DEFAULT_AI_ANALYSIS = {
  /** 是否启用AI分析 */
  enabled: true,
  /** AI趋势判断 - 看涨 */
  trendUp: true,
  /** AI趋势判断 - 看跌 */
  trendDown: false,
  /** AI趋势判断 - 横盘 */
  trendSideways: false,
  /** AI趋势评分最小值 */
  trendScoreMin: 50,
  /** AI风险评分最小值 */
  riskScoreMin: 50,
} as const;

// ==================== 3. 横盘筛选 ====================

export const OPPORTUNITY_DEFAULT_CONSOLIDATION = {
  lookback: 10,
  consecutive: 3,
  threshold: 1.5,
  requireClosesAboveMa10: false,
} as const;

// ==================== 4. 趋势线筛选 ====================

export const OPPORTUNITY_DEFAULT_TREND_LINE = {
  lookback: 10,
  consecutive: 3,
} as const;

// ==================== 5. 单日异动筛选 ====================

export const OPPORTUNITY_DEFAULT_SHARP_MOVE = {
  windowBars: 20,
  magnitude: 4,
} as const;

/** 异动筛选完整配置 */
export const OPPORTUNITY_DEFAULT_SHARP_MOVE_FULL = {
  ...OPPORTUNITY_DEFAULT_SHARP_MOVE,
  /** 横盘幅度阈值（%） */
  flatThreshold: 3,
  /** 仅急跌 */
  onlyDrop: true,
  /** 仅急涨 */
  onlyRise: true,
  /** 急跌→急涨 */
  dropThenRiseLoose: true,
  /** 急涨→急跌 */
  riseThenDropLoose: true,
  /** 急跌横盘急涨 */
  dropFlatRise: false,
  /** 急涨横盘急跌 */
  riseFlatDrop: false,
} as const;

// ==================== 6. 形态筛选 ====================

/** 技术指标筛选默认配置 */
export const OPPORTUNITY_DEFAULT_INDICATORS = {
  /** RSI周期 */
  rsiPeriod: 14,
  /** 布林带阈值（0-1之间，即百分比） */
  bollingerThreshold: 0.02,
} as const;

/** K线形态识别默认配置 */
export const OPPORTUNITY_DEFAULT_CANDLESTICK = {
  /** K线形态回溯窗口大小（根数） */
  lookback: 20,
  /** 启用成交量确认 */
  useVolumeConfirmation: true,
  /** 反转形态强制成交量确认 */
  requireVolumeForReversal: true,
  /** 趋势背景回溯周期（根数） */
  trendBackgroundLookback: 10,
  /** 成交量放大倍数 */
  volumeMultiplier: 1.5,
} as const;

/** 趋势形态识别默认配置 */
export const OPPORTUNITY_DEFAULT_TREND_PATTERN = {
  /** 趋势形态回溯窗口大小（根数） */
  lookback: 20,
} as const;
