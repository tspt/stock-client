/**
 * K线形态图形 SVG 渲染工具
 * 用于在 tooltip 和标记中展示形态示意图
 */

/** 形态类型 */
export type CandlestickPatternType =
  | 'hammer'
  | 'shootingStar'
  | 'doji'
  | 'engulfingBullish'
  | 'engulfingBearish'
  | 'haramiBullish'
  | 'haramiBearish'
  | 'morningStar'
  | 'eveningStar'
  | 'darkCloudCover'
  | 'piercing'
  | 'threeBlackCrows'
  | 'threeWhiteSoldiers'
  | 'invertedHammer'
  | 'hangingMan'
  | 'dragonflyDoji'
  | 'gravestoneDoji';

/** 形态名称映射 */
export const PATTERN_NAMES: Record<CandlestickPatternType, string> = {
  hammer: '锤头线',
  shootingStar: '射击之星',
  doji: '十字星',
  engulfingBullish: '阳包阴',
  engulfingBearish: '阴包阳',
  haramiBullish: '阳孕阴',
  haramiBearish: '阴孕阳',
  morningStar: '早晨之星',
  eveningStar: '黄昏之星',
  darkCloudCover: '乌云盖顶',
  piercing: '刺透形态',
  threeBlackCrows: '三只乌鸦',
  threeWhiteSoldiers: '三兵红烛',
  invertedHammer: '倒锤头线',
  hangingMan: '上吊线',
  dragonflyDoji: '蜻蜓十字星',
  gravestoneDoji: '墓碑十字星',
};

/** 形态颜色 */
export const PATTERN_COLORS: Record<CandlestickPatternType, { bullish: string; bearish: string }> =
  {
    hammer: { bullish: '#26a69a', bearish: '#26a69a' }, // 底部信号用阳线颜色
    shootingStar: { bullish: '#ef5350', bearish: '#ef5350' }, // 顶部信号用阴线颜色
    doji: { bullish: '#888', bearish: '#888' },
    engulfingBullish: { bullish: '#26a69a', bearish: '#26a69a' },
    engulfingBearish: { bullish: '#ef5350', bearish: '#ef5350' },
    haramiBullish: { bullish: '#26a69a', bearish: '#26a69a' },
    haramiBearish: { bullish: '#ef5350', bearish: '#ef5350' },
    morningStar: { bullish: '#26a69a', bearish: '#26a69a' },
    eveningStar: { bullish: '#ef5350', bearish: '#ef5350' },
    darkCloudCover: { bullish: '#ef5350', bearish: '#ef5350' },
    piercing: { bullish: '#26a69a', bearish: '#26a69a' },
    threeBlackCrows: { bullish: '#ef5350', bearish: '#ef5350' },
    threeWhiteSoldiers: { bullish: '#26a69a', bearish: '#26a69a' },
    invertedHammer: { bullish: '#26a69a', bearish: '#26a69a' }, // 底部信号
    hangingMan: { bullish: '#ef5350', bearish: '#ef5350' }, // 顶部信号
    dragonflyDoji: { bullish: '#26a69a', bearish: '#26a69a' }, // 强烈看涨
    gravestoneDoji: { bullish: '#ef5350', bearish: '#ef5350' }, // 强烈看跌
  };

/** SVG 尺寸配置 */
const SVG_WIDTH = 60;
const SVG_HEIGHT = 40;
const CANDLE_WIDTH = 10;
const CANDLE_GAP = 2;

/**
 * 绘制单根K线的SVG
 */
