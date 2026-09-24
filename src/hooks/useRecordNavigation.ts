/**
 * 表格行导航 Hook
 *
 * 为「K线 / 筹码弹窗」提供 ← / → 快速切换表格上一行 / 下一行的能力，
 * 免去「关闭弹窗 → 找下一行 → 再点击」的重复操作。
 *
 * 行顺序完全由调用方传入的 records 决定（应与表格当前展示顺序一致）；
 * 键盘监听只在 enabled（通常为弹窗是否打开）为 true 时挂到 window 上：
 * ECharts 画布不接收焦点，必须监听 window 才能捕获方向键，打开注册、关闭即移除。
 */

import { useCallback, useEffect, useMemo } from 'react';

export interface NavigableRecord {
  code: string;
  name: string;
}

export interface UseRecordNavigationOptions<T extends NavigableRecord> {
  /** 是否启用（通常为弹窗是否打开） */
  enabled: boolean;
  /** 与表格展示顺序一致的股票列表 */
  records: T[];
  /** 当前展示的股票代码，用于定位在列表中的位置 */
  currentCode: string;
  /** 切换到相邻行时回调，由调用方更新弹窗对应的数据 */
  onNavigate?: (record: T) => void;
}

export interface UseRecordNavigationResult<T extends NavigableRecord> {
  /** 当前股票在列表中的下标；-1 表示不在列表中（如筛选变化后已被过滤掉） */
  currentIndex: number;
  total: number;
  hasPrev: boolean;
  hasNext: boolean;
  goPrev: () => void;
  goNext: () => void;
}

/** 方向键是否落在可编辑控件上（此时不应劫持，交还输入框自身行为） */
function isEditableTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

export function useRecordNavigation<T extends NavigableRecord>({
  enabled,
  records,
  currentCode,
  onNavigate,
}: UseRecordNavigationOptions<T>): UseRecordNavigationResult<T> {
  const currentIndex = useMemo(
    () => records.findIndex((record) => record.code === currentCode),
    [records, currentCode]
  );

  // 当前股票不在列表中时，只允许向「第一行」前进，避免导航彻底失效
  const hasPrev = currentIndex > 0;
  const hasNext = records.length > 0 && currentIndex < records.length - 1;

  const goPrev = useCallback(() => {
    if (currentIndex > 0) onNavigate?.(records[currentIndex - 1]);
  }, [currentIndex, records, onNavigate]);

  const goNext = useCallback(() => {
    if (records.length === 0) return;
    const nextIndex = currentIndex < 0 ? 0 : currentIndex + 1;
    if (nextIndex < records.length) onNavigate?.(records[nextIndex]);
  }, [currentIndex, records, onNavigate]);

  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      // 组合键（如 Ctrl+← / Alt+←）交还给浏览器与系统
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      if (isEditableTarget(event.target)) return;

      if (event.key === 'ArrowLeft') {
        if (!hasPrev) return;
        event.preventDefault();
        goPrev();
      } else {
        if (!hasNext) return;
        event.preventDefault();
        goNext();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [enabled, hasPrev, hasNext, goPrev, goNext]);

  return { currentIndex, total: records.length, hasPrev, hasNext, goPrev, goNext };
}
