/**
 * 同花顺热股榜数据服务
 */

import { API_BASE } from '@/config/environment';
import type { ThsHotRankItem, ThsHotRankPeriod, ThsHotRankRawItem, ThsHotRankRawResponse } from '@/types/thsHotRank';
import { logger } from '@/utils/business/logger';
import { saveHotRankToFile } from '@/utils/storage/hotRankFiles';

const HOT_LIST_PATH = 'fuyao/hot_list_data/out/hot_list/v1/stock';

function toNumber(value: string | number | undefined): number | null {
  if (value == null || value === '') {
    return null;
  }
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function mapRawItem(item: ThsHotRankRawItem): ThsHotRankItem {
  const conceptTags = Array.isArray(item.tag?.concept_tag)
    ? item.tag.concept_tag.filter((tag) => Boolean(tag))
    : [];

  return {
    rank: item.order,
    code: item.code,
    name: item.name,
    hotValue: toNumber(item.rate),
    changePercent: toNumber(item.rise_and_fall),
    rankChange: toNumber(item.hot_rank_chg),
    popularityTag: item.tag?.popularity_tag ? String(item.tag.popularity_tag).replace(/\n/g, '') : '',
    conceptTags,
  };
}

/**
 * 获取同花顺 A 股热股榜
 * @param period hour=1小时 day=24小时
 */
export async function fetchThsHotRank(period: ThsHotRankPeriod = 'hour'): Promise<ThsHotRankItem[]> {
  const url = new URL(HOT_LIST_PATH, `${API_BASE.THS_HOT}/`);
  url.searchParams.set('stock_type', 'a');
  url.searchParams.set('type', period);
  url.searchParams.set('list_type', 'normal');

  logger.info('[ThsHotRank] 请求同花顺热股榜:', { url: url.toString() });

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      Accept: 'application/json, text/plain, */*',
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const data = (await response.json()) as ThsHotRankRawResponse;

  if (data.status_code !== 0) {
    throw new Error(data.status_msg || '同花顺热股榜返回异常');
  }

  const list = data.data?.stock_list;
  if (!list || list.length === 0) {
    try {
      await saveHotRankToFile([], period);
    } catch (error) {
      logger.error('[ThsHotRank] 保存热门榜到本地失败:', error);
    }
    return [];
  }

  const result = list.map(mapRawItem);
  logger.info('[ThsHotRank] 获取同花顺热股榜成功:', { count: result.length });

  try {
    await saveHotRankToFile(result, period);
  } catch (error) {
    logger.error('[ThsHotRank] 保存热门榜到本地失败:', error);
  }

  return result;
}