function drawCandle(
  x: number,
  open: number,
  close: number,
  low: number,
  high: number,
  minPrice: number,
  maxPrice: number,
  color: string
): string {
  const range = maxPrice - minPrice || 1;
  const chartHeight = SVG_HEIGHT - 8; // 留出上下边距
  const chartWidth = SVG_WIDTH - 16;

  const yHigh = 4 + ((maxPrice - high) / range) * chartHeight;
  const yLow = 4 + ((maxPrice - low) / range) * chartHeight;
  const yOpen = 4 + ((maxPrice - open) / range) * chartHeight;
  const yClose = 4 + ((maxPrice - close) / range) * chartHeight;

  const yTop = Math.min(yOpen, yClose);
  const yBottom = Math.max(yOpen, yClose);
  const bodyHeight = Math.max(yBottom - yTop, 1);

  const isBullish = close >= open;
  const bodyColor = isBullish ? '#26a69a' : '#ef5350';
  const borderColor = bodyColor;

  return `
    <!-- 上下影线 -->
    <line x1="${x + CANDLE_WIDTH / 2}" y1="${yHigh}" x2="${
    x + CANDLE_WIDTH / 2
  }" y2="${yLow}" stroke="${borderColor}" stroke-width="1"/>
    <!-- 实体 -->
    <rect x="${x}" y="${yTop}" width="${CANDLE_WIDTH}" height="${bodyHeight}" fill="${bodyColor}" stroke="${borderColor}" stroke-width="1"/>
  `;
}

/**
 * 锤头线 SVG
 * 特征：实体小，下影线长，上影线短
 */
export function getHammerSVG(): string {
  return `
    <svg width="${SVG_WIDTH}" height="${SVG_HEIGHT}" viewBox="0 0 ${SVG_WIDTH} ${SVG_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
      <style>
        .pattern-label { font-size: 9px; fill: #666; text-anchor: middle; }
      </style>
      <!-- 下影线长 -->
      <line x1="30" y1="6" x2="30" y2="34" stroke="#26a69a" stroke-width="1.5"/>
      <!-- 实体小 -->
      <rect x="25" y="24" width="10" height="6" fill="#26a69a" stroke="#26a69a" stroke-width="1"/>
      <!-- 上影线短 -->
      <line x1="30" y1="20" x2="30" y2="24" stroke="#26a69a" stroke-width="1.5"/>
      <!-- 标签 -->
      <text x="30" y="${SVG_HEIGHT - 2}" class="pattern-label">锤头</text>
    </svg>
  `;
}

/**
 * 射击之星 SVG
 * 特征：实体小，上影线长，下影线短
 */
export function getShootingStarSVG(): string {
  return `
    <svg width="${SVG_WIDTH}" height="${SVG_HEIGHT}" viewBox="0 0 ${SVG_WIDTH} ${SVG_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
      <style>
        .pattern-label { font-size: 9px; fill: #666; text-anchor: middle; }
      </style>
      <!-- 上影线长 -->
      <line x1="30" y1="6" x2="30" y2="16" stroke="#ef5350" stroke-width="1.5"/>
      <!-- 实体小 -->
      <rect x="25" y="16" width="10" height="6" fill="#ef5350" stroke="#ef5350" stroke-width="1"/>
      <!-- 下影线短 -->
      <line x1="30" y1="22" x2="30" y2="34" stroke="#ef5350" stroke-width="1.5"/>
      <!-- 标签 -->
      <text x="30" y="${SVG_HEIGHT - 2}" class="pattern-label">射击</text>
    </svg>
  `;
}

/**
 * 十字星 SVG
 * 特征：开盘收盘接近，影线差不多长
 */
export function getDojiSVG(): string {
  return `
    <svg width="${SVG_WIDTH}" height="${SVG_HEIGHT}" viewBox="0 0 ${SVG_WIDTH} ${SVG_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
      <style>
        .pattern-label { font-size: 9px; fill: #666; text-anchor: middle; }
      </style>
      <!-- 上下影线 -->
      <line x1="30" y1="6" x2="30" y2="34" stroke="#888" stroke-width="1.5"/>
      <!-- 十字 -->
      <line x1="20" y1="20" x2="40" y2="20" stroke="#888" stroke-width="1.5"/>
      <!-- 标签 -->
      <text x="30" y="${SVG_HEIGHT - 2}" class="pattern-label">十字</text>
    </svg>
  `;
}

