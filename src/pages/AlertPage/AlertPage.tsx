/**
 * 提醒列表页面
 */

import { useState, useEffect } from 'react';
import { Table, Button, Space, Tag, Popconfirm, message, Empty } from 'antd';
import { EditOutlined, DeleteOutlined, BellOutlined, BellTwoTone } from '@ant-design/icons';
import { useAlertStore } from '@/stores/alertStore';
import { useStockStore } from '@/stores/stockStore';
import { AlertSettingModal } from '@/components/PriceAlert/AlertSettingModal';
import { formatPrice, formatChangePercent } from '@/utils/format';
import type { PriceAlert } from '@/types/stock';
import { ALERT_TIME_PERIODS } from '@/utils/constants';
import styles from './AlertPage.module.css';

export function AlertPage() {
    const { alerts, removeAlert, toggleAlert, loadAlerts, resetAlertTrigger } = useAlertStore();
    const { quotes, watchList } = useStockStore();
    const [editAlert, setEditAlert] = useState<PriceAlert | null>(null);
    const [editModalVisible, setEditModalVisible] = useState(false);

    useEffect(() => {
        loadAlerts();
    }, [loadAlerts]);

    // 获取股票名称
    const getStockName = (code: string) => {
        const stock = watchList.find((s) => s.code === code);
        return stock?.name || code;
    };

    // 获取当前价格
    const getCurrentPrice = (code: string) => {
        const quote = quotes[code];
        return quote?.price;
    };

    // 获取时间周期标签
    const getTimePeriodLabel = (period: string) => {
        const periodOption = ALERT_TIME_PERIODS.find((p) => p.value === period);
        return periodOption?.label || period;
    };

    // 获取提醒状态标签
    const getStatusTag = (alert: PriceAlert) => {
        if (!alert.enabled) {
            return <Tag color="default">已禁用</Tag>;
        }
        if (alert.triggered) {
            return <Tag color="success">已触发</Tag>;
        }
        return <Tag color="processing">监控中</Tag>;
    };

    // 获取触发条件文本
    const getConditionText = (alert: PriceAlert) => {
        if (alert.type === 'price') {
            return alert.condition === 'above' ? `涨到 ${formatPrice(alert.targetValue)} 元` : `跌到 ${formatPrice(alert.targetValue)} 元`;
        } else {
            return alert.condition === 'above' ? `涨幅达到 ${formatChangePercent(alert.targetValue)}` : `跌幅达到 ${formatChangePercent(alert.targetValue)}`;
        }
    };

    const columns = [
        {
            title: '股票',
            dataIndex: 'code',
            key: 'code',
            width: 120,
            render: (code: string, alert: PriceAlert) => (
                <div>
                    <div style={{ fontWeight: 500 }}>{getStockName(code)}</div>
                    <div style={{ fontSize: '12px', color: '#999' }}>{code}</div>
                </div>
            ),
        },
        {
            title: '提醒类型',
            key: 'type',
            width: 100,
            render: (_: any, alert: PriceAlert) => (
                <Tag color={alert.type === 'price' ? 'blue' : 'purple'}>
                    {alert.type === 'price' ? '价格' : '幅度'}
                </Tag>
            ),
        },
        {
            title: '触发条件',
            key: 'condition',
            width: 150,
            render: (_: any, alert: PriceAlert) => getConditionText(alert),
        },
        {
            title: '当前价格',
            key: 'currentPrice',
            width: 100,
            render: (_: any, alert: PriceAlert) => {
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
            render: (_: any, alert: PriceAlert) => (
                <Space size="small">
                    {alert.notifications.tray && <Tag size="small">托盘</Tag>}
                    {alert.notifications.desktop && <Tag size="small">桌面</Tag>}
                </Space>
            ),
        },
        {
            title: '状态',
            key: 'status',
            width: 100,
            render: (_: any, alert: PriceAlert) => getStatusTag(alert),
        },
        {
            title: '操作',
            key: 'action',
            width: 200,
            render: (_: any, alert: PriceAlert) => (
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

