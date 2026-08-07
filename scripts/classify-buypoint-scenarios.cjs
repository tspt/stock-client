/**
 * 精选好买点场景互斥归类（规则主分 + 对照日 lift）
 *
 * 输入：
 * - docs/回测优化/股票数据/*.json
 * - docs/回测优化/买点信号/精选_5项全中/*.json
 *
 * 输出：
 * - docs/回测优化/买点场景/summary.json
 * - docs/回测优化/买点场景/{scenario}/{股票名}.json
 *
 * 优先级（互斥，命中即停）：
 * 1 limit_up_trend        连板/强趋势
 * 2 volume_breakout       放量突破续涨
 * 3 soft_breakout         温和过前高
 * 4 volume_mid_thrust     中部放量启动
 * 5 trend_continuation    趋势中继
 * 6 pullback_stabilize    缩量回踩企稳反弹（已收紧）
 * 7 pullback_with_volume  回撤后放量企稳
 * 8 oversold_bounce       超跌强反
 * 9 weak_base             弱势蓄势
 * 10 other                未归类
 */

const fs = require('fs');
const path = require('path');
const {
  SCENARIOS,
  fmtDate,
  classifyOneDay,
} = require('./lib/buypoint-scenario-lib.cjs');

const ROOT = path.join(__dirname, '..');
const STOCK_DIR = path.join(ROOT, 'docs', '回测优化', '股票数据');
const SIGNAL_DIR = path.join(ROOT, 'docs', '回测优化', '买点信号', '精选_5项全中');
const OUT_ROOT = path.join(ROOT, 'docs', '回测优化', '买点场景');

const RNG_SEED = 20260807;

function mulberry32(seed) {
  let t = seed >>> 0;
  return function () {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function clearScenarioDirs() {
  fs.mkdirSync(OUT_ROOT, { recursive: true });
  const deleted = {};
  for (const s of SCENARIOS) {
    const dir = path.join(OUT_ROOT, s.id);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      deleted[s.id] = 0;
      continue;
    }
    let n = 0;
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.json')) continue;
      fs.unlinkSync(path.join(dir, f));
      n++;
    }
    deleted[s.id] = n;
  }
  return deleted;
}

function buildDateIndex(lines) {
  const map = new Map();
  for (let i = 0; i < lines.length; i++) {
    map.set(fmtDate(lines[i].time), i);
  }
  return map;
}

function processStock(stockPath, signalPath, rng) {
  const stockRaw = JSON.parse(fs.readFileSync(stockPath, 'utf8'));
  const data = stockRaw.data || stockRaw;
  const lines = data.dailyLines || [];
  const code = data.code || '';
  const name = data.name || path.basename(stockPath, '.json');
  const industry = stockRaw.industry || data.industry || null;

  if (!fs.existsSync(signalPath) || lines.length < 5) {
    return null;
  }

  const signalRaw = JSON.parse(fs.readFileSync(signalPath, 'utf8'));
  const goodSignals = signalRaw.signals || [];
  if (!goodSignals.length) return null;

  const dateIndex = buildDateIndex(lines);
  const goodIndexSet = new Set();
  const classified = [];

  for (const sig of goodSignals) {
    const idx = dateIndex.get(sig.date);
    if (idx == null) continue;
    goodIndexSet.add(idx);
    const cls = classifyOneDay(lines, idx);
    classified.push({
      date: sig.date,
      entryPrice: sig.entryPrice,
      hitCount: sig.hitCount,
      returns: sig.returns,
      scenario: cls.scenario,
      scenarioName: cls.scenarioName,
      matchedRule: cls.matchedRule,
      features: cls.features,
    });
  }

  if (!classified.length) return null;

  // 对照日：非好买点日，数量不超过好买点数，且索引需 >=1
  const candidates = [];
  for (let i = 1; i < lines.length; i++) {
    if (!goodIndexSet.has(i)) candidates.push(i);
  }
  const controlN = Math.min(classified.length, candidates.length);
  // Fisher-Yates partial shuffle with seeded rng
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = candidates[i];
    candidates[i] = candidates[j];
    candidates[j] = tmp;
  }
  const controlIdx = candidates.slice(0, controlN);
  const controlClassified = controlIdx.map((idx) => {
    const cls = classifyOneDay(lines, idx);
    return {
      date: fmtDate(lines[idx].time),
      scenario: cls.scenario,
      scenarioName: cls.scenarioName,
    };
  });

  return {
    code,
    name,
    industry,
    classified,
    controlClassified,
  };
}

