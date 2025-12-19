/**
 * 机会分析表格组件
 */

import { useMemo, useState } from 'react';
import { Table } from 'antd';
import type { ColumnsType, TablePaginationConfig } from 'antd/es/table';
import type { OverviewColumnConfig, OverviewSortConfig, StockOpportunityData } from '@/types/stock';
import {
  formatPrice,
  formatVolumeInBillion,
  formatAmountInBillion,
  formatMarketCap,
  formatRatio,
  formatTurnoverRate,
} from '@/utils/format';
import styles from './OpportunityTable.module.css';

interface OpportunityTableProps {
  data: StockOpportunityData[];
  columns: OverviewColumnConfig[];
  sortConfig: OverviewSortConfig;
  onSortChange: (config: OverviewSortConfig) => void;
}

export function OpportunityTable({ data, columns, sortConfig, onSortChange }: OpportunityTableProps) {
  const [pagination, setPagination] = useState<TablePaginationConfig>({
    current: 1,
    pageSize: 20,
    showSizeChanger: true,
    showTotal: (total) => `共 ${total} 条`,
    pageSizeOptions: ['20', '50', '100', '200'],
  });

  const formatValue = (value: any, key: string): string | number => {
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
      case 'change1w':
      case 'change1m':
      case 'change1q':
      case 'change6m':
      case 'change1y':
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
      case 'ma5':
      case 'ma10':
      case 'ma20':
      case 'ma30':
      case 'ma60':
      case 'ma120':
      case 'ma240':
      case 'ma360':
        return value !== undefined && value !== null ? Number(value).toFixed(2) : '-';
      default:
        return String(value);
    }
  };

  const tableColumns: ColumnsType<StockOpportunityData> = useMemo(() => {
    const visibleColumns = columns.filter((c) => c.visible).sort((a, b) => a.order - b.order);

    return visibleColumns.map((col) => {
      const column: ColumnsType<StockOpportunityData>[0] = {
        title: col.title,
        dataIndex: col.key,
        key: col.key,
        width: col.width || 120,
        render: (value: any) => {
          if (col.key === 'name') {
            return <span className={styles.stockName}>{value}</span>;
          }
          if (col.key === 'opportunityChangePercent') {
            const isPositive = typeof value === 'number' ? value >= 0 : false;
            return (
              <span className={isPositive ? styles.positiveValue : styles.negativeValue}>
                {formatValue(value, col.key)}
              </span>
            );
          }
          if (
            col.key === 'change1w' ||
            col.key === 'change1m' ||
            col.key === 'change1q' ||
            col.key === 'change6m' ||
            col.key === 'change1y'
          ) {
            const isPositive = typeof value === 'number' ? value >= 0 : false;
            return (
              <span className={isPositive ? styles.positiveValue : styles.negativeValue}>
                {formatValue(value, col.key)}
              </span>
            );
          }
          if (col.key === 'error') {
            return <span className={styles.errorText}>{value}</span>;
          }
          return formatValue(value, col.key);
        },
      };

      if (col.key === 'name') {
        column.fixed = 'left';
      } else {
        column.sorter = (a: any, b: any) => {
          const aVal = a[col.key];
          const bVal = b[col.key];
          if (aVal === null || aVal === undefined) return 1;
          if (bVal === null || bVal === undefined) return -1;
          if (typeof aVal === 'number' && typeof bVal === 'number') return aVal - bVal;
          return String(aVal).localeCompare(String(bVal));
        };

        column.sortOrder =
          sortConfig.key === col.key
            ? sortConfig.direction === 'asc'
              ? 'ascend'
              : sortConfig.direction === 'desc'
                ? 'descend'
                : null
            : null;
      }

      return column;
    });
  }, [columns, sortConfig]);

  const handleTableChange = (paginationConfig: TablePaginationConfig, _filters: any, sorter: any) => {
    if (paginationConfig) {
      setPagination((prev) => ({
        ...prev,
        current: paginationConfig.current,
        pageSize: paginationConfig.pageSize,
      }));
    }

    if (sorter && sorter.columnKey) {
      onSortChange({
        key: sorter.columnKey,
        direction: sorter.order === 'ascend' ? 'asc' : sorter.order === 'descend' ? 'desc' : null,
      });
    } else {
      onSortChange({ key: null, direction: null });
    }
  };

  const sortedData = useMemo(() => {
    if (!sortConfig.key || !sortConfig.direction) {
      return data;
    }

    const sorted = [...data].sort((a, b) => {
      const aVal = (a as any)[sortConfig.key!];
      const bVal = (b as any)[sortConfig.key!];

      if (aVal === null || aVal === undefined) return 1;
      if (bVal === null || bVal === undefined) return -1;

      let comparison = 0;
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        comparison = aVal - bVal;
      } else {
        comparison = String(aVal).localeCompare(String(bVal));
      }

      return sortConfig.direction === 'asc' ? comparison : -comparison;
    });

    return sorted;
  }, [data, sortConfig]);

  return (
    <div className={styles.tableContainer}>
      <Table
        columns={tableColumns}
        dataSource={sortedData}
        rowKey="code"
        pagination={pagination}
        scroll={{ x: 'max-content', y: 'calc(100vh - 300px)' }}
        onChange={handleTableChange}
        size="small"
      />
    </div>
  );
}


