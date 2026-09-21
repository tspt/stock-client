/**
 * 机会分析表格组件
 */

import { useMemo, useState, memo } from 'react';
import { Table } from 'antd';
import type React from 'react';
import type { ColumnsType, TablePaginationConfig } from 'antd/es/table';
import type { OverviewSortConfig, StockOpportunityData, TradingSignalType } from '@/types/stock';
import type { ColumnConfig } from '@/types/common';
import {
  formatPrice,
  formatVolumeInBillion,
  formatAmountInBillion,
  formatMarketCap,
  formatRatio,
  formatTurnoverRate,
  formatTotalShares,
  formatChineseAmountFromYuan,
  formatGrowthPercent,
} from '@/utils/format/format';
import { StockConceptTags, StockFeatureTag, StockStatusTag } from '@/components/common/Tags';
import styles from './OpportunityTable.module.css';

/**
 * 交易信号排序权重：买入类相邻、卖出类相邻，观望排在最后。
 * 升序顺序：建议买入 → 强烈买入 → 建议卖出 → 强烈卖出 → 观望（无信号始终最后）
 */
const TRADING_SIGNAL_SORT_WEIGHT: Record<TradingSignalType, number> = {
  BUY: 0,
  STRONG_BUY: 1,
  SELL: 2,
  STRONG_SELL: 3,
  HOLD: 4,
};

interface OpportunityTableProps {
  data: StockOpportunityData[];
  columns: ColumnConfig[];
  sortConfig: OverviewSortConfig;
  onSortChange: (config: OverviewSortConfig) => void;
  tableHeight?: number;
  onShowAIAnalysis?: (record: StockOpportunityData) => void;
  /** 行点击回调（传入后整行可点击） */
  onRowClick?: (record: StockOpportunityData) => void;
}

