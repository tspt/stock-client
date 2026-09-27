/**
 * 临时股票列表的「加入 / 取消」+ ↑↓ 快捷键（各个 K 线抽屉共用）。
 *
 * 临时列表本身是全局内存态（tempStockListStore），抽屉只负责两件事：
 * 1. 按 code 去重地加入 / 移除，并给出提示文案；
 * 2. ↑ = 加入、↓ = 取消：ECharts 画布不接收焦点，必须监听 window，
 *    抽屉打开时注册、关闭即移除；输入框等可编辑控件内不劫持，组合键交还系统。
 */

import { useCallback, useEffect } from 'react';
import { App } from 'antd';
import { isEditableTarget } from '@/hooks/useRecordNavigation';
import { useTempStockListStore } from '@/stores/tempStockListStore';

export interface UseTempListToggleOptions {
  code: string;
  name: string;
  /** 抽屉是否打开：只有打开时才注册 ↑ / ↓ 快捷键 */
  enabled: boolean;
}

export interface UseTempListToggleResult {
  /** 当前股票是否已在临时列表中 */
  inTempList: boolean;
  /** 临时列表总数 */
  tempListCount: number;
  /** 加入临时列表（已存在时只提示，不重复加入） */
  add: () => void;
  /** 取消加入（不在列表中时只提示） */
  remove: () => void;
}

export function useTempListToggle({
  code,
  name,
  enabled,
}: UseTempListToggleOptions): UseTempListToggleResult {
  const { message } = App.useApp();

  const tempListCount = useTempStockListStore((state) => state.items.length);
  const inTempList = useTempStockListStore((state) =>
    state.items.some((item) => item.code === code)
  );
  const addStock = useTempStockListStore((state) => state.addStock);
  const removeStock = useTempStockListStore((state) => state.removeStock);

  /** 加入临时列表：按 code 去重，重复加入只提示不新增 */
  const add = useCallback(() => {
    if (!code) {
      return;
    }
    const stockName = name || code;
    if (addStock({ code, name: stockName })) {
      message.success(`已加入临时列表：${stockName}（共 ${tempListCount + 1} 只）`);
    } else {
      message.info(`${stockName} 已在临时列表中`);
    }
  }, [addStock, code, message, name, tempListCount]);

  /** 取消加入：把当前股票从临时列表移除（不在列表中时只提示） */
  const remove = useCallback(() => {
    if (!code) {
      return;
    }
    const stockName = name || code;
    if (!inTempList) {
      message.info(`${stockName} 不在临时列表中`);
      return;
    }
    removeStock(code);
    message.success(`已取消加入：${stockName}（剩余 ${Math.max(0, tempListCount - 1)} 只）`);
  }, [code, inTempList, message, name, removeStock, tempListCount]);

  /**
   * ↑ 加入 / ↓ 取消 快捷键：
   * 与 ← / → 换股同一套约定——ECharts 画布不接收焦点，必须监听 window。
   */
  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      if (isEditableTarget(event.target)) return;

      // 方向键默认会滚动页面 / 弹窗内容，这里必须拦下
      event.preventDefault();
      if (event.key === 'ArrowUp') {
        add();
      } else {
        remove();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [enabled, add, remove]);

  return { inTempList, tempListCount, add, remove };
}
