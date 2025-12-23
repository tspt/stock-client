/**
 * 机会分析数据导出工具
 */

import type { StockOpportunityData } from '@/types/stock';
import type { ColumnConfig } from '@/types/common';
import {
  formatPrice,
  formatVolumeInBillion,
  formatAmountInBillion,
  formatMarketCap,
  formatRatio,
  formatTurnoverRate,
} from './format';

function formatValue(value: any, key: string): string {
  if (value === null || value === undefined || value === '') {
    return '-';
  }

  switch (key) {
    case 'price':
    case 'avgPrice':
    case 'highPrice':
    case 'lowPrice':
      return formatPrice(Number(value));
    case 'opportunityChangePercent':
      return `${Number(value).toFixed(2)}%`;
    case 'volume':
      return formatVolumeInBillion(Number(value));
    case 'amount':
      return formatAmountInBillion(Number(value));
    case 'marketCap':
    case 'circulatingMarketCap':
      return formatMarketCap(Number(value));
    case 'peRatio':
      return formatRatio(Number(value));
    case 'turnoverRate':
      return formatTurnoverRate(Number(value));
    case 'kdjK':
    case 'kdjD':
    case 'kdjJ':
      return Number(value).toFixed(2);
    case 'ma5':
    case 'ma10':
    case 'ma20':
    case 'ma30':
    case 'ma60':
    case 'ma120':
    case 'ma240':
    case 'ma360':
      return `${Number(value).toFixed(2)}%`;
    default:
      return String(value);
  }
}

export async function exportOpportunityToExcel(
  data: StockOpportunityData[],
  columns: ColumnConfig[]
): Promise<void> {
  try {
    const XLSX = await import('xlsx').catch(() => {
      throw new Error('xlsx库未安装，请运行: npm install xlsx');
    });

    const visibleColumns = columns.filter((c) => c.visible).sort((a, b) => a.order - b.order);

    const worksheetData: any[][] = [];
    worksheetData.push(visibleColumns.map((col) => col.title));

    data.forEach((item) => {
      worksheetData.push(
        visibleColumns.map((col) => {
          const value = (item as any)[col.key];
          return formatValue(value, col.key);
        })
      );
    });

    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);

    const colWidths = visibleColumns.map((col) => {
      const headerLength = col.title.length;
      const maxContentLength = Math.max(
        headerLength,
        ...data.map((item) => String(formatValue((item as any)[col.key], col.key)).length)
      );
      return { wch: Math.min(Math.max(maxContentLength + 2, 10), 30) };
    });
    worksheet['!cols'] = colWidths;

    XLSX.utils.book_append_sheet(workbook, worksheet, '机会分析');

    const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([excelBuffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `机会分析_${new Date().toISOString().slice(0, 10)}.xlsx`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error('Excel导出失败：', error);
    throw new Error('Excel导出失败。');
  }
}
