/**
 * 机会分析表格组件
 */

import { useMemo, useState, memo } from 'react';
import { Table } from 'antd';
import type React from 'react';
import type { ColumnsType, TablePaginationConfig } from 'antd/es/table';
import type { OverviewSortConfig, StockOpportunityData } from '@/types/stock';
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
import styles from './OpportunityTable.module.css';

interface OpportunityTableProps {
  data: StockOpportunityData[];
  columns: ColumnConfig[];
  sortConfig: OverviewSortConfig;
  onSortChange: (config: OverviewSortConfig) => void;
  tableHeight?: number;
  onShowAIAnalysis?: (record: StockOpportunityData) => void;
}

export const OpportunityTable = memo(function OpportunityTable({ data, columns, sortConfig, onSortChange, tableHeight = 600, onShowAIAnalysis }: OpportunityTableProps) {
  const [pagination, setPagination] = useState<TablePaginationConfig>({
    current: 1,
    pageSize: 50,
    showSizeChanger: true,
    showTotal: (total) => `共 ${total} 条`,
    pageSizeOptions: ['20', '50', '100', '200'],
  });

  const getSortValue = (record: StockOpportunityData, key: string): string | number | null | undefined => {
    switch (key) {
      case 'consolidationStatus':
        return record.consolidation?.isConsolidation ? 1 : 0;
      case 'consolidationTypes':
        return record.consolidation?.matchedTypeLabels?.join('、') ?? '';
      case 'consolidationReason':
        return record.consolidation?.reasonText ?? '';
      case 'trendLineStatus':
        return record.trendLine?.isHit ? 1 : 0;
      case 'trendLineReason':
        return record.trendLine?.reasonText ?? '';
      case 'sharpMoveLabels':
        return record.sharpMovePatterns?.labels?.join('、') ?? '';
      default:
        return (record as any)[key];
    }
  };

  const compareSortValue = (
    aVal: string | number | null | undefined,
    bVal: string | number | null | undefined
  ): number => {
    if (aVal === null || aVal === undefined || aVal === '') return 1;
    if (bVal === null || bVal === undefined || bVal === '') return -1;
    if (typeof aVal === 'number' && typeof bVal === 'number') return aVal - bVal;
    return String(aVal).localeCompare(String(bVal));
  };

  const formatValue = (value: any, key: string, record?: StockOpportunityData): string | number | React.ReactNode => {
    if (key === 'consolidationStatus') {
      if (!record?.consolidation) return '-';
      const isConsolidation = record.consolidation.isConsolidation;
      return (
        <span className={isConsolidation ? styles.consolidationYes : styles.consolidationNo}>
          {isConsolidation ? '是' : '否'}
        </span>
      );
    }

    if (key === 'consolidationTypes') {
      const labels = record?.consolidation?.matchedTypeLabels;
      if (!labels?.length) {
        return '-';
      }
      return (
        <div className={styles.consolidationTypes}>
          {labels.map((label) => (
            <span key={label} className={styles.consolidationTag}>
              {label}
            </span>
          ))}
        </div>
      );
    }

    if (key === 'consolidationReason') {
      return record?.consolidation?.reasonText || '-';
    }

    if (key === 'trendLineStatus') {
      if (!record?.trendLine) return '-';
      const hit = record.trendLine.isHit;
      return (
        <span className={hit ? styles.consolidationYes : styles.consolidationNo}>{hit ? '是' : '否'}</span>
      );
    }

    if (key === 'trendLineReason') {
      if (!record?.trendLine) return '-';
      const { lookback, consecutive, reasonText } = record.trendLine;
      return (
        <span>
          <strong style={{ color: '#1890ff' }}>M={lookback}, N={consecutive}</strong>
          <span style={{ marginLeft: 8 }}>{reasonText}</span>
        </span>
      );
    }

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
      case 'totalShares':
        return formatTotalShares(Number(value));
      case 'kdjK':
      case 'kdjD':
      case 'kdjJ':
        return value !== undefined && value !== null ? Number(value).toFixed(2) : '-';
      case 'opportunityChangePercent':
        return value !== null && value !== undefined ? `${Number(value).toFixed(2)}%` : '-';
      case 'ma5':
      case 'ma10':
      case 'ma20':
      case 'ma30':
      case 'ma60':
      case 'ma120':
      case 'ma240':
      case 'ma360':
        return value !== undefined && value !== null ? `${Number(value).toFixed(2)}%` : '-';
      case 'sharpMoveLabels': {
        const labels = record?.sharpMovePatterns?.labels;
        if (!labels || labels.length === 0) return '-';
        return labels.join('、');
      }
      default:
        return String(value);
    }
  };

  const tableColumns: ColumnsType<StockOpportunityData> = useMemo(() => {
    const visibleColumns = columns.filter((c) => c.visible).sort((a, b) => a.order - b.order);

    const cols = visibleColumns.map((col) => {
      const column: ColumnsType<StockOpportunityData>[0] = {
        title: col.title,
        dataIndex: col.key,
        key: col.key,
        width: col.width || 120,
        render: (value: any, record: StockOpportunityData) => {
          if (col.key === 'name') {
            return <span className={styles.stockName}>{value}</span>;
          }
          if (col.key === 'opportunityChangePercent') {
            const isPositive = typeof value === 'number' ? value >= 0 : false;
            return (
              <span className={isPositive ? styles.positiveValue : styles.negativeValue}>
                {formatValue(value, col.key, record)}
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
                {formatValue(value, col.key, record)}
              </span>
            );
          }
          if (col.key === 'error') {
            return <span className={styles.errorText}>{value}</span>;
          }
          return formatValue(value, col.key, record);
        },
      };

      if (col.key === 'name') {
        column.fixed = 'left';
      } else {
        column.sorter = (a: StockOpportunityData, b: StockOpportunityData) =>
          compareSortValue(getSortValue(a, col.key), getSortValue(b, col.key));

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

    // 添加操作列（如果有AI分析回调）
    if (onShowAIAnalysis) {
      cols.push({
        title: 'AI分析',
        key: 'aiAction',
        width: 100,
        fixed: 'right',
        render: (_: any, record: StockOpportunityData) => {
          if (!record.aiAnalysis) {
            return <span style={{ color: '#d9d9d9' }}>-</span>;
          }
          return (
            <a
              onClick={(e) => {
                e.stopPropagation();
                onShowAIAnalysis(record);
              }}
              style={{ cursor: 'pointer' }}
            >
              查看
            </a>
          );
        },
      });
    }

    return cols;
  }, [columns, sortConfig, onShowAIAnalysis]);

  // 计算表格横向滚动宽度
  const scrollX = useMemo(() => {
    const visibleColumns = columns.filter((c) => c.visible).sort((a, b) => a.order - b.order);
    return visibleColumns.reduce((sum, col) => sum + (col.width || 120), 0);
  }, [columns]);

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

  return (
    <div className={styles.tableContainer}>
      <Table
        columns={tableColumns}
        dataSource={data}
        rowKey="code"
        pagination={pagination}
        virtual
        scroll={{ x: scrollX, y: tableHeight }}
        onChange={handleTableChange}
        size="small"
        className={styles.opportunityTable}
      />
    </div>
  );
});