function main() {
  if (!fs.existsSync(STOCK_DIR)) {
    console.error('股票数据目录不存在:', STOCK_DIR);
    process.exit(1);
  }
  if (!fs.existsSync(SIGNAL_DIR)) {
    console.error('精选买点目录不存在:', SIGNAL_DIR);
    process.exit(1);
  }

  const deleted = clearScenarioDirs();
  console.log('已清空场景目录旧文件:', deleted);

  const rng = mulberry32(RNG_SEED);
  const signalFiles = new Set(fs.readdirSync(SIGNAL_DIR).filter((f) => f.endsWith('.json')));
  const stockFiles = fs.readdirSync(STOCK_DIR).filter((f) => f.endsWith('.json'));

  const byScenarioSignals = {};
  const byScenarioStocks = {};
  const controlByScenario = {};
  for (const s of SCENARIOS) {
    byScenarioSignals[s.id] = 0;
    byScenarioStocks[s.id] = 0;
    controlByScenario[s.id] = 0;
  }

  // name -> scenario -> signals[]
  const stockBuckets = new Map();
  let processedStocks = 0;
  let totalGood = 0;
  let totalControl = 0;
  let missingSignalFile = 0;

  for (const file of stockFiles) {
    if (!signalFiles.has(file)) {
      missingSignalFile++;
      continue;
    }
    let result;
    try {
      result = processStock(path.join(STOCK_DIR, file), path.join(SIGNAL_DIR, file), rng);
    } catch (err) {
      console.warn('处理失败:', file, err.message);
      continue;
    }
    if (!result) continue;

    processedStocks++;
    totalGood += result.classified.length;
    totalControl += result.controlClassified.length;

    for (const c of result.controlClassified) {
      controlByScenario[c.scenario] = (controlByScenario[c.scenario] || 0) + 1;
    }

    if (!stockBuckets.has(result.name)) {
      stockBuckets.set(result.name, {
        code: result.code,
        name: result.name,
        industry: result.industry,
        byScenario: {},
      });
    }
    const bucket = stockBuckets.get(result.name);
    for (const sig of result.classified) {
      byScenarioSignals[sig.scenario]++;
      if (!bucket.byScenario[sig.scenario]) bucket.byScenario[sig.scenario] = [];
      bucket.byScenario[sig.scenario].push(sig);
    }
  }

  // 写每场景每股票文件
  for (const [, stock] of stockBuckets) {
    for (const s of SCENARIOS) {
      const signals = stock.byScenario[s.id];
      if (!signals || !signals.length) continue;
      byScenarioStocks[s.id]++;
      const payload = {
        code: stock.code,
        name: stock.name,
        industry: stock.industry,
        scenario: s.id,
        scenarioName: s.name,
        criteria: '精选：近1/2/3/5/10日累计收益全部 >5%',
        generatedAt: new Date().toISOString(),
        buypointDate: signals.map((x) => x.date),
        signals,
      };
      fs.writeFileSync(
        path.join(OUT_ROOT, s.id, `${stock.name}.json`),
        JSON.stringify(payload, null, 2),
        'utf8'
      );
    }
  }

  const goodRate = {};
  const controlRate = {};
  const lift = {};
  for (const s of SCENARIOS) {
    goodRate[s.id] = totalGood ? byScenarioSignals[s.id] / totalGood : 0;
    controlRate[s.id] = totalControl ? controlByScenario[s.id] / totalControl : 0;
    lift[s.id] =
      controlRate[s.id] > 0 ? goodRate[s.id] / controlRate[s.id] : null;
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    rngSeed: RNG_SEED,
    labelSource: SIGNAL_DIR,
    stockDir: STOCK_DIR,
    outRoot: OUT_ROOT,
    priority: SCENARIOS.map((s) => `${s.id}(${s.name})`),
    processedStocks,
    stockFiles: stockFiles.length,
    signalFiles: signalFiles.size,
    stocksWithoutStrictSignalFile: missingSignalFile,
    totalGoodSignals: totalGood,
    totalControlDays: totalControl,
    byScenarioSignals,
    byScenarioStocks,
    controlByScenario,
    goodRate: Object.fromEntries(
      Object.entries(goodRate).map(([k, v]) => [k, Number((v * 100).toFixed(2))])
    ),
    controlRate: Object.fromEntries(
      Object.entries(controlRate).map(([k, v]) => [k, Number((v * 100).toFixed(2))])
    ),
    lift: Object.fromEntries(
      Object.entries(lift).map(([k, v]) => [k, v == null ? null : Number(v.toFixed(3))])
    ),
    note: 'lift>1 表示该场景在好买点中比对照日更常见；classifyOneDay 可复用于最新交易日判别',
  };

  fs.writeFileSync(path.join(OUT_ROOT, 'summary.json'), JSON.stringify(summary, null, 2), 'utf8');
  console.log(JSON.stringify(summary, null, 2));
  console.log('完成。');
}

if (require.main === module) {
  main();
}
