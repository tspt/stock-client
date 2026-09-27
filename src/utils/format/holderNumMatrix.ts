/**
 * 股东人数「指标 × 报告期」矩阵
 *
 * 9 行与东财 F10 股东人数页一致，单位与小数位也照其口径：
 * - 股东人数、人均持股金额一律用「万」并保留 4 位有效数字（108000 → 10.80万）；
 * - 两行「较上期变化(%)」按自身正负染色（正红负绿），数值不带 + 号与 %
 *   （行标签已含 (%)，再带符号会重复）；
 * - 筹码集中度按分档染色。
 */

import type { HolderNumItem } from '@/types/f10';
import {
  formatF10CountInWan,
  formatF10Price,
  formatPlainPercent,
  formatSignificantDigits,
  pickHoldFocusColor,
} from './f10Format';
import { buildTableMatrix, type MatrixSpec, type TableMatrix } from './tableMatrix';

/** 指标行定义，顺序即从上到下的展示顺序 */
const SPECS: MatrixSpec<HolderNumItem>[] = [
  {
    key: 'holderTotalNum',
    label: '股东人数(户)',
    value: (item) => item.holderTotalNum,
    text: (item) => formatF10CountInWan(item.holderTotalNum),
  },
  {
    key: 'totalNumRatio',
    label: '较上期变化(%)',
    value: (item) => item.totalNumRatio,
    text: (item) => formatPlainPercent(item.totalNumRatio),
    colorMode: 'sign',
  },
  {
    key: 'avgFreeShares',
    label: '人均流通股(股)',
    value: (item) => item.avgFreeShares,
    text: (item) => formatSignificantDigits(item.avgFreeShares),
  },
  {
    key: 'avgFreeSharesRatio',
    label: '较上期变化(%)',
    value: (item) => item.avgFreeSharesRatio,
    text: (item) => formatPlainPercent(item.avgFreeSharesRatio),
    colorMode: 'sign',
  },
  {
    key: 'holdFocus',
    label: '筹码集中度',
    text: (item) => item.holdFocus || '-',
    color: (item) => pickHoldFocusColor(item.holdFocus),
  },
  {
    key: 'price',
    label: '股价(元)',
    value: (item) => item.price,
    text: (item) => formatF10Price(item.price),
  },
  {
    key: 'avgHoldAmt',
    label: '人均持股金额(元)',
    value: (item) => item.avgHoldAmt,
    text: (item) => formatF10CountInWan(item.avgHoldAmt),
  },
  {
    key: 'holdRatioTotal',
    label: '十大股东持股合计(%)',
    value: (item) => item.holdRatioTotal,
    text: (item) => formatPlainPercent(item.holdRatioTotal),
  },
  {
    key: 'freeHoldRatioTotal',
    label: '十大流通股东持股合计(%)',
    value: (item) => item.freeHoldRatioTotal,
    // 早期报告期接口该字段为 null，formatPlainPercent 会统一显示 '-'
    text: (item) => formatPlainPercent(item.freeHoldRatioTotal),
  },
];

/** 把股东人数长表转成矩阵 */
export function buildHolderNumMatrix(items: HolderNumItem[]): TableMatrix {
  return buildTableMatrix(items, (item) => item.endDate, SPECS);
}
