/**
 * K 线 + 筹码抽屉的布局常量（日K抽屉 / 周K抽屉共用，单一数据源）
 *
 * 为什么必须集中一处：左侧 K 线主图与右侧筹码面板共享同一套纵向坐标
 * （都用 MAIN_GRID 推导），任何一边单独改动都会立刻破坏
 * 「同一价格落在同一水平线」的对齐关系，因此只允许在这一份文件里改。
 *
 * 纵向布局一律用像素而不是百分比：百分比会随画布高度缩放，
 * 而缩放条的 bottom/height 是固定 px，两者混用极易错位。
 */

/** 抽屉宽度：尽量铺满窗口，同时两侧各留 24px 遮罩，便于点击遮罩关闭 */
export const DRAWER_WIDTH = 'min(1540px, calc(100vw - 48px))';

/**
 * 图表区域高度（px），即左侧 K 线画布的高度：主图 + 成交量 + MACD + KDJ + 缩放条。
 * 刻意用固定高度而非 flex 拉伸——抽屉高度占满视口，
 * 若让图表撑满剩余空间，主图会被拉得过高，底部缩放条还会顶到抽屉页脚。
 * 右侧筹码画布与之不等高，只取「主图上方留白 + 主图高度」这一段（见 CHIP_CANVAS_HEIGHT）。
 */
export const CHART_HEIGHT = 600;

/**
 * 筹码分布面板宽度（px）：除筹码条本身，还要容纳右侧价格刻度（3~4 位数价格）
 * 与平均成本线标签，因此比早期版本更宽。
 */
export const CHIP_PANEL_WIDTH = 300;

/** 筹码统计面板宽度（px），位于筹码图右侧 */
export const CHIP_STATS_WIDTH = 140;

/** 默认展示最近多少根（日K / 周K 共用） */
export const DEFAULT_VISIBLE_BARS = 120;

/**
 * 各网格自画布顶算起：主图 52~302、成交量 320~382、MACD 400~458、KDJ 476~534，
 * 缩放条落在 558~580，其下方 20px 留给两端日期标签。
 */
export const GRID_GAP = 18;

/** 主图（蜡烛 + 均线）：top 同时也是标题留白高度，筹码面板必须与其完全一致 */
export const MAIN_GRID = { top: 52, height: 250 };

/** 成交量副图 */
export const VOLUME_GRID = { top: MAIN_GRID.top + MAIN_GRID.height + GRID_GAP, height: 62 };

/** MACD 副图：放在成交量之下、KDJ 之上 */
export const MACD_GRID = { top: VOLUME_GRID.top + VOLUME_GRID.height + GRID_GAP, height: 58 };

/** KDJ 副图：放在最下，紧邻缩放条 */
export const KDJ_GRID = { top: MACD_GRID.top + MACD_GRID.height + GRID_GAP, height: 58 };

/**
 * K线各网格共用的左右留白（px）：四个网格必须一致，
 * 否则十字星竖线与缩放条会横向错位。
 * - 左侧要放下主图价格刻度（3~4 位数价格）与成交量刻度；
 * - 右侧要放下缩放条两端自动显示的日期标签——ECharts 把左侧滑块的日期画在滑块左边、
 *   右侧滑块的日期画在滑块右边，留窄了会被画布右缘截断（表现为日期只剩半截）。
 */
export const GRID_LEFT = 72;
export const GRID_RIGHT = 88;

/** 主图绘图区的上沿 / 高度（px）：筹码画布与统计列的对齐基准 */
export const MAIN_GRID_TOP_PX = MAIN_GRID.top;
export const MAIN_GRID_HEIGHT_PX = MAIN_GRID.height;

/**
 * 筹码画布底部留白（px）：绘图区下沿仍与主图底部逐像素对齐（保证同一价格同一水平线），
 * 但画布必须再向下延伸一段——y 轴最低一档价格刻度是垂直居中在绘图区最低点的，
 * 画布若正好止于绘图区下沿，该刻度会被画布边缘截掉一半。
 */
export const CHIP_CANVAS_BOTTOM_PX = 16;

/** 筹码画布高度（px）= 主图上方留白 + 主图高度 + 底部留白，绘图区与左侧主图逐像素等高 */
export const CHIP_CANVAS_HEIGHT = MAIN_GRID.top + MAIN_GRID.height + CHIP_CANVAS_BOTTOM_PX;

/** 主图纵轴分段数，与筹码面板保持一致以便刻度文字相同 */
export const Y_SPLIT_COUNT = 5;

/** 缩放条高度（px）：ECharts 默认 30 会压住副图底部刻度，收窄后把空间让给副图 */
export const ZOOM_SLIDER_HEIGHT = 22;

/**
 * 缩放条距容器底部的距离（px）：
 * ECharts 会把缩放条两端的日期标签渲染在缩放条「下方」，
 * bottom 为 0 时标签会落到容器外被裁掉（表现为日期只露出半截）。
 */
export const ZOOM_SLIDER_BOTTOM = 20;
