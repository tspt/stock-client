import { app, BrowserWindow, Tray, Menu, nativeImage, session } from 'electron';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

// 开发环境判断
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let proxyServer: ReturnType<typeof spawn> | null = null;

// 配置请求拦截，解决403和CORS问题
function setupRequestInterceptor() {
  console.log('[主进程] 设置defaultSession请求拦截器');

  const defaultUserAgent =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

  // 拦截新浪财经API请求 - 修改请求头
  // 使用更宽泛的URL匹配模式
  session.defaultSession.webRequest.onBeforeSendHeaders(
    {
      urls: ['*://*.sinajs.cn/*', '*://hq.sinajs.cn/*'],
    },
    (details, callback) => {
      console.log('[defaultSession拦截器] 拦截新浪API请求:', details.url);
      console.log('[defaultSession拦截器] 原始Referer:', details.requestHeaders['Referer']);

      details.requestHeaders['Referer'] = 'https://finance.sina.com.cn';
      details.requestHeaders['Origin'] = 'https://finance.sina.com.cn';
      details.requestHeaders['User-Agent'] = defaultUserAgent;

      console.log('[defaultSession拦截器] 修改后的Referer:', details.requestHeaders['Referer']);

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
      details.requestHeaders['Referer'] = 'https://finance.qq.com';
      details.requestHeaders['Origin'] = 'https://finance.qq.com';
      details.requestHeaders['User-Agent'] = defaultUserAgent;

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
        console.log('[defaultSession全局拦截器] 当前Referer:', details.requestHeaders['Referer']);
      }
      callback({ requestHeaders: details.requestHeaders });
    }
  );

  console.log('[主进程] defaultSession拦截器设置完成');
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      // 开发环境可以禁用webSecurity以解决CORS问题
      // 生产环境建议使用请求拦截方式
      webSecurity: !isDev,
    },
  });

  // 为窗口的session设置请求拦截（重要：必须在窗口创建后设置）
  setupWindowRequestInterceptor(mainWindow.webContents.session);

  // 加载应用
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(join(__dirname, '../dist/index.html'));
  }

  // 确保在窗口加载完成后拦截器已设置
  mainWindow.webContents.on('did-finish-load', () => {
    console.log('[主进程] 窗口加载完成，拦截器已设置');
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
  const defaultUserAgent =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

  console.log('[主进程] 开始设置窗口请求拦截器');

  // 使用更宽泛的URL匹配 - 拦截所有包含sinajs.cn的请求
  webSession.webRequest.onBeforeSendHeaders(
    {
      urls: ['*://*.sinajs.cn/*', '*://hq.sinajs.cn/*'],
    },
    (details, callback) => {
      console.log('[窗口拦截器] 拦截新浪API请求:', details.url);
      console.log('[窗口拦截器] 原始Referer:', details.requestHeaders['Referer']);

      details.requestHeaders['Referer'] = 'https://finance.sina.com.cn';
      details.requestHeaders['Origin'] = 'https://finance.sina.com.cn';
      details.requestHeaders['User-Agent'] = defaultUserAgent;

      console.log('[窗口拦截器] 修改后的Referer:', details.requestHeaders['Referer']);

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
      details.requestHeaders['Referer'] = 'https://finance.qq.com';
      details.requestHeaders['Origin'] = 'https://finance.qq.com';
      details.requestHeaders['User-Agent'] = defaultUserAgent;

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
        console.log('[全局调试] Referer:', details.requestHeaders['Referer']);
        console.log('[全局调试] Origin:', details.requestHeaders['Origin']);
      }
      callback({ requestHeaders: details.requestHeaders });
    }
  );

  console.log('[主进程] 窗口请求拦截器设置完成');
}

function createTray() {
  // 创建托盘图标（暂时使用空图标，后续可以添加图标文件）
  const icon = nativeImage.createEmpty();
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

// 启动代理服务器
function startProxyServer() {
  if (proxyServer) {
    return; // 已经启动
  }

  const proxyPath = join(__dirname, '../server/proxy.js');
  console.log('[主进程] 启动代理服务器:', proxyPath);

  proxyServer = spawn('node', [proxyPath], {
    cwd: join(__dirname, '..'),
    stdio: 'inherit',
  });

  proxyServer.on('error', (err) => {
    console.error('[主进程] 代理服务器启动失败:', err);
  });

  proxyServer.on('exit', (code) => {
    console.log(`[主进程] 代理服务器退出，代码: ${code}`);
    proxyServer = null;
  });
}

// 应用准备就绪
app.whenReady().then(() => {
  console.log('[主进程] 应用准备就绪');

  // 开发环境启动代理服务器
  if (isDev) {
    startProxyServer();
  } else {
    // 生产环境使用请求拦截
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
    console.log('[主进程] 关闭代理服务器');
    proxyServer.kill();
    proxyServer = null;
  }
});