/**
 * 阳包阴（多头吞没）SVG
 * 特征：阴线在前，阳线在后且完全包裹
 */
export function getEngulfingBullishSVG(): string {
  return `
    <svg width="${SVG_WIDTH}" height="${SVG_HEIGHT}" viewBox="0 0 ${SVG_WIDTH} ${SVG_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
      <style>
        .pattern-label { font-size: 8px; fill: #666; text-anchor: middle; }
      </style>
      <!-- 第一根阴线 -->
      <line x1="18" y1="12" x2="18" y2="28" stroke="#ef5350" stroke-width="1"/>
      <rect x="14" y="14" width="8" height="10" fill="none" stroke="#ef5350" stroke-width="1"/>
      <!-- 第二根阳线 -->
      <line x1="36" y1="10" x2="36" y2="30" stroke="#26a69a" stroke-width="1"/>
      <rect x="28" y="16" width="16" height="10" fill="#26a69a" stroke="#26a69a" stroke-width="1"/>
      <!-- 标签 -->
      <text x="26" y="${SVG_HEIGHT - 2}" class="pattern-label">阳包阴</text>
    </svg>
  `;
}

/**
 * 阴包阳（空头吞没）SVG
 */
export function getEngulfingBearishSVG(): string {
  return `
    <svg width="${SVG_WIDTH}" height="${SVG_HEIGHT}" viewBox="0 0 ${SVG_WIDTH} ${SVG_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
      <style>
        .pattern-label { font-size: 8px; fill: #666; text-anchor: middle; }
      </style>
      <!-- 第一根阳线 -->
      <line x1="18" y1="12" x2="18" y2="28" stroke="#26a69a" stroke-width="1"/>
      <rect x="14" y="14" width="8" height="10" fill="#26a69a" stroke="#26a69a" stroke-width="1"/>
      <!-- 第二根阴线 -->
      <line x1="36" y1="10" x2="36" y2="30" stroke="#ef5350" stroke-width="1"/>
      <rect x="28" y="16" width="16" height="10" fill="#ef5350" stroke="#ef5350" stroke-width="1"/>
      <!-- 标签 -->
      <text x="26" y="${SVG_HEIGHT - 2}" class="pattern-label">阴包阳</text>
    </svg>
  `;
}

/**
 * 阳孕阴（多头孕育）SVG
 */
export function getHaramiBullishSVG(): string {
  return `
    <svg width="${SVG_WIDTH}" height="${SVG_HEIGHT}" viewBox="0 0 ${SVG_WIDTH} ${SVG_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
      <style>
        .pattern-label { font-size: 8px; fill: #666; text-anchor: middle; }
      </style>
      <!-- 第一根阳线 -->
      <line x1="18" y1="10" x2="18" y2="30" stroke="#26a69a" stroke-width="1"/>
      <rect x="12" y="14" width="12" height="12" fill="#26a69a" stroke="#26a69a" stroke-width="1"/>
      <!-- 第二根阴线（小） -->
      <line x1="36" y1="18" x2="36" y2="22" stroke="#ef5350" stroke-width="1"/>
      <rect x="32" y="18" width="8" height="4" fill="#ef5350" stroke="#ef5350" stroke-width="1"/>
      <!-- 标签 -->
      <text x="26" y="${SVG_HEIGHT - 2}" class="pattern-label">阳孕阴</text>
    </svg>
  `;
}

/**
 * 阴孕阳（空头孕育）SVG
 */
