/**
 * 机会分析表格组件
 */

import { useMemo, useState } from 'react';
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
}

export function OpportunityTable({ data, columns, sortConfig, onSortChange, tableHeight = 600 }: OpportunityTableProps) {
  const [pagination, setPagination] = useState<TablePaginationConfig>({
    current: 1,
    pageSize: 50,
    showSizeChanger: true,
    showTotal: (total) => `共 ${total} 条`,
    pageSizeOptions: ['20', '50', '100', '200'],
  });

  const formatValue = (value: any, key: string, record?: StockOpportunityData): string | number | React.ReactNode => {
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
      case 'consolidationStatus':
        if (!record?.consolidation) return '-';
        const isConsolidation = record.consolidation.combined.isConsolidation;
        return (
          <span className={isConsolidation ? styles.consolidationYes : styles.consolidationNo}>
            {isConsolidation ? '是' : '否'}
          </span>
        );
      case 'consolidationStrength':
        if (!record?.consolidation) return '-';
        const strength = record.consolidation.combined.strength;
        return (
          <div className={styles.strengthContainer}>
            <span>{strength.toFixed(0)}</span>
            <div className={styles.strengthBar}>
              <div
                className={styles.strengthBarFill}
                style={{ width: `${strength}%` }}
              />
            </div>
          </div>
        );
      case 'volatility':
        if (!record?.consolidation) return '-';
        return `${record.consolidation.priceVolatility.volatility.toFixed(2)}%`;
      case 'maSpread':
        if (!record?.consolidation) return '-';
        return `${record.consolidation.maConvergence.maSpread.toFixed(2)}%`;
      case 'volumeRatio':
        if (!record?.consolidation) return '-';
        const ratio = record.consolidation.volumeAnalysis.avgVolumeRatio;
        const isShrinking = record.consolidation.volumeAnalysis.isVolumeShrinking;
        return (
          <span className={isShrinking ? styles.volumeShrinking : styles.volumeNormal}>
            {ratio.toFixed(1)}%
          </span>
        );
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
        // 横盘相关列的特殊排序逻辑
        if (col.key === 'consolidationStatus' || col.key === 'consolidationStrength' ||
          col.key === 'volatility' || col.key === 'maSpread' || col.key === 'volumeRatio') {
          column.sorter = (a: any, b: any) => {
            let aVal: any;
            let bVal: any;

            if (col.key === 'consolidationStatus') {
              aVal = a.consolidation?.combined?.isConsolidation ? 1 : 0;
              bVal = b.consolidation?.combined?.isConsolidation ? 1 : 0;
            } else if (col.key === 'consolidationStrength') {
              aVal = a.consolidation?.combined?.strength;
              bVal = b.consolidation?.combined?.strength;
            } else if (col.key === 'volatility') {
              aVal = a.consolidation?.priceVolatility?.volatility;
              bVal = b.consolidation?.priceVolatility?.volatility;
            } else if (col.key === 'maSpread') {
              aVal = a.consolidation?.maConvergence?.maSpread;
              bVal = b.consolidation?.maConvergence?.maSpread;
            } else if (col.key === 'volumeRatio') {
              aVal = a.consolidation?.volumeAnalysis?.avgVolumeRatio;
              bVal = b.consolidation?.volumeAnalysis?.avgVolumeRatio;
            }

            if (aVal === null || aVal === undefined) return 1;
            if (bVal === null || bVal === undefined) return -1;
            if (typeof aVal === 'number' && typeof bVal === 'number') return aVal - bVal;
            return String(aVal).localeCompare(String(bVal));
          };
        } else {
          column.sorter = (a: any, b: any) => {
            const aVal = a[col.key];
            const bVal = b[col.key];
            if (aVal === null || aVal === undefined) return 1;
            if (bVal === null || bVal === undefined) return -1;
            if (typeof aVal === 'number' && typeof bVal === 'number') return aVal - bVal;
            return String(aVal).localeCompare(String(bVal));
          };
        }

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
        scroll={{ x: 'max-content', y: tableHeight }}
        onChange={handleTableChange}
        size="small"
      />
    </div>
  );
}


