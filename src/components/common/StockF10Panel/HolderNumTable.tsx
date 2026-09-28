/**
 * 股东人数表（转置矩阵）：一行一个指标、一列一个报告期。
 *
 * 行：股东人数(户) / 较上期变化(%) / 人均流通股(股) / 较上期变化(%) / 筹码集中度
 *     / 股价(元) / 人均持股金额(元) / 十大股东持股合计(%) / 十大流通股东持股合计(%)
 * 列：报告期倒序（最新在最左），报告期多时横向滚动查看历史。
 *
 * 转置与格式化逻辑在 `@/utils/format/holderNumMatrix`，本组件只负责把矩阵画出来。
 */

import type { HolderNumItem } from '@/types/f10';
import { buildHolderNumMatrix } from '@/utils/format/holderNumMatrix';
import { F10MatrixTable } from './F10MatrixTable';

/** 行首指标名较长（「十大流通股东持股合计(%)」），列宽要给足 */
const LABEL_WIDTH = 190;

interface HolderNumTableProps {
  data: HolderNumItem[];
}

export function HolderNumTable({ data }: HolderNumTableProps) {
  return <F10MatrixTable matrix={buildHolderNumMatrix(data)} labelWidth={LABEL_WIDTH} />;
}

export default HolderNumTable;