export function getHaramiBearishSVG(): string {
  return `
    <svg width="${SVG_WIDTH}" height="${SVG_HEIGHT}" viewBox="0 0 ${SVG_WIDTH} ${SVG_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
      <style>
        .pattern-label { font-size: 8px; fill: #666; text-anchor: middle; }
      </style>
      <!-- 第一根阴线 -->
      <line x1="18" y1="10" x2="18" y2="30" stroke="#ef5350" stroke-width="1"/>
      <rect x="12" y="14" width="12" height="12" fill="#ef5350" stroke="#ef5350" stroke-width="1"/>
      <!-- 第二根阳线（小） -->
      <line x1="36" y1="18" x2="36" y2="22" stroke="#26a69a" stroke-width="1"/>
      <rect x="32" y="18" width="8" height="4" fill="#26a69a" stroke="#26a69a" stroke-width="1"/>
      <!-- 标签 -->
      <text x="26" y="${SVG_HEIGHT - 2}" class="pattern-label">阴孕阳</text>
    </svg>
  `;
}

/**
 * 早晨之星 SVG
 * 特征：大阴 + 小星 + 大阳
 */
export function getMorningStarSVG(): string {
  return `
    <svg width="${SVG_WIDTH}" height="${SVG_HEIGHT}" viewBox="0 0 ${SVG_WIDTH} ${SVG_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
      <style>
        .pattern-label { font-size: 8px; fill: #666; text-anchor: middle; }
      </style>
      <!-- 第一根大阴 -->
      <line x1="12" y1="8" x2="12" y2="32" stroke="#ef5350" stroke-width="1"/>
      <rect x="8" y="10" width="8" height="18" fill="#ef5350" stroke="#ef5350" stroke-width="1"/>
      <!-- 第二根小星 -->
      <line x1="28" y1="16" x2="28" y2="24" stroke="#888" stroke-width="1"/>
      <rect x="25" y="18" width="6" height="4" fill="#888" stroke="#888" stroke-width="1"/>
      <!-- 第三根大阳 -->
      <line x1="44" y1="10" x2="44" y2="30" stroke="#26a69a" stroke-width="1"/>
      <rect x="40" y="14" width="8" height="12" fill="#26a69a" stroke="#26a69a" stroke-width="1"/>
      <!-- 标签 -->
      <text x="28" y="${SVG_HEIGHT - 2}" class="pattern-label">早晨</text>
    </svg>
  `;
}

/**
 * 黄昏之星 SVG
 */
export function getEveningStarSVG(): string {
  return `
    <svg width="${SVG_WIDTH}" height="${SVG_HEIGHT}" viewBox="0 0 ${SVG_WIDTH} ${SVG_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
      <style>
        .pattern-label { font-size: 8px; fill: #666; text-anchor: middle; }
      </style>
      <!-- 第一根大阳 -->
      <line x1="12" y1="8" x2="12" y2="32" stroke="#26a69a" stroke-width="1"/>
      <rect x="8" y="10" width="8" height="18" fill="#26a69a" stroke="#26a69a" stroke-width="1"/>
      <!-- 第二根小星 -->
      <line x1="28" y1="16" x2="28" y2="24" stroke="#888" stroke-width="1"/>
      <rect x="25" y="18" width="6" height="4" fill="#888" stroke="#888" stroke-width="1"/>
      <!-- 第三根大阴 -->
      <line x1="44" y1="10" x2="44" y2="30" stroke="#ef5350" stroke-width="1"/>
      <rect x="40" y="14" width="8" height="12" fill="#ef5350" stroke="#ef5350" stroke-width="1"/>
      <!-- 标签 -->
      <text x="28" y="${SVG_HEIGHT - 2}" class="pattern-label">黄昏</text>
    </svg>
  `;
}

/**
 * 乌云盖顶 SVG
 * 特征：大阳后出现大阴，且阴线开盘高于阳线收盘
 */
