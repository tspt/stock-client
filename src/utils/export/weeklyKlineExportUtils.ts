/**
 * 周线选股结果导出（PNG）
 *
 * 项目未引入 html2canvas，这里直接用 Canvas 2D 绘制表格，
 * 与 stockNamesExportUtils 保持一致的白色底 + 微软雅黑风格。
 */

import type { WeeklyKlineAnalysis } from '@/utils/analysis/weeklyKlineAnalysis';

const FONT_FAMILY = '"Microsoft YaHei", "PingFang SC", "Noto Sans SC", sans-serif';
const FONT_SIZE = 13;
const LINE_HEIGHT = 26;
const PAD_X = 24;
const PAD_Y = 24;
const HEADER_FONT_SIZE = 18;

interface WeeklyExportColumn {
  title: string;
  width: number;
  align: 'left' | 'right';
  get: (row: WeeklyKlineAnalysis) => string;
}

function fixed(value: number | undefined, digits = 2): string {
  return value === undefined || !Number.isFinite(value) ? '-' : value.toFixed(digits);
}

function formatPercent(value: number | undefined, digits = 2): string {
  return value === undefined || !Number.isFinite(value) ? '-' : `${value.toFixed(digits)}%`;
}

function pureCode(code: string): string {
  return code.replace(/^(SH|SZ|BJ)/i, '');
}

