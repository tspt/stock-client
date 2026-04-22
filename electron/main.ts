// ⚠️ dotenv 必须在所有其他导入之前加载，确保环境变量可用
import dotenv from 'dotenv';
import { resolve } from 'path';
const envPath = resolve(process.cwd(), '.env');
const dotEnvResult = dotenv.config({ path: envPath });
if (dotEnvResult.error) {
  console.error('[主进程] 环境变量加载失败:', dotEnvResult.error);
} else {
  console.log('[主进程] 环境变量加载成功，已加载的变量:', Object.keys(dotEnvResult.parsed || {}));
}

import {
  app,
  BrowserWindow,
  Tray,
  Menu,
  nativeImage,
  session,
  ipcMain,
  Notification,
} from 'electron';
import { join } from 'path';
import { fileURLToPath } from 'url';
import type { Server as HttpServer } from 'http';
import { existsSync, appendFileSync } from 'fs';
import { startEmbeddedApiProxy, stopEmbeddedApiProxy } from './localApiProxy.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

// 开发环境判断
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

/** 应用窗口/托盘用的图标（开发：项目根下 build；打包：app.asar 内 build） */
function getAppIconPath(): string | undefined {
  const relativeToApp = join('build', 'icon.ico');
  const iconPath = app.isPackaged
    ? join(app.getAppPath(), relativeToApp)
    : join(process.cwd(), relativeToApp);
  return existsSync(iconPath) ? iconPath : undefined;
}

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let proxyServer: HttpServer | null = null;

/** 供 did-finish-load 注入到渲染进程控制台；主进程 console 不会出现在 F12 里 */
let lastProxyStartupMessage = '';

function mainLog(msg: string, isError = false) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  try {
    appendFileSync(join(app.getPath('userData'), 'main-debug.log'), line, 'utf8');
  } catch {
    // ignore
  }
  if (isError) console.error(msg);
  else console.log(msg);
}