export function getDarkCloudCoverSVG(): string {
  return `
    <svg width="${SVG_WIDTH}" height="${SVG_HEIGHT}" viewBox="0 0 ${SVG_WIDTH} ${SVG_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
      <style>
        .pattern-label { font-size: 8px; fill: #666; text-anchor: middle; }
      </style>
      <!-- 第一根大阳 -->
      <line x1="14" y1="12" x2="14" y2="28" stroke="#26a69a" stroke-width="1"/>
      <rect x="10" y="14" width="8" height="10" fill="#26a69a" stroke="#26a69a" stroke-width="1"/>
      <!-- 第二根阴线（开在阳线上方） -->
      <line x1="40" y1="8" x2="40" y2="32" stroke="#ef5350" stroke-width="1"/>
      <rect x="36" y="14" width="8" height="14" fill="#ef5350" stroke="#ef5350" stroke-width="1"/>
      <!-- 虚线表示乌云 -->
      <line x1="14" y1="14" x2="40" y2="14" stroke="#666" stroke-width="1" stroke-dasharray="2,2"/>
      <!-- 标签 -->
      <text x="26" y="${SVG_HEIGHT - 2}" class="pattern-label">乌云</text>
    </svg>
  `;
}

/**
 * 刺透形态 SVG
 * 特征：大阴后出现阳线，且阳线开盘低于阴线收盘，收盘超过阴线中点
 */
export function getPiercingSVG(): string {
  return `
    <svg width="${SVG_WIDTH}" height="${SVG_HEIGHT}" viewBox="0 0 ${SVG_WIDTH} ${SVG_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
      <style>
        .pattern-label { font-size: 8px; fill: #666; text-anchor: middle; }
      </style>
      <!-- 第一根大阴 -->
      <line x1="14" y1="12" x2="14" y2="28" stroke="#ef5350" stroke-width="1"/>
      <rect x="10" y="14" width="8" height="10" fill="#ef5350" stroke="#ef5350" stroke-width="1"/>
      <!-- 第二根阳线（开在阴线下方） -->
      <line x1="40" y1="16" x2="40" y2="26" stroke="#26a69a" stroke-width="1"/>
      <rect x="36" y="16" width="8" height="8" fill="#26a69a" stroke="#26a69a" stroke-width="1"/>
      <!-- 虚线表示中点 -->
      <line x1="14" y1="19" x2="40" y2="19" stroke="#666" stroke-width="1" stroke-dasharray="2,2"/>
      <!-- 标签 -->
      <text x="26" y="${SVG_HEIGHT - 2}" class="pattern-label">刺透</text>
    </svg>
  `;
}

/**
 * 三只乌鸦 SVG
 * 特征：三根连续阴线，收盘逐步走低
 */
export function getThreeBlackCrowsSVG(): string {
  return `
    <svg width="${SVG_WIDTH}" height="${SVG_HEIGHT}" viewBox="0 0 ${SVG_WIDTH} ${SVG_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
      <style>
        .pattern-label { font-size: 8px; fill: #666; text-anchor: middle; }
      </style>
      <!-- 第一根阴 -->
      <line x1="12" y1="10" x2="12" y2="24" stroke="#ef5350" stroke-width="1"/>
      <rect x="8" y="12" width="8" height="8" fill="#ef5350" stroke="#ef5350" stroke-width="1"/>
      <!-- 第二根阴 -->
      <line x1="28" y1="14" x2="28" y2="28" stroke="#ef5350" stroke-width="1"/>
      <rect x="24" y="16" width="8" height="8" fill="#ef5350" stroke="#ef5350" stroke-width="1"/>
      <!-- 第三根阴 -->
      <line x1="44" y1="18" x2="44" y2="32" stroke="#ef5350" stroke-width="1"/>
      <rect x="40" y="20" width="8" height="8" fill="#ef5350" stroke="#ef5350" stroke-width="1"/>
      <!-- 下降趋势线 -->
      <line x1="8" y1="12" x2="44" y2="20" stroke="#666" stroke-width="1" stroke-dasharray="2,2"/>
      <!-- 标签 -->
      <text x="26" y="${SVG_HEIGHT - 2}" class="pattern-label">三鸦</text>
    </svg>
  `;
}

