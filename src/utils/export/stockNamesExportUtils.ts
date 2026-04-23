/**
 * 将股票名称按列导出（每列最多 N 条，填满一列再换下一列），支持 Excel 与 PNG。
 */

const DEFAULT_MAX_PER_COLUMN = 20;

/** 按「每列最多 maxPerColumn 个」拆成多列（从左到右依次为第 1、2、3…列） */
export function splitNamesIntoColumns(
  names: string[],
  maxPerColumn = DEFAULT_MAX_PER_COLUMN
): string[][] {
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
  options?: { maxPerColumn?: number; fileNamePrefix?: string; filterSummary?: string }
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

  // 筛选条件文案相关配置
  const filterSummary = options?.filterSummary;
  const filterFontSize = 13;
  const filterLineHeight = Math.round(filterFontSize * 1.6);
  const filterPadY = 16; // 筛选文案区域的上下内边距
  const filterTextMaxWidth = 1200; // 筛选文案最大宽度，超过则换行

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

  // 计算筛选条件文案所需的宽度和高度
  let filterHeight = 0;
  let filterWidth = 0;
  if (filterSummary) {
    ctx.font = `${filterFontSize}px ${fontFamily}`;
    // 测量筛选条件文案的实际宽度
    const metrics = ctx.measureText(filterSummary);
    filterWidth = metrics.width;
    // 根据最大宽度计算换行数
    const lines = Math.ceil(filterWidth / filterTextMaxWidth) || 1;
    filterHeight = lines * filterLineHeight + filterPadY * 2;
    ctx.font = `${fontSize}px ${fontFamily}`; // 恢复字体
  }

  // 画布宽度需要同时满足股票列宽和筛选文案宽度的要求
  const minContentWidth = filterWidth > 0 ? filterWidth + padX * 2 : 0;
  const cssW = Math.max(Math.ceil(padX * 2 + contentWidth), Math.ceil(minContentWidth));
  const cssH = Math.ceil(filterHeight + padY * 2 + contentHeight);
  const dpr = typeof window !== 'undefined' ? Math.min(2, window.devicePixelRatio || 1) : 1;

  canvas.width = Math.ceil(cssW * dpr);
  canvas.height = Math.ceil(cssH * dpr);
  canvas.style.width = `${cssW}px`;
  canvas.style.height = `${cssH}px`;

  ctx.scale(dpr, dpr);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, cssW, cssH);

  // 绘制筛选条件文案
  let currentY = padY;
  if (filterSummary) {
    ctx.fillStyle = '#666666';
    ctx.font = `${filterFontSize}px ${fontFamily}`;
    ctx.textBaseline = 'top';

    // 文本换行处理
    const words = filterSummary.split('');
    let line = '';
    let y = currentY + filterPadY;

    for (let n = 0; n < words.length; n++) {
      const testLine = line + words[n];
      const metrics = ctx.measureText(testLine);
      const testWidth = metrics.width;

      if (testWidth > filterTextMaxWidth && n > 0) {
        ctx.fillText(line, padX, y);
        line = words[n];
        y += filterLineHeight;
      } else {
        line = testLine;
      }
    }
    ctx.fillText(line, padX, y);

    // 更新当前 Y 坐标，为股票名称留出空间
    const lines = Math.ceil(ctx.measureText(filterSummary).width / filterTextMaxWidth) || 1;
    currentY = y + lines * filterLineHeight + filterPadY;
  }

  // 绘制股票名称
  ctx.fillStyle = '#000000';
  ctx.font = `${fontSize}px ${fontFamily}`;
  ctx.textBaseline = 'top';

  let x = padX;
  for (let c = 0; c < cols.length; c++) {
    const col = cols[c];
    for (let r = 0; r < col.length; r++) {
      const y = currentY + r * lineHeight;
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
