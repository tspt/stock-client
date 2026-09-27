/**
 * 东方财富 F10 资料领域类型
 *
 * 数据来源：`https://datacenter.eastmoney.com/securities/api/data/v1/get`，
 * 详见 `docs/回测优化/历史买点/获取股东人数.md`。
 * 接口原始字段名随东财版本可能增删，这里的字段是「已归一化 + 防御性解析」后的结果：
 * 东财大量字段会返回 `null`（如早期报告期的 HOLD_RATIO_TOTAL），统一收敛为 `null`，
 * 展示层负责把 `null` 渲染成 `-`。
 */

/** F10 三个纵向区块的标识（同时作为 IndexedDB 缓存字段名与组件 key） */
export type F10SectionKey = 'holderNum' | 'freeHolders' | 'orgHoldings';

/** 股东人数（RPT_F10_EH_HOLDERNUM），一次返回全部报告期，按 END_DATE 倒序 */
export interface HolderNumItem {
  /** 报告期（YYYY-MM-DD） */
  endDate: string;
  /** 股东总户数 */
  holderTotalNum: number | null;
  /** 股东户数较上期增减比（%），负值表示户数减少（筹码趋向集中） */
  totalNumRatio: number | null;
  /** 户均流通股（股） */
  avgFreeShares: number | null;
  /** 户均流通股较上期增减比（%） */
  avgFreeSharesRatio: number | null;
  /** 筹码集中度描述：非常集中 / 较集中 / 较分散 */
  holdFocus: string;
  /** 该报告期收盘价 */
  price: number | null;
  /** 户均持股市值（元） */
  avgHoldAmt: number | null;
  /** 十大股东持股合计占流通股比（%，HOLD_RATIO_TOTAL） */
  holdRatioTotal: number | null;
  /** 十大流通股东持股合计占流通股比（%，FREEHOLD_RATIO_TOTAL） */
  freeHoldRatioTotal: number | null;
}

/** 十大流通股东（RPT_F10_EH_FREEHOLDERS），同一报告期内按 HOLDER_RANK 升序 */
export interface FreeHolderItem {
  /** 报告期（YYYY-MM-DD） */
  endDate: string;
  /** 股东名称 */
  holderName: string;
  /** 股东类型：个人 / 其它 / QFII / 证券投资基金 / 社保 等 */
  holderType: string;
  /** 持股数（股） */
  holdNum: number | null;
  /** 占流通股比（%） */
  freeHoldNumRatio: number | null;
  /** 持股变动描述：新进 / 不变 / 具体股数 */
  holdNumChange: string;
  /** 变动比例描述：新进 / 不变 / 具体百分比 */
  newChangeRatio: string;
  /** 股东排名（1 起） */
  holderRank: number;
}

/** 机构持仓合计（RPT_F10_MAIN_ORGHOLDDETAILS，ORG_TYPE=00），按 REPORT_DATE 倒序 */
export interface OrgHoldingItem {
  /** 报告期（YYYY-MM-DD） */
  reportDate: string;
  /** 持股机构家数（TOTAL_ORG_NUM） */
  totalOrgNum: number | null;
  /** 机构合计持股数·流通股口径（TOTAL_FREE_SHARES） */
  totalFreeShares: number | null;
  /** 机构合计持股数·总股本口径（TOTAL_SHARES） */
  totalShares: number | null;
  /** 机构合计持股市值（元，TOTAL_MARKET_CAP） */
  totalMarketCap: number | null;
  /** 机构合计持股占流通股比（%，TOTAL_SHARES_RATIO） */
  totalSharesRatio: number | null;
  /** 机构合计持股占总股本比例（%，ALL_SHARES_RATIO） */
  allSharesRatio: number | null;
  /** 机构持股数较上期变动比例（%） */
  changeRatio: number | null;
  /** 是否增持：'1' 增持 / '-1' 减持 */
  isIncrease: string;
  /** 该报告期收盘价 */
  closePrice: number | null;
}

/** 单个区块的缓存条目：数据 + 写入时间（用于展示「缓存于 xx」） */
export interface F10SectionCacheEntry<T> {
  /** 写入缓存的时间戳（毫秒） */
  updatedAt: number;
  data: T[];
}

/** 十大流通股东缓存条目额外记录其所属报告期，便于判断是否需要重取 */
export interface F10FreeHolderCacheEntry extends F10SectionCacheEntry<FreeHolderItem> {
  /** 该批数据对应的报告期（YYYY-MM-DD） */
  endDate: string;
}

/** IndexedDB 中按股票代码存储的整条 F10 记录（三个区块各自独立缓存） */
export interface F10CacheRecord {
  /** 主键：统一格式股票代码（SH600000 / SZ000001） */
  code: string;
  /**
   * 记录结构版本（见 `F10_CACHE_SCHEMA_VERSION`）。
   * 与当前版本不一致的记录会被读取层丢弃，避免旧结构数据被当成有效缓存。
   */
  schemaVersion?: number;
  holderNum?: F10SectionCacheEntry<HolderNumItem>;
  freeHolders?: F10FreeHolderCacheEntry;
  orgHoldings?: F10SectionCacheEntry<OrgHoldingItem>;
}
