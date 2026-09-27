/**
 * 十大流通股东表：单个报告期内的前十大流通股东（服务层已按最新报告期过滤并排名排序）。
 *
 * 报告期在表格上方单独提示而非占一列——同一批数据只可能属于一个报告期，
 * 每行重复打印日期会浪费横向空间。
 */

import { Table, Tooltip, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { FreeHolderItem } from '@/types/f10';
import {
  formatF10Percent,
  formatF10Shares,
  formatHolderChangeRatio,
  formatReportDate,
  pickHolderChangeColor,
} from '@/utils/format/f10Format';
import styles from './StockF10Panel.module.css';

const { Text } = Typography;

interface FreeHolderTableProps {
  data: FreeHolderItem[];
}

export function FreeHolderTable({ data }: FreeHolderTableProps) {
  const columns: ColumnsType<FreeHolderItem> = [
    {
      title: '排名',
      dataIndex: 'holderRank',
      key: 'holderRank',
      width: 60,
      fixed: 'left',
      render: (value: number) => (value > 0 ? value : '-'),
    },
    {
      title: '股东名称',
      dataIndex: 'holderName',
      key: 'holderName',
      width: 260,
      render: (value: string) => (
        <Tooltip title={value}>
          <Text ellipsis style={{ maxWidth: 240 }}>
            {value || '-'}
          </Text>
        </Tooltip>
      ),
    },
    {
      title: '股东类型',
      dataIndex: 'holderType',
      key: 'holderType',
      width: 110,
      render: (value: string) => value || '-',
    },
    {
      title: '持股数',
      dataIndex: 'holdNum',
      key: 'holdNum',
      width: 110,
      align: 'right',
      render: (value: number | null) => formatF10Shares(value),
    },
    {
      title: '占流通股比',
      dataIndex: 'freeHoldNumRatio',
      key: 'freeHoldNumRatio',
      width: 110,
      align: 'right',
      render: (value: number | null) => formatF10Percent(value),
    },
    {
      title: '持股变动',
      dataIndex: 'holdNumChange',
      key: 'holdNumChange',
      width: 110,
      align: 'right',
      render: (value: string) => (
        <Text style={{ color: pickHolderChangeColor(value) }}>{value || '-'}</Text>
      ),
    },
    {
      title: '变动比例',
      dataIndex: 'newChangeRatio',
      key: 'newChangeRatio',
      width: 110,
      align: 'right',
      render: (value: string) => formatHolderChangeRatio(value),
    },
  ];

  const endDate = data[0]?.endDate;

  return (
    <>
      {endDate && (
        <Text type="secondary" className={styles.periodLine}>
          报告期 <Text strong>{formatReportDate(endDate)}</Text>
        </Text>
      )}
      <Table
        columns={columns}
        dataSource={data}
        rowKey={(record) => `${record.endDate}-${record.holderRank}-${record.holderName}`}
        size="small"
        pagination={false}
        /**
         * 只有 10 行，刻意不设 `scroll.y`：本表不出现纵向滚动条，10 名股东一次看全。
         * 横向滚动条仅在窗口过窄（列被挤压）时才会出现。
         */
        scroll={{ x: 'max-content' }}
      />
    </>
  );
}

export default FreeHolderTable;
