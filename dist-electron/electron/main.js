// ⚠️ dotenv 必须在所有其他导入之前加载，确保环境变量可用
import dotenv from 'dotenv';
import { resolve } from 'path';
const envPath = resolve(process.cwd(), '.env');
const dotEnvResult = dotenv.config({ path: envPath });
if (dotEnvResult.error) {
    console.error('[主进程] 环境变量加载失败:', dotEnvResult.error);
}
import { app, BrowserWindow, Tray, Menu, nativeImage, session, ipcMain, Notification, } from 'electron';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { existsSync, appendFileSync, writeFileSync, mkdirSync, readdirSync, readFileSync, unlinkSync, } from 'fs';
import { startEmbeddedApiProxy, stopEmbeddedApiProxy, initProxySession } from './localApiProxy.js';
import { deriveEastmoneyRefererOrigin, isEastmoneyJsonpUrl } from './eastMoneyPush2Context.js';
const __dirname = fileURLToPath(new URL('.', import.meta.url));
// 开发环境判断
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
/** 应用窗口/托盘用的图标（开发：项目根下 build；打包：app.asar 内 build） */
function getAppIconPath() {
    const relativeToApp = join('build', 'icon.ico');
    const iconPath = app.isPackaged
        ? join(app.getAppPath(), relativeToApp)
        : join(process.cwd(), relativeToApp);
    return existsSync(iconPath) ? iconPath : undefined;
}
let mainWindow = null;
let tray = null;
let proxyServer = null;
/** 供 did-finish-load 注入到渲染进程控制台；主进程 console 不会出现在 F12 里 */
let lastProxyStartupMessage = '';
function mainLog(msg, isError = false) {
    const line = `[${new Date().toISOString()}] ${msg}\n`;
    try {
        appendFileSync(join(app.getPath('userData'), 'main-debug.log'), line, 'utf8');
    }
    catch {
        // ignore
    }
    if (isError)
        console.error(msg);
    else
        console.log(msg);
}
// 配置请求拦截，解决403和CORS问题
function setupRequestInterceptor() {
    const defaultUserAgent = process.env.VITE_USER_AGENT;
    // 拦截新浪财经API请求 - 修改请求头
    // 使用更宽泛的URL匹配模式
    session.defaultSession.webRequest.onBeforeSendHeaders({
        urls: ['*://*.sinajs.cn/*', '*://hq.sinajs.cn/*'],
    }, (details, callback) => {
        // Electron 文档：requestHeaders 的键一律为小写，用大写键不会覆盖实际发出的 referer，易导致新浪 403
        details.requestHeaders['referer'] = process.env.VITE_SINA_REFERER;
        details.requestHeaders['origin'] = process.env.VITE_SINA_ORIGIN;
        details.requestHeaders['user-agent'] = defaultUserAgent;
        details.requestHeaders['accept'] = process.env.VITE_ACCEPT;
        details.requestHeaders['accept-language'] = process.env.VITE_ACCEPT_LANGUAGE;
        callback({
            requestHeaders: details.requestHeaders,
        });
    });
    // 拦截新浪财经API响应 - 添加CORS头
    session.defaultSession.webRequest.onHeadersReceived({
        urls: [
            'https://hq.sinajs.cn/*',
            'https://*.sinajs.cn/*',
            'http://hq.sinajs.cn/*',
            'http://*.sinajs.cn/*',
        ],
    }, (details, callback) => {
        callback({
            responseHeaders: {
                ...details.responseHeaders,
                'Access-Control-Allow-Origin': ['*'],
                'Access-Control-Allow-Methods': ['GET', 'POST', 'OPTIONS'],
                'Access-Control-Allow-Headers': ['*'],
            },
        });
    });
    // 拦截腾讯财经API请求 - 修改请求头
    session.defaultSession.webRequest.onBeforeSendHeaders({
        urls: [
            'https://qt.gtimg.cn/*',
            'https://*.gtimg.cn/*',
            'http://qt.gtimg.cn/*',
            'http://*.gtimg.cn/*',
        ],
    }, (details, callback) => {
        details.requestHeaders['referer'] = process.env.VITE_TENCENT_REFERER;
        details.requestHeaders['origin'] = process.env.VITE_TENCENT_ORIGIN;
        details.requestHeaders['user-agent'] = defaultUserAgent;
        details.requestHeaders['accept'] = process.env.VITE_ACCEPT;
        details.requestHeaders['accept-language'] = process.env.VITE_ACCEPT_LANGUAGE;
        callback({
            requestHeaders: details.requestHeaders,
        });
    });
    // 拦截腾讯财经API响应 - 添加CORS头
    session.defaultSession.webRequest.onHeadersReceived({
        urls: [
            'https://qt.gtimg.cn/*',
            'https://*.gtimg.cn/*',
            'http://qt.gtimg.cn/*',
            'http://*.gtimg.cn/*',
        ],
    }, (details, callback) => {
        callback({
            responseHeaders: {
                ...details.responseHeaders,
                'Access-Control-Allow-Origin': ['*'],
                'Access-Control-Allow-Methods': ['GET', 'POST', 'OPTIONS'],
                'Access-Control-Allow-Headers': ['*'],
            },
        });
    });
    // 添加全局拦截器用于调试（拦截所有请求）
    session.defaultSession.webRequest.onBeforeSendHeaders({
        urls: ['<all_urls>'],
    }, (details, callback) => {
        const du = details.url;
        // 渲染进程 JSONP 直连 push2 时默认 Referer 为 localhost，与内嵌代理不一致，对端可能拒答；按 URL 中 fs 补齐与 localApiProxy 相同
        if (du.includes('push2.eastmoney.com') && du.includes('/api/qt/')) {
            const ro = deriveEastmoneyRefererOrigin(du, process.env.VITE_EASTMONEY_REFERER, process.env.VITE_EASTMONEY_ORIGIN);
            if (isEastmoneyJsonpUrl(du)) {
                details.requestHeaders['referer'] = ro.referer;
                delete details.requestHeaders['origin'];
            }
            else {
                details.requestHeaders['referer'] = ro.referer;
                details.requestHeaders['origin'] = ro.origin;
            }
        }
        callback({ requestHeaders: details.requestHeaders });
    });
}
function createWindow() {
    // preload 脚本路径配置
    // 源代码：electron/preload.ts
    // 编译后：dist-electron/preload.js
    // 运行时：main.js 在 dist-electron/electron/，__dirname 指向该目录，preload 在上一级
    const preloadPath = resolve(__dirname, '../preload.js');
    // 验证文件是否存在
    if (!existsSync(preloadPath)) {
        console.error('[主进程] ❌ 错误：Preload 文件不存在！');
        console.error('[主进程] 期望路径:', preloadPath);
        console.error('[主进程] 请确保已运行: npm run build:electron');
        console.error('[主进程] 编译后文件应该在: dist-electron/preload.js');
        // 尝试查找其他可能的位置（用于调试）
        const debugPaths = [
            resolve(process.cwd(), 'dist-electron', 'preload.js'),
            join(process.cwd(), 'dist-electron', 'preload.js'),
            join(app.getAppPath(), 'dist-electron', 'preload.js'),
        ];
        console.error('[主进程] 调试：尝试查找其他位置:');
        debugPaths.forEach((path) => {
            const exists = existsSync(path);
            console.error(`  ${path}: ${exists ? '✓ 存在' : '✗ 不存在'}`);
        });
    }
    const appIcon = getAppIconPath();
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        minWidth: 800,
        minHeight: 600,
        ...(appIcon ? { icon: appIcon } : {}),
        webPreferences: {
            preload: preloadPath,
            nodeIntegration: false,
            contextIsolation: true,
            // 开发环境可以禁用webSecurity以解决CORS问题
            // 生产环境建议使用请求拦截方式
            webSecurity: !isDev,
        },
    });
    // 移除顶部菜单栏
    mainWindow.setMenu(null);
    // 为窗口的session设置请求拦截（重要：必须在窗口创建后设置）
    setupWindowRequestInterceptor(mainWindow.webContents.session);
    // 加载应用
    if (isDev) {
        mainWindow.loadURL('http://localhost:5173');
        mainWindow.webContents.openDevTools();
    }
    else {
        mainWindow.loadFile(join(__dirname, '../../dist/index.html'));
    }
    // 监听 preload 脚本加载错误
    mainWindow.webContents.on('preload-error', (_event, _preloadPath, error) => {
        console.error('[主进程] Preload 脚本加载错误:', error);
        console.error('[主进程] Preload 路径:', _preloadPath);
    });
    // 确保在窗口加载完成后拦截器已设置
    mainWindow.webContents.on('did-finish-load', () => {
        if (mainWindow && lastProxyStartupMessage) {
            const logPath = join(app.getPath('userData'), 'main-debug.log');
            mainWindow.webContents
                .executeJavaScript(`console.log('%c[主进程→渲染控制台]','color:#fa8c16;font-weight:bold', ${JSON.stringify(lastProxyStartupMessage)}); console.log('主进程日志文件(持续追加):', ${JSON.stringify(logPath)})`)
                .catch(() => { });
        }
        // 检查 preload 脚本是否成功加载
        if (mainWindow) {
            // 延迟一下，确保 preload 脚本已执行
            setTimeout(() => {
                if (mainWindow) {
                    mainWindow.webContents
                        .executeJavaScript(`
            if (typeof window.electronAPI !== 'undefined') {
              console.log('[渲染进程检查] electronAPI 方法:', Object.keys(window.electronAPI));
            }
          `)
                        .catch((err) => {
                        console.error('[主进程] 执行检查脚本失败:', err);
                    });
                }
            }, 1000);
        }
    });
    // 添加右键菜单
    mainWindow.webContents.on('context-menu', (_event, params) => {
        const contextMenu = Menu.buildFromTemplate([
            {
                label: '刷新',
                click: () => {
                    if (mainWindow) {
                        mainWindow.reload();
                    }
                },
            },
            {
                type: 'separator',
            },
            {
                label: '打开开发者工具',
                click: () => {
                    if (mainWindow) {
                        mainWindow.webContents.toggleDevTools();
                    }
                },
            },
            {
                type: 'separator',
            },
            {
                label: '复制',
                role: 'copy',
                enabled: params.editFlags.canCopy,
            },
            {
                label: '粘贴',
                role: 'paste',
                enabled: params.editFlags.canPaste,
            },
        ]);
        contextMenu.popup();
    });
    mainWindow.on('closed', () => {
        mainWindow = null;
    });
    // 创建系统托盘
    createTray();
}
// 为特定窗口的session设置请求拦截
function setupWindowRequestInterceptor(webSession) {
    const defaultUserAgent = process.env.VITE_USER_AGENT;
    // 使用更宽泛的URL匹配 - 拦截所有包含sinajs.cn的请求
    webSession.webRequest.onBeforeSendHeaders({
        urls: ['*://*.sinajs.cn/*', '*://hq.sinajs.cn/*'],
    }, (details, callback) => {
        details.requestHeaders['referer'] = process.env.VITE_SINA_REFERER;
        details.requestHeaders['origin'] = process.env.VITE_SINA_ORIGIN;
        details.requestHeaders['user-agent'] = defaultUserAgent;
        details.requestHeaders['accept'] = process.env.VITE_ACCEPT;
        details.requestHeaders['accept-language'] = process.env.VITE_ACCEPT_LANGUAGE;
        callback({
            requestHeaders: details.requestHeaders,
        });
    });
    // 拦截新浪财经API响应 - 添加CORS头
    webSession.webRequest.onHeadersReceived({
        urls: ['*://*.sinajs.cn/*', '*://hq.sinajs.cn/*'],
    }, (details, callback) => {
        callback({
            responseHeaders: {
                ...details.responseHeaders,
                'Access-Control-Allow-Origin': ['*'],
                'Access-Control-Allow-Methods': ['GET', 'POST', 'OPTIONS'],
                'Access-Control-Allow-Headers': ['*'],
            },
        });
    });
    // 拦截腾讯财经API请求 - 修改请求头
    webSession.webRequest.onBeforeSendHeaders({
        urls: ['*://*.gtimg.cn/*', '*://qt.gtimg.cn/*'],
    }, (details, callback) => {
        details.requestHeaders['referer'] = process.env.VITE_TENCENT_REFERER;
        details.requestHeaders['origin'] = process.env.VITE_TENCENT_ORIGIN;
        details.requestHeaders['user-agent'] = defaultUserAgent;
        details.requestHeaders['accept'] = process.env.VITE_ACCEPT;
        details.requestHeaders['accept-language'] = process.env.VITE_ACCEPT_LANGUAGE;
        callback({
            requestHeaders: details.requestHeaders,
        });
    });
    // 拦截腾讯财经API响应 - 添加CORS头
    webSession.webRequest.onHeadersReceived({
        urls: ['*://*.gtimg.cn/*', '*://qt.gtimg.cn/*'],
    }, (details, callback) => {
        callback({
            responseHeaders: {
                ...details.responseHeaders,
                'Access-Control-Allow-Origin': ['*'],
                'Access-Control-Allow-Methods': ['GET', 'POST', 'OPTIONS'],
                'Access-Control-Allow-Headers': ['*'],
            },
        });
    });
    // 添加一个全局拦截器用于调试 - 拦截所有请求
    webSession.webRequest.onBeforeSendHeaders({
        urls: ['<all_urls>'],
    }, (details, callback) => {
        callback({ requestHeaders: details.requestHeaders });
    });
}
function createTray() {
    const iconPath = getAppIconPath();
    const icon = iconPath ? nativeImage.createFromPath(iconPath) : nativeImage.createEmpty();
    tray = new Tray(icon);
    const contextMenu = Menu.buildFromTemplate([
        {
            label: '显示',
            click: () => {
                if (mainWindow) {
                    mainWindow.show();
                }
            },
        },
        {
            label: '退出',
            click: () => {
                app.quit();
            },
        },
    ]);
    tray.setToolTip('破忒头工具');
    tray.setContextMenu(contextMenu);
    // 点击托盘图标显示/隐藏窗口
    tray.on('click', () => {
        if (mainWindow) {
            if (mainWindow.isVisible()) {
                mainWindow.hide();
            }
            else {
                mainWindow.show();
            }
        }
    });
}
// 主进程内嵌 HTTP 代理（与 server/proxy.js 行为一致，不依赖子进程）
async function startProxyServer() {
    if (proxyServer) {
        return;
    }
    try {
        proxyServer = await startEmbeddedApiProxy(3000);
    }
    catch (e) {
        const err = e;
        const hint = err.code === 'EADDRINUSE'
            ? '端口 3000 已被占用（请关闭占用进程或结束本机其它 stock-client 实例）'
            : String(err.message || e);
        mainLog(`[主进程] 内嵌本地代理启动失败: ${hint}`, true);
        throw e;
    }
}
// 设置IPC处理器
function setupIpcHandlers() {
    console.log('[主进程] 设置 IPC 处理器');
    // 显示系统托盘通知
    // 注意：Windows 10/11 已不再支持传统的托盘气泡通知（tray.displayBalloon）
    // 因此使用系统通知，但可以通过图标或标识来区分
    ipcMain.handle('show-tray-notification', (_event, options) => {
        if (!tray) {
            console.warn('[主进程] 系统托盘不存在，无法发送托盘通知');
            return;
        }
        // Windows系统托盘通知 - 统一使用系统通知API
        if (Notification.isSupported()) {
            const notification = new Notification({
                title: options.title,
                body: options.body,
                silent: false,
            });
            notification.on('click', () => {
                if (mainWindow && options.code) {
                    mainWindow.show();
                    mainWindow.focus();
                    // 发送消息到渲染进程，跳转到股票详情
                    mainWindow.webContents.send('navigate-to-stock', options.code);
                }
            });
            notification.on('show', () => {
                // 通知已显示
            });
            notification.show();
        }
        else {
            console.warn('[主进程] 系统不支持通知 API');
            // 降级方案：使用托盘工具提示（仅Windows）
            if (process.platform === 'win32' && tray) {
                try {
                    tray.displayBalloon({
                        title: options.title,
                        content: options.body,
                        icon: nativeImage.createEmpty(),
                    });
                }
                catch (error) {
                    console.error('[主进程] 托盘工具提示失败:', error);
                }
            }
        }
    });
    // 显示桌面通知
    ipcMain.handle('show-desktop-notification', (_event, options) => {
        if (!Notification.isSupported()) {
            console.warn('[主进程] 系统不支持桌面通知');
            return;
        }
        const notification = new Notification({
            title: options.title,
            body: options.body,
            silent: false,
        });
        notification.on('click', () => {
            if (mainWindow && options.code) {
                mainWindow.show();
                mainWindow.focus();
                // 发送消息到渲染进程，跳转到股票详情
                mainWindow.webContents.send('navigate-to-stock', options.code);
            }
        });
        notification.on('show', () => {
            // 通知已显示
        });
        notification.show();
    });
    // 自动获取东方财富Cookie
    ipcMain.handle('fetch-cookies', async (event, count) => {
        try {
            mainLog(`[主进程] 收到获取Cookie请求，数量: ${count}`);
            const { autoFetchCookies } = await import('./cookieFetcher.js');
            // 获取发送请求的窗口
            const mainWindow = BrowserWindow.fromWebContents(event.sender);
            const cookiesWithUA = await autoFetchCookies(count, mainWindow);
            mainLog(`[主进程] 成功获取 ${cookiesWithUA.length} 个Cookie`);
            // 返回 Cookie 和 UA 的组合信息
            return {
                success: true,
                cookies: cookiesWithUA.map((item) => item.cookie),
                userAgents: cookiesWithUA.map((item) => item.userAgent),
            };
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            mainLog(`[主进程] 获取Cookie失败: ${errorMessage}`, true);
            return { success: false, error: errorMessage };
        }
    });
    // 取消Cookie获取
    ipcMain.handle('cancel-fetch-cookies', async () => {
        try {
            mainLog('[主进程] 收到取消获取Cookie请求');
            const { cancelFetchCookies } = await import('./cookieFetcher.js');
            cancelFetchCookies();
            return { success: true };
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            mainLog(`[主进程] 取消失败: ${errorMessage}`, true);
            return { success: false, error: errorMessage };
        }
    });
    // 测试Cookie（在主进程中执行，避免CORS）
    ipcMain.handle('test-cookie', async (event, cookieValue) => {
        try {
            const { net } = await import('electron');
            return new Promise((resolve) => {
                const request = net.request({
                    url: 'https://push2.eastmoney.com/api/qt/clist/get?pn=1&pz=1&po=1&np=1&ut=bd1d9ddb04089700cf9c27f6f7426281&fltt=2&invt=2&wbp2u=|0|0|0|web&fid=f3&fs=b:MK0010,b:MK0021,b:MK0022,b:MK0023,b:MK0024&fields=f12,f14',
                    method: 'GET',
                });
                request.setHeader('Cookie', cookieValue);
                request.on('response', (response) => {
                    const isValid = response.statusCode === 200;
                    resolve({ success: true, isValid });
                });
                request.on('error', (error) => {
                    resolve({ success: false, isValid: false, error: error.message });
                });
                request.end();
            });
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            mainLog(`[主进程] 测试Cookie失败: ${errorMessage}`, true);
            return { success: false, isValid: false, error: errorMessage };
        }
    });
    /**
     * 将池内 Cookie 字符串写入主窗口同 session，供渲染进程 JSONP 请求 push2 时自动带 Cookie（不经 Node 主进程代发）
     */
    ipcMain.handle('sync-eastmoney-session-cookies', async (_event, raw) => {
        const ses = mainWindow && !mainWindow.isDestroyed()
            ? mainWindow.webContents.session
            : session.defaultSession;
        const base = 'https://push2.eastmoney.com/';
        try {
            const existing = await ses.cookies.get({ url: base });
            for (const c of existing) {
                try {
                    await ses.cookies.remove(base, c.name);
                }
                catch {
                    /* 忽略 */
                }
            }
        }
        catch (e) {
            console.warn('[主进程] 清东财 push2 旧 cookies:', e);
        }
        if (!raw || !raw.trim()) {
            return { ok: true };
        }
        for (const part of raw.split(';')) {
            const s = part.trim();
            if (!s)
                continue;
            const p = s.indexOf('=');
            if (p < 0)
                continue;
            const name = s.slice(0, p).trim();
            const value = s.slice(p + 1).trim();
            if (!name)
                continue;
            try {
                await ses.cookies.set({
                    url: base,
                    name,
                    value,
                    sameSite: 'no_restriction',
                });
            }
            catch (e) {
                console.warn('[主进程] cookies.set', name, e);
            }
        }
        return { ok: true };
    });
    /**
     * 保存股票K线数据到本地文件
     */
    ipcMain.handle('save-stock-data', async (_event, data) => {
        try {
            const { code, name, klineData, latestQuote, updatedAt, dates, exportContent, exportFilename, } = data;
            // 如果是批量导出
            if (exportContent && exportFilename) {
                mainLog(`[主进程] 处理批量导出请求`);
                // 固定使用历史回测数据目录
                let exportDir;
                if (isDev) {
                    exportDir = join(app.getAppPath(), 'docs', '回测优化', '历史回测数据');
                }
                else {
                    const exeDir = join(app.getPath('exe'), '..');
                    exportDir = join(exeDir, 'docs', '回测优化', '历史回测数据');
                }
                // 确保目录存在
                if (!existsSync(exportDir)) {
                    mkdirSync(exportDir, { recursive: true });
                    mainLog(`[主进程] 创建导出目录: ${exportDir}`);
                }
                const filePath = join(exportDir, exportFilename);
                mainLog(`[主进程] 准备写入批量导出文件: ${filePath}`);
                mainLog(`[主进程] 文件大小: ${exportContent.length} 字节`);
                // 写入文件
                writeFileSync(filePath, exportContent, 'utf-8');
                mainLog(`[主进程] 批量导出文件写入成功: ${filePath}`);
                return { success: true, filePath };
            }
            // 原有的单股票导出逻辑
            mainLog(`[主进程] 处理单股票导出请求`);
            // 构建文件路径 - 使用项目根目录下的 docs 文件夹
            // 在开发环境：app.getAppPath() 返回项目根目录
            // 在生产环境：需要特殊处理
            let stockDataDir;
            if (isDev) {
                // 开发环境：直接使用项目根目录
                stockDataDir = join(app.getAppPath(), 'docs', '回测优化', '股票数据');
            }
            else {
                // 生产环境：使用 exe 所在目录的上级目录
                const exeDir = join(app.getPath('exe'), '..');
                stockDataDir = join(exeDir, 'docs', '回测优化', '股票数据');
            }
            mainLog(`[主进程] 保存路径: ${stockDataDir}`);
            // 确保目录存在
            if (!existsSync(stockDataDir)) {
                mkdirSync(stockDataDir, { recursive: true });
                mainLog(`[主进程] 创建目录: ${stockDataDir}`);
            }
            const filePath = join(stockDataDir, `${name}.json`);
            // 格式化日期买点字符串
            const formattedDates = dates.map((dateStr) => {
                const trimmed = dateStr.trim();
                if (/^\d{8}$/.test(trimmed)) {
                    const year = trimmed.substring(0, 4);
                    const month = trimmed.substring(4, 6);
                    const day = trimmed.substring(6, 8);
                    return `${year}/${month}/${day}`;
                }
                return trimmed;
            });
            // 构建JSON内容（新格式）
            const jsonData = {
                data: {
                    code,
                    name,
                    dailyLines: klineData,
                    latestQuote: latestQuote || null,
                    updatedAt: updatedAt || Date.now(),
                },
                buypointDate: formattedDates,
            };
            const jsonContent = JSON.stringify(jsonData, null, 4);
            mainLog(`[主进程] 准备写入文件: ${filePath}`);
            mainLog(`[主进程] 文件大小: ${jsonContent.length} 字节`);
            // 写入文件（覆盖模式）
            writeFileSync(filePath, jsonContent, 'utf-8');
            mainLog(`[主进程] 文件写入成功: ${filePath}`);
            // 验证文件是否真的存在
            if (existsSync(filePath)) {
                mainLog(`[主进程] 文件验证通过: ${filePath}`);
            }
            else {
                mainLog(`[主进程] ⚠️ 警告：文件写入后不存在！`, true);
            }
            return { success: true, filePath };
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            mainLog(`[主进程] 保存股票数据失败: ${errorMessage}`, true);
            return { success: false, error: errorMessage };
        }
    });
    // 扫描股票数据目录获取股票列表
    ipcMain.handle('scan-stock-data-directory', async () => {
        try {
            let stockDataDir;
            if (isDev) {
                stockDataDir = join(app.getAppPath(), 'docs', '回测优化', '股票数据');
            }
            else {
                const exeDir = join(app.getPath('exe'), '..');
                stockDataDir = join(exeDir, 'docs', '回测优化', '股票数据');
            }
            mainLog(`[主进程] 扫描目录: ${stockDataDir}`);
            if (!existsSync(stockDataDir)) {
                mainLog(`[主进程] 目录不存在: ${stockDataDir}`);
                return { success: false, stocks: [], error: '目录不存在' };
            }
            const files = readdirSync(stockDataDir);
            const stocks = [];
            for (const file of files) {
                if (file.endsWith('.json')) {
                    try {
                        const filePath = join(stockDataDir, file);
                        const content = readFileSync(filePath, 'utf-8');
                        const stockData = JSON.parse(content);
                        // 从新格式中获取 code 和 name
                        const code = stockData.data?.code;
                        const name = stockData.data?.name;
                        if (code && name) {
                            stocks.push({
                                code,
                                name,
                            });
                        }
                    }
                    catch (error) {
                        mainLog(`[主进程] 读取文件失败: ${file}`, true);
                    }
                }
            }
            // 按名称排序
            stocks.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
            mainLog(`[主进程] 扫描完成，找到 ${stocks.length} 只股票`);
            return { success: true, stocks };
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            mainLog(`[主进程] 扫描目录失败: ${errorMessage}`, true);
            return { success: false, stocks: [], error: errorMessage };
        }
    });
    // 获取股票数据文件路径
    ipcMain.on('get-stock-data-path', (event, filename) => {
        try {
            let stockDataDir;
            if (isDev) {
                stockDataDir = join(app.getAppPath(), 'docs', '回测优化', '股票数据');
            }
            else {
                const exeDir = join(app.getPath('exe'), '..');
                stockDataDir = join(exeDir, 'docs', '回测优化', '股票数据');
            }
            const filePath = join(stockDataDir, filename);
            event.returnValue = existsSync(filePath) ? filePath : undefined;
        }
        catch (error) {
            mainLog(`[主进程] 获取文件路径失败: ${error instanceof Error ? error.message : String(error)}`, true);
            event.returnValue = undefined;
        }
    });
    // 读取股票JSON文件中的日期买点
    ipcMain.handle('read-stock-buy-points', async (_event, filePath) => {
        try {
            if (!existsSync(filePath)) {
                mainLog(`[主进程] 文件不存在: ${filePath}`);
                return [];
            }
            const content = readFileSync(filePath, 'utf-8');
            const stockData = JSON.parse(content);
            // 从新格式中获取买点日期数组
            const dates = stockData.buypointDate || [];
            mainLog(`[主进程] 读取到 ${dates.length} 个日期买点`);
            return dates;
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            mainLog(`[主进程] 读取日期买点失败: ${errorMessage}`, true);
            return [];
        }
    });
    /**
     * 批量导出K线数据
     */
    ipcMain.handle('batch-export-kline-data', async (_event, stocksData) => {
        try {
            mainLog(`[主进程] 开始批量导出 ${stocksData.length} 只股票的K线数据`);
            let stockDataDir;
            if (isDev) {
                stockDataDir = join(app.getAppPath(), 'docs', '回测优化', '股票数据');
            }
            else {
                const exeDir = join(app.getPath('exe'), '..');
                stockDataDir = join(exeDir, 'docs', '回测优化', '股票数据');
            }
            // 确保目录存在
            if (!existsSync(stockDataDir)) {
                mkdirSync(stockDataDir, { recursive: true });
                mainLog(`[主进程] 创建目录: ${stockDataDir}`);
            }
            const results = [];
            for (const stockData of stocksData) {
                try {
                    const filePath = join(stockDataDir, `${stockData.name}.json`);
                    mainLog(`[主进程] 处理股票: ${stockData.name} (${stockData.code})`);
                    // 检查文件是否存在
                    let existingBuypointDate = [];
                    if (existsSync(filePath)) {
                        try {
                            const content = readFileSync(filePath, 'utf-8');
                            const existingData = JSON.parse(content);
                            mainLog(`[主进程] 找到现有文件: ${filePath}`);
                            // 如果已有数据且 buypointDate 不为空数组，则保留原有的 buypointDate
                            if (existingData.buypointDate && existingData.buypointDate.length > 0) {
                                existingBuypointDate = existingData.buypointDate;
                                mainLog(`[主进程] 保留原有的 buypointDate (${existingBuypointDate.length} 个日期)`);
                            }
                        }
                        catch (parseError) {
                            mainLog(`[主进程] 解析现有文件失败: ${parseError}`, true);
                        }
                    }
                    // 构建新的数据结构
                    const newData = {
                        data: {
                            code: stockData.code,
                            name: stockData.name,
                            dailyLines: stockData.klineData,
                            latestQuote: stockData.latestQuote || null,
                            updatedAt: stockData.updatedAt || Date.now(),
                        },
                        industry: stockData.industry || null,
                        buypointDate: existingBuypointDate,
                    };
                    const jsonContent = JSON.stringify(newData, null, 4);
                    writeFileSync(filePath, jsonContent, 'utf-8');
                    mainLog(`[主进程] 成功保存: ${filePath}`);
                    results.push({ code: stockData.code, name: stockData.name, success: true });
                }
                catch (error) {
                    const errorMessage = error instanceof Error ? error.message : String(error);
                    mainLog(`[主进程] 导出股票 ${stockData.name} 失败: ${errorMessage}`, true);
                    results.push({
                        code: stockData.code,
                        name: stockData.name,
                        success: false,
                        error: errorMessage,
                    });
                }
            }
            const successCount = results.filter((r) => r.success).length;
            const failCount = results.filter((r) => !r.success).length;
            mainLog(`[主进程] 批量导出完成: 成功 ${successCount}, 失败 ${failCount}`);
            return {
                success: true,
                results,
                summary: { total: stocksData.length, success: successCount, fail: failCount },
            };
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            mainLog(`[主进程] 批量导出失败: ${errorMessage}`, true);
            return { success: false, error: errorMessage, results: [] };
        }
    });
    /**
     * 分批保存回测信号数据
     */
    ipcMain.handle('batch-save-backtest-signals', async (_event, batches) => {
        try {
            mainLog(`[主进程] 开始分批保存回测信号数据，共 ${batches.length} 个批次`);
            let exportDir;
            if (isDev) {
                exportDir = join(app.getAppPath(), 'docs', '回测优化', '历史回测数据');
            }
            else {
                const exeDir = join(app.getPath('exe'), '..');
                exportDir = join(exeDir, 'docs', '回测优化', '历史回测数据');
            }
            // 确保目录存在
            if (!existsSync(exportDir)) {
                mkdirSync(exportDir, { recursive: true });
                mainLog(`[主进程] 创建导出目录: ${exportDir}`);
            }
            else {
                // 清空目录中的旧文件
                mainLog(`[主进程] 清空历史回测数据目录: ${exportDir}`);
                const files = readdirSync(exportDir);
                let deletedCount = 0;
                for (const file of files) {
                    const filePath = join(exportDir, file);
                    try {
                        unlinkSync(filePath);
                        deletedCount++;
                    }
                    catch (error) {
                        const errorMessage = error instanceof Error ? error.message : String(error);
                        mainLog(`[主进程] 删除文件失败 ${file}: ${errorMessage}`, true);
                    }
                }
                mainLog(`[主进程] 已删除 ${deletedCount} 个旧文件`);
            }
            const results = [];
            for (const batch of batches) {
                try {
                    const filePath = join(exportDir, batch.filename);
                    mainLog(`[主进程] 保存批次文件: ${batch.filename}`);
                    const jsonContent = JSON.stringify(batch.data, null, 2);
                    mainLog(`[主进程] 文件大小: ${jsonContent.length} 字节`);
                    writeFileSync(filePath, jsonContent, 'utf-8');
                    mainLog(`[主进程] 成功保存: ${filePath}`);
                    results.push({ filename: batch.filename, success: true });
                }
                catch (error) {
                    const errorMessage = error instanceof Error ? error.message : String(error);
                    mainLog(`[主进程] 保存批次 ${batch.filename} 失败: ${errorMessage}`, true);
                    results.push({ filename: batch.filename, success: false, error: errorMessage });
                }
            }
            const successCount = results.filter((r) => r.success).length;
            const failCount = results.filter((r) => !r.success).length;
            mainLog(`[主进程] 分批保存完成: 成功 ${successCount}, 失败 ${failCount}`);
            return {
                success: true,
                results,
                summary: { total: batches.length, success: successCount, fail: failCount },
            };
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            mainLog(`[主进程] 分批保存失败: ${errorMessage}`, true);
            return { success: false, error: errorMessage, results: [] };
        }
    });
}
// 应用准备就绪
app.whenReady().then(async () => {
    mainLog('[主进程] 应用准备就绪');
    // 初始化代理 session（必须在 app.ready 之后）
    initProxySession();
    if (process.platform === 'win32') {
        app.setAppUserModelId('com.stock.client');
    }
    // 设置IPC处理器
    setupIpcHandlers();
    // 开发/打包均启动本地 proxy，渲染进程与 npm run dev 一致走 127.0.0.1:3000，不依赖 webRequest 改直连域名
    lastProxyStartupMessage = '';
    try {
        await startProxyServer();
        lastProxyStartupMessage = '本地代理已就绪 (127.0.0.1:3000)';
        mainLog(`[主进程] ${lastProxyStartupMessage}`);
    }
    catch (e) {
        const errText = e instanceof Error ? e.message : String(e);
        lastProxyStartupMessage = `本地代理未启动: ${errText}`;
        mainLog(`[主进程] ${lastProxyStartupMessage}（新浪/腾讯接口可能失败）`, true);
    }
    if (!isDev) {
        setupRequestInterceptor();
    }
    createWindow();
    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});
// 所有窗口关闭时
app.on('window-all-closed', () => {
    // 在macOS上，除非用户用Cmd + Q确定地退出，否则绝大部分应用及其菜单栏会保持激活
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
// 应用退出前清理
app.on('before-quit', () => {
    if (tray) {
        tray.destroy();
    }
    // 关闭代理服务器
    if (proxyServer) {
        mainLog('[主进程] 关闭内嵌代理');
        stopEmbeddedApiProxy(proxyServer);
        proxyServer = null;
    }
});
