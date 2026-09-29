/**
 * 颜色派生工具（纯函数，不依赖 React 与 DOM）。
 *
 * 存在的意义：同一个「涨 / 跌」色在不同场景下需要不同形态——K 线是实色描边、
 * 筹码条是半透明填充、信号文字是「浅一档」、标签底色是「极浅底」。
 * 若把这些值各自写死，改主色时必然漏改，所以统一由主色派生：
 * - 半透明 → `withAlpha(主色, α)`
 * - 浅档 / 底色 → `mix(主色, 白或黑, 比例)`
 */

/** 解析 `#rgb` / `#rrggbb`（`#` 可省略）为 [r, g, b]；无法解析返回 null */
function parseHex(color: string): [number, number, number] | null {
  const hex = color.trim().replace(/^#/, '');
  const full =
    hex.length === 3
      ? hex
          .split('')
          .map((char) => char + char)
          .join('')
      : hex;

  if (!/^[0-9a-fA-F]{6}$/.test(full)) {
    return null;
  }
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

/**
 * 给十六进制颜色加上透明度，返回 `rgba(r, g, b, a)`。
 *
 * 传入无法解析的值（例如已经是 `rgba(...)`、颜色名）时按原样返回，
 * 便于调用方把「已经是 rgba 的色值」透传过来而不必先判断。
 */
export function withAlpha(color: string, alpha: number): string {
  const rgb = parseHex(color);
  if (!rgb) {
    return color;
  }
  const [r, g, b] = rgb;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * 线性混合两个十六进制颜色，返回 `rgb(r, g, b)`：`ratio` 是 `to` 的占比
 * （0 = 完全 `from`，1 = 完全 `to`），任一端无法解析时原样返回 `from`。
 *
 * 用途：把「浅一档 / 极浅底」绑到主色上，例如
 * `mix(TEXT_RISE_COLOR, '#ffffff', 0.28)` ≈ 旧值 `#ff7875`。
 *
 * 边界提醒：本函数只做线性混合，而 antd 的色阶并非线性混白/混黑产生，
 * 因此**浅档可用（偏差约 10 以内，肉眼不可辨）**，
 * **深档不要用混黑派生**（`#ff4d4f` 混黑 18% 会得到 `#d13f41`，与设计值 `#f5222d` 明显不符），
 * 深档请直接复用 `STRONG_*` 常量。
 */
export function mix(from: string, to: string, ratio: number): string {
  const a = parseHex(from);
  const b = parseHex(to);
  if (!a || !b) {
    return from;
  }
  const blend = (i: number) => Math.round(a[i] * (1 - ratio) + b[i] * ratio);
  return `rgb(${blend(0)}, ${blend(1)}, ${blend(2)})`;
}
