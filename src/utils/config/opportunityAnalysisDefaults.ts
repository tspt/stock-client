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
  marketCapRange: { min: 100, max: 1000 },
  /** 总股本范围（亿） */
  totalSharesRange: { min: 1, max: 50 },
  /** 换手率范围（%） */
  turnoverRateRange: { min: 1 },
} as const;

/** 涨跌停筛选默认配置 */
export const OPPORTUNITY_DEFAULT_LIMIT_MOVES = {
  /** 涨停/跌停统计周期 */
  period: 10,
  /** 默认涨停次数 */
  minLimitUpCount: 1,
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
    'BK1245', // 照明设备Ⅱ
    'BK1228', // 冶钢原料
    'BK1243', // 其他家电Ⅱ
    'BK1239', // 白色家电
    'BK1241', // 黑色家电
    'BK1240', // 厨卫电器
    'BK1244', // 小家电
    'BK1249', // 焦炭Ⅱ
    'BK1250', // 煤炭开采
    'BK1251', // 个护用品
    'BK1225', // 服装家纺
    'BK0424', // 水泥
    'BK1267', // 造纸
    'BK1247', // 基础建设
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
    'BK0440', // 家居用品
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
  /** AI置信度最小值（%） */
  confidenceMin: 60,
  /** AI形态评分最小值 */
  patternScoreMin: 60,
  /** AI趋势评分最小值 */
  trendScoreMin: 55,
  /** AI安全评分最小值 */
  riskScoreMin: 40,
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
  onlyDrop: false,
  /** 仅急涨 */
  onlyRise: false,
  /** 急跌→急涨 */
  dropThenRiseLoose: false,
  /** 急涨→急跌 */
  riseThenDropLoose: false,
  /** 急跌横盘急涨 */
  dropFlatRise: false,
  /** 急涨横盘急跌 */
  riseFlatDrop: false,
} as const;

// ==================== 6. 技术指标筛选 ====================

/** 技术指标筛选默认配置 */
export const OPPORTUNITY_DEFAULT_INDICATORS = {
  /** RSI周期 */
  rsiPeriod: 14,
  /** 布林带阈值（0-1之间，即百分比） */
  bollingerThreshold: 0.02,
} as const;

// ==================== 7. 名称过滤 ====================

/** 名称过滤默认配置 */
export const OPPORTUNITY_DEFAULT_NAME_FILTERS = {
  /** 排除名称包含这些关键词的股票 */
  excludedNameKeywords: ['药业', '中国', '矿业', '水务', '纸业', '环保', '期货'],
  /** 排除这些完整名称的股票 */
  excludedExactNames: [
    '晋亿实业',
    '鲁银投资',
    '骆驼股份',
    '爱普股份',
    '翠微股份',
    '杉杉股份',
    '安徽合力',
    '麦加芯彩',
  ],
  /** 短期排除股票名称 */
  excludedShortTermNames: [
    '中立股份',
    '福斯特',
    '展鹏科技',
    '洛凯股份',
    '立霸股份',
    '多伦科技',
    '威派格',
    '海兴电力',
    '广信股份',
    '巍华新材',
    '迪生力',
    '联德股份',
    '璞泰来',
    '亿嘉禾',
    '华康股份',
    '湖南天雁',
    '华荣股份',
    '道升天合',
    '永杰新材',
    '川仪股份',
    '永茂泰',
    '中际联合',
    '福莱蒽特',
    '振石股份',
    '上海沿浦',
    '建业股份',
    '凯众股份',
    '百达精工',
    '立中集团',
    '德力佳',
    '秦安股份',
    '百利电气',
    '华新精科',
    '海阳科技',
    '众辰科技',
    '杰克科技',
    '力鼎光电',
    '星德胜',
    '明新旭腾',
    '南矿集团',
    '威星智能',
    '国网信通',
    '华立股份',
    '新凤鸣',
    '奥赛康',
    '龙佰集团',
    '新乡化纤',
    '皇马科技',
    '新华制药',
    '珠海中富',
    '建投能源',
    '滨化股份',
    '木林森',
    '华金资本',
    '青龙管业',
    '东方明珠',
    '维信诺',
  ],
} as const;
