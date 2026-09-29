/**
 * 全项目「涨跌配色」单一来源。
 *
 * 三套口径并存，语义不同、不要混用：
 * 1. `CHART_*`  —— K 线 / 图表口径（红 `#ef5350` / 绿 `#26a69a`）：图表描边、填充、K 线形态示意图；
 * 2. `TEXT_*`   —— 表格 / 卡片文字口径（antd 红 `#ff4d4f` / 绿 `#52c41a`）：涨跌幅文字、状态文字；
 * 3. `STRONG_*` —— 强化强调口径（深红 `#cf1322` / 深绿 `#389e0d`）：通过率、评分等需要更“重”的数值。
 *
 * 引用方一览（改本文件即全局生效）：
 * - `CHART_*`：`utils/chart/stockKlineOption`、`utils/chart/chipChartOption`、`utils/format/f10Format`、
 *   `components/KLineChart`、`components/common/ChipStatsPanel`、`utils/analysis/candlestickPatternSVGs`；
 * - `TEXT_*` / `STRONG_*`：各页面与组件里原先内联的红绿十六进制（现统一改为引用本文件）。
 *
 * CSS 侧无法 import TS：`.module.css` 一律改用 `var(--app-*)`，变量值在 `src/App.module.css`
 * 的 `[data-theme]` 块里定义，是 CSS 侧的唯一出处；改色时 TS 常量与那四个变量需同步一次。
 *
 * 未纳入：`config/constants.ts` 的 `PRESET_COLORS`（那是取色器色板，无涨跌语义）。
 *
 * 档位约定：**只维护下面 6 个基色**，浅档 / 浅底 / 深底一律派生——
 * TS 侧用 `mix()` / `withAlpha()`（见 `utils/format/color.ts`），
 * CSS 侧用 `color-mix()`（见 `src/App.module.css` 的 `--app-*` 变量）。
 * 深档混黑会失真，故不派生，直接复用 `STRONG_*`。
 */

import { mix } from '@/utils/format/color';

/* ===== 1. K 线 / 图表口径 ===== */

/** 上涨配色（红） */
export const CHART_RISE_COLOR = '#ef5350';

/** 下跌配色（绿） */
export const CHART_FALL_COLOR = '#26a69a';

/* ===== 2. 表格 / 卡片文字口径（antd 红绿） ===== */

/** 上涨文字（红） */
export const TEXT_RISE_COLOR = '#ff4d4f';

/** 下跌文字（绿） */
export const TEXT_FALL_COLOR = '#52c41a';

/* ===== 3. 强化强调口径（深红 / 深绿） ===== */

/** 强调上涨（深红） */
export const STRONG_RISE_COLOR = '#cf1322';

/** 强调下跌（深绿） */
export const STRONG_FALL_COLOR = '#389e0d';

/* ===== 4. 派生档位（由主色算出，不再维护独立色值） =====
 *
 * 浅档 = 主色混白（`mix`），与旧值几乎一致（偏差 ≤ 10，肉眼不可辨）；
 * 深档混黑会明显失真（`#ff4d4f` 混黑 18% → `#d13f41`，与旧值 `#f5222d` 不符），
 * 因此不再定义 `RISE_DEEP_COLOR`——交易信号的「强烈卖出」直接复用 `STRONG_RISE_COLOR`。
 * 只被 CSS 使用的档位（浅底 / 深底 / 卡片底）同样派生，见 `App.module.css` 的 `--app-*` 注释。
 */

/** 浅档·涨（红）：建议卖出信号、渐变浅端 —— 由 `TEXT_RISE_COLOR` 混白 28% 派生 */
export const RISE_SOFT_COLOR = mix(TEXT_RISE_COLOR, '#ffffff', 0.28);

/** 浅档·跌（绿）：建议买入信号、深色主题下的正面文字 —— 由 `TEXT_FALL_COLOR` 混白 22% 派生 */
export const FALL_SOFT_COLOR = mix(TEXT_FALL_COLOR, '#ffffff', 0.22);
