/**
 * 同花顺热股榜类型
 */

export interface ThsHotRankTag {
  concept_tag?: string[];
  popularity_tag?: string;
}

export interface ThsHotRankRawItem {
  market?: number;
  code: string;
  name: string;
  rate?: string | number;
  rise_and_fall?: number;
  hot_rank_chg?: number;
  order: number;
  tag?: ThsHotRankTag;
}

export interface ThsHotRankRawResponse {
  status_code: number;
  status_msg?: string;
  data?: {
    stock_list?: ThsHotRankRawItem[];
  };
}

export interface ThsHotRankItem {
  rank: number;
  code: string;
  name: string;
  hotValue: number | null;
  changePercent: number | null;
  rankChange: number | null;
  popularityTag: string;
  conceptTags: string[];
}

export type ThsHotRankPeriod = 'hour' | 'day';

export interface ThsHotRankFilePayload {
  version: string;
  kind: 'hot-rank';
  date: string;
  createdAt: number;
  updatedAt: number;
  source: 'ths';
  /** hour | day，分文件保存后标识周期 */
  period?: ThsHotRankPeriod;
  /** @deprecated 兼容仅小时榜时期的文件 */
  items?: ThsHotRankItem[];
  hour?: ThsHotRankItem[];
  day?: ThsHotRankItem[];
}
