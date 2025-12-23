/**
 * 数据导出工具
 */

import type { StockOverviewData } from '@/types/stock';
import type { ColumnConfig } from '@/types/common';
import {
  formatPrice,
  formatChangePercent,
  formatVolumeInBillion,
  formatAmountInBillion,
  formatMarketCap,
  formatRatio,
  formatTurnoverRate,
} from './format';

/**
 * 格式化数据值
 */
function formatValue(value: any, key: string): string {
  if (value === null || value === undefined || value === '') {
    return '-';
  }

  switch (key) {
    case 'price':
      return formatPrice(value);
    case 'change':
      return value >= 0 ? `+${value.toFixed(2)}` : value.toFixed(2);
    case 'changePercent':
      // 涨跌幅格式化为5.66%格式
      return value !== null && value !== undefined ? `${value.toFixed(2)}%` : '-';
    case 'volume':
      return formatVolumeInBillion(value);
    case 'amount':
      return formatAmountInBillion(value);
    case 'marketCap':
    case 'circulatingMarketCap':
      return formatMarketCap(value);
    case 'peRatio':
      return formatRatio(value);
    case 'turnoverRate':
      return formatTurnoverRate(value);
    case 'kdjK':
    case 'kdjD':
    case 'kdjJ':
      return value !== undefined && value !== null ? value.toFixed(2) : '-';
    default:
      return String(value);
  }
}

/**
 * 导出为Excel
 */
export async function exportToExcel(
  data: StockOverviewData[],
  columns: ColumnConfig[]
): Promise<void> {
  try {
    // 动态导入xlsx库（ES模块方式）
    const XLSX = await import('xlsx').catch(() => {
      throw new Error('xlsx库未安装，请运行: npm install xlsx');
    });

    // 过滤可见列并按顺序排序
    const visibleColumns = columns.filter((col) => col.visible).sort((a, b) => a.order - b.order);

    // 准备数据
    const worksheetData: any[][] = [];

    // 添加表头
    const headers = visibleColumns.map((col) => col.title);
    worksheetData.push(headers);

    // 添加数据行
    data.forEach((item) => {
      const row = visibleColumns.map((col) => {
        const value = (item as any)[col.key];
        // 使用格式化后的值，确保导出的数据与列表显示一致
        return formatValue(value, col.key);
      });
      worksheetData.push(row);
    });

    // 创建工作簿
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);

    // 设置列宽（可选，根据内容自动调整）
    const colWidths = visibleColumns.map((col) => {
      // 根据列标题长度和内容估算宽度
      const headerLength = col.title.length;
      const maxContentLength = Math.max(
        headerLength,
        ...data.map((item) => {
          const value = (item as any)[col.key];
          const formatted = formatValue(value, col.key);
          return String(formatted).length;
        })
      );
      return { wch: Math.min(Math.max(maxContentLength + 2, 10), 30) };
    });
    worksheet['!cols'] = colWidths;

    // 添加工作表到工作簿
    XLSX.utils.book_append_sheet(workbook, worksheet, '股票数据概况');

    // 生成Excel文件
    const excelBuffer = XLSX.write(workbook, {
      bookType: 'xlsx',
      type: 'array',
    });

    // 创建Blob并下载
    const blob = new Blob([excelBuffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `股票数据概况_${new Date().toISOString().slice(0, 10)}.xlsx`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error('Excel导出失败：', error);
    throw new Error('Excel导出失败。');
  }
}
