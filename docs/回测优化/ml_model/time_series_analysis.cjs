const fs = require('fs');
const path = require('path');

// 所有股票数据文件列表
const stockFiles = [
  { file: '中衡设计.txt', dates: ['2026-04-17', '2026-01-07', '2025-11-24'] },
  { file: '起帆股份.txt', dates: ['2026-04-14', '2026-01-16', '2025-12-11'] },
  { file: '永杉锂业.txt', dates: ['2026-04-07', '2025-10-28'] },
  { file: '山东玻纤.txt', dates: ['2026-04-09', '2026-02-03'] },
  { file: '宏昌电子.txt', dates: ['2026-04-03', '2026-01-14'] },
  { file: '三孚股份.txt', dates: ['2025-12-22', '2026-04-01'] },
];

console.log('================================================================================');
console.log('=== 方向2: 时间序列模式分析 ===');
console.log('================================================================================\n');

// 加载股票数据
function loadStockData(filename) {
  const filePath = path.join(__dirname, filename);
  const content = fs.readFileSync(filePath, 'utf-8');

  const updatedAtMatch = content.match(/"updatedAt"\s*:\s*\d+/);
  const jsonEndIndex = updatedAtMatch.index + updatedAtMatch[0].length;
  const closingBraceIndex = content.indexOf('}', jsonEndIndex);
  const validJson = content.substring(0, closingBraceIndex + 1);

  return JSON.parse(validJson);
}

