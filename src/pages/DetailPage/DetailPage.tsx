/**
 * 详情页（K线图）
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Layout, Space, Card, message, Table, Button, Select } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { BellOutlined } from '@ant-design/icons';
import { useStockStore } from '@/stores/stockStore';
import { useKLineData } from '@/hooks/useKLineData';
import { useStockDetail } from '@/hooks/useStockDetail';
import { KLineChart } from '@/components/KLineChart/KLineChart';
import { AlertSettingModal } from '@/components/PriceAlert/AlertSettingModal';
import { FundamentalAnalysisCard } from '@/components/FundamentalAnalysisCard';
import {
  formatPrice,
  formatVolume,
  formatAmount,
  formatMarketCap,
  formatRatio,
  formatTurnoverRate,
} from '@/utils/format';
import type { KLinePeriod } from '@/types/stock';
import { DETAIL_KLINE_PERIOD_STORAGE_KEY } from '@/utils/constants';
import styles from './DetailPage.module.css';

const { Header, Content } = Layout;
const { Option } = Select;

const PERIOD_OPTIONS: { label: string; value: KLinePeriod }[] = [
  { label: '分时', value: '1min' },
  { label: '5分', value: '5min' },
  { label: '15分', value: '15min' },
  { label: '30分', value: '30min' },
  { label: '60分', value: '60min' },
  { label: '日', value: 'day' },
  { label: '周', value: 'week' },
  { label: '月', value: 'month' },
  { label: '年', value: 'year' },
];

type OrderBookRow = {
  key: string;
  level: string;
  price: number;
  volume: number;
};

const SELL_ORDER_COLUMNS: ColumnsType<OrderBookRow> = [
  {
    title: '档位',
    dataIndex: 'level',
    key: 'level',
    width: 50,
  },
  {
    title: '价格',
    dataIndex: 'price',
    key: 'price',
    render: (price: number) => <span className={styles.priceSell}>{formatPrice(price)}</span>,
  },
  {
    title: '数量',
    dataIndex: 'volume',
    key: 'volume',
    render: (volume: number) => formatVolume(volume),
  },
];

const BUY_ORDER_COLUMNS: ColumnsType<OrderBookRow> = [
  {
    title: '档位',
    dataIndex: 'level',
    key: 'level',
    width: 50,
  },
  {
    title: '价格',
    dataIndex: 'price',
    key: 'price',
    render: (price: number) => <span className={styles.priceBuy}>{formatPrice(price)}</span>,
  },
  {
    title: '数量',
    dataIndex: 'volume',
    key: 'volume',
    render: (volume: number) => formatVolume(volume),
  },
];

export function DetailPage() {
  const { selectedStock, quotes, watchList } = useStockStore();

  // 从localStorage恢复上次选择的周期，默认为'day'
  const [period, setPeriod] = useState<KLinePeriod>(() => {
    try {
      const saved = localStorage.getItem(DETAIL_KLINE_PERIOD_STORAGE_KEY);
      if (saved && ['1min', '5min', '15min', '30min', '60min', 'day', 'week', 'month', 'year'].includes(saved)) {
        return saved as KLinePeriod;
      }
    } catch (e) {
      console.warn('读取周期偏好失败:', e);
    }
    return 'day';
  });

  const [alertModalVisible, setAlertModalVisible] = useState(false);

  const { data: klineData, loading: klineLoading, error } = useKLineData({
    code: selectedStock,
    period,
    enablePolling: true,
  });
  const { detail, loading: detailLoading } = useStockDetail(selectedStock, true);

  // 使用useMemo缓存计算结果，避免重复渲染
  const quote = useMemo(() =>
    selectedStock ? quotes[selectedStock] : null,
    [selectedStock, quotes]
  );

  const stock = useMemo(() =>
    selectedStock ? watchList.find((s) => s.code === selectedStock) : null,
    [selectedStock, watchList]
  );

  const sellOrderRows = useMemo<OrderBookRow[]>(
    () =>
      detail?.sellOrders?.map((order, index) => ({
        key: `sell-${index}`,
        level: `卖${index + 1}`,
        price: order.price,
        volume: order.volume,
      })) ?? [],
    [detail?.sellOrders]
  );

  const buyOrderRows = useMemo<OrderBookRow[]>(
    () =>
      detail?.buyOrders?.map((order, index) => ({
        key: `buy-${index}`,
        level: `买${index + 1}`,
        price: order.price,
        volume: order.volume,
      })) ?? [],
    [detail?.buyOrders]
  );

  // 使用useCallback优化事件处理函数
  const handlePeriodChange = useCallback((value: KLinePeriod) => {
    setPeriod(value);
    // 保存周期偏好到localStorage
    try {
      localStorage.setItem(DETAIL_KLINE_PERIOD_STORAGE_KEY, value);
    } catch (e) {
      console.warn('保存周期偏好失败:', e);
    }
  }, []);

  const handleAlertCancel = useCallback(() => {
    setAlertModalVisible(false);
  }, []);

  const handleAlertOpen = useCallback(() => {
    setAlertModalVisible(true);
  }, []);

  useEffect(() => {
    if (error) {
      message.error('加载K线数据失败');
    }
  }, [error]);

  if (!selectedStock) {
    return (
      <div className={styles.emptyDetail}>
        <div>请从左侧列表选择一只股票查看详情</div>
      </div>
    );
  }

  return (
    <Layout className={styles.detailPage}>
      <Header className={styles.header}>
        <div className={styles.headerContent}>
          <h2 className={styles.title}>
            {quote?.name || selectedStock}
          </h2>
          <Space size="small">
            <Button
              type="primary"
              size="small"
              icon={<BellOutlined />}
              onClick={handleAlertOpen}
            >
              设置提醒
            </Button>
          </Space>
        </div>
      </Header>
      <Content className={styles.content}>
        <div className={styles.topSection}>
          {quote && (
            <Card className={styles.quoteCard} bodyStyle={{ padding: '12px 16px' }}>
              <div className={styles.quoteInfo}>
                <div className={styles.priceBlock}>
                  <span className={styles.currentPrice} style={{
                    color: quote.changePercent >= 0 ? '#ff4d4f' : '#52c41a',
                  }}>
                    {formatPrice(quote.price)}
                  </span>
                  <span className={styles.changeInfo} style={{
                    color: quote.changePercent >= 0 ? '#ff4d4f' : '#52c41a',
                  }}>
                    {quote.change >= 0 ? '+' : ''}{quote.change.toFixed(2)} ({quote.changePercent >= 0 ? '+' : ''}{quote.changePercent.toFixed(2)}%)
                  </span>
                </div>
                <div className={styles.quoteDetails}>
                  <span>开:{formatPrice(quote.open)}</span>
                  <span>高:{formatPrice(quote.high)}</span>
                  <span>低:{formatPrice(quote.low)}</span>
                  <span>量:{formatVolume(quote.volume)}</span>
                  <span>额:{formatAmount(quote.amount)}</span>
                </div>
              </div>
            </Card>
          )}

          {detail && (
            <Card className={styles.infoCard} bodyStyle={{ padding: '8px 16px' }}>
              <div className={styles.fundamentalInfo}>
                {detail.marketCap !== undefined && (
                  <span>总市值:{formatMarketCap(detail.marketCap)}</span>
                )}
                {detail.circulatingMarketCap !== undefined && (
                  <span>流通:{formatMarketCap(detail.circulatingMarketCap)}</span>
                )}
                {detail.peRatio !== undefined && (
                  <span>PE:{formatRatio(detail.peRatio)}</span>
                )}
                {detail.turnoverRate !== undefined && (
                  <span>换手:{formatTurnoverRate(detail.turnoverRate)}</span>
                )}
                {detail.volumeRatio !== undefined && (
                  <span>量比:{detail.volumeRatio.toFixed(2)}</span>
                )}
              </div>
            </Card>
          )}

          {(detail?.buyOrders || detail?.sellOrders) && (
            <Card className={styles.orderBookCard} bodyStyle={{ padding: '8px 16px' }} loading={detailLoading}>
              <div className={styles.orderBookCompact}>
                {detail.sellOrders && detail.sellOrders.length > 0 && (
                  <div className={styles.orderSide}>
                    <Table
                      size="small"
                      pagination={false}
                      dataSource={sellOrderRows}
                      columns={SELL_ORDER_COLUMNS}
                      showHeader={false}
                    />
                  </div>
                )}
                {detail.buyOrders && detail.buyOrders.length > 0 && (
                  <div className={styles.orderSide}>
                    <Table
                      size="small"
                      pagination={false}
                      dataSource={buyOrderRows}
                      columns={BUY_ORDER_COLUMNS}
                      showHeader={false}
                    />
                  </div>
                )}
              </div>
            </Card>
          )}
        </div>

        <div className={styles.chartSection}>
          <div className={styles.periodBar}>
            <Select
              value={period}
              onChange={handlePeriodChange}
              size="small"
              style={{ width: 100 }}
            >
              {PERIOD_OPTIONS.map((p) => (
                <Option key={p.value} value={p.value}>
                  {p.label}
                </Option>
              ))}
            </Select>
          </div>
          <div className={styles.chartContainer}>
            <KLineChart
              data={klineData}
              period={period}
              loading={klineLoading}
            />
          </div>
        </div>

        {/* 基本面分析 */}
        <FundamentalAnalysisCard code={selectedStock} />
      </Content>
      {selectedStock && stock && (
        <AlertSettingModal
          visible={alertModalVisible}
          code={selectedStock}
          name={stock.name}
          basePrice={quote?.prevClose || quote?.price || 0}
          onCancel={handleAlertCancel}
        />
      )}
    </Layout>
  );
}