/**
 * 三兵红烛 SVG
 * 特征：三根连续阳线，收盘逐步走高
 */
export function getThreeWhiteSoldiersSVG(): string {
  return `
    <svg width="${SVG_WIDTH}" height="${SVG_HEIGHT}" viewBox="0 0 ${SVG_WIDTH} ${SVG_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
      <style>
        .pattern-label { font-size: 8px; fill: #666; text-anchor: middle; }
      </style>
      <!-- 第一根阳 -->
      <line x1="12" y1="14" x2="12" y2="30" stroke="#26a69a" stroke-width="1"/>
      <rect x="8" y="16" width="8" height="10" fill="#26a69a" stroke="#26a69a" stroke-width="1"/>
      <!-- 第二根阳 -->
      <line x1="28" y1="10" x2="28" y2="26" stroke="#26a69a" stroke-width="1"/>
      <rect x="24" y="12" width="8" height="10" fill="#26a69a" stroke="#26a69a" stroke-width="1"/>
      <!-- 第三根阳 -->
      <line x1="44" y1="6" x2="44" y2="22" stroke="#26a69a" stroke-width="1"/>
      <rect x="40" y="8" width="8" height="10" fill="#26a69a" stroke="#26a69a" stroke-width="1"/>
      <!-- 上升趋势线 -->
      <line x1="8" y1="16" x2="44" y2="8" stroke="#666" stroke-width="1" stroke-dasharray="2,2"/>
      <!-- 标签 -->
      <text x="26" y="${SVG_HEIGHT - 2}" class="pattern-label">三兵</text>
    </svg>
  `;
}

/**
 * 倒锤头线 SVG
 * 特征：实体小，上影线长，下影线短（与锤头线相反）
 */
export function getInvertedHammerSVG(): string {
  return `
    <svg width="${SVG_WIDTH}" height="${SVG_HEIGHT}" viewBox="0 0 ${SVG_WIDTH} ${SVG_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
      <style>
        .pattern-label { font-size: 9px; fill: #666; text-anchor: middle; }
      </style>
      <!-- 上影线长 -->
      <line x1="30" y1="6" x2="30" y2="16" stroke="#26a69a" stroke-width="1.5"/>
      <!-- 实体小 -->
      <rect x="25" y="16" width="10" height="6" fill="#26a69a" stroke="#26a69a" stroke-width="1"/>
      <!-- 下影线短 -->
      <line x1="30" y1="22" x2="30" y2="34" stroke="#26a69a" stroke-width="1.5"/>
      <!-- 标签 -->
      <text x="30" y="${SVG_HEIGHT - 2}" class="pattern-label">倒锤</text>
    </svg>
  `;
}

/**
 * 上吊线 SVG
 * 特征：实体小，下影线长，出现在上升趋势顶部
 */
export function getHangingManSVG(): string {
  return `
    <svg width="${SVG_WIDTH}" height="${SVG_HEIGHT}" viewBox="0 0 ${SVG_WIDTH} ${SVG_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
      <style>
        .pattern-label { font-size: 9px; fill: #666; text-anchor: middle; }
      </style>
      <!-- 下影线长 -->
      <line x1="30" y1="6" x2="30" y2="34" stroke="#ef5350" stroke-width="1.5"/>
      <!-- 实体小 -->
      <rect x="25" y="24" width="10" height="6" fill="#ef5350" stroke="#ef5350" stroke-width="1"/>
      <!-- 上影线短 -->
      <line x1="30" y1="20" x2="30" y2="24" stroke="#ef5350" stroke-width="1.5"/>
      <!-- 标签 -->
      <text x="30" y="${SVG_HEIGHT - 2}" class="pattern-label">上吊</text>
    </svg>
  `;
}

/**
 * 蜻蜓十字星 SVG
 * 特征：开盘=收盘=最高价，只有下影线
 */
