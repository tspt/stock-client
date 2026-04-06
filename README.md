# 破忒头工具桌面应用

基于 Electron + React + TypeScript 开发的破忒头工具桌面应用，提供全面的股票管理和分析功能。

## 功能特性

### 核心功能
- 📊 股票列表管理（自选股）
- 📈 K 线图展示（详情页支持 **日 / 周 / 月 / 年** 周期切换；数据层支持更多周期类型，界面未提供分时按钮）
- 🔍 股票搜索功能（支持代码和名称搜索）
- 📱 实时行情更新（10 秒轮询）
- 🎨 深色/浅色主题切换
- 💾 本地数据存储（LocalStorage + IndexedDB）
- 📊 技术指标（MA、MACD、KDJ、RSI）
- 🔄 列表排序（涨幅、跌幅、默认）

### 高级功能
- 🔔 **提醒管理**：设置股票价格提醒，实时监控价格变动
- 📊 **列表数据概况**：统计分析股票列表的各项指标，提供整体市场视图
- 📈 **机会分析**：基于技术指标筛选潜在投资机会
- 🏷️ **分组管理**：支持股票分组，灵活管理不同投资策略
- 💾 **数据导出**：支持将股票数据导出为可编辑格式

## 技术栈

- **前端框架**: React 18 + TypeScript
- **构建工具**: Vite
- **UI 组件库**: Ant Design 5
- **图表库**: ECharts
- **桌面框架**: Electron
- **状态管理**: Zustand
- **数据源**: 新浪财经/腾讯财经 API（真实数据源已集成）

## 开发

```bash
# 安装依赖
npm install

# 开发模式（同时启动Vite和Electron）
npm run electron:dev

# 仅启动Vite开发服务器
npm run dev

# 构建前端
npm run build

# 构建Electron主进程
npm run build:electron

# 打包Electron应用（Windows）
npm run electron:build:win
```

## 项目结构

```
stockClient/
├── docs/                    # 专题文档（见下文「文档索引」）
├── electron/                # Electron 主进程与预加载
│   ├── main.ts              # 主进程入口
│   ├── preload.ts           # 预加载脚本
│   ├── tsconfig.json
│   └── tsconfig.preload.json
├── public/                  # 静态资源
├── server/
│   └── proxy.js             # 开发环境 API 代理（npm run proxy）
├── src/
│   ├── App.tsx              # 根布局（左侧主 Tab、懒加载页面）
│   ├── App.module.css
│   ├── main.tsx             # React 入口
│   ├── vite-env.d.ts        # Vite 类型声明
│   ├── components/          # UI 组件（各目录含 .tsx / .module.css 等）
│   │   ├── ColumnSettings/       # 通用列设置
│   │   ├── GroupManager/         # 分组管理弹层
│   │   ├── GroupTabs/            # 分组标签栏
│   │   ├── KLineChart/           # K 线图（ECharts）
│   │   ├── OpportunityTable/     # 机会分析结果表
│   │   ├── OverviewColumnSettings/ # 数据概况专用列设置
│   │   ├── OverviewTable/        # 数据概况表格
│   │   ├── PriceAlert/           # 价格提醒设置（AlertSettingModal）
│   │   ├── SearchBar/            # 股票搜索
│   │   ├── StockGroupSelector/   # 分组选择器
│   │   ├── StockList/            # 自选股列表
│   │   └── ThemeToggle/          # 主题切换
│   ├── pages/
│   │   ├── ListPage/
│   │   │   ├── ListPage.tsx
│   │   │   └── ListPage.module.css
│   │   ├── DetailPage/
│   │   │   ├── DetailPage.tsx
│   │   │   └── DetailPage.module.css
│   │   ├── AlertPage/
│   │   │   ├── AlertPage.tsx
│   │   │   └── AlertPage.module.css
│   │   ├── OverviewPage/
│   │   │   ├── OverviewPage.tsx
│   │   │   └── OverviewPage.module.css
│   │   └── OpportunityPage/
│   │       ├── OpportunityPage.tsx
│   │       ├── OpportunityPage.module.css
│   │       └── OpportunityFiltersPanel.tsx   # 筛选条件侧栏
│   ├── workers/             # Web Worker
│   │   ├── opportunityFilterWorker.ts
│   │   └── opportunityFilterWorkerTypes.ts
│   ├── services/            # 接口与桌面通知桥接
│   │   ├── stockApi.ts
│   │   ├── notificationService.ts    # 系统/托盘通知发送
│   │   ├── notificationNavigation.ts # 通知点击跳转回股票 Tab
│   │   ├── opportunityService.ts
│   │   └── overviewService.ts
│   ├── hooks/
│   │   ├── usePolling.ts
│   │   ├── useStockList.ts
│   │   ├── useKLineData.ts
│   │   ├── useTheme.ts
│   │   ├── useStockDetail.ts
│   │   ├── useAllStocks.ts
│   │   └── useOpportunityFilterEngine.ts  # 机会筛选与 Worker 协作
│   ├── stores/
│   │   ├── stockStore.ts
│   │   ├── themeStore.ts
│   │   ├── alertStore.ts
│   │   ├── opportunityStore.ts
│   │   └── overviewStore.ts
│   ├── utils/
│   │   ├── storage.ts
│   │   ├── indexedDB.ts
│   │   ├── opportunityIndexedDB.ts
│   │   ├── format.ts
│   │   ├── indicators.ts
│   │   ├── constants.ts
│   │   ├── exportUtils.ts
│   │   ├── opportunityExportUtils.ts
│   │   ├── stockNamesExportUtils.ts    # 股票名称等导出辅助
│   │   ├── opportunityFilterPrefs.ts
│   │   ├── trendLineAnalysis.ts
│   │   ├── consolidationAnalysis.ts
│   │   ├── sharpMovePatterns.ts
│   │   ├── groupUtils.ts
│   │   └── concurrencyManager.ts
│   └── types/
│       ├── stock.ts
│       ├── common.ts
│       └── opportunityFilter.ts
├── index.html
├── package.json
├── tsconfig.json
├── tsconfig.node.json
├── vite.config.ts
└── .eslintrc.json           # ESLint 配置
```