// 配置请求拦截，解决403和CORS问题
function setupRequestInterceptor() {
  console.log('[主进程] 设置defaultSession请求拦截器');

  const defaultUserAgent = process.env.VITE_USER_AGENT!;

  // 拦截新浪财经API请求 - 修改请求头
  // 使用更宽泛的URL匹配模式
  session.defaultSession.webRequest.onBeforeSendHeaders(
    {
      urls: ['*://*.sinajs.cn/*', '*://hq.sinajs.cn/*'],
    },
    (details, callback) => {
      console.log('[defaultSession拦截器] 拦截新浪API请求:', details.url);
      console.log('[defaultSession拦截器] 原始Referer:', details.requestHeaders['referer']);

      // Electron 文档：requestHeaders 的键一律为小写，用大写键不会覆盖实际发出的 referer，易导致新浪 403
      details.requestHeaders['referer'] = process.env.VITE_SINA_REFERER!;
      details.requestHeaders['origin'] = process.env.VITE_SINA_ORIGIN!;
      details.requestHeaders['user-agent'] = defaultUserAgent;
      details.requestHeaders['accept'] = process.env.VITE_ACCEPT!;
      details.requestHeaders['accept-language'] = process.env.VITE_ACCEPT_LANGUAGE!;

      console.log('[defaultSession拦截器] 修改后的Referer:', details.requestHeaders['referer']);

      callback({
        requestHeaders: details.requestHeaders,
      });
    }
  );

  // 拦截新浪财经API响应 - 添加CORS头
  session.defaultSession.webRequest.onHeadersReceived(
    {
      urls: [
        'https://hq.sinajs.cn/*',
        'https://*.sinajs.cn/*',
        'http://hq.sinajs.cn/*',
        'http://*.sinajs.cn/*',
      ],
    },
    (details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Access-Control-Allow-Origin': ['*'],
          'Access-Control-Allow-Methods': ['GET', 'POST', 'OPTIONS'],
          'Access-Control-Allow-Headers': ['*'],
        },
      });
    }
  );

  // 拦截腾讯财经API请求 - 修改请求头
  session.defaultSession.webRequest.onBeforeSendHeaders(
    {
      urls: [
        'https://qt.gtimg.cn/*',
        'https://*.gtimg.cn/*',
        'http://qt.gtimg.cn/*',
        'http://*.gtimg.cn/*',
      ],
    },
    (details, callback) => {
      console.log('[拦截器] 拦截腾讯API请求:', details.url);
      details.requestHeaders['referer'] = process.env.VITE_TENCENT_REFERER!;
      details.requestHeaders['origin'] = process.env.VITE_TENCENT_ORIGIN!;
      details.requestHeaders['user-agent'] = defaultUserAgent;
      details.requestHeaders['accept'] = process.env.VITE_ACCEPT!;
      details.requestHeaders['accept-language'] = process.env.VITE_ACCEPT_LANGUAGE!;

      callback({
        requestHeaders: details.requestHeaders,
      });
    }
  );

  // 拦截腾讯财经API响应 - 添加CORS头
  session.defaultSession.webRequest.onHeadersReceived(
    {
      urls: [
        'https://qt.gtimg.cn/*',
        'https://*.gtimg.cn/*',
        'http://qt.gtimg.cn/*',
        'http://*.gtimg.cn/*',
      ],
    },
    (details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Access-Control-Allow-Origin': ['*'],
          'Access-Control-Allow-Methods': ['GET', 'POST', 'OPTIONS'],
          'Access-Control-Allow-Headers': ['*'],
        },
      });
    }
  );

  // 添加全局拦截器用于调试（拦截所有请求）
  session.defaultSession.webRequest.onBeforeSendHeaders(
    {
      urls: ['<all_urls>'],
    },
    (details, callback) => {
      // 只处理目标API的请求
      if (details.url.includes('sinajs.cn') || details.url.includes('gtimg.cn')) {
        console.log('[defaultSession全局拦截器] 检测到API请求:', details.url);
        console.log('[defaultSession全局拦截器] 当前Referer:', details.requestHeaders['referer']);
      }
      callback({ requestHeaders: details.requestHeaders });
    }
  );

  console.log('[主进程] defaultSession拦截器设置完成');
}