export function getDragonflyDojiSVG(): string {
  return `
    <svg width="${SVG_WIDTH}" height="${SVG_HEIGHT}" viewBox="0 0 ${SVG_WIDTH} ${SVG_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
      <style>
        .pattern-label { font-size: 9px; fill: #666; text-anchor: middle; }
      </style>
      <!-- 长下影线 -->
      <line x1="30" y1="20" x2="30" y2="34" stroke="#26a69a" stroke-width="1.5"/>
      <!-- 十字（开=收=高） -->
      <line x1="20" y1="20" x2="40" y2="20" stroke="#26a69a" stroke-width="2"/>
      <!-- 标签 -->
      <text x="30" y="${SVG_HEIGHT - 2}" class="pattern-label">蜻蜓</text>
    </svg>
  `;
}

/**
 * 墓碑十字星 SVG
 * 特征：开盘=收盘=最低价，只有上影线
 */
export function getGravestoneDojiSVG(): string {
  return `
    <svg width="${SVG_WIDTH}" height="${SVG_HEIGHT}" viewBox="0 0 ${SVG_WIDTH} ${SVG_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
      <style>
        .pattern-label { font-size: 9px; fill: #666; text-anchor: middle; }
      </style>
      <!-- 长上影线 -->
      <line x1="30" y1="6" x2="30" y2="20" stroke="#ef5350" stroke-width="1.5"/>
      <!-- 十字（开=收=低） -->
      <line x1="20" y1="20" x2="40" y2="20" stroke="#ef5350" stroke-width="2"/>
      <!-- 标签 -->
      <text x="30" y="${SVG_HEIGHT - 2}" class="pattern-label">墓碑</text>
    </svg>
  `;
}

/**
 * 获取形态 SVG
 */
export function getPatternSVG(pattern: CandlestickPatternType): string {
  const svgGetters: Record<CandlestickPatternType, () => string> = {
    hammer: getHammerSVG,
    shootingStar: getShootingStarSVG,
    doji: getDojiSVG,
    engulfingBullish: getEngulfingBullishSVG,
    engulfingBearish: getEngulfingBearishSVG,
    haramiBullish: getHaramiBullishSVG,
    haramiBearish: getHaramiBearishSVG,
    morningStar: getMorningStarSVG,
    eveningStar: getEveningStarSVG,
    darkCloudCover: getDarkCloudCoverSVG,
    piercing: getPiercingSVG,
    threeBlackCrows: getThreeBlackCrowsSVG,
    threeWhiteSoldiers: getThreeWhiteSoldiersSVG,
    invertedHammer: getInvertedHammerSVG,
    hangingMan: getHangingManSVG,
    dragonflyDoji: getDragonflyDojiSVG,
    gravestoneDoji: getGravestoneDojiSVG,
  };

  return svgGetters[pattern]?.() || '';
}

/**
 * 获取多个形态的 SVG（用于 tooltip 展示）
 */
export function getMultiplePatternsSVG(patterns: CandlestickPatternType[]): string {
  if (patterns.length === 0) return '';

  const svgWidth = SVG_WIDTH + 4;
  const totalWidth = patterns.length * svgWidth;
  const svgHeight = SVG_HEIGHT + 8;

  let svgs = '';
  patterns.forEach((pattern, index) => {
    const xOffset = index * svgWidth;
    svgs += `<g transform="translate(${xOffset}, 0)">${getPatternSVG(pattern)}</g>`;
  });

  return `
    <div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid #eee;">
      <div style="font-size: 11px; color: #666; margin-bottom: 4px;">形态识别:</div>
      <div style="display: flex; gap: 4px; flex-wrap: wrap;">
        ${patterns
          .map(
            (p) => `
          <div style="text-align: center;">
            ${getPatternSVG(p)}
          </div>
        `
          )
          .join('')}
      </div>
    </div>
  `;
}
