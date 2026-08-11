/**
 * 历史回测结果导出（最新交易日命中 / 历史好买点）
 * Electron 下写入 docs/回测优化/最新买点 或 docs/回测优化/历史买点
 */

import type { BuyPointSignal, LatestScenarioSignal } from '@/utils/analysis/buypointScenario';
import { logger } from '@/utils/business/logger';

export type BacktestExportKind = 'latest' | 'history';
export type BacktestExportFormat = 'json' | 'xlsx';

type ExportableSignal = BuyPointSignal | LatestScenarioSignal;

function formatReturn(value: number | null | undefined): string | number {
  if (value == null) return '';
  return Number(value.toFixed(2));
}

function getDateStamp(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getKindLabel(kind: BacktestExportKind): string {
  return kind === 'latest' ? '最新交易日命中' : '历史好买点';
}

/** 将 2026/08/10 或 2026-08-10 统一为文件名用日期 */
export function normalizeExportDate(date: string): string {
  return date.trim().replace(/\//g, '-');
}

/** 最新买点：按数据日期（众数）命名 */
export function resolveLatestExportDate(
  data: LatestScenarioSignal[],
  fallbackDate?: string | null
): string {
  const counts = new Map<string, number>();
  data.forEach((item) => {
    if (!item.date) return;
    const key = normalizeExportDate(item.date);
    counts.set(key, (counts.get(key) || 0) + 1);
  });

  let best = '';
  let bestCount = 0;
  counts.forEach((count, date) => {
    if (count > bestCount) {
      best = date;
      bestCount = count;
    }
  });

  if (best) return best;
  if (fallbackDate) return normalizeExportDate(fallbackDate);
  return getDateStamp();
}

/** 历史买点：按 K 线众数截止日（最新交易日）当天命名 */
export function resolveHistoryExportDate(cutoffDate?: string | null): string {
  if (cutoffDate) return normalizeExportDate(cutoffDate);
  return getDateStamp();
}

function toLatestRow(item: LatestScenarioSignal) {
  const concepts = ((item as any).concepts || []) as Array<{ name: string }>;
  return {
    代码: item.code,
    名称: item.name,
    数据日期: item.date,
    场景: item.scenarioName,
    场景ID: item.scenario,
    收盘价: item.close,
    lift: item.lift ?? '',
    '1日收益%': formatReturn(item.returns.d1),
    '2日收益%': formatReturn(item.returns.d2),
    '3日收益%': formatReturn(item.returns.d3),
    '5日收益%': formatReturn(item.returns.d5),
    '两周收益%': formatReturn(item.returns.d10),
    命中规则: item.matchedRule,
    行业: item.industry?.name || '',
    概念: concepts.map((concept) => concept.name).join('、'),
  };
}

function toHistoryRow(item: BuyPointSignal) {
  const concepts = ((item as any).concepts || []) as Array<{ name: string }>;
  return {
    代码: item.code,
    名称: item.name,
    买点日期: item.date,
    场景: item.scenarioName,
    场景ID: item.scenario,
    买入价: item.entryPrice,
    命中项: item.hitCount,
    '1日收益%': formatReturn(item.returns.d1),
    '2日收益%': formatReturn(item.returns.d2),
    '3日收益%': formatReturn(item.returns.d3),
    '5日收益%': formatReturn(item.returns.d5),
    '两周收益%': formatReturn(item.returns.d10),
    命中规则: item.matchedRule,
    行业: item.industry?.name || '',
    概念: concepts.map((concept) => concept.name).join('、'),
  };
}

function toExportRows(kind: BacktestExportKind, data: ExportableSignal[]) {
  if (kind === 'latest') {
    return (data as LatestScenarioSignal[]).map(toLatestRow);
  }
  return (data as BuyPointSignal[]).map(toHistoryRow);
}

async function saveViaElectron(params: {
  kind: BacktestExportKind;
  format: BacktestExportFormat;
  fileBaseName: string;
  content: string | number[];
}): Promise<string> {
  if (!window.electronAPI?.exportBacktestSignalsFile) {
    throw new Error('导出到项目目录不可用（需在 Electron 环境中运行）');
  }
  const result = await window.electronAPI.exportBacktestSignalsFile(params);
  if (!result.success || !result.filePath) {
    throw new Error(result.error || '写入文件失败');
  }
  return result.filePath;
}

export interface BacktestExportOptions {
  kind: BacktestExportKind;
  data: ExportableSignal[];
  fileBaseName: string;
  meta?: Record<string, unknown>;
}

/** 导出为 JSON 到 docs/回测优化 对应目录 */
export async function exportBacktestSignalsToJson(
  options: BacktestExportOptions
): Promise<string> {
  const { kind, data, fileBaseName, meta } = options;
  try {
    const payload = {
      exportedAt: new Date().toISOString(),
      kind,
      kindLabel: getKindLabel(kind),
      count: data.length,
      fileBaseName,
      meta: meta || {},
      items: data,
    };
    return await saveViaElectron({
      kind,
      format: 'json',
      fileBaseName,
      content: JSON.stringify(payload, null, 2),
    });
  } catch (error) {
    logger.error('[BacktestExport] JSON 导出失败:', error);
    throw error instanceof Error ? error : new Error('JSON 导出失败');
  }
}

/** 导出为 Excel 到 docs/回测优化 对应目录 */
export async function exportBacktestSignalsToExcel(
  options: BacktestExportOptions
): Promise<string> {
  const { kind, data, fileBaseName } = options;
  try {
    const XLSX = await import('xlsx').catch(() => {
      throw new Error('xlsx库未安装，请运行: npm install xlsx');
    });

    const rows = toExportRows(kind, data);
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(rows);
    const sheetName = getKindLabel(kind).slice(0, 31);
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);

    const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' }) as number[];
    return await saveViaElectron({
      kind,
      format: 'xlsx',
      fileBaseName,
      content: Array.from(excelBuffer),
    });
  } catch (error) {
    logger.error('[BacktestExport] Excel 导出失败:', error);
    throw error instanceof Error ? error : new Error('Excel 导出失败');
  }
}
