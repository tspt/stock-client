/**
 * 交易信号标签：把 `TradingSignal` 渲染为「方向色点 + 文案 + 原因」的一段展示。
 *
 * 使用方：
 * - 机会分析表格（`tradingSignal` 列）；
 * - K 线抽屉顶部（嵌在「交易信号」文案之后的一行里）。
 *
 * 两处形态完全一致（文案 + 原因，单行超出省略），
 * 文案与配色统一取自 `utils/config/tradingSignalMeta.ts`，不会各自漂移。
 */

import type { TradingSignal } from '@/types/stock';
import { resolveTradingSignalMeta } from '@/utils/config/tradingSignalMeta';
import styles from './TradingSignalLabel.module.css';

export interface TradingSignalLabelProps {
  /** 交易信号；缺省或类型未知时按「观望」展示 */
  signal?: TradingSignal;
  /** 文案字号（表格 12 / 抽屉 14），默认 12 */
  fontSize?: number;
}

export function TradingSignalLabel({ signal, fontSize = 12 }: TradingSignalLabelProps) {
  const meta = resolveTradingSignalMeta(signal?.type);

  return (
    <span className={styles.label}>
      <span className={styles.text} style={{ color: meta.color, fontSize }}>
        {meta.label}
      </span>
      {signal?.reason ? <span className={styles.reason}>{signal.reason}</span> : null}
    </span>
  );
}

export default TradingSignalLabel;