const EXPORT_COLUMNS: WeeklyExportColumn[] = [
  { title: '代码', width: 70, align: 'left', get: (r) => pureCode(r.code) },
  { title: '名称', width: 90, align: 'left', get: (r) => r.name },
  { title: '最新价', width: 70, align: 'right', get: (r) => fixed(r.close) },
  {
    title: '本周涨幅',
    width: 80,
    align: 'right',
    get: (r) => formatPercent(r.weekChangePercent),
  },
  { title: 'MA5周', width: 70, align: 'right', get: (r) => fixed(r.ma5) },
  { title: 'MA10周', width: 70, align: 'right', get: (r) => fixed(r.ma10) },
  { title: 'MA20周', width: 70, align: 'right', get: (r) => fixed(r.ma20) },
  { title: '量比5周', width: 76, align: 'right', get: (r) => fixed(r.volumeRatio5) },
  { title: '20周涨幅', width: 84, align: 'right', get: (r) => formatPercent(r.change20w, 1) },
  { title: '偏离MA20', width: 84, align: 'right', get: (r) => formatPercent(r.bias20, 1) },
  { title: '评分', width: 56, align: 'right', get: (r) => String(r.score) },
  {
    title: '周线信号',
    width: 260,
    align: 'left',
    get: (r) => r.signals.map((s) => s.label).join('、') || '-',
  },
];

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function localDateStamp(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** 触发浏览器下载 dataURL（用于 ECharts 图表导出） */
export function downloadDataUrl(dataUrl: string, filename: string): void {
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * 将周线选股结果导出为 PNG 表格
 */
export function exportWeeklyResultToPng(
  rows: WeeklyKlineAnalysis[],
  options?: {
    fileNamePrefix?: string;
    /** 顶部摘要（每行一条，自动换行绘制） */
    summaryLines?: string[];
    dateStamp?: string;
    maxRows?: number;
  }
): Promise<void> {
  if (rows.length === 0) {
    return Promise.reject(new Error('没有可导出的数据'));
  }

  const maxRows = options?.maxRows ?? 200;
  const exportRows = rows.slice(0, maxRows);
  const summaryLines = options?.summaryLines ?? [];

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return Promise.reject(new Error('无法创建画布上下文'));
  }

  const summaryFontSize = 13;
  const summaryLineHeight = 20;

  // 计算列宽（取表头与内容的最大宽度）
  ctx.font = `${FONT_SIZE}px ${FONT_FAMILY}`;
  const colWidths = EXPORT_COLUMNS.map((col) => {
    let width = ctx.measureText(col.title).width;
    exportRows.forEach((row) => {
      width = Math.max(width, ctx.measureText(col.get(row)).width);
    });
    return Math.max(col.width, Math.ceil(width) + 16);
  });

  const tableWidth = colWidths.reduce((a, w) => a + w, 0);
  const cssW = Math.max(tableWidth, 900) + PAD_X * 2;
  const summaryHeight = summaryLines.length * summaryLineHeight;
  const headerHeight = 34 + summaryHeight;
  const cssH =
    PAD_Y * 2 + headerHeight + LINE_HEIGHT * (exportRows.length + 1) + (rows.length > maxRows ? LINE_HEIGHT : 0);

  const dpr = typeof window !== 'undefined' ? Math.min(2, window.devicePixelRatio || 1) : 1;
  canvas.width = Math.ceil(cssW * dpr);
  canvas.height = Math.ceil(cssH * dpr);
  canvas.style.width = `${cssW}px`;
  canvas.style.height = `${cssH}px`;
  ctx.scale(dpr, dpr);

  // 背景
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, cssW, cssH);

  // 标题
  ctx.fillStyle = '#000000';
  ctx.font = `bold ${HEADER_FONT_SIZE}px ${FONT_FAMILY}`;
  ctx.textBaseline = 'top';
  ctx.fillText('周线选股分析结果', PAD_X, PAD_Y);

  // 摘要
  if (summaryLines.length > 0) {
    ctx.font = `${summaryFontSize}px ${FONT_FAMILY}`;
    ctx.fillStyle = '#666666';
    summaryLines.forEach((line, index) => {
      ctx.fillText(line, PAD_X, PAD_Y + 26 + index * summaryLineHeight);
    });
  }

  const tableTop = PAD_Y + headerHeight;

  // 表头
  ctx.fillStyle = '#f0f5ff';
  ctx.fillRect(PAD_X, tableTop, tableWidth, LINE_HEIGHT);
  ctx.fillStyle = '#1f1f1f';
  ctx.font = `bold ${FONT_SIZE}px ${FONT_FAMILY}`;
  let x = PAD_X;
  EXPORT_COLUMNS.forEach((col, index) => {
    const text = col.title;
    const textWidth = ctx.measureText(text).width;
    const offset = col.align === 'right' ? colWidths[index] - textWidth - 8 : 8;
    ctx.fillText(text, x + offset, tableTop + 6);
    x += colWidths[index];
  });

  // 表格内容
  ctx.font = `${FONT_SIZE}px ${FONT_FAMILY}`;
  exportRows.forEach((row, rowIndex) => {
    const y = tableTop + LINE_HEIGHT * (rowIndex + 1);
    if (rowIndex % 2 === 1) {
      ctx.fillStyle = '#fafafa';
      ctx.fillRect(PAD_X, y, tableWidth, LINE_HEIGHT);
    }
    let cx = PAD_X;
    EXPORT_COLUMNS.forEach((col, colIndex) => {
      const text = col.get(row);
      let color = '#262626';
      if (col.title === '本周涨幅' || col.title === '20周涨幅') {
        const value = col.title === '本周涨幅' ? row.weekChangePercent : row.change20w;
        if (typeof value === 'number') {
          color = value > 0 ? '#cf1322' : value < 0 ? '#389e0d' : '#595959';
        }
      }
      ctx.fillStyle = color;
      const textWidth = ctx.measureText(text).width;
      const offset = col.align === 'right' ? colWidths[colIndex] - textWidth - 8 : 8;
      // 超宽文本截断
      const maxWidth = colWidths[colIndex] - 12;
      let display = text;
      if (textWidth > maxWidth) {
        let truncated = text;
        while (truncated.length > 1 && ctx.measureText(`${truncated}…`).width > maxWidth) {
          truncated = truncated.slice(0, -1);
        }
        display = `${truncated}…`;
      }
      ctx.fillText(display, cx + offset, y + 6);
      cx += colWidths[colIndex];
    });
  });

  // 网格线
  ctx.strokeStyle = '#e8e8e8';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i <= exportRows.length + 1; i++) {
    const y = tableTop + LINE_HEIGHT * i + 0.5;
    ctx.moveTo(PAD_X, y);
    ctx.lineTo(PAD_X + tableWidth, y);
  }
  ctx.stroke();

  if (rows.length > maxRows) {
    ctx.fillStyle = '#8c8c8c';
    ctx.font = `${summaryFontSize}px ${FONT_FAMILY}`;
    ctx.fillText(`注：仅导出评分前 ${maxRows} 条，共 ${rows.length} 条`, PAD_X, cssH - PAD_Y - 16);
  }

  const prefix = options?.fileNamePrefix ?? '周线选股';
  const filename = `${prefix}_${options?.dateStamp || localDateStamp()}.png`;

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('生成图片失败'));
          return;
        }
        triggerDownload(blob, filename);
        resolve();
      },
      'image/png',
      1
    );
  });
}
