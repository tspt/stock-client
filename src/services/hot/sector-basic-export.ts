/**
 * 板块基础信息快照导出服务
 *
 * 职责：刷新板块基础信息 → 裁剪为 { code, name } → 落盘 docs/回测优化/{行业板块|概念板块}.json
 * 边界：快照只保留 code / name，行情字段（主力净流入等）一律走实时接口，不进入缓存与快照
 */

import {
  refreshIndustrySectorsBasic,
  refreshConceptSectorsBasic,
} from './unified-sectors';
import { logger } from '@/utils/business/logger';

/** 板块类型：industry=行业板块，concept=概念板块 */
export type SectorBasicType = 'industry' | 'concept';

/** 快照唯一字段 */
export interface SectorBasicSnapshotItem {
  code: string;
  name: string;
}

/** 快照文件名（需与 electron 主进程 ALLOWED_FILES 保持一致） */
export const SECTOR_BASIC_EXPORT_FILE_NAME: Record<SectorBasicType, string> = {
  industry: '行业板块.json',
  concept: '概念板块.json',
};

/**
 * 裁剪为快照字段，防止基础信息类型未来新增字段被带入缓存或文件
 */
export function pickSectorBasicFields<T extends { code: string; name: string }>(
  sectors: T[]
): SectorBasicSnapshotItem[] {
  return sectors.map(({ code, name }) => ({ code, name }));
}

/**
 * 刷新板块基础信息并导出快照
 * @param type industry=行业板块，concept=概念板块
 * @returns 已裁剪为 { code, name } 的数据
 */
export async function refreshAndExportSectorBasic(
  type: SectorBasicType
): Promise<SectorBasicSnapshotItem[]> {
  const basics =
    type === 'industry' ? await refreshIndustrySectorsBasic() : await refreshConceptSectorsBasic();

  const snapshot = pickSectorBasicFields(basics);
  const fileName = SECTOR_BASIC_EXPORT_FILE_NAME[type];

  if (window.electronAPI?.writeBacktestOptimizeFile) {
    const res = await window.electronAPI.writeBacktestOptimizeFile({
      fileName,
      content: JSON.stringify(snapshot, null, 4),
    });
    if (!res.success) {
      throw new Error(res.error || `写入${fileName}失败`);
    }
    logger.info(`[SectorBasicExport] 已导出 ${fileName}，共 ${snapshot.length} 条`);
  }

  return snapshot;
}
