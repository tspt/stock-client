/**
 * 机构持仓表（转置矩阵）：一行一个指标、一列一个报告期。
 *
 * 行：机构总数(家) / 合计持股(股) / 合计市值(元) / 占流通股比(%) / 占总股本比例(%)
 * 列：报告期倒序（最新在最左），报告期多时横向滚动。
 *
 * 转置与格式化逻辑在 `@/utils/format/orgHoldingMatrix`，本组件只负责把矩阵画出来。
 */

import type { OrgHoldingItem } from '@/types/f10';
import { buildOrgHoldingMatrix } from '@/utils/format/orgHoldingMatrix';
import { F10MatrixTable } from './F10MatrixTable';

/** 指标名较短（最宽的「占总股本比例(%)」） */
const LABEL_WIDTH = 120;

interface OrgHoldingTableProps {
  data: OrgHoldingItem[];
}

export function OrgHoldingTable({ data }: OrgHoldingTableProps) {
  return <F10MatrixTable matrix={buildOrgHoldingMatrix(data)} labelWidth={LABEL_WIDTH} />;
}

export default OrgHoldingTable;
