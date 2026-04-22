/**
 * Cookie自动获取器 - 使用Puppeteer从东方财富网站获取Cookie
 * 运行在Electron主进程中
 */

import puppeteer from 'puppeteer-core';
import { existsSync } from 'fs';
import { ipcMain, BrowserWindow } from 'electron';

// 简单的日志函数，避免依赖 src 目录
const log = (msg: string, ...args: any[]) => console.log(`[CookieFetcher] ${msg}`, ...args);
const warn = (msg: string, ...args: any[]) => console.warn(`[CookieFetcher] ${msg}`, ...args);
const error = (msg: string, ...args: any[]) => console.error(`[CookieFetcher] ${msg}`, ...args);

// 取消标志
let isCancelled = false;

/**
 * 发送进度更新到渲染进程
 */
function sendProgress(
  window: BrowserWindow | null,
  progress: {
    current: number;
    total: number;
    batch: number;
    totalBatches: number;
    status: string;
    cookie?: string;
  }
) {
  if (window) {
    window.webContents.send('cookie-fetch-progress', progress);
  }
}

/**
 * 常见的User-Agent列表，用于模拟不同浏览器
 */
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
];

/**
 * 随机获取一个User-Agent
 */
function getRandomUserAgent(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

/**
 * 查找Chrome/Edge浏览器路径
 */
function findBrowserPath(): string {
  // Windows常见路径
  const paths = [
    // Chrome
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    // Edge
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  ];

  for (const path of paths) {
    if (existsSync(path)) {
      log(`找到浏览器: ${path}`);
      return path;
    }
  }

  throw new Error('未找到Chrome或Edge浏览器，请安装Google Chrome或Microsoft Edge');
}

/**
 * 自动获取东方财富Cookie
 * @param count 需要获取的Cookie数量
 * @param mainWindow 主窗口引用，用于发送进度
 * @returns Cookie字符串数组
 */
export async function autoFetchCookies(
  count: number,
  mainWindow: BrowserWindow | null = null
): Promise<string[]> {
  // 重置取消标志
  isCancelled = false;

  log(`开始获取 ${count} 个Cookie...`);

  // 计算分批策略
  const BATCH_SIZE = 12; // 每批获取12个
  const BATCH_PAUSE_MIN = 30; // 批次间最短暂停30秒
  const BATCH_PAUSE_MAX = 60; // 批次间最长暂停60秒
  const totalBatches = Math.ceil(count / BATCH_SIZE);
  const estimatedTime = Math.ceil((count * 3.5 + totalBatches * 45) / 60);

  log(`分批策略: 每批${BATCH_SIZE}个，共${totalBatches}批`);
  log(`预计耗时: 约${estimatedTime}分钟`);

  // 发送初始进度
  sendProgress(mainWindow, {
    current: 0,
    total: count,
    batch: 0,
    totalBatches,
    status: '准备中...',
  });

  const browserPath = findBrowserPath();
  const cookies: string[] = [];
  const seenCookies = new Set<string>();

  let browser: any = null;

  try {
    for (let batch = 0; batch < totalBatches; batch++) {
      const batchStart = batch * BATCH_SIZE;
      const batchEnd = Math.min(batchStart + BATCH_SIZE, count);
      const batchSize = batchEnd - batchStart;

      log(`\n===== 第 ${batch + 1}/${totalBatches} 批 =====`);
      log(`本批将获取 ${batchSize} 个Cookie`);

      // 检查是否被取消
      if (isCancelled) {
        log('操作已取消');
        sendProgress(mainWindow, {
          current: cookies.length,
          total: count,
          batch: batch + 1,
          totalBatches,
          status: '已取消',
        });
        break;
      }

      // 每批启动新的浏览器实例，确保清除缓存和Cookie
      log('启动新的浏览器实例（清除缓存）...');

      // 发送批次开始进度
      sendProgress(mainWindow, {
        current: cookies.length,
        total: count,
        batch: batch + 1,
        totalBatches,
        status: `第 ${batch + 1}/${totalBatches} 批`,
      });
      browser = await puppeteer.launch({
        executablePath: browserPath,
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--disable-blink-features=AutomationControlled',
          '--incognito', // 无痕模式，不保留缓存和Cookie
        ],
      });

      log('浏览器已启动（无痕模式）');

      // 在本批内获取Cookie
      for (let i = batchStart; i < batchEnd; i++) {
        try {
          // 检查是否被取消
          if (isCancelled) {
            log('操作已取消');
            return cookies;
          }

          log(`获取第 ${i + 1}/${count} 个Cookie...`);

          // 发送当前进度
          sendProgress(mainWindow, {
            current: i + 1,
            total: count,
            batch: batch + 1,
            totalBatches,
            status: `获取中 ${i + 1}/${count}`,
          });

          // 创建新页面
          const page = await browser.newPage();

          // 随机设置User-Agent，模拟不同浏览器
          const userAgent = getRandomUserAgent();
          await page.setUserAgent(userAgent);

          // 访问东方财富网站
          await page.goto('https://data.eastmoney.com', {
            waitUntil: 'networkidle2',
            timeout: 30000,
          });

          // 等待页面加载
          await page.waitForSelector('body', { timeout: 10000 });

          // 模拟用户行为：随机滚动页面
          const scrollAmount = Math.floor(Math.random() * 500) + 200;
          await page.evaluate((scroll: number) => {
            window.scrollTo(0, scroll);
          }, scrollAmount);

          // 随机等待 1-3秒，模拟浏览
          const browseTime = 1000 + Math.random() * 2000;
          await new Promise((resolve) => setTimeout(resolve, browseTime));

          // 获取Cookie
          const client = await page.target().createCDPSession();
          const { cookies: pageCookies } = await client.send('Network.getAllCookies');

          // 转换为Cookie字符串
          const cookieString = pageCookies.map((c: any) => `${c.name}=${c.value}`).join('; ');

          // 去重
          if (!seenCookies.has(cookieString)) {
            seenCookies.add(cookieString);
            cookies.push(cookieString);
            log(`✅ 成功获取唯一Cookie (${cookies.length}/${count})`);

            // 发送成功进度
            sendProgress(mainWindow, {
              current: i + 1,
              total: count,
              batch: batch + 1,
              totalBatches,
              status: `成功 ${cookies.length}/${count}`,
              cookie: cookieString.substring(0, 50) + '...',
            });
          } else {
            log('⚠️ Cookie重复，跳过');
          }

          // 关闭页面
          await page.close();

          // 随机延迟 2-5秒，降低被封风险
          const delay = 2000 + Math.random() * 3000;
          log(`等待 ${Math.round(delay / 1000)} 秒后继续...`);
          await new Promise((resolve) => setTimeout(resolve, delay));
        } catch (err) {
          error(`❌ 获取第 ${i + 1} 个Cookie失败:`, err);
          // 继续尝试下一个
        }
      }

      // 关闭当前批次的浏览器
      if (browser) {
        try {
          await browser.close();
          log('本批浏览器已关闭');
          browser = null;
        } catch (err) {
          error('关闭浏览器失败:', err);
        }
      }

      // 如果不是最后一批，则暂停较长时间
      if (batch < totalBatches - 1 && !isCancelled) {
        const pauseTime = BATCH_PAUSE_MIN + Math.random() * (BATCH_PAUSE_MAX - BATCH_PAUSE_MIN);
        log(`\n🕐 批次间暂停 ${Math.round(pauseTime / 1000)} 秒...`);
        log('这有助于降低风控风险，提高Cookie多样性');

        // 发送暂停进度
        sendProgress(mainWindow, {
          current: cookies.length,
          total: count,
          batch: batch + 1,
          totalBatches,
          status: `暂停中... ${Math.round(pauseTime / 1000)}秒`,
        });

        await new Promise((resolve) => setTimeout(resolve, pauseTime));
      }
    }

    log(`\n===== 全部完成 =====`);
    log(`共获取 ${cookies.length} 个唯一Cookie（目标: ${count}）`);

    // 发送完成进度
    sendProgress(mainWindow, {
      current: cookies.length,
      total: count,
      batch: totalBatches,
      totalBatches,
      status: isCancelled ? '已取消' : '完成',
    });

    if (cookies.length < count && !isCancelled) {
      warn(`注意: 实际获取数量少于目标，可能是Cookie重复率较高`);
      log('建议: 可以再次运行获取更多，或手动添加补充');
    }

    return cookies;
  } catch (err) {
    error('获取Cookie过程中出错:', err);
    throw err;
  } finally {
    // 确保关闭浏览器
    if (browser) {
      try {
        await browser.close();
        log('浏览器已关闭');
      } catch (err) {
        error('关闭浏览器失败:', err);
      }
    }
  }
}

/**
 * 取消Cookie获取操作
 */
export function cancelFetchCookies() {
  isCancelled = true;
  log('收到取消请求');
}
