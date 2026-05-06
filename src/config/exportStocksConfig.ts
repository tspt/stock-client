/**
 * 导出股票配置
 * 用于历史回测页面的批量数据导出功能
 *
 * 注意：
 * - 股票列表通过实时扫描股票数据目录动态获取
 * - 无需手动维护此文件中的股票列表
 * - 每次打开导出模态框时，点击“从目录刷新”即可获取最新列表
 */

export interface ExportStockConfig {
  code: string;
  name: string;
  enabled: boolean; // 是否启用导出
}

export interface ExportStocksConfig {
  stocks: ExportStockConfig[];
  lastUpdated: number;
  description?: string;
}

// 初始空列表，实际使用时通过实时扫描填充
export const DEFAULT_EXPORT_STOCKS: ExportStocksConfig = {
  stocks: [],
  lastUpdated: 0,
  description: '股票列表将通过实时扫描股票数据目录动态获取',
};

/**
 * 获取启用的股票列表
 */
export function getEnabledExportStocks(): ExportStockConfig[] {
  return DEFAULT_EXPORT_STOCKS.stocks.filter((stock) => stock.enabled);
}

/**
 * 根据代码查找股票
 */
export function findExportStockByCode(code: string): ExportStockConfig | undefined {
  return DEFAULT_EXPORT_STOCKS.stocks.find((stock) => stock.code === code);
}

/**
 * 更新股票启用状态
 */
export function updateStockEnabled(code: string, enabled: boolean): void {
  const stock = DEFAULT_EXPORT_STOCKS.stocks.find((s) => s.code === code);
  if (stock) {
    stock.enabled = enabled;
    DEFAULT_EXPORT_STOCKS.lastUpdated = Date.now();
  }
}

/**
 * 从扫描结果更新股票列表
 */
export function updateStocksFromScan(stocks: Array<{ code: string; name: string }>): void {
  DEFAULT_EXPORT_STOCKS.stocks = stocks.map((s) => ({
    code: s.code,
    name: s.name,
    enabled: true,
  }));
  DEFAULT_EXPORT_STOCKS.lastUpdated = Date.now();
  DEFAULT_EXPORT_STOCKS.description = '从股票数据目录实时扫描';
}
