/**
 * F10 资料（股东人数 / 十大流通股东 / 机构持仓）导出导入工具
 *
 * 支持将 IndexedDB (StockF10DB.f10_detail) 中的数据导出为 JSON 文件，
 * 以及从 JSON 文件导入：`overwrite` 覆盖导入、`merge` 合并导入。
 *
 * 合并导入语义（以「股票代码」为粒度）：
 * - JSON 中存在的 code：覆盖库中对应记录（无论库中此前有没有）；
 * - JSON 中不存在的 code：保留库中记录不动。
 * 等价于对 JSON 每条记录做一次 `put()`，不做整表清空。
 */

import {
  getAllF10Cache,
  saveF10Records,
} from '../storage/f10IndexedDB';
import { F10_CACHE_SCHEMA_VERSION } from '../config/constants';
import type { F10CacheRecord } from '@/types/f10';
import { logger } from '../business/logger';

/**
 * 导出数据文件格式
 *
 * `records` 与 `F10CacheRecord` 同构：以 code 为主键，内部含三个区块各自的 `updatedAt`。
 */
export interface F10ExportData {
  version: string;
  exportTime: string;
  dataType: 'stock-f10';
  records: F10CacheRecord[];
}

/** 导入模式：overwrite 覆盖现有数据，merge 合并到现有数据 */
export type F10ImportMode = 'overwrite' | 'merge';

/** 导入结果 */
export interface F10ImportResult {
  success: boolean;
  message: string;
  count?: number;
}

/**
 * 从记录集合中取三个区块最新的 `updatedAt`，作为页面「最后更新」的参考时间。
 * 无有效时间时返回 0。
 */
export function getLatestF10UpdateTime(records: F10CacheRecord[]): number {
  return records.reduce((max, record) => {
    const times = [
      record.holderNum?.updatedAt,
      record.freeHolders?.updatedAt,
      record.orgHoldings?.updatedAt,
    ].filter((time): time is number => typeof time === 'number');
    return times.length > 0 ? Math.max(max, ...times) : max;
  }, 0);
}

/**
 * 导出 F10 资料为 JSON 文件
 * Electron 环境静默落盘到 docs/回测优化/F10资料数据.json，否则回退浏览器 Blob 下载
 */
export async function exportF10ToJSON(): Promise<void> {
  try {
    logger.info('[F10Export] 开始导出 F10 资料数据');

    const records = await getAllF10Cache();

    const exportData: F10ExportData = {
      version: '1.0',
      exportTime: new Date().toISOString(),
      dataType: 'stock-f10',
      records,
    };

    const jsonStr = JSON.stringify(exportData, null, 2);

    // Electron 环境优先静默落盘
    if (window.electronAPI?.writeBacktestOptimizeFile) {
      const res = await window.electronAPI.writeBacktestOptimizeFile({
        fileName: 'F10资料数据.json',
        content: jsonStr,
      });
      if (!res.success) {
        throw new Error(res.error || '写入 F10资料数据.json 失败');
      }
      logger.info(
        `[F10Export] 静默导出成功至 docs/回测优化/F10资料数据.json - 共 ${records.length} 只股票`
      );
      return;
    }

    // 非 Electron 环境回退为浏览器 Blob 下载
    const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    link.href = url;
    link.download = `F10资料数据_${timestamp}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    logger.info(`[F10Export] 导出成功 - 共 ${records.length} 只股票`);
  } catch (error) {
    logger.error('[F10Export] 导出失败:', error);
    throw new Error('导出 F10 资料数据失败');
  }
}

/**
 * 从 JSON 文件导入 F10 资料
 * @param file JSON 文件
 * @param mode 导入模式：'overwrite' 先清空再写入，'merge' 按 code 覆盖并保留库中独有记录
 */
export async function importF10FromJSON(
  file: File,
  mode: F10ImportMode = 'merge'
): Promise<F10ImportResult> {
  try {
    logger.info(`[F10Export] 开始导入 F10 资料数据 (模式: ${mode})`);

    const text = await readFileAsText(file);
    const importData: F10ExportData = JSON.parse(text);

    if (!validateExportData(importData)) {
      throw new Error('数据格式不正确');
    }

    // 过滤无效记录并统一补当前结构版本，避免旧 JSON 被读取层当作过期数据丢弃
    const records: F10CacheRecord[] = importData.records
      .filter((record) => record && typeof record.code === 'string')
      .map((record) => ({ ...record, schemaVersion: F10_CACHE_SCHEMA_VERSION }));

    if (records.length === 0) {
      throw new Error('文件中没有有效的 F10 数据');
    }

    // 覆盖模式：先清空再写入；合并模式：按 code 覆盖，库中独有记录保留
    await saveF10Records(records, mode === 'merge');

    logger.info(`[F10Export] 导入成功 - 共 ${records.length} 只股票`);

    return {
      success: true,
      message: `导入成功！共 ${records.length} 只股票的 F10 数据`,
      count: records.length,
    };
  } catch (error: any) {
    logger.error('[F10Export] 导入失败:', error);
    return {
      success: false,
      message: error.message || '导入失败，请检查文件格式',
    };
  }
}

/** 读取文件内容为文本 */
function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target?.result as string);
    reader.onerror = () => reject(new Error('文件读取失败'));
    reader.readAsText(file);
  });
}

/** 验证导出数据格式 */
function validateExportData(data: any): data is F10ExportData {
  return (
    data &&
    typeof data === 'object' &&
    data.dataType === 'stock-f10' &&
    Array.isArray(data.records)
  );
}
