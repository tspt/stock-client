/**
 * 弹窗拖拽 Hook（基于 antd Modal 的 modalRender，不引入额外依赖）
 *
 * antd 的 modalRender 回调拿到的是 `.ant-modal-content` 节点：
 * 给它挂 onPointerDown + transform 即可整块拖动，
 * 且不会影响 `.ant-modal`（外层）的居中布局与开合缩放动画
 * —— 缩放动画的 transform 作用在 `.ant-modal` 上，两者互不干扰。
 *
 * - 只允许从标题栏（.ant-modal-header）拖动，并排除关闭按钮等交互元素；
 * - 用 PointerEvent + setPointerCapture，鼠标移出窗口也能持续跟随；
 * - 拖动范围收敛在视口内，避免弹窗被拖出屏幕或产生多余滚动条；
 * - 弹窗关闭后自动复位，下次打开仍是居中位置。
 */

import { cloneElement, isValidElement, useCallback, useEffect, useRef, useState } from 'react';
import type {
  CSSProperties,
  PointerEvent as ReactPointerEvent,
  ReactElement,
  ReactNode,
} from 'react';

/** 小于该像素的移动视为抖动，不触发拖拽（不影响标题栏上的点击行为） */
const DRAG_THRESHOLD = 3;

export interface UseModalDragResult {
  /** 传给 Modal 的 modalRender */
  modalRender: (node: ReactNode) => ReactNode;
  /** 传给 Modal 的 styles：标题栏显示可拖拽光标 */
  styles: { header: CSSProperties };
}

/** 计算某个方向的偏移范围，保证元素始终留在视口内 */
function clampRange(size: number, viewport: number, start: number): { min: number; max: number } {
  if (size <= viewport) {
    // 元素小于视口：左右（上下）都不能越界
    return { min: -start, max: viewport - size - start };
  }
  // 元素大于视口：对齐左右（上下）两侧即可
  return { min: viewport - size - start, max: -start };
}

export function useModalDrag(enabled: boolean): UseModalDragResult {
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const offsetRef = useRef(offset);
  offsetRef.current = offset;

  // 关闭后复位：下次打开仍回到居中位置
  useEffect(() => {
    if (!enabled) setOffset({ x: 0, y: 0 });
  }, [enabled]);

  const handlePointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const target = event.target as HTMLElement;
    // 只允许从标题栏拖动，并排除关闭按钮与标题里的交互元素
    if (!target.closest('.ant-modal-header')) return;
    if (target.closest('.ant-modal-close, button, a, input, select, textarea')) return;

    const element = event.currentTarget;
    const rect = element.getBoundingClientRect();
    const viewportWidth = document.documentElement.clientWidth;
    const viewportHeight = document.documentElement.clientHeight;
    const horizontal = clampRange(rect.width, viewportWidth, rect.left);
    const vertical = clampRange(rect.height, viewportHeight, rect.top);

    const startX = event.clientX;
    const startY = event.clientY;
    const origin = offsetRef.current;
    let dragging = false;

    // 指针捕获：鼠标移出窗口后依然能收到 pointermove / pointerup
    element.setPointerCapture(event.pointerId);

    const handleMove = (moveEvent: PointerEvent) => {
      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;
      if (!dragging && Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) return;
      dragging = true;
      setOffset({
        x: Math.min(horizontal.max, Math.max(horizontal.min, origin.x + dx)),
        y: Math.min(vertical.max, Math.max(vertical.min, origin.y + dy)),
      });
    };

    const handleUp = () => {
      element.removeEventListener('pointermove', handleMove);
      element.removeEventListener('pointerup', handleUp);
      element.removeEventListener('pointercancel', handleUp);
      if (element.hasPointerCapture(event.pointerId)) {
        element.releasePointerCapture(event.pointerId);
      }
    };

    element.addEventListener('pointermove', handleMove);
    element.addEventListener('pointerup', handleUp);
    element.addEventListener('pointercancel', handleUp);

    // 避免拖动时选中标题文字
    event.preventDefault();
  }, []);

  const modalRender = useCallback(
    (node: ReactNode) => {
      if (!isValidElement(node)) return node;
      const element = node as ReactElement<Record<string, unknown>>;
      return cloneElement(element, {
        style: {
          ...(element.props.style as CSSProperties | undefined),
          transform: `translate(${offset.x}px, ${offset.y}px)`,
        },
        onPointerDown: handlePointerDown,
      });
    },
    [handlePointerDown, offset.x, offset.y]
  );

  return { modalRender, styles: { header: { cursor: 'move' } } };
}
