/**
 * 机会记录本地 JSON 文件存储（Electron IPC）
 * 路径：docs/回测优化/机会记录/{YYYY-MM-DD}.json
 */

import type { StockRecord, StockRecordItem } from '@/types/stock';
import { logger } from '@/utils/business/logger';

const DATE_FILE_PATTERN = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;

export interface OpportunityRecordFilePayload {
  version: string;
  kind: 'opportunity-record';
  date: string;
  createdAt: number;
  updatedAt: number;
  stocks: StockRecordItem[];
}

let cachedRecords: StockRecord[] | null = null;

function invalidateCache(): void {
  cachedRecords = null;
}

export function invalidateOpportunityRecordCache(): void {
  invalidateCache();
}

function ensureElectronAPI() {
  const api = window.electronAPI;
  if (!api?.writeOpportunityRecordFile || !api?.readOpportunityRecordFiles) {
    throw new Error('机会记录文件功能不可用（需在 Electron 环境中运行并重启应用）');
  }
  return api;
}

export function buildRecordFilePayload(record: StockRecord): OpportunityRecordFilePayload {
  return {
    version: '1.0',
    kind: 'opportunity-record',
    date: record.date,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    stocks: record.stocks,
  };
}

export function parseRecordFileContent(content: unknown, fileBaseName: string): StockRecord | null {
  if (!content || typeof content !== 'object') {
    return null;
  }

  const raw = content as Record<string, unknown>;

  if (raw.kind === 'opportunity-record' && typeof raw.date === 'string') {
    const stocks = Array.isArray(raw.stocks) ? (raw.stocks as StockRecordItem[]) : [];
    return {
      date: raw.date,
      stocks,
      createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : Date.now(),
      updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : Date.now(),
    };
  }

  if (typeof raw.date === 'string' && Array.isArray(raw.stocks)) {
    return {
      date: raw.date,
      stocks: raw.stocks as StockRecordItem[],
      createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : Date.now(),
      updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : Date.now(),
    };
  }

  if (DATE_FILE_PATTERN.test(fileBaseName)) {
    logger.warn(`[OpportunityRecordFiles] 无法解析 ${fileBaseName}.json，已跳过`);
  }

  return null;
}

export async function saveStockRecordToFile(record: StockRecord): Promise<void> {
  const api = ensureElectronAPI();
  const payload = buildRecordFilePayload(record);
  const result = await api.writeOpportunityRecordFile({
    fileBaseName: record.date,
    content: JSON.stringify(payload, null, 2),
  });

  if (!result.success) {
    throw new Error(result.error || '保存机会记录文件失败');
  }

  invalidateCache();
}

export async function getAllStockRecordsFromFiles(): Promise<StockRecord[]> {
  if (cachedRecords) {
    return cachedRecords;
  }

  const api = ensureElectronAPI();
  const result = await api.readOpportunityRecordFiles();

  if (!result.success) {
    throw new Error(result.error || '读取机会记录文件失败');
  }

  const records: StockRecord[] = [];

  for (const file of result.files || []) {
    const record = parseRecordFileContent(file.content, file.fileBaseName);
    if (record) {
      records.push(record);
    }
  }

  records.sort((a, b) => a.date.localeCompare(b.date));
  cachedRecords = records;
  return records;
}

export async function deleteStockRecordFile(date: string): Promise<void> {
  const api = ensureElectronAPI();
  const result = await api.deleteOpportunityRecordFile(date);

  if (!result.success) {
    throw new Error(result.error || '删除机会记录文件失败');
  }

  invalidateCache();
}

export async function clearAllStockRecordFiles(): Promise<void> {
  const api = ensureElectronAPI();
  const result = await api.clearOpportunityRecordFiles();

  if (!result.success) {
    throw new Error(result.error || '清空机会记录文件失败');
  }

  invalidateCache();
}
