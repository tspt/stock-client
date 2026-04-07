/**
 * K线形态提示组件
 * 悬停时显示形态示意图
 */

import { Tooltip } from 'antd';
import type { ReactNode } from 'react';
import { getPatternSVG, type CandlestickPatternType, PATTERN_NAMES } from '@/utils/candlestickPatternSVGs';

interface PatternTooltipProps {
  /** 形态类型 */
  pattern: CandlestickPatternType;
  /** 子元素 */
  children: ReactNode;
  /** 位置 */
  placement?: 'top' | 'bottom' | 'left' | 'right' | 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight';
}

/**
 * 形态提示组件
 * 包裹一个元素，悬停时显示对应的形态示意图
 */
export function PatternTooltip({ pattern, children, placement = 'top' }: PatternTooltipProps) {
  const svg = getPatternSVG(pattern);
  const name = PATTERN_NAMES[pattern];

  const tooltipContent = (
    <div style={{ textAlign: 'center', padding: '4px 0' }}>
      <div style={{ marginBottom: 6, fontWeight: 500, color: '#fff' }}>{name}</div>
      <div dangerouslySetInnerHTML={{ __html: svg }} />
    </div>
  );

  return (
    <Tooltip title={tooltipContent} placement={placement} mouseEnterDelay={0.3}>
      {children}
    </Tooltip>
  );
}

/**
 * 批量形态提示组件
 * 用于同时展示多个形态
 */
interface MultiPatternTooltipProps {
  /** 形态类型数组 */
  patterns: CandlestickPatternType[];
  /** 子元素 */
  children: ReactNode;
  /** 位置 */
  placement?: 'top' | 'bottom' | 'left' | 'right';
}

export function MultiPatternTooltip({ patterns, children, placement = 'top' }: MultiPatternTooltipProps) {
  if (patterns.length === 0) {
    return <>{children}</>;
  }

  const tooltipContent = (
    <div style={{ padding: '4px 0' }}>
      <div style={{ marginBottom: 8, fontWeight: 500, color: '#fff' }}>形态组合</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
        {patterns.map((pattern) => (
          <div key={pattern} style={{ textAlign: 'center' }}>
            <div dangerouslySetInnerHTML={{ __html: getPatternSVG(pattern) }} />
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <Tooltip title={tooltipContent} placement={placement} mouseEnterDelay={0.3}>
      {children}
    </Tooltip>
  );
}
