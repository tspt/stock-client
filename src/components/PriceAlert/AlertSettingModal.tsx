/**
 * 提醒设置弹窗组件
 */

import { useState, useEffect } from 'react';
import { Modal, Form, Radio, InputNumber, Select, Checkbox, App } from 'antd';
import type { PriceAlert, AlertType, NotificationConfig, IndicatorType } from '@/types/stock';
import { useAlertStore } from '@/stores/alertStore';
import { useStockStore } from '@/stores/stockStore';
import { ALERT_TIME_PERIODS } from '@/utils/config/constants';
import { formatPrice } from '@/utils/format/format';
import { logger } from '@/utils/business/logger';

interface AlertSettingModalProps {
  /** 是否显示 */
  visible: boolean;
  /** 股票代码 */
  code: string;
  /** 股票名称 */
  name: string;
  /** 当前价格（用于显示） */
  currentPrice?: number;
  /** 基准价格（开盘价/prevClose） */
  basePrice: number;
  /** 编辑模式：传入要编辑的提醒 */
  editAlert?: PriceAlert;
  /** 关闭回调 */
  onCancel: () => void;
  /** 成功回调 */
  onSuccess?: () => void;
}

export function AlertSettingModal({
  visible,
  code,
  name,
  currentPrice,
  basePrice,
  editAlert,
  onCancel,
  onSuccess,
}: AlertSettingModalProps) {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const { addAlert, updateAlert } = useAlertStore();
  const { quotes } = useStockStore();
  const [alertType, setAlertType] = useState<AlertType>('price');
  const [indicatorType, setIndicatorType] = useState<IndicatorType>('MACD');

  // 获取当前行情（如果未传入）
  const quote = quotes[code];
  const displayPrice = currentPrice ?? quote?.price ?? basePrice;
  const displayBasePrice = basePrice || quote?.prevClose || quote?.price || 0;

  useEffect(() => {
    if (visible) {
      if (editAlert) {
        // 编辑模式：填充表单
        form.setFieldsValue({
          type: editAlert.type,
          condition: editAlert.condition,
          targetValue: editAlert.targetValue,
          timePeriod: editAlert.timePeriod,
          notifications: editAlert.notifications,
          indicatorType: editAlert.indicatorType || 'MACD',
          volumeMultiplier: editAlert.volumeMultiplier || 2.0,
          volumePeriod: editAlert.volumePeriod || 20,
          maFastPeriod: editAlert.maFastPeriod || 5,
          maSlowPeriod: editAlert.maSlowPeriod || 20,
        });
        setAlertType(editAlert.type);
        setIndicatorType(editAlert.indicatorType || 'MACD');
      } else {
        // 新建模式：重置表单
        form.resetFields();
        form.setFieldsValue({
          type: 'price',
          condition: 'above',
          timePeriod: 'day',
          notifications: {
            tray: true,
            desktop: true,
          },
          indicatorType: 'MACD',
          volumeMultiplier: 2.0,
          volumePeriod: 20,
          maFastPeriod: 5,
          maSlowPeriod: 20,
        });
        setAlertType('price');
        setIndicatorType('MACD');
      }
    }
  }, [visible, editAlert, form]);

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      const {
        type,
        condition,
        targetValue,
        timePeriod,
        notifications,
        indicatorType: selectedIndicatorType,
        volumeMultiplier,
        volumePeriod,
        maFastPeriod,
        maSlowPeriod,
      } = values;

      // 验证目标值
      if (type === 'price') {
        if (targetValue <= 0) {
          message.error('目标价格必须大于0');
          return;
        }
        if (condition === 'above' && targetValue <= displayPrice) {
          message.warning('涨到提醒：目标价格应大于当前价格');
        }
        if (condition === 'below' && targetValue >= displayPrice) {
          message.warning('跌到提醒：目标价格应小于当前价格');
        }
      } else if (type === 'percent') {
        if (condition === 'above' && targetValue <= 0) {
          message.error('目标涨幅必须大于0');
          return;
        }
        if (condition === 'below' && targetValue >= 0) {
          message.error('目标跌幅必须小于0');
          return;
        }
      } else if (type === 'volume_anomaly') {
        if (!volumeMultiplier || volumeMultiplier < 1.5) {
          message.error('成交量倍数阈值必须大于等于1.5');
          return;
        }
      }

      if (editAlert) {
        // 更新提醒
        updateAlert(editAlert.id, {
          type,
          condition,
          targetValue,
          timePeriod,
          notifications,
          indicatorType: selectedIndicatorType,
          volumeMultiplier,
          volumePeriod,
          maFastPeriod,
          maSlowPeriod,
          // 重置触发状态（如果修改了目标值）
          triggered: false,
          lastTriggerPrice: undefined,
        });
        message.success('提醒已更新');
      } else {
        // 添加提醒
        addAlert({
          code,
          name,
          type,
          condition,
          targetValue,
          basePrice: displayBasePrice,
          timePeriod,
          notifications,
          indicatorType: selectedIndicatorType,
          volumeMultiplier,
          volumePeriod,
          maFastPeriod,
          maSlowPeriod,
        });
        message.success('提醒已设置');
      }

      onSuccess?.();
      onCancel();
    } catch (error) {
      message.error('设置提醒失败，请重试');
      logger.error('表单验证失败:', error);
    }
  };

  return (
    <Modal
      title={editAlert ? '编辑提醒' : '设置价格提醒'}
      open={visible}
      onOk={handleSubmit}
      onCancel={onCancel}
      okText="确定"
      cancelText="取消"
      width={500}
    >
      <Form form={form} layout="vertical" initialValues={{ type: 'price', condition: 'above', timePeriod: 'day' }}>
        <Form.Item label="股票信息">
          <div>
            <div>
              <strong>{name}</strong> ({code})
            </div>
            <div style={{ color: '#999', fontSize: '12px', marginTop: '4px' }}>
              当前价格: {formatPrice(displayPrice)} 元 | 基准价格: {formatPrice(displayBasePrice)} 元
            </div>
          </div>
        </Form.Item>

        <Form.Item
          name="type"
          label="提醒类型"
          rules={[{ required: true, message: '请选择提醒类型' }]}
        >
          <Radio.Group
            onChange={(e) => {
              setAlertType(e.target.value);
              form.setFieldsValue({ targetValue: undefined });
            }}
          >
            <Radio value="price">价格提醒</Radio>
            <Radio value="percent">幅度提醒</Radio>
            <Radio value="support_resistance">支撑阻力位</Radio>
            <Radio value="volume_anomaly">成交量异常</Radio>
            <Radio value="indicator_cross">指标金叉/死叉</Radio>
          </Radio.Group>
        </Form.Item>

        <Form.Item
          name="condition"
          label="触发条件"
          rules={[{ required: true, message: '请选择触发条件' }]}
        >
          <Radio.Group>
            {alertType === 'price' && (
              <>
                <Radio value="above">涨到</Radio>
                <Radio value="below">跌到</Radio>
              </>
            )}
            {alertType === 'percent' && (
              <>
                <Radio value="above">涨幅达到</Radio>
                <Radio value="below">跌幅达到</Radio>
              </>
            )}
            {alertType === 'support_resistance' && (
              <>
                <Radio value="breakout">突破阻力位</Radio>
                <Radio value="breakdown">跌破支撑位</Radio>
              </>
            )}
            {alertType === 'indicator_cross' && (
              <>
                <Radio value="golden_cross">金叉</Radio>
                <Radio value="death_cross">死叉</Radio>
              </>
            )}
          </Radio.Group>
        </Form.Item>

        <Form.Item
          name="targetValue"
          label={alertType === 'price' ? '目标价格（元）' : '目标幅度（%）'}
          rules={[
            {
              validator: (_, value) => {
                if (value === undefined || value === null || value === '') {
                  return Promise.reject(new Error(`请输入目标${alertType === 'price' ? '价格' : '幅度'}`));
                }
                if (alertType === 'percent') {
                  if (form.getFieldValue('condition') === 'above' && value <= 0) {
                    return Promise.reject(new Error('涨幅必须大于0'));
                  }
                  if (form.getFieldValue('condition') === 'below' && value >= 0) {
                    return Promise.reject(new Error('跌幅必须小于0'));
                  }
                }
                return Promise.resolve();
              },
            },
          ]}
        >
          <InputNumber
            style={{ width: '100%' }}
            min={alertType === 'price' ? 0.01 : undefined}
            max={alertType === 'price' ? undefined : undefined}
            precision={alertType === 'price' ? 2 : 2}
            placeholder={alertType === 'price' ? '请输入目标价格' : '请输入目标幅度'}
          />
        </Form.Item>

        {/* 技术指标类型选择（仅当提醒类型为指标金叉/死叉时显示） */}
        {alertType === 'indicator_cross' && (
          <Form.Item
            name="indicatorType"
            label="技术指标类型"
            rules={[{ required: true, message: '请选择技术指标类型' }]}
          >
            <Select onChange={(value) => setIndicatorType(value)}>
              <Select.Option value="MACD">MACD</Select.Option>
              <Select.Option value="KDJ">KDJ</Select.Option>
              <Select.Option value="RSI">RSI</Select.Option>
              <Select.Option value="MA">均线 (MA)</Select.Option>
            </Select>
          </Form.Item>
        )}

        {/* MA周期配置（仅当指标类型为MA时显示） */}
        {alertType === 'indicator_cross' && indicatorType === 'MA' && (
          <>
            <Form.Item
              name="maFastPeriod"
              label="快速MA周期"
              rules={[{ required: true, message: '请输入快速MA周期' }]}
            >
              <InputNumber style={{ width: '100%' }} min={1} max={60} />
            </Form.Item>
            <Form.Item
              name="maSlowPeriod"
              label="慢速MA周期"
              rules={[{ required: true, message: '请输入慢速MA周期' }]}
            >
              <InputNumber style={{ width: '100%' }} min={1} max={120} />
            </Form.Item>
          </>
        )}

        {/* 成交量异常配置 */}
        {alertType === 'volume_anomaly' && (
          <>
            <Form.Item
              name="volumeMultiplier"
              label="成交量倍数阈值"
              rules={[{ required: true, message: '请输入成交量倍数阈值' }]}
            >
              <InputNumber
                style={{ width: '100%' }}
                min={1.5}
                max={10}
                step={0.1}
                precision={1}
                placeholder="例如：2.0表示2倍均量"
              />
            </Form.Item>
            <Form.Item
              name="volumePeriod"
              label="历史均量计算周期（天）"
              rules={[{ required: true, message: '请输入计算周期' }]}
            >
              <InputNumber style={{ width: '100%' }} min={5} max={60} />
            </Form.Item>
          </>
        )}

        <Form.Item
          name="timePeriod"
          label="时间周期"
          rules={[{ required: true, message: '请选择时间周期' }]}
        >
          <Select>
            {ALERT_TIME_PERIODS.map((period) => (
              <Select.Option key={period.value} value={period.value}>
                {period.label}
              </Select.Option>
            ))}
          </Select>
        </Form.Item>

        <Form.Item
          name="notifications"
          label="通知方式"
          rules={[
            {
              validator: (_, value: NotificationConfig) => {
                if (!value || (!value.tray && !value.desktop)) {
                  return Promise.reject(new Error('至少选择一种通知方式'));
                }
                return Promise.resolve();
              },
            },
          ]}
        >
          <Form.Item
            name={['notifications', 'tray']}
            valuePropName="checked"
            noStyle
          >
            <Checkbox>系统托盘通知</Checkbox>
          </Form.Item>
          <Form.Item
            name={['notifications', 'desktop']}
            valuePropName="checked"
            noStyle
            style={{ marginLeft: 16 }}
          >
            <Checkbox>桌面通知</Checkbox>
          </Form.Item>
        </Form.Item>
      </Form>
    </Modal >
  );
}

