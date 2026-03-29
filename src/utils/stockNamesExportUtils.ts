/**
 * 将股票名称按列导出（每列最多 N 条，填满一列再换下一列），支持 Excel 与 PNG。
 */

const DEFAULT_MAX_PER_COLUMN = 20;

/** 按「每列最多 maxPerColumn 个」拆成多列（从左到右依次为第 1、2、3…列） */
export function splitNamesIntoColumns(names: string[], maxPerColumn = DEFAULT_MAX_PER_COLUMN): string[][] {
  const cap = Math.max(1, Math.floor(maxPerColumn));
  const columns: string[][] = [];
  for (let i = 0; i < names.length; i += cap) {
    columns.push(names.slice(i, i + cap));
  }
  return columns.length > 0 ? columns : [[]];
}

function padRowsFromColumns(cols: string[][]): string[][] {
  const numRows = Math.max(1, ...cols.map((c) => c.length));
  const rows: string[][] = [];
  for (let r = 0; r < numRows; r++) {
    rows.push(cols.map((col) => col[r] ?? ''));
  }
  return rows;
}

/**
 * 导出为多列表格：A 列第 1–20 个名称，B 列第 21–40 个，以此类推。
 */
export async function exportStockNamesToExcel(
  names: string[],
  options?: { maxPerColumn?: number; fileNamePrefix?: string }
): Promise<void> {
  const maxPerColumn = options?.maxPerColumn ?? DEFAULT_MAX_PER_COLUMN;
  const cols = splitNamesIntoColumns(names, maxPerColumn);
  const sheetRows = padRowsFromColumns(cols);

  const XLSX = await import('xlsx').catch(() => {
    throw new Error('xlsx库未安装，请运行: npm install xlsx');
  });

  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.aoa_to_sheet(sheetRows);
  worksheet['!cols'] = cols.map(() => ({ wch: 14 }));
  XLSX.utils.book_append_sheet(workbook, worksheet, '股票名称');

  const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([excelBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });

  const prefix = options?.fileNamePrefix ?? '股票名称';
  const dateStr = new Date().toISOString().slice(0, 10);
  triggerDownload(blob, `${prefix}_${dateStr}.xlsx`);
}

/**
 * 在白底画布上绘制多列文字，布局与 Excel 一致。
 */
export function exportStockNamesToPng(
  names: string[],
  options?: { maxPerColumn?: number; fileNamePrefix?: string }
): Promise<void> {
  const maxPerColumn = options?.maxPerColumn ?? DEFAULT_MAX_PER_COLUMN;
  const cols = splitNamesIntoColumns(names, maxPerColumn);
  const numRows = Math.max(1, ...cols.map((c) => c.length));

  const fontSize = 16;
  const fontFamily = '"Microsoft YaHei", "PingFang SC", "Noto Sans SC", sans-serif';
  const lineHeight = Math.round(fontSize * 1.75);
  const colGap = 32;
  const padX = 24;
  const padY = 24;

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return Promise.reject(new Error('无法创建画布上下文'));
  }

  ctx.font = `${fontSize}px ${fontFamily}`;

  const colWidths = cols.map((col) => {
    let w = 40;
    for (const text of col) {
      const m = ctx.measureText(text);
      w = Math.max(w, Math.ceil(m.width));
    }
    return w;
  });

  const contentWidth = colWidths.reduce((a, w) => a + w, 0) + colGap * Math.max(0, cols.length - 1);
  const contentHeight = numRows * lineHeight;
  const cssW = Math.ceil(padX * 2 + contentWidth);
  const cssH = Math.ceil(padY * 2 + contentHeight);
  const dpr = typeof window !== 'undefined' ? Math.min(2, window.devicePixelRatio || 1) : 1;

  canvas.width = Math.ceil(cssW * dpr);
  canvas.height = Math.ceil(cssH * dpr);
  canvas.style.width = `${cssW}px`;
  canvas.style.height = `${cssH}px`;

  ctx.scale(dpr, dpr);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, cssW, cssH);
  ctx.fillStyle = '#000000';
  ctx.font = `${fontSize}px ${fontFamily}`;
  ctx.textBaseline = 'top';

  let x = padX;
  for (let c = 0; c < cols.length; c++) {
    const col = cols[c];
    for (let r = 0; r < col.length; r++) {
      const y = padY + r * lineHeight;
      ctx.fillText(col[r], x, y);
    }
    x += colWidths[c] + colGap;
  }

  const prefix = options?.fileNamePrefix ?? '股票名称';
  const dateStr = new Date().toISOString().slice(0, 10);
  const filename = `${prefix}_${dateStr}.png`;

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

export const STOCK_NAMES_MAX_PER_COLUMN = DEFAULT_MAX_PER_COLUMN;
