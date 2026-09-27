/**
 * 机构持仓「指标 × 报告期」矩阵
 *
 * 转置由 `tableMatrix.ts` 完成，这里只声明 5 个指标。
 * 配色规则：与更早一期比较，增加用红、减少用绿，最早一期不染色。
 * 之所以按环比而不是直接采用接口的 IS_INCREASE：市值 = 持股数 × 股价，
 * 市值上升未必代表增持，5 个指标只有「同一口径前后对比」这一种规则能统一适用。
 */

import type { OrgHoldingItem } from '@/types/f10';
import {
  formatCount,
  formatF10AmountInYi,
  formatF10SharesInYi,
  formatPlainPercent,
} from './f10Format';
import { buildTableMatrix, type MatrixSpec, type TableMatrix } from './tableMatrix';

/** 指标行定义，顺序即从上到下的展示顺序 */
const SPECS: MatrixSpec<OrgHoldingItem>[] = [
  {
    key: 'orgNum',
    label: '机构总数(家)',
    value: (item) => item.totalOrgNum,
    text: (item) => formatCount(item.totalOrgNum),
    colorMode: 'periodTrend',
  },
  {
    key: 'shares',
    label: '合计持股(股)',
    // 流通股口径优先；个别报告期只给总股本口径时兜底
    value: (item) => item.totalFreeShares ?? item.totalShares,
    text: (item) => formatF10SharesInYi(item.totalFreeShares ?? item.totalShares),
    colorMode: 'periodTrend',
  },
  {
    key: 'marketCap',
    label: '合计市值(元)',
    value: (item) => item.totalMarketCap,
    text: (item) => formatF10AmountInYi(item.totalMarketCap),
    colorMode: 'periodTrend',
  },
  {
    key: 'freeRatio',
    label: '占流通股比(%)',
    value: (item) => item.totalSharesRatio,
    text: (item) => formatPlainPercent(item.totalSharesRatio),
    colorMode: 'periodTrend',
  },
  {
    key: 'totalRatio',
    label: '占总股本比例(%)',
    value: (item) => item.allSharesRatio,
    text: (item) => formatPlainPercent(item.allSharesRatio),
    colorMode: 'periodTrend',
  },
];

/** 把机构持仓长表转成矩阵 */
export function buildOrgHoldingMatrix(items: OrgHoldingItem[]): TableMatrix {
  return buildTableMatrix(items, (item) => item.reportDate, SPECS);
}
