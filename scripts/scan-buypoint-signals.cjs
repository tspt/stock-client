/**
 * 扫描股票K线，按规则标记买点信号，并按股票分别写入
 * docs/回测优化/买点信号/全量_至少3项/{name}.json
 * docs/回测优化/买点信号/精选_5项全中/{name}.json
 *
 * 口径：
 * - 买入价 = 当日收盘
 * - 累计收益 = (未来第N日收盘 - 买入收盘) / 买入收盘
 * - 近两周 = 10 个交易日
 * - 全量：1/2/3/5/10 日中至少 3 项 > 5%
 * - 精选：5 项全部 > 5%
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const STOCK_DIR = path.join(ROOT, 'docs', '回测优化', '股票数据');
const OUT_ROOT = path.join(ROOT, 'docs', '回测优化', '买点信号');
const OUT_WIDE = path.join(OUT_ROOT, '全量_至少3项');
const OUT_STRICT = path.join(OUT_ROOT, '精选_5项全中');

const HORIZONS = [
  { key: 'd1', days: 1 },
  { key: 'd2', days: 2 },
  { key: 'd3', days: 3 },
  { key: 'd5', days: 5 },
  { key: 'd10', days: 10 },
];
const THRESHOLD = 0.05;
const MIN_HIT_WIDE = 3;
const MIN_HIT_STRICT = 5;

const CRITERIA_WIDE = '买入收盘后，近1/2/3/5/10日累计收益中至少3个 >5%';
const CRITERIA_STRICT = '买入收盘后，近1/2/3/5/10日累计收益全部 >5%';
const ENTRY_RULE =
  '买入价=当日收盘；累计收益=(未来第N日收盘-买入收盘)/买入收盘；两周按10个交易日';

function fmtDate(ts) {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}/${m}/${day}`;
}

function calcReturn(entry, future) {
  if (!entry || !future || entry <= 0) return null;
  return (future - entry) / entry;
}

function clearJsonDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    return 0;
  }
  let deleted = 0;
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith('.json')) continue;
    fs.unlinkSync(path.join(dir, file));
    deleted++;
  }
  return deleted;
}

function scanStock(filePath) {
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const data = raw.data || raw;
  const lines = data.dailyLines || [];
  const code = data.code || '';
  const name = data.name || path.basename(filePath, '.json');

  const wideSignals = [];
  const strictSignals = [];

  if (lines.length < 2) {
    return { code, name, wideSignals, strictSignals };
  }

  for (let i = 0; i < lines.length - 1; i++) {
    const entry = lines[i].close;
    if (!entry || entry <= 0) continue;

    const returns = {};
    let hitCount = 0;

    for (const h of HORIZONS) {
      const j = i + h.days;
      if (j >= lines.length) {
        returns[h.key] = null;
        continue;
      }
      const r = calcReturn(entry, lines[j].close);
      returns[h.key] = r == null ? null : Number((r * 100).toFixed(2));
      if (r != null && r > THRESHOLD) hitCount++;
    }

    if (hitCount < MIN_HIT_WIDE) continue;

    const signal = {
      date: fmtDate(lines[i].time),
      entryPrice: Number(entry.toFixed(4)),
      hitCount,
      returns: {
        d1: returns.d1,
        d2: returns.d2,
        d3: returns.d3,
        d5: returns.d5,
        d10: returns.d10,
      },
    };

    wideSignals.push(signal);
    if (hitCount >= MIN_HIT_STRICT) {
      strictSignals.push(signal);
    }
  }

  return { code, name, wideSignals, strictSignals };
}

function writeStockFile(outDir, criteria, stock) {
  const signals = criteria === CRITERIA_WIDE ? stock.wideSignals : stock.strictSignals;
  if (!signals.length) return false;

  const payload = {
    code: stock.code,
    name: stock.name,
    criteria,
    entryRule: ENTRY_RULE,
    generatedAt: new Date().toISOString(),
    buypointDate: signals.map((s) => s.date),
    signals,
  };

  const filePath = path.join(outDir, `${stock.name}.json`);
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf8');
  return true;
}

function main() {
  if (!fs.existsSync(STOCK_DIR)) {
    console.error('股票数据目录不存在:', STOCK_DIR);
    process.exit(1);
  }

  fs.mkdirSync(OUT_ROOT, { recursive: true });
  const deletedWide = clearJsonDir(OUT_WIDE);
  const deletedStrict = clearJsonDir(OUT_STRICT);
  console.log(`已清空旧文件: 全量=${deletedWide}, 精选=${deletedStrict}`);

  const files = fs.readdirSync(STOCK_DIR).filter((f) => f.endsWith('.json'));
  let parseFail = 0;
  let wideStockCount = 0;
  let strictStockCount = 0;
  let wideSignalCount = 0;
  let strictSignalCount = 0;
  const byHit = { 3: 0, 4: 0, 5: 0 };

  for (const file of files) {
    let stock;
    try {
      stock = scanStock(path.join(STOCK_DIR, file));
    } catch (err) {
      parseFail++;
      console.warn('解析失败:', file, err.message);
      continue;
    }

    for (const s of stock.wideSignals) {
      if (s.hitCount === 3) byHit[3]++;
      else if (s.hitCount === 4) byHit[4]++;
      else if (s.hitCount >= 5) byHit[5]++;
    }

    if (writeStockFile(OUT_WIDE, CRITERIA_WIDE, stock)) {
      wideStockCount++;
      wideSignalCount += stock.wideSignals.length;
    }
    if (writeStockFile(OUT_STRICT, CRITERIA_STRICT, stock)) {
      strictStockCount++;
      strictSignalCount += stock.strictSignals.length;
    }
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    stockDir: STOCK_DIR,
    outRoot: OUT_ROOT,
    entryRule: ENTRY_RULE,
    scannedFiles: files.length,
    parseFail,
    wide: {
      criteria: CRITERIA_WIDE,
      dir: OUT_WIDE,
      stockCount: wideStockCount,
      signalCount: wideSignalCount,
      byHitCount: byHit,
    },
    strict: {
      criteria: CRITERIA_STRICT,
      dir: OUT_STRICT,
      stockCount: strictStockCount,
      signalCount: strictSignalCount,
    },
  };

  fs.writeFileSync(path.join(OUT_ROOT, 'summary.json'), JSON.stringify(summary, null, 2), 'utf8');
  console.log(JSON.stringify(summary, null, 2));
  console.log('完成。');
}

main();
