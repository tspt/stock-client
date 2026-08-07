/**
 * 最新交易日场景判别（仅输出 lift>1 的高价值场景）
 *
 * 输入：docs/回测优化/股票数据/*.json
 * 输出：docs/回测优化/买点场景/最新交易日/
 *   - summary.json
 *   - signals.json              全部命中列表
 *   - {scenario}/{股票名}.json  按场景分文件
 */

const fs = require('fs');
const path = require('path');
const {
  HIGH_LIFT_SCENARIOS,
  HIGH_LIFT_IDS,
  fmtDate,
  classifyOneDay,
} = require('./lib/buypoint-scenario-lib.cjs');

const ROOT = path.join(__dirname, '..');
const STOCK_DIR = path.join(ROOT, 'docs', '回测优化', '股票数据');
const OUT_ROOT = path.join(ROOT, 'docs', '回测优化', '买点场景', '最新交易日');

function clearOutDirs() {
  fs.mkdirSync(OUT_ROOT, { recursive: true });
  for (const s of HIGH_LIFT_SCENARIOS) {
    const dir = path.join(OUT_ROOT, s.id);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      continue;
    }
    for (const f of fs.readdirSync(dir)) {
      if (f.endsWith('.json')) fs.unlinkSync(path.join(dir, f));
    }
  }
  for (const f of ['summary.json', 'signals.json']) {
    const p = path.join(OUT_ROOT, f);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
}

function main() {
  if (!fs.existsSync(STOCK_DIR)) {
    console.error('股票数据目录不存在:', STOCK_DIR);
    process.exit(1);
  }

  clearOutDirs();

  const files = fs.readdirSync(STOCK_DIR).filter((f) => f.endsWith('.json'));
  const hits = [];
  const byScenario = {};
  for (const s of HIGH_LIFT_SCENARIOS) byScenario[s.id] = 0;

  let scanned = 0;
  let skippedShort = 0;
  let latestDate = null;
  const dateCounts = new Map();

  for (const file of files) {
    let raw;
    try {
      raw = JSON.parse(fs.readFileSync(path.join(STOCK_DIR, file), 'utf8'));
    } catch {
      continue;
    }
    const data = raw.data || raw;
    const lines = data.dailyLines || [];
    const code = data.code || '';
    const name = data.name || path.basename(file, '.json');
    const industry = raw.industry || data.industry || null;

    if (lines.length < 5) {
      skippedShort++;
      continue;
    }

    const i = lines.length - 1;
    const cls = classifyOneDay(lines, i);
    scanned++;

    const date = fmtDate(lines[i].time);
    dateCounts.set(date, (dateCounts.get(date) || 0) + 1);
    if (!latestDate || date > latestDate) latestDate = date;

    if (!HIGH_LIFT_IDS.has(cls.scenario)) continue;

    const item = {
      code,
      name,
      industry,
      date,
      close: lines[i].close,
      scenario: cls.scenario,
      scenarioName: cls.scenarioName,
      matchedRule: cls.matchedRule,
      features: cls.features,
      lift:
        HIGH_LIFT_SCENARIOS.find((s) => s.id === cls.scenario)?.lift ?? null,
    };
    hits.push(item);
    byScenario[cls.scenario]++;

    const payload = {
      ...item,
      criteria: '最新交易日命中 lift>1 场景',
      generatedAt: new Date().toISOString(),
    };
    fs.writeFileSync(
      path.join(OUT_ROOT, cls.scenario, `${name}.json`),
      JSON.stringify(payload, null, 2),
      'utf8'
    );
  }

  // 多数股票的最新日期（用于提示数据是否对齐）
  let dominantDate = null;
  let dominantCount = 0;
  for (const [d, c] of dateCounts) {
    if (c > dominantCount) {
      dominantDate = d;
      dominantCount = c;
    }
  }

  hits.sort((a, b) => {
    if (b.lift !== a.lift) return (b.lift || 0) - (a.lift || 0);
    return a.name.localeCompare(b.name, 'zh');
  });

  const summary = {
    generatedAt: new Date().toISOString(),
    stockDir: STOCK_DIR,
    outRoot: OUT_ROOT,
    highLiftScenarios: HIGH_LIFT_SCENARIOS,
    scannedStocks: scanned,
    skippedShortHistory: skippedShort,
    dominantLatestDate: dominantDate,
    dominantDateStockCount: dominantCount,
    maxLatestDateSeen: latestDate,
    hitCount: hits.length,
    hitRate: scanned ? Number(((hits.length / scanned) * 100).toFixed(2)) : 0,
    byScenario,
  };

  fs.writeFileSync(path.join(OUT_ROOT, 'summary.json'), JSON.stringify(summary, null, 2), 'utf8');
  fs.writeFileSync(path.join(OUT_ROOT, 'signals.json'), JSON.stringify({ summary, signals: hits }, null, 2), 'utf8');

  console.log(JSON.stringify(summary, null, 2));
  console.log('--- TOP20 ---');
  console.log(
    JSON.stringify(
      hits.slice(0, 20).map((h) => ({
        name: h.name,
        code: h.code,
        date: h.date,
        scenario: h.scenarioName,
        lift: h.lift,
        dayRet: h.features?.dayReturn,
        volR: h.features?.volumeRatio,
      })),
      null,
      2
    )
  );
  console.log('完成。');
}

main();
