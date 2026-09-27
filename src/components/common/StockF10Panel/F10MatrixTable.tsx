/**
 * F10 矩阵表渲染：一行一个指标、一列一个报告期。
 *
 * 股东人数与机构持仓只有「转置后的数据」与「行首列宽」不同，渲染完全一致，
 * 因此收敛成一个组件；数据由 `buildTableMatrix` 系列函数产出。
 *
 * 横向滚动条：尺寸与颜色沿用全局 `::-webkit-scrollbar`（与机会分析页表格一致），
 * 但默认隐藏、鼠标移入表格才浮现——见 StockF10Panel.module.css 的 .matrixTable。
 */

import { Table, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { formatReportDate } from '@/utils/format/f10Format';
import type { MatrixRow, TableMatrix } from '@/utils/format/tableMatrix';
import styles from './StockF10Panel.module.css';

const { Text } = Typography;

export interface F10MatrixTableProps {
  matrix: TableMatrix;
  /** 行首「指标」列宽：机构持仓指标名较短，股东人数的「十大流通股东持股合计(%)」要给足 */
  labelWidth: number;
}

export function F10MatrixTable({ matrix, labelWidth }: F10MatrixTableProps) {
  const columns: ColumnsType<MatrixRow> = [
    {
      title: '指标',
      dataIndex: 'label',
      key: 'label',
      width: labelWidth,
      fixed: 'left',
    },
    ...matrix.periods.map((period, periodIndex) => ({
      title: formatReportDate(period),
      key: period,
      width: 110,
      align: 'right' as const,
      render: (_: unknown, row: MatrixRow) => {
        const cell = row.cells[periodIndex];
        return <Text style={{ color: cell?.color }}>{cell?.text ?? '-'}</Text>;
      },
    })),
  ];

  return (
    /* .matrixTable 只负责「默认隐藏滚动条、移入浮现」，见 StockF10Panel.module.css */
    <div className={styles.matrixTable}>
      <Table
        columns={columns}
        dataSource={matrix.rows}
        rowKey="key"
        size="small"
        pagination={false}
        /**
         * 只有 5~9 行指标，不需要纵向滚动；
         * 报告期可能多达 40+ 期（股东人数），靠横向滚动查看历史。
         */
        scroll={{ x: 'max-content' }}
      />
    </div>
  );
}

export default F10MatrixTable;
