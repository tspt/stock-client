/**
 * 热门榜本地 JSON 文件存储（Electron IPC）
 * 路径：docs/回测优化/热门榜/{YYYY-MM-DD}.json
 */

import type { ThsHotRankItem, ThsHotRankPeriod } from '@/types/thsHotRank';
import { logger } from '@/utils/business/logger';

function getLocalDateString(): string {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export async function saveHotRankToFile(items: ThsHotRankItem[], period: ThsHotRankPeriod): Promise<void> {
  const api = window.electronAPI;
  if (!api?.writeHotRankFile) {
    logger.warn('[HotRankFiles] 写入不可用（需在 Electron 环境中运行并重启应用）');
    return;
  }

  const date = getLocalDateString();
  const result = await api.writeHotRankFile({
    fileBaseName: date,
    content: JSON.stringify(items),
    period,
  });

  if (!result.success) {
    throw new Error(result.error || '保存热门榜文件失败');
  }

  logger.info('[HotRankFiles] 热门榜已保存:', { date, period, count: items.length, filePath: result.filePath });
}
