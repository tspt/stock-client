/**
 * 补全 docs/回测优化/机会记录 中缺失的行业（及概念）信息
 * 行业映射来源：IndexedDB SectorStocksDB / industry_sectors
 *
 * 用法：
 *   npm run dev
 *   npm run backfill:opportunity-record-industry
 */

import { app, BrowserWindow } from 'electron';
import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join } from 'path';

const SECTOR_DB_NAME = 'SectorStocksDB';
const SECTOR_DB_VERSION = 1;
const INDUSTRY_STORE = 'industry_sectors';
const CONCEPT_STORE = 'concept_sectors';
const DEV_URL = process.env.VITE_DEV_URL || 'http://localhost:5173/';
const RECORD_DIR = join(process.cwd(), 'docs', '回测优化', '机会记录');

app.setPath('userData', join(app.getPath('appData'), 'stock-client'));

function normalizeStockCode(code) {
  if (code.startsWith('SH') || code.startsWith('SZ')) {
    return code;
  }
  const prefix = code.substring(0, 2);
  if (['60', '68', '90'].includes(prefix)) {
    return `SH${code}`;
  }
  if (['00', '30'].includes(prefix)) {
    return `SZ${code}`;
  }
  return code;
}

async function buildSectorMapping(win) {
  return win.webContents.executeJavaScript(`
    new Promise((resolve, reject) => {
      const req = indexedDB.open('${SECTOR_DB_NAME}', ${SECTOR_DB_VERSION});
      req.onerror = () => reject(req.error && req.error.message ? req.error.message : '打开 SectorStocksDB 失败');
      req.onupgradeneeded = () => {};
      req.onsuccess = () => {
        const db = req.result;
        const stores = Array.from(db.objectStoreNames);
        const readStore = (name) => new Promise((res, rej) => {
          if (!stores.includes(name)) {
            res([]);
            return;
          }
          const g = db.transaction([name], 'readonly').objectStore(name).getAll();
          g.onsuccess = () => res(g.result || []);
          g.onerror = () => rej(g.error);
        });
        Promise.all([readStore('${INDUSTRY_STORE}'), readStore('${CONCEPT_STORE}')])
          .then(([industrySectors, conceptSectors]) => {
            db.close();
            resolve({ industrySectors, conceptSectors });
          })
          .catch((err) => {
            db.close();
            reject(err);
          });
      };
    })
  `);
}

function mappingFromSectors({ industrySectors, conceptSectors }) {
  const industryMap = new Map();
  const conceptMap = new Map();

  for (const sector of industrySectors || []) {
    for (const stock of sector.children || []) {
      const code = normalizeStockCode(stock.code);
      if (!industryMap.has(code)) {
        industryMap.set(code, { code: sector.code, name: sector.name });
      }
    }
  }

  for (const sector of conceptSectors || []) {
    for (const stock of sector.children || []) {
      const code = normalizeStockCode(stock.code);
      if (!conceptMap.has(code)) {
        conceptMap.set(code, []);
      }
      conceptMap.get(code).push({ code: sector.code, name: sector.name });
    }
  }

  return { industryMap, conceptMap };
}

function backfillRecordFile(filePath, { industryMap, conceptMap }) {
  const raw = JSON.parse(readFileSync(filePath, 'utf-8'));
  if (!Array.isArray(raw.stocks)) {
    return { updated: 0, total: 0 };
  }

  let updated = 0;
  raw.stocks = raw.stocks.map((stock) => {
    const code = normalizeStockCode(stock.code);
    const industry = stock.industry || industryMap.get(code);
    const concepts =
      Array.isArray(stock.concepts) && stock.concepts.length > 0
        ? stock.concepts
        : conceptMap.get(code) || [];

    const changed =
      (!stock.industry && industry) ||
      ((!stock.concepts || stock.concepts.length === 0) && concepts.length > 0);

    if (changed) {
      updated += 1;
    }

    return {
      ...stock,
      industry: industry || stock.industry,
      concepts,
    };
  });

  if (updated > 0) {
    raw.updatedAt = Date.now();
    writeFileSync(filePath, JSON.stringify(raw, null, 2), 'utf-8');
  }

  return { updated, total: raw.stocks.length };
}

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    show: false,
    webPreferences: { sandbox: true, contextIsolation: true },
  });

  try {
    await win.loadURL(DEV_URL, { waitUntil: 'domcontentloaded' });
    await new Promise((r) => setTimeout(r, 800));

    const sectors = await buildSectorMapping(win);
    const maps = mappingFromSectors(sectors);
    console.log(
      `[backfill] 行业映射 ${maps.industryMap.size} 只，概念映射 ${maps.conceptMap.size} 只`
    );

    const files = readdirSync(RECORD_DIR)
      .filter((f) => f.endsWith('.json'))
      .sort();

    let totalUpdated = 0;
    for (const file of files) {
      const filePath = join(RECORD_DIR, file);
      const { updated, total } = backfillRecordFile(filePath, maps);
      totalUpdated += updated;
      console.log(`[backfill] ${file}: 补全 ${updated}/${total} 只`);
    }

    console.log(`[backfill] 完成，共补全 ${totalUpdated} 条个股行业/概念`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[backfill] 失败:', message);
    process.exitCode = 1;
  } finally {
    app.quit();
  }
});

app.on('window-all-closed', () => app.quit());
