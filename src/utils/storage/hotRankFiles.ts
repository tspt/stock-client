/**
 * 热门榜本地 JSON 文件存储（Electron IPC）
 * - 24小时：docs/回测优化/热门榜/{YYYY-MM-DD}.json
 * - 1小时：docs/回测优化/热门榜/{YYYY-MM-DD}_{HH}.json
 */

import type { ThsHotRankItem, ThsHotRankPeriod, ThsHotRankFilePayload } from '@/types/thsHotRank';
import { logger } from '@/utils/business/logger';

const DATE_FILE_PATTERN = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;

function getLocalDateString(): string {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// 1小时文件名用，暂不落盘
// function getLocalHourString(): string {
//   return String(new Date().getHours()).padStart(2, '0');
// }

function pureCode(code: string): string {
  return code.replace(/^(SH|SZ)/i, '');
}

/**
 * 保存热门榜：day 写无后缀日期文件，hour 写带本地小时后缀
 */
export async function saveHotRankToFile(items: ThsHotRankItem[], period: ThsHotRankPeriod): Promise<void> {
  // 1小时暂不生成 JSON（YYYY-MM-DD_HH.json）
  if (period === 'hour') {
    return;
  }

  const api = window.electronAPI;
  if (!api?.writeHotRankFile) {
    logger.warn('[HotRankFiles] 写入不可用（需在 Electron 环境中运行并重启应用）');
    return;
  }

  const date = getLocalDateString();
  // const fileBaseName = period === 'hour' ? `${date}_${getLocalHourString()}` : date;
  const fileBaseName = date;
  const result = await api.writeHotRankFile({
    fileBaseName,
    content: JSON.stringify(items),
    period,
  });

  if (!result.success) {
    throw new Error(result.error || '保存热门榜文件失败');
  }

  logger.info('[HotRankFiles] 热门榜已保存:', {
    date,
    fileBaseName,
    period,
    count: items.length,
    filePath: result.filePath,
  });
}

/**
 * 从 24 小时热门榜文件内容解析股票代码集合（含纯代码）
 */
export function extractHotRankDayCodes(content: unknown): Set<string> {
  const codes = new Set<string>();
  if (!content || typeof content !== 'object') {
    return codes;
  }

  const raw = content as ThsHotRankFilePayload;
  const list = Array.isArray(raw.day) ? raw.day : [];
  list.forEach((item) => {
    if (!item?.code) return;
    codes.add(item.code);
    codes.add(pureCode(item.code));
  });
  return codes;
}

/**
 * 读取指定日期的 24 小时热门榜代码集合
 * @returns null 表示文件不存在；空 Set 表示文件存在但无人上榜
 */
export async function readHotRankDayCodes(date: string): Promise<Set<string> | null> {
  const api = window.electronAPI;
  if (!api?.readHotRankDayFile) {
    throw new Error('读取热门榜文件不可用（需在 Electron 环境中运行并重启应用）');
  }

  const dateKey = date.trim().replace(/\//g, '-');
  if (!DATE_FILE_PATTERN.test(dateKey)) {
    throw new Error(`非法热门榜日期: ${date}`);
  }

  const result = await api.readHotRankDayFile(dateKey);
  if (!result.success) {
    throw new Error(result.error || '读取热门榜文件失败');
  }
  if (!result.exists || result.content == null) {
    return null;
  }

  return extractHotRankDayCodes(result.content);
}

/**
 * 按信号日批量加载 24 小时热门榜代码映射
 * 当天缺失时可选择由调用方先请求再重读
 */
export async function loadHotRankDayCodeMap(dates: string[]): Promise<Map<string, Set<string>>> {
  const map = new Map<string, Set<string>>();
  const uniqueDates = Array.from(new Set(dates.map((d) => d.trim().replace(/\//g, '-')).filter((d) => DATE_FILE_PATTERN.test(d))));

  for (const date of uniqueDates) {
    try {
      const codes = await readHotRankDayCodes(date);
      map.set(date, codes ?? new Set());
    } catch (error) {
      logger.warn('[HotRankFiles] 读取热门榜失败:', { date, error });
      map.set(date, new Set());
    }
  }

  return map;
}

export { getLocalDateString };
