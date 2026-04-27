/**
 * 成分股数据导出导入工具
 * 支持将 IndexedDB 中的成分股数据导出为 JSON 文件，以及从 JSON 文件导入
 */

import {
  getIndustrySectors,
  getConceptSectors,
  saveIndustrySectors,
  saveConceptSectors,
  clearSectorStocksDB,
  type SectorWithStocks,
} from '../storage/sectorStocksIndexedDB';
import { logger } from '../business/logger';

/**
 * 导出数据文件格式
 */
export interface SectorStocksExportData {
  version: string;
  exportTime: string;
  dataType: 'sector-stocks';
  industrySectors: SectorWithStocks[];
  conceptSectors: SectorWithStocks[];
}

/**
 * 导入模式
 */
export type ImportMode = 'overwrite' | 'merge';

/**
 * 导入结果
 */
export interface ImportResult {
  success: boolean;
  message: string;
  industryCount?: number;
  conceptCount?: number;
}

/**
 * 导出成分股数据为 JSON 文件
 */
export async function exportSectorStocksToJSON(): Promise<void> {
  try {
    logger.info('[SectorStocksExport] 开始导出成分股数据');

    // 从 IndexedDB 读取数据
    const [industrySectors, conceptSectors] = await Promise.all([
      getIndustrySectors(),
      getConceptSectors(),
    ]);

    // 构建导出数据
    const exportData: SectorStocksExportData = {
      version: '1.0',
      exportTime: new Date().toISOString(),
      dataType: 'sector-stocks',
      industrySectors,
      conceptSectors,
    };

    // 转换为 JSON 字符串
    const jsonStr = JSON.stringify(exportData, null, 2);

    // 创建 Blob 并下载
    const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    link.href = url;
    link.download = `成分股数据_${timestamp}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    logger.info(
      `[SectorStocksExport] 导出成功 - 行业: ${industrySectors.length}, 概念: ${conceptSectors.length}`
    );
  } catch (error) {
    logger.error('[SectorStocksExport] 导出失败:', error);
    throw new Error('导出成分股数据失败');
  }
}

/**
 * 从 JSON 文件导入成分股数据
 * @param file JSON 文件
 * @param mode 导入模式：'overwrite' 覆盖现有数据，'merge' 合并到现有数据
 */
export async function importSectorStocksFromJSON(
  file: File,
  mode: ImportMode = 'overwrite'
): Promise<ImportResult> {
  try {
    logger.info(`[SectorStocksExport] 开始导入成分股数据 (模式: ${mode})`);

    // 读取文件内容
    const text = await readFileAsText(file);
    const importData: SectorStocksExportData = JSON.parse(text);

    // 验证数据格式
    if (!validateExportData(importData)) {
      throw new Error('数据格式不正确');
    }

    let industryCount = 0;
    let conceptCount = 0;

    if (mode === 'overwrite') {
      // 覆盖模式：先清空再导入
      await clearSectorStocksDB();
      await saveIndustrySectors(importData.industrySectors, false);
      await saveConceptSectors(importData.conceptSectors, false);
      industryCount = importData.industrySectors.length;
      conceptCount = importData.conceptSectors.length;
    } else {
      // 合并模式：增量保存
      await saveIndustrySectors(importData.industrySectors, true);
      await saveConceptSectors(importData.conceptSectors, true);
      industryCount = importData.industrySectors.length;
      conceptCount = importData.conceptSectors.length;
    }

    logger.info(`[SectorStocksExport] 导入成功 - 行业: ${industryCount}, 概念: ${conceptCount}`);

    return {
      success: true,
      message: `导入成功！行业板块: ${industryCount} 个，概念板块: ${conceptCount} 个`,
      industryCount,
      conceptCount,
    };
  } catch (error: any) {
    logger.error('[SectorStocksExport] 导入失败:', error);
    return {
      success: false,
      message: error.message || '导入失败，请检查文件格式',
    };
  }
}

/**
 * 读取文件内容为文本
 */
function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target?.result as string);
    reader.onerror = () => reject(new Error('文件读取失败'));
    reader.readAsText(file);
  });
}

/**
 * 验证导出数据格式
 */
function validateExportData(data: any): data is SectorStocksExportData {
  return (
    data &&
    typeof data === 'object' &&
    data.dataType === 'sector-stocks' &&
    Array.isArray(data.industrySectors) &&
    Array.isArray(data.conceptSectors)
  );
}