function createWindow() {
  // preload 脚本路径配置
  // 源代码：electron/preload.ts
  // 编译后：dist-electron/preload.js
  // 运行时：main.js 在 dist-electron 目录，所以 __dirname 指向 dist-electron
  // 因此 preload.js 应该在同一个目录（__dirname）
  const preloadPath = resolve(__dirname, 'preload.js');

  console.log('[主进程] ========== Preload 脚本配置 ==========');
  console.log('[主进程] 源代码位置: electron/preload.ts');
  console.log('[主进程] 编译后位置: dist-electron/preload.js');
  console.log('[主进程] 运行时 __dirname:', __dirname);
  console.log('[主进程] 计算的 preload 路径:', preloadPath);
  console.log('[主进程] 文件是否存在:', existsSync(preloadPath));
  console.log('[主进程] ======================================');

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
  } else {
    console.log('[主进程] ✓ Preload 文件找到，路径正确');
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
  } else {
    mainWindow.loadFile(join(__dirname, '../dist/index.html'));
  }

  // 监听 preload 脚本加载错误
  mainWindow.webContents.on('preload-error', (_event, _preloadPath, error) => {
    console.error('[主进程] Preload 脚本加载错误:', error);
    console.error('[主进程] Preload 路径:', _preloadPath);
  });

  // 确保在窗口加载完成后拦截器已设置
  mainWindow.webContents.on('did-finish-load', () => {
    console.log('[主进程] 窗口加载完成，拦截器已设置');
    if (mainWindow && lastProxyStartupMessage) {
      const logPath = join(app.getPath('userData'), 'main-debug.log');
      mainWindow.webContents
        .executeJavaScript(
          `console.log('%c[主进程→渲染控制台]','color:#fa8c16;font-weight:bold', ${JSON.stringify(
            lastProxyStartupMessage
          )}); console.log('主进程日志文件(持续追加):', ${JSON.stringify(logPath)})`
        )
        .catch(() => {});
    }
    // 检查 preload 脚本是否成功加载
    if (mainWindow) {
      // 延迟一下，确保 preload 脚本已执行
      setTimeout(() => {
        if (mainWindow) {
          mainWindow.webContents
            .executeJavaScript(
              `
            console.log('[渲染进程检查] window.electronAPI:', typeof window.electronAPI !== 'undefined' ? '已加载' : '未找到');
            console.log('[渲染进程检查] window keys:', Object.keys(window).filter(k => k.includes('electron') || k.includes('Electron')));
            if (typeof window.electronAPI !== 'undefined') {
              console.log('[渲染进程检查] electronAPI 方法:', Object.keys(window.electronAPI));
            }
          `
            )
            .then((result) => {
              console.log('[主进程] 渲染进程检查结果:', result);
            })
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
function setupWindowRequestInterceptor(webSession: Electron.Session) {
  const defaultUserAgent = process.env.VITE_USER_AGENT!;

  console.log('[主进程] 开始设置窗口请求拦截器');

  // 使用更宽泛的URL匹配 - 拦截所有包含sinajs.cn的请求
  webSession.webRequest.onBeforeSendHeaders(
    {
      urls: ['*://*.sinajs.cn/*', '*://hq.sinajs.cn/*'],
    },
    (details, callback) => {
      console.log('[窗口拦截器] 拦截新浪API请求:', details.url);
      console.log('[窗口拦截器] 原始Referer:', details.requestHeaders['referer']);

      details.requestHeaders['referer'] = process.env.VITE_SINA_REFERER!;
      details.requestHeaders['origin'] = process.env.VITE_SINA_ORIGIN!;
      details.requestHeaders['user-agent'] = defaultUserAgent;
      details.requestHeaders['accept'] = process.env.VITE_ACCEPT!;
      details.requestHeaders['accept-language'] = process.env.VITE_ACCEPT_LANGUAGE!;

      console.log('[窗口拦截器] 修改后的Referer:', details.requestHeaders['referer']);

      callback({
        requestHeaders: details.requestHeaders,
      });
    }
  );

  // 拦截新浪财经API响应 - 添加CORS头
  webSession.webRequest.onHeadersReceived(
    {
      urls: ['*://*.sinajs.cn/*', '*://hq.sinajs.cn/*'],
    },
    (details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Access-Control-Allow-Origin': ['*'],
          'Access-Control-Allow-Methods': ['GET', 'POST', 'OPTIONS'],
          'Access-Control-Allow-Headers': ['*'],
        },
      });
    }
  );

  // 拦截腾讯财经API请求 - 修改请求头
  webSession.webRequest.onBeforeSendHeaders(
    {
      urls: ['*://*.gtimg.cn/*', '*://qt.gtimg.cn/*'],
    },
    (details, callback) => {
      console.log('[窗口拦截器] 拦截腾讯API请求:', details.url);
      details.requestHeaders['referer'] = process.env.VITE_TENCENT_REFERER!;
      details.requestHeaders['origin'] = process.env.VITE_TENCENT_ORIGIN!;
      details.requestHeaders['user-agent'] = defaultUserAgent;
      details.requestHeaders['accept'] = process.env.VITE_ACCEPT!;
      details.requestHeaders['accept-language'] = process.env.VITE_ACCEPT_LANGUAGE!;

      callback({
        requestHeaders: details.requestHeaders,
      });
    }
  );

  // 拦截腾讯财经API响应 - 添加CORS头
  webSession.webRequest.onHeadersReceived(
    {
      urls: ['*://*.gtimg.cn/*', '*://qt.gtimg.cn/*'],
    },
    (details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Access-Control-Allow-Origin': ['*'],
          'Access-Control-Allow-Methods': ['GET', 'POST', 'OPTIONS'],
          'Access-Control-Allow-Headers': ['*'],
        },
      });
    }
  );

  // 添加一个全局拦截器用于调试 - 拦截所有请求
  webSession.webRequest.onBeforeSendHeaders(
    {
      urls: ['<all_urls>'],
    },
    (details, callback) => {
      if (details.url.includes('sinajs.cn') || details.url.includes('gtimg.cn')) {
        console.log('[全局调试] URL:', details.url);
        console.log('[全局调试] Referer:', details.requestHeaders['referer']);
        console.log('[全局调试] Origin:', details.requestHeaders['origin']);
      }
      callback({ requestHeaders: details.requestHeaders });
    }
  );

  console.log('[主进程] 窗口请求拦截器设置完成');
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
      } else {
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
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    const hint =
      err.code === 'EADDRINUSE'
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
  ipcMain.handle(
    'show-tray-notification',
    (_event, options: { title: string; body: string; code?: string }) => {
      console.log('[主进程] 收到系统托盘通知请求:', options);

      if (!tray) {
        console.warn('[主进程] 系统托盘不存在，无法发送托盘通知');
        return;
      }

      // Windows系统托盘通知 - 统一使用系统通知API
      if (Notification.isSupported()) {
        console.log('[主进程] 创建系统通知');
        const notification = new Notification({
          title: options.title,
          body: options.body,
          silent: false,
        });

        notification.on('click', () => {
          console.log('[主进程] 通知被点击');
          if (mainWindow && options.code) {
            mainWindow.show();
            mainWindow.focus();
            // 发送消息到渲染进程，跳转到股票详情
            mainWindow.webContents.send('navigate-to-stock', options.code);
          }
        });

        notification.on('show', () => {
          console.log('[主进程] 系统通知已显示');
        });

        notification.show();
        console.log('[主进程] 已调用 notification.show()');
      } else {
        console.warn('[主进程] 系统不支持通知 API');
        // 降级方案：使用托盘工具提示（仅Windows）
        if (process.platform === 'win32' && tray) {
          try {
            tray.displayBalloon({
              title: options.title,
              content: options.body,
              icon: nativeImage.createEmpty(),
            });
            console.log('[主进程] 已使用托盘工具提示');
          } catch (error) {
            console.error('[主进程] 托盘工具提示失败:', error);
          }
        }
      }
    }
  );

  // 显示桌面通知
  ipcMain.handle(
    'show-desktop-notification',
    (_event, options: { title: string; body: string; code?: string }) => {
      console.log('[主进程] 收到桌面通知请求:', options);

      if (!Notification.isSupported()) {
        console.warn('[主进程] 系统不支持桌面通知');
        return;
      }

      console.log('[主进程] 创建桌面通知');
      const notification = new Notification({
        title: options.title,
        body: options.body,
        silent: false,
      });

      notification.on('click', () => {
        console.log('[主进程] 桌面通知被点击');
        if (mainWindow && options.code) {
          mainWindow.show();
          mainWindow.focus();
          // 发送消息到渲染进程，跳转到股票详情
          mainWindow.webContents.send('navigate-to-stock', options.code);
        }
      });

      notification.on('show', () => {
        console.log('[主进程] 桌面通知已显示');
      });

      notification.show();
      console.log('[主进程] 已调用桌面通知 notification.show()');
    }
  );

  // 自动获取东方财富Cookie
  ipcMain.handle('fetch-cookies', async (event, count: number) => {
    try {
      mainLog(`[主进程] 收到获取Cookie请求，数量: ${count}`);
      const { autoFetchCookies } = await import('./cookieFetcher.js');

      // 获取发送请求的窗口
      const mainWindow = BrowserWindow.fromWebContents(event.sender);

      const cookies = await autoFetchCookies(count, mainWindow);
      mainLog(`[主进程] 成功获取 ${cookies.length} 个Cookie`);
      return { success: true, cookies };
    } catch (error) {
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
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      mainLog(`[主进程] 取消失败: ${errorMessage}`, true);
      return { success: false, error: errorMessage };
    }
  });
}

// 应用准备就绪
app.whenReady().then(async () => {
  mainLog('[主进程] 应用准备就绪');

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
  } catch (e) {
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
