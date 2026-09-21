/**
 * 营收/净利润财务指标导出导入工具
 * 支持将 IndexedDB (StockOpportunityDB.stockFinanceMetrics) 中的数据导出为 JSON 文件，以及从 JSON 文件导入
 */

import {
  getAllStockFinanceMetrics,
  saveStockFinanceMetrics,
  clearStockFinanceMetrics,
  type StockFinanceRecord,
} from '../storage/opportunityIndexedDB';
import { logger } from '../business/logger';

/**
 * 导出数据文件格式
 */
export interface StockFinanceExportData {
  version: string;
  exportTime: string;
  dataType: 'stock-finance-metrics';
  records: StockFinanceRecord[];
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
  count?: number;
}

/**
 * 导出营收/净利润指标为 JSON 文件
 * Electron 环境静默落盘到 docs/回测优化/营收净利润数据.json，否则回退浏览器 Blob 下载
 */
export async function exportStockFinanceToJSON(): Promise<void> {
  try {
    logger.info('[StockFinanceExport] 开始导出营收净利润数据');

    const records = await getAllStockFinanceMetrics();

    const exportData: StockFinanceExportData = {
      version: '1.0',
      exportTime: new Date().toISOString(),
      dataType: 'stock-finance-metrics',
      records,
    };

    const jsonStr = JSON.stringify(exportData, null, 2);

    // 如果处于 Electron 环境，优先静默落盘到 docs/回测优化/营收净利润数据.json
    if (window.electronAPI?.writeBacktestOptimizeFile) {
      const res = await window.electronAPI.writeBacktestOptimizeFile({
        fileName: '营收净利润数据.json',
        content: jsonStr,
      });
      if (!res.success) {
        throw new Error(res.error || '写入营收净利润数据.json失败');
      }
      logger.info(
        `[StockFinanceExport] 静默导出成功至 docs/回测优化/营收净利润数据.json - 共 ${records.length} 条`
      );
      return;
    }

    // 非 Electron 环境回退为浏览器 Blob 下载
    const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    link.href = url;
    link.download = `营收净利润数据_${timestamp}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    logger.info(`[StockFinanceExport] 导出成功 - 共 ${records.length} 条`);
  } catch (error) {
    logger.error('[StockFinanceExport] 导出失败:', error);
    throw new Error('导出营收净利润数据失败');
  }
}

/**
 * 从 JSON 文件导入营收/净利润指标
 * @param file JSON 文件
 * @param mode 导入模式：'overwrite' 覆盖现有数据，'merge' 合并到现有数据
 */
export async function importStockFinanceFromJSON(
  file: File,
  mode: ImportMode = 'overwrite'
): Promise<ImportResult> {
  try {
    logger.info(`[StockFinanceExport] 开始导入营收净利润数据 (模式: ${mode})`);

    // 读取文件内容
    const text = await readFileAsText(file);
    const importData: StockFinanceExportData = JSON.parse(text);

    // 验证数据格式
    if (!validateExportData(importData)) {
      throw new Error('数据格式不正确');
    }

    const records = importData.records.filter(
      (record) => record && typeof record.code === 'string' && record.metrics
    );

    if (records.length === 0) {
      throw new Error('文件中没有有效的财务指标数据');
    }

    // 覆盖模式：先清空再导入；合并模式：直接按 code 覆盖写入
    if (mode === 'overwrite') {
      await clearStockFinanceMetrics();
    }
    await saveStockFinanceMetrics(records);

    logger.info(`[StockFinanceExport] 导入成功 - 共 ${records.length} 条`);

    return {
      success: true,
      message: `导入成功！共 ${records.length} 条营收净利润数据`,
      count: records.length,
    };
  } catch (error: any) {
    logger.error('[StockFinanceExport] 导入失败:', error);
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
function validateExportData(data: any): data is StockFinanceExportData {
  return (
    data &&
    typeof data === 'object' &&
    data.dataType === 'stock-finance-metrics' &&
    Array.isArray(data.records)
  );
}
