/**
 * 数据概况表格组件
 */

import { useState, useMemo } from 'react';
import { Table } from 'antd';
import type { ColumnsType, TablePaginationConfig } from 'antd/es/table';
import type { StockOverviewData, OverviewSortConfig } from '@/types/stock';
import type { ColumnConfig } from '@/types/common';
import {
  formatPrice,
  formatVolumeInBillion,
  formatAmountInBillion,
  formatMarketCap,
  formatRatio,
  formatTurnoverRate,
  formatTotalShares,
} from '@/utils/format';
import styles from './OverviewTable.module.css';

interface OverviewTableProps {
  data: StockOverviewData[];
  columns: ColumnConfig[];
  sortConfig: OverviewSortConfig;
  onSortChange: (config: OverviewSortConfig) => void;
}

export function OverviewTable({
  data,
  columns,
  sortConfig,
  onSortChange,
}: OverviewTableProps) {
  // 分页状态管理
  const [pagination, setPagination] = useState<TablePaginationConfig>({
    current: 1,
    pageSize: 50,
    showSizeChanger: true,
    showTotal: (total) => `共 ${total} 条`,
    pageSizeOptions: ['20', '50', '100', '200'],
  });

  // 格式化数据值
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
      case 'change':
        return value >= 0 ? `+${value.toFixed(2)}` : value.toFixed(2);
      case 'changePercent':
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
      case 'totalShares':
        return formatTotalShares(value);
      case 'kdjK':
      case 'kdjD':
      case 'kdjJ':
        return value !== undefined && value !== null ? value.toFixed(2) : '-';
      case 'opportunityChangePercent':
        return value !== undefined && value !== null ? `${Number(value).toFixed(2)}%` : '-';
      case 'ma5':
      case 'ma10':
      case 'ma20':
      case 'ma30':
      case 'ma60':
      case 'ma120':
      case 'ma240':
      case 'ma360':
        return value !== undefined && value !== null ? `${Number(value).toFixed(2)}%` : '-';
      default:
        return String(value);
    }
  };

  // 构建表格列
  const tableColumns: ColumnsType<StockOverviewData> = useMemo(() => {
    // 过滤可见列并按顺序排序
    const visibleColumns = columns
      .filter((col) => col.visible)
      .sort((a, b) => a.order - b.order);

    return visibleColumns.map((col) => {
      const column: ColumnsType<StockOverviewData>[0] = {
        title: col.title,
        dataIndex: col.key,
        key: col.key,
        width: col.width || 120,
        render: (value: any) => {
          if (col.key === 'name') {
            return <span className={styles.stockName}>{value}</span>;
          }
          if (col.key === 'change' || col.key === 'changePercent') {
            const isPositive = value >= 0;
            return (
              <span
                className={isPositive ? styles.positiveValue : styles.negativeValue}
              >
                {formatValue(value, col.key)}
              </span>
            );
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
            col.key === 'ma5' ||
            col.key === 'ma10' ||
            col.key === 'ma20' ||
            col.key === 'ma30' ||
            col.key === 'ma60' ||
            col.key === 'ma120' ||
            col.key === 'ma240' ||
            col.key === 'ma360'
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

      // 名称列固定左侧，不支持排序
      if (col.key === 'name') {
        column.fixed = 'left';
      } else {
        column.sorter = (a: any, b: any) => {
          const aVal = a[col.key];
          const bVal = b[col.key];
          if (aVal === null || aVal === undefined) return 1;
          if (bVal === null || bVal === undefined) return -1;
          if (typeof aVal === 'number' && typeof bVal === 'number') {
            return aVal - bVal;
          }
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

  // 处理表格变化（排序、分页等）
  const handleTableChange = (
    paginationConfig: TablePaginationConfig,
    _filters: any,
    sorter: any
  ) => {
    // 更新分页配置
    if (paginationConfig) {
      setPagination((prev) => ({
        ...prev,
        current: paginationConfig.current,
        pageSize: paginationConfig.pageSize,
      }));
    }

    // 处理排序变化
    if (sorter && sorter.columnKey) {
      onSortChange({
        key: sorter.columnKey,
        direction: sorter.order === 'ascend' ? 'asc' : sorter.order === 'descend' ? 'desc' : null,
      });
    } else {
      onSortChange({ key: null, direction: null });
    }
  };

  // 应用排序
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
        scroll={{ x: 'max-content', y: 'calc(100vh - 240px)' }}
        onChange={handleTableChange}
        size="small"
      />
    </div>
  );
}

