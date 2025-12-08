/**
 * 详情页（K线图）
 */

import { useState, useEffect } from 'react';
import { Layout, Space, Card, Statistic, message, Table } from 'antd';
import { useStockStore } from '@/stores/stockStore';
import { useKLineData } from '@/hooks/useKLineData';
import { useStockDetail } from '@/hooks/useStockDetail';
import { KLineChart } from '@/components/KLineChart/KLineChart';
import { ThemeToggle } from '@/components/ThemeToggle/ThemeToggle';
import {
  formatPrice,
  formatChangePercent,
  formatVolume,
  formatAmount,
  formatMarketCap,
  formatRatio,
  formatTurnoverRate,
} from '@/utils/format';
import type { KLinePeriod } from '@/types/stock';
import styles from './DetailPage.module.css';

const { Header, Content } = Layout;

const PERIODS: { label: string; value: KLinePeriod }[] = [
  { label: '分时', value: '1min' },
  { label: '日K', value: 'day' },
  { label: '周K', value: 'week' },
  { label: '月K', value: 'month' },
  { label: '年K', value: 'year' },
];

export function DetailPage() {
  const { selectedStock, quotes, setSelectedStock } = useStockStore();
  const [period, setPeriod] = useState<KLinePeriod>('day');
  const { data: klineData, loading, error } = useKLineData({
    code: selectedStock,
    period,
    enablePolling: true,
  });
  const { detail, loading: detailLoading } = useStockDetail(selectedStock, true);

  const quote = selectedStock ? quotes[selectedStock] : null;

  const handleBack = () => {
    setSelectedStock(null);
  };

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
          <ThemeToggle />
        </div>
      </Header>
      <Content className={styles.content}>
        {quote && (
          <>
            <Card className={styles.quoteCard}>
              <Space size="large">
                <Statistic
                  title="当前价"
                  value={formatPrice(quote.price)}
                  valueStyle={{
                    color: quote.changePercent >= 0 ? '#ff4d4f' : '#52c41a',
                    fontSize: 24,
                    fontWeight: 600,
                  }}
                />
                <Statistic
                  title="涨跌额"
                  value={quote.change}
                  precision={2}
                  valueStyle={{
                    color: quote.changePercent >= 0 ? '#ff4d4f' : '#52c41a',
                  }}
                  prefix={quote.change >= 0 ? '+' : ''}
                />
                <Statistic
                  title="涨跌幅"
                  value={quote.changePercent}
                  precision={2}
                  suffix="%"
                  valueStyle={{
                    color: quote.changePercent >= 0 ? '#ff4d4f' : '#52c41a',
                  }}
                  prefix={quote.changePercent >= 0 ? '+' : ''}
                />
                <Statistic
                  title="成交量"
                  value={formatVolume(quote.volume)}
                />
                <Statistic
                  title="成交额"
                  value={formatAmount(quote.amount)}
                />
              </Space>
            </Card>
            {detail && (
              <>
                <Card className={styles.quoteCard} title="基本面信息" loading={detailLoading}>
                  <Space size="large" wrap>
                    {detail.marketCap !== undefined && (
                      <Statistic
                        title="总市值"
                        value={formatMarketCap(detail.marketCap)}
                      />
                    )}
                    {detail.circulatingMarketCap !== undefined && (
                      <Statistic
                        title="流通市值"
                        value={formatMarketCap(detail.circulatingMarketCap)}
                      />
                    )}
                    {detail.peRatio !== undefined && (
                      <Statistic
                        title="市盈率(PE)"
                        value={formatRatio(detail.peRatio)}
                      />
                    )}
                    {detail.turnoverRate !== undefined && (
                      <Statistic
                        title="换手率"
                        value={formatTurnoverRate(detail.turnoverRate)}
                      />
                    )}
                  </Space>
                </Card>
                {(detail.buyOrders || detail.sellOrders) && (
                  <Card className={styles.quoteCard} title="买卖盘" loading={detailLoading}>
                    <div style={{ display: 'flex', gap: '24px' }}>
                      {/* 卖盘 */}
                      {detail.sellOrders && detail.sellOrders.length > 0 && (
                        <div style={{ flex: 1 }}>
                          <h4 style={{ marginBottom: 12, color: '#ff4d4f' }}>卖盘</h4>
                          <Table
                            size="small"
                            pagination={false}
                            dataSource={detail.sellOrders.map((order, index) => ({
                              key: `sell-${index}`,
                              level: `卖${index + 1}`,
                              price: order.price,
                              volume: order.volume,
                            }))}
                            columns={[
                              {
                                title: '档位',
                                dataIndex: 'level',
                                key: 'level',
                                width: 60,
                              },
                              {
                                title: '价格',
                                dataIndex: 'price',
                                key: 'price',
                                render: (price: number) => (
                                  <span style={{ color: '#ff4d4f' }}>
                                    {formatPrice(price)}
                                  </span>
                                ),
                              },
                              {
                                title: '数量（手）',
                                dataIndex: 'volume',
                                key: 'volume',
                                render: (volume: number) => formatVolume(volume),
                              },
                            ]}
                          />
                        </div>
                      )}
                      {/* 买盘 */}
                      {detail.buyOrders && detail.buyOrders.length > 0 && (
                        <div style={{ flex: 1 }}>
                          <h4 style={{ marginBottom: 12, color: '#52c41a' }}>买盘</h4>
                          <Table
                            size="small"
                            pagination={false}
                            dataSource={detail.buyOrders.map((order, index) => ({
                              key: `buy-${index}`,
                              level: `买${index + 1}`,
                              price: order.price,
                              volume: order.volume,
                            }))}
                            columns={[
                              {
                                title: '档位',
                                dataIndex: 'level',
                                key: 'level',
                                width: 60,
                              },
                              {
                                title: '价格',
                                dataIndex: 'price',
                                key: 'price',
                                render: (price: number) => (
                                  <span style={{ color: '#52c41a' }}>
                                    {formatPrice(price)}
                                  </span>
                                ),
                              },
                              {
                                title: '数量（手）',
                                dataIndex: 'volume',
                                key: 'volume',
                                render: (volume: number) => formatVolume(volume),
                              },
                            ]}
                          />
                        </div>
                      )}
                    </div>
                  </Card>
                )}
              </>
            )}
          </>
        )}
        {/* <div className={styles.periodSelector}>
          <Space>
            {PERIODS.map((p) => (
              <Button
                key={p.value}
                type={period === p.value ? 'primary' : 'default'}
                onClick={() => setPeriod(p.value)}
              >
                {p.label}
              </Button>
            ))}
          </Space>
        </div>
        <div className={styles.chartContainer}>
          <KLineChart
            data={klineData}
            period={period}
            loading={loading}
          />
        </div> */}
      </Content>
    </Layout>
  );
}