export const OpportunityTable = memo(function OpportunityTable({ data, columns, sortConfig, onSortChange, tableHeight = 600, onShowAIAnalysis, onRowClick }: OpportunityTableProps) {
  const [pagination, setPagination] = useState<TablePaginationConfig>({
    current: 1,
    pageSize: 100,
    showSizeChanger: true,
    showTotal: (total) => `共 ${total} 条`,
    pageSizeOptions: ['50', '100', '200'],
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
      case 'pullbackLabels':
        return record.pullbackPattern?.labels?.join('、') ?? '';
      case 'industry':
        return record.industry?.name ?? '';
      case 'concepts':
        return record.concepts?.map(c => c.name).join('、') ?? '';
      case 'tradingSignal': {
        const signalType = record.tradingSignal?.type;
        // 用权重而非类型字符串排序：避免 HOLD 插在买入与卖出之间、且 STRONG_* 被字典序排到最后
        return signalType ? TRADING_SIGNAL_SORT_WEIGHT[signalType] ?? 5 : undefined;
      }
      case 'financeRevenue':
        return record.finance?.revenue;
      case 'financeNetProfit':
        return record.finance?.netProfit;
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
      if (!record?.consolidation) return '';
      return <StockStatusTag status={record.consolidation.isConsolidation} />;
    }

    if (key === 'consolidationTypes') {
      const labels = record?.consolidation?.matchedTypeLabels;
      if (!labels?.length) {
        return '';
      }
      return (
        <div className={styles.consolidationTypes}>
          {labels.map((label) => (
            <StockFeatureTag key={label} text={label} />
          ))}
        </div>
      );
    }

    if (key === 'consolidationReason') {
      return record?.consolidation?.reasonText || '';
    }

    if (key === 'trendLineStatus') {
      if (!record?.trendLine) return '';
      return <StockStatusTag status={record.trendLine.isHit} />;
    }

    if (key === 'trendLineReason') {
      if (!record?.trendLine) return '';
      const { lookback, consecutive, reasonText } = record.trendLine;
      return (
        <span>
          <strong style={{ color: '#1890ff' }}>M={lookback}, N={consecutive}</strong>
          <span style={{ marginLeft: 8 }}>{reasonText}</span>
        </span>
      );
    }

    if (key === 'financeRevenue' || key === 'financeNetProfit') {
      const metrics = record?.finance;
      const amount = key === 'financeRevenue' ? metrics?.revenue : metrics?.netProfit;
      const growth = key === 'financeRevenue' ? metrics?.revenueYoy : metrics?.netProfitYoy;
      if (amount === undefined && growth === undefined) {
        return '';
      }
      const title = metrics
        ? [metrics.reportLabel, metrics.publishDate ? `公告日 ${metrics.publishDate}` : '']
            .filter(Boolean)
            .join(' · ')
        : '';
      return (
        <span title={title || undefined} style={{ whiteSpace: 'nowrap' }}>
          <span>{formatChineseAmountFromYuan(amount)}</span>
          {growth !== undefined && (
            <span
              className={growth >= 0 ? styles.positiveValue : styles.negativeValue}
              style={{ marginLeft: 6 }}
            >
              {formatGrowthPercent(growth)}
            </span>
          )}
        </span>
      );
    }

    if (value === null || value === undefined || value === '') {
      return '';
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
        return value !== null && value !== undefined ? `${value.toFixed(2)}%` : '';
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
        return value !== undefined && value !== null ? Number(value).toFixed(2) : '';
      case 'opportunityChangePercent':
        return value !== null && value !== undefined ? `${Number(value).toFixed(2)}%` : '';
      case 'ma5':
      case 'ma10':
      case 'ma20':
      case 'ma30':
      case 'ma60':
      case 'ma120':
      case 'ma240':
      case 'ma360':
        return value !== undefined && value !== null ? `${Number(value).toFixed(2)}%` : '';
      case 'sharpMoveLabels': {
        const labels = record?.sharpMovePatterns?.labels;
        if (!labels || labels.length === 0) return '';
        return (
          <div className={styles.consolidationTypes}>
            {labels.map((label) => (
              <StockFeatureTag key={label} text={label} />
            ))}
          </div>
        );
      }
      case 'pullbackLabels': {
        const pullback = record?.pullbackPattern;
        if (!pullback?.labels?.length) {
          return '';
        }
        return (
          <div
            className={styles.consolidationTypes}
            title={pullback.reasonText || undefined}
          >
            {pullback.labels.map((label) => (
              <StockFeatureTag key={label} text={label} />
            ))}
          </div>
        );
      }
      case 'industry': {
        const industryName = record?.industry?.name;
        if (!industryName) return '';
        return <span style={{ fontSize: '13px' }}>{industryName}</span>;
      }
      case 'concepts': {
        if (!record?.concepts || record.concepts.length === 0) {
          return '';
        }
        return <StockConceptTags concepts={record.concepts} max={3} />;
      }
      case 'tradingSignal': {
        const signal = record?.tradingSignal;
        if (!signal) return '';

        let color = '#666';
        let text = '观望';
        if (signal.type === 'STRONG_BUY') { color = '#52c41a'; text = '🟢 强烈买入'; }
        else if (signal.type === 'BUY') { color = '#73d13d'; text = '🟢 建议买入'; }
        else if (signal.type === 'SELL') { color = '#ff7875'; text = '🔴 建议卖出'; }
        else if (signal.type === 'STRONG_SELL') { color = '#f5222d'; text = '🔴 强烈卖出'; }

        return (
          <div className={styles.tradingSignal}>
            <span style={{ fontWeight: 'bold', color, fontSize: '12px' }}>{text}</span>
            {signal.reason ? <span className={styles.tradingSignalReason}>{signal.reason}</span> : null}
          </div>
        );
      }
      default:
        return String(value);
    }
  };

  // 可见列只计算一次，供列定义与横向滚动宽度共用（原先两处各自 filter + sort）
  const visibleColumns = useMemo(
    () => columns.filter((c) => c.visible).sort((a, b) => a.order - b.order),
    [columns]
  );

  const tableColumns: ColumnsType<StockOpportunityData> = useMemo(() => {
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
            return '';
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
  }, [visibleColumns, sortConfig, onShowAIAnalysis]);

  // 计算表格横向滚动宽度（与列定义共用同一份可见列）
  const scrollX = useMemo(
    () => visibleColumns.reduce((sum, col) => sum + (col.width || 120), 0),
    [visibleColumns]
  );

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
        onRow={
          onRowClick
            ? (record) => ({
                onClick: () => onRowClick(record),
                className: styles.clickableRow,
              })
            : undefined
        }
        size="small"
        className={styles.opportunityTable}
      />
    </div>
  );
});


