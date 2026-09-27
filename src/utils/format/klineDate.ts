/**
 * K 线类图表的时间格式化。
 *
 * 命名刻意带 Kline 前缀：`services/hot/billboard-service.ts` 里已有一个
 * `formatDate(dateStr: string)`（字符串入参、不同语义），避免两者被误引用。
 */

/** 时间戳 → YYYY-MM-DD：K线横轴、tooltip、以及筹码按日期对齐都以此为准 */
export function formatKlineDate(time: number): string {
  const d = new Date(time);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