// 提取买点左右的价格序列
function extractPricePattern(stockData, targetDate, lookback = 20, lookahead = 20) {
  const klineData = stockData.dailyLines;

  const targetIndex = klineData.findIndex((k) => {
    const d = new Date(k.time);
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
      d.getDate()
    ).padStart(2, '0')}`;
    return dateStr === targetDate;
  });

  if (targetIndex === -1) return null;

  const startIndex = Math.max(0, targetIndex - lookback);
  const endIndex = Math.min(klineData.length - 1, targetIndex + lookahead);

  const pattern = [];
  for (let i = startIndex; i <= endIndex; i++) {
    const isBuyPoint = i === targetIndex;
    pattern.push({
      index: i,
      date: new Date(klineData[i].time).toISOString().split('T')[0],
      price: klineData[i].close,
      volume: klineData[i].volume,
      isBuyPoint,
      daysFromBuyPoint: i - targetIndex, // 负数表示之前,正数表示之后
    });
  }

  return {
    stockName: stockData.name,
    buyDate: targetDate,
    buyPrice: klineData[targetIndex].close,
    nextDayReturn:
      targetIndex < klineData.length - 1
        ? ((klineData[targetIndex + 1].close - klineData[targetIndex].close) /
            klineData[targetIndex].close) *
          100
        : 0,
    pattern,
  };
}

// 收集所有买点的价格模式
const allPatterns = [];

stockFiles.forEach((stockFile) => {
  const stockData = loadStockData(stockFile.file);

  stockFile.dates.forEach((date) => {
    const pattern = extractPricePattern(stockData, date, 10, 10); // 前后各10天
    if (pattern) {
      allPatterns.push(pattern);
    }
  });
});

console.log(`成功提取 ${allPatterns.length} 个买点的价格模式\n`);

// 分析价格模式的共同特征
console.log('=== 买点前后的价格走势统计 ===\n');

// 计算每个相对位置的平均价格和涨跌幅
const positionStats = {};

for (let day = -10; day <= 10; day++) {
  const prices = [];
  const changes = [];

  allPatterns.forEach((p) => {
    const point = p.pattern.find((pt) => pt.daysFromBuyPoint === day);
    if (point) {
      prices.push(point.price);

      // 相对于买点的涨跌幅
      if (day !== 0) {
        const buyPrice = p.pattern.find((pt) => pt.daysFromBuyPoint === 0).price;
        const change = ((point.price - buyPrice) / buyPrice) * 100;
        changes.push(change);
      }
    }
  });

  if (prices.length > 0) {
    const avgPrice = prices.reduce((a, b) => a + b, 0) / prices.length;
    const avgChange = changes.length > 0 ? changes.reduce((a, b) => a + b, 0) / changes.length : 0;

    positionStats[day] = {
      avgPrice,
      avgChange,
      sampleCount: prices.length,
    };
  }
}

// 打印价格走势表
console.log('相对天数 | 平均价格 | 相对买点涨跌% | 样本数');
console.log('-'.repeat(55));

for (let day = -10; day <= 10; day++) {
  if (positionStats[day]) {
    const stat = positionStats[day];
    const marker = day === 0 ? ' ← 买点' : '';
    const changeStr =
      day === 0
        ? '   基准'
        : (stat.avgChange >= 0 ? '+' : '') + stat.avgChange.toFixed(2).padStart(6) + '%';

    console.log(
      `${day.toString().padStart(4)}天   | ${stat.avgPrice
        .toFixed(2)
        .padStart(8)} | ${changeStr.padStart(13)} | ${stat.sampleCount}${marker}`
    );
  }
}

console.log('\n\n=== 典型价格形态分类 ===\n');

// 根据买点前后5天的价格走势,尝试分类
const morphologyTypes = {
  vReversal: [], // V型反转: 前跌后涨
  wBottom: [], // W底: 震荡后上涨
  platformBreak: [], // 平台突破: 横盘后突破
  pullback: [], // 回调企稳: 小幅回调后反弹
  other: [], // 其他
};

allPatterns.forEach((p) => {
  const buyIdx = p.pattern.findIndex((pt) => pt.isBuyPoint);
  if (buyIdx === -1) return;

  // 提取买点前后5天的价格
  const before5 = p.pattern.slice(Math.max(0, buyIdx - 5), buyIdx).map((pt) => pt.price);
  const after5 = p.pattern
    .slice(buyIdx + 1, Math.min(p.pattern.length, buyIdx + 6))
    .map((pt) => pt.price);

  if (before5.length < 3 || after5.length < 3) {
    morphologyTypes.other.push(p);
    return;
  }

  // 计算买点前的趋势
  const beforeTrend = ((before5[before5.length - 1] - before5[0]) / before5[0]) * 100;
  // 计算买点后的趋势
  const afterTrend = ((after5[after5.length - 1] - after5[0]) / after5[0]) * 100;

  // 分类逻辑
  if (beforeTrend < -3 && afterTrend > 3) {
    morphologyTypes.vReversal.push({ ...p, beforeTrend, afterTrend });
  } else if (beforeTrend > -2 && beforeTrend < 2 && afterTrend > 3) {
    morphologyTypes.platformBreak.push({ ...p, beforeTrend, afterTrend });
  } else if (beforeTrend < -1 && beforeTrend > -5 && afterTrend > 2) {
    morphologyTypes.pullback.push({ ...p, beforeTrend, afterTrend });
  } else {
    morphologyTypes.wBottom.push({ ...p, beforeTrend, afterTrend });
  }
});

// 打印分类结果
console.log('【V型反转型】(前期下跌>3%,后期上涨>3%)');
if (morphologyTypes.vReversal.length === 0) {
  console.log('  无此类买点\n');
} else {
  morphologyTypes.vReversal.forEach((p) => {
    console.log(
      `  ${p.stockName.padEnd(8)} | ${p.buyDate} | 前${p.beforeTrend.toFixed(
        1
      )}% → 后${p.afterTrend.toFixed(1)}% | 次日+${p.nextDayReturn.toFixed(2)}%`
    );
  });
  console.log();
}

console.log('【平台突破型】(前期横盘±2%,后期上涨>3%)');
if (morphologyTypes.platformBreak.length === 0) {
  console.log('  无此类买点\n');
} else {
  morphologyTypes.platformBreak.forEach((p) => {
    console.log(
      `  ${p.stockName.padEnd(8)} | ${p.buyDate} | 前${p.beforeTrend.toFixed(
        1
      )}% → 后${p.afterTrend.toFixed(1)}% | 次日+${p.nextDayReturn.toFixed(2)}%`
    );
  });
  console.log();
}

console.log('【回调企稳型】(前期小幅下跌1-5%,后期上涨>2%)');
if (morphologyTypes.pullback.length === 0) {
  console.log('  无此类买点\n');
} else {
  morphologyTypes.pullback.forEach((p) => {
    console.log(
      `  ${p.stockName.padEnd(8)} | ${p.buyDate} | 前${p.beforeTrend.toFixed(
        1
      )}% → 后${p.afterTrend.toFixed(1)}% | 次日+${p.nextDayReturn.toFixed(2)}%`
    );
  });
  console.log();
}

console.log('【W底/其他型】');
if (morphologyTypes.wBottom.length === 0) {
  console.log('  无此类买点\n');
} else {
  morphologyTypes.wBottom.forEach((p) => {
    console.log(
      `  ${p.stockName.padEnd(8)} | ${p.buyDate} | 前${p.beforeTrend.toFixed(
        1
      )}% → 后${p.afterTrend.toFixed(1)}% | 次日+${p.nextDayReturn.toFixed(2)}%`
    );
  });
  console.log();
}

// 统计各类别的分布
console.log('=== 形态分布统计 ===');
console.log(
  `V型反转: ${morphologyTypes.vReversal.length}个 (${(
    (morphologyTypes.vReversal.length / allPatterns.length) *
    100
  ).toFixed(0)}%)`
);
console.log(
  `平台突破: ${morphologyTypes.platformBreak.length}个 (${(
    (morphologyTypes.platformBreak.length / allPatterns.length) *
    100
  ).toFixed(0)}%)`
);
console.log(
  `回调企稳: ${morphologyTypes.pullback.length}个 (${(
    (morphologyTypes.pullback.length / allPatterns.length) *
    100
  ).toFixed(0)}%)`
);
console.log(
  `W底/其他: ${morphologyTypes.wBottom.length}个 (${(
    (morphologyTypes.wBottom.length / allPatterns.length) *
    100
  ).toFixed(0)}%)`
);

console.log('\n\n' + '='.repeat(80));
console.log('=== 方向2完成,准备进入方向3 ===');
console.log('='.repeat(80));
