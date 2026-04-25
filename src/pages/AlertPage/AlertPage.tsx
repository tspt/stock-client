/**
 * 提醒列表页面
 */

import { useState, useEffect, useMemo } from 'react';
import { Table, Button, Space, Tag, Popconfirm, Empty, App } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { EditOutlined, DeleteOutlined, BellOutlined, BellTwoTone } from '@ant-design/icons';
import { useAlertStore } from '@/stores/alertStore';
import { useStockStore } from '@/stores/stockStore';
import { AlertSettingModal } from '@/components/PriceAlert/AlertSettingModal';
import { formatPrice, formatChangePercent } from '@/utils/format/format';
import type { PriceAlert } from '@/types/stock';
import { ALERT_TIME_PERIODS } from '@/utils/config/constants';
import styles from './AlertPage.module.css';

export function AlertPage() {
  const { message } = App.useApp();
  const { alerts, removeAlert, toggleAlert, loadAlerts, resetAlertTrigger } = useAlertStore();
  const { quotes, watchList } = useStockStore();
  const [editAlert, setEditAlert] = useState<PriceAlert | null>(null);
  const [editModalVisible, setEditModalVisible] = useState(false);

  useEffect(() => {
    loadAlerts();
  }, [loadAlerts]);

  const columns: ColumnsType<PriceAlert> = useMemo(() => {
    const getStockName = (code: string) => {
      const stock = watchList.find((s) => s.code === code);
      return stock?.name || code;
    };

    const getCurrentPrice = (code: string) => {
      const quote = quotes[code];
      return quote?.price;
    };

    const getTimePeriodLabel = (period: string) => {
      const periodOption = ALERT_TIME_PERIODS.find((p) => p.value === period);
      return periodOption?.label || period;
    };

    const getStatusTag = (alert: PriceAlert) => {
      if (!alert.enabled) {
        return <Tag color="default">已禁用</Tag>;
      }
      if (alert.triggered) {
        return <Tag color="success">已触发</Tag>;
      }
      return <Tag color="processing">监控中</Tag>;
    };

    const getConditionText = (alert: PriceAlert) => {
      if (alert.type === 'price') {
        return alert.condition === 'above'
          ? `涨到 ${formatPrice(alert.targetValue)} 元`
          : `跌到 ${formatPrice(alert.targetValue)} 元`;
      } else if (alert.type === 'percent') {
        return alert.condition === 'above'
          ? `涨幅达到 ${formatChangePercent(alert.targetValue)}`
          : `跌幅达到 ${formatChangePercent(alert.targetValue)}`;
      } else if (alert.type === 'support_resistance') {
        if (alert.condition === 'breakout') {
          return `突破阻力位 ${formatPrice(alert.resistanceLevel || alert.targetValue)} 元`;
        } else {
          return `跌破支撑位 ${formatPrice(alert.supportLevel || alert.targetValue)} 元`;
        }
      } else if (alert.type === 'volume_anomaly') {
        return `成交量异常（>${(alert.volumeMultiplier || 2.0).toFixed(1)}倍均量）`;
      } else if (alert.type === 'indicator_cross') {
        const indicatorName = getIndicatorName(alert.indicatorType);
        if (alert.condition === 'golden_cross') {
          return `${indicatorName}金叉`;
        } else {
          return `${indicatorName}死叉`;
        }
      }
      return '-';
    };

    const getIndicatorName = (indicatorType?: string): string => {
      switch (indicatorType) {
        case 'MACD':
          return 'MACD';
        case 'KDJ':
          return 'KDJ';
        case 'RSI':
          return 'RSI';
        case 'MA':
          return '均线';
        default:
          return '指标';
      }
    };

    return [
      {
        title: '股票',
        dataIndex: 'code',
        key: 'code',
        width: 120,
        render: (code: string) => (
          <div>
            <div className={styles.stockName}>{getStockName(code)}</div>
            <div className={styles.stockCode}>{code}</div>
          </div>
        ),
      },
      {
        title: '提醒类型',
        key: 'type',
        width: 120,
        render: (_: unknown, alert: PriceAlert) => {
          let color = 'blue';
          let text = '价格';

          switch (alert.type) {
            case 'price':
              color = 'blue';
              text = '价格';
              break;
            case 'percent':
              color = 'purple';
              text = '幅度';
              break;
            case 'support_resistance':
              color = 'orange';
              text = '支撑阻力';
              break;
            case 'volume_anomaly':
              color = 'red';
              text = '成交量';
              break;
            case 'indicator_cross':
              color = 'green';
              text = '指标交叉';
              break;
          }

          return <Tag color={color}>{text}</Tag>;
        },
      },
      {
        title: '触发条件',
        key: 'condition',
        width: 150,
        render: (_: unknown, alert: PriceAlert) => getConditionText(alert),
      },
      {
        title: '当前价格',
        key: 'currentPrice',
        width: 100,
        render: (_: unknown, alert: PriceAlert) => {
          const price = getCurrentPrice(alert.code);
          return price ? formatPrice(price) : '-';
        },
      },
      {
        title: '时间周期',
        dataIndex: 'timePeriod',
        key: 'timePeriod',
        width: 80,
        render: (period: string) => getTimePeriodLabel(period),
      },
      {
        title: '通知方式',
        key: 'notifications',
        width: 120,
        render: (_: unknown, alert: PriceAlert) => (
          <Space size="small">
            {alert.notifications.tray && <Tag>托盘</Tag>}
            {alert.notifications.desktop && <Tag>桌面</Tag>}
          </Space>
        ),
      },
      {
        title: '状态',
        key: 'status',
        width: 100,
        render: (_: unknown, alert: PriceAlert) => getStatusTag(alert),
      },
      {
        title: '操作',
        key: 'action',
        width: 200,
        render: (_: unknown, alert: PriceAlert) => (
          <Space size="small">
            <Button
              type="link"
              size="small"
              icon={<EditOutlined />}
              onClick={() => {
                setEditAlert(alert);
                setEditModalVisible(true);
              }}
            >
              编辑
            </Button>
            <Button
              type="link"
              size="small"
              icon={alert.enabled ? <BellOutlined /> : <BellTwoTone />}
              onClick={() => {
                toggleAlert(alert.id);
                message.success(alert.enabled ? '提醒已禁用' : '提醒已启用');
              }}
            >
              {alert.enabled ? '禁用' : '启用'}
            </Button>
            {alert.triggered && (
              <Button
                type="link"
                size="small"
                onClick={() => {
                  resetAlertTrigger(alert.id);
                  message.success('提醒状态已重置');
                }}
              >
                重置
              </Button>
            )}
            <Popconfirm
              title="确定要删除这个提醒吗？"
              onConfirm={() => {
                removeAlert(alert.id);
                message.success('提醒已删除');
              }}
              okText="确定"
              cancelText="取消"
            >
              <Button type="link" size="small" danger icon={<DeleteOutlined />}>
                删除
              </Button>
            </Popconfirm>
          </Space>
        ),
      },
    ];
  }, [watchList, quotes, removeAlert, toggleAlert, resetAlertTrigger]);

  if (alerts.length === 0) {
    return (
      <div className={styles.emptyContainer}>
        <Empty description="暂无提醒设置" />
      </div>
    );
  }

  return (
    <div className={styles.alertPage}>
      <Table
        dataSource={alerts}
        columns={columns}
        rowKey="id"
        pagination={{ pageSize: 20 }}
        size="small"
      />
      {editAlert && (
        <AlertSettingModal
          visible={editModalVisible}
          code={editAlert.code}
          name={editAlert.name}
          basePrice={editAlert.basePrice}
          editAlert={editAlert}
          onCancel={() => {
            setEditModalVisible(false);
            setEditAlert(null);
          }}
          onSuccess={() => {
            setEditModalVisible(false);
            setEditAlert(null);
          }}
        />
      )}
    </div>
  );
}
