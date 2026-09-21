/**
 * 筹码分布（成本分布）相关类型
 *
 * 东方财富网页上的「筹码分布」并非服务端接口返回，而是前端用 K 线数据本地推算：
 * 数据源就是 push2his 的标准 K 线接口（fields2 必须含换手率 f61），
 * 算法见 `@/utils/analysis/chipDistribution`。
 */

/** 筹码计算所用的 K 线周期 */
export type ChipPeriod = 'day' | 'week';

/** 复权方式 */
export type ChipAdjust = 'none' | 'qfq' | 'hfq';

/**
 * 筹码分布计算所需的单根 K 线（比 KLineData 多出换手率与成交额）
 */
export interface ChipKlineBar {
  /** 时间戳（该交易日/交易周的零点，本地时区） */
  time: number;
  /** 日期字符串，格式 YYYY-MM-DD（东财原始值） */
  date: string;
  /** 开盘价 */
  open: number;
  /** 收盘价 */
  close: number;
  /** 最高价 */
  high: number;
  /** 最低价 */
  low: number;
  /** 成交量（手） */
  volume: number;
  /** 成交额（元） */
  amount: number;
  /** 换手率（百分比，例如 15.89 表示 15.89%） */
  turnoverRate: number;
}

/** 百分比筹码区间（70% / 90%） */
export interface ChipPercentRange {
  /** 区间下沿（元） */
  low: number;
  /** 区间上沿（元） */
  high: number;
  /** 集中度 = (上沿 - 下沿) / (上沿 + 下沿)，越小说明筹码越集中 */
  concentration: number;
}

/** 筹码分布计算结果 */
export interface ChipDistribution {
  /** 价格分箱价位（从低到高） */
  prices: number[];
  /** 各价位对应的筹码量，与 prices 一一对应 */
  amounts: number[];
  /** 筹码总量 */
  totalChips: number;
  /** 计算时采用的收盘价（即最后一根 K 线的收盘价） */
  close: number;
  /** 获利比例 0~1（现价以下的筹码占比） */
  benefitRatio: number;
  /** 平均成本（累计 50% 筹码处的价位，元） */
  avgCost: number;
  /** 70% 成本区间 */
  range70: ChipPercentRange;
  /** 90% 成本区间 */
  range90: ChipPercentRange;
  /** 计算窗口内 K 线根数 */
  barCount: number;
}