### 构建产物与资源目录

以下目录由构建或打包命令生成，**已写入 `.gitignore`，一般不要提交到仓库**：

| 目录 | 说明 |
|------|------|
| `dist/` | 运行 `npm run build` 时 Vite 输出的前端静态资源 |
| `dist-electron/` | 运行 `npm run build:electron` 时编译得到的 Electron 主进程、`preload` 脚本（`.js`） |
| `release/` | 运行 `electron:build` / `electron:build:win` 时 `electron-builder` 生成的安装包输出目录（与 `package.json` 中 `build.directories.output` 一致） |

打包所需的 **图标等静态资源** 放在仓库中的 **`build/`** 目录（例如 `build/icon.ico`），与上述生成目录不同，**需自行维护并建议纳入版本控制**；若本地尚未添加图标，打包前请补齐（见下文「注意事项」）。

## 使用说明

### 基础操作
1. **添加自选股**：在搜索栏输入股票代码或名称，选择后自动添加到列表
2. **查看 K 线图**：点击列表中的股票，进入详情页查看 K 线图
3. **切换 K 线周期**：在详情页点击 **日 / 周 / 月 / 年** 按钮切换
4. **排序**：在列表页点击"排序"按钮，选择排序方式
5. **删除股票**：在列表项右侧点击"删除"按钮
6. **切换主题**：点击右上角主题切换按钮

### 高级操作
1. **设置提醒**：进入"提醒管理"标签，设置股票价格提醒条件
2. **查看数据概况**：进入"列表数据概况"标签，查看股票列表的统计分析
3. **寻找投资机会**：进入"机会分析"标签，基于技术指标筛选股票
4. **管理分组**：使用分组功能，将股票按照不同策略进行分类管理
5. **导出数据**：使用导出功能，将需要的数据导出为可编辑格式

## 技术实现说明

### 数据来源
- **真实 API 集成**：已接入新浪财经和腾讯财经 API，提供实时行情数据
- **API 代理**：开发环境使用本地代理解决跨域问题，生产环境直接请求

### 数据存储
- **LocalStorage**：存储用户配置、主题偏好等轻量数据
- **IndexedDB**：存储历史数据、分析结果等大量数据，优化数据缓存

### 性能优化
- **并发控制**：使用并发管理器限制 API 请求频率
- **数据缓存**：对 API 响应进行缓存，减少重复请求
- **懒加载**：页面级 `lazy` + `Suspense`，非当前主 Tab 内容可通过 `destroyOnHidden` 卸载，减轻后台轮询与内存占用
- **机会分析筛选**：价格/市值/换手/市盈/KDJ 等在主线程先做轻量过滤；依赖 K 线的横盘、趋势线、急跌急涨、涨跌停统计等在 **Web Worker** 中计算，避免拖慢 UI；筛选条件变更 **300ms 防抖**；K 线缓存以全量或增量消息同步至 Worker，并与 `MAX_OPPORTUNITY_KLINE_CACHE_ENTRIES` 上限对齐截断
- **机会分析（算法侧）**：趋势线等指标在工具函数中单次预计算（如 MA5 数组），避免滑动窗口内重复求和

### 文档索引（`docs/`）

| 文档 | 说明 |
|------|------|
| [横盘分析参数说明](docs/横盘分析参数说明.md) | 横盘判定参数、组合建议与常见问题 |
| [趋势线分析说明](docs/趋势线分析说明.md) | 趋势线规则、M/N 含义、页面数据流与实现要点 |
| [机会分析缓存与筛选](docs/机会分析缓存与筛选.md) | IndexedDB 与筛选偏好、纯前端筛选范围 |
| [API 代理说明](docs/api-proxy-solutions.md) | 开发环境跨域与代理方案 |

## 注意事项

1. **图标文件**：打包时需要提供 `build/icon.ico` 图标文件
2. **跨域配置**：已在 Electron 环境中配置了适当的 Referer 头，解决跨域问题
3. **API 限制**：使用第三方 API 可能存在访问频率限制

## 待优化功能

- [ ] 自动更新功能完善
- [ ] 系统托盘图标
- [ ] 更多技术指标支持
- [ ] 自定义技术指标功能
- [ ] 历史数据批量导入
- [ ] 多账户支持
