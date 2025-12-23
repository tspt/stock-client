# 破忒头工具桌面应用

基于 Electron + React + TypeScript 开发的破忒头工具桌面应用，提供全面的股票管理和分析功能。

## 功能特性

### 核心功能
- 📊 股票列表管理（自选股）
- 📈 K 线图展示（分时图、日 K、周 K、月 K、年 K）
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
├── electron/              # Electron主进程代码
│   ├── main.ts           # 主进程入口
│   ├── preload.ts        # 预加载脚本
│   └── tsconfig.json     # Electron TS配置
├── src/                   # React应用源码
│   ├── components/        # 组件
│   │   ├── SearchBar/    # 搜索栏
│   │   ├── StockList/    # 股票列表
│   │   ├── KLineChart/   # K线图
│   │   ├── ThemeToggle/  # 主题切换
│   │   ├── GroupManager/ # 分组管理
│   │   ├── GroupTabs/    # 分组标签
│   │   ├── OpportunityTable/ # 机会分析表格
│   │   ├── OverviewColumnSettings/ # 概况列设置
│   │   ├── OverviewTable/ # 概况表格
│   │   └── StockGroupSelector/ # 股票分组选择器
│   ├── pages/            # 页面
│   │   ├── ListPage/     # 列表页
│   │   ├── DetailPage/   # 详情页
│   │   ├── AlertPage/    # 提醒管理
│   │   ├── OverviewPage/ # 数据概况
│   │   └── OpportunityPage/ # 机会分析
│   ├── services/         # API服务
│   │   ├── stockApi.ts   # 股票数据API
│   │   ├── notificationService.ts # 通知服务
│   │   ├── opportunityService.ts # 机会分析服务
│   │   └── overviewService.ts # 概况服务
│   ├── hooks/            # 自定义Hooks
│   │   ├── usePolling.ts      # 轮询Hook
│   │   ├── useStockList.ts    # 股票列表Hook
│   │   ├── useKLineData.ts    # K线数据Hook
│   │   ├── useTheme.ts        # 主题Hook
│   │   ├── useStockDetail.ts  # 股票详情Hook
│   │   └── useAllStocks.ts    # 全量股票Hook
│   ├── stores/           # 状态管理
│   │   ├── stockStore.ts     # 股票数据Store
│   │   ├── themeStore.ts     # 主题Store
│   │   ├── alertStore.ts     # 提醒Store
│   │   ├── opportunityStore.ts # 机会分析Store
│   │   └── overviewStore.ts   # 概况Store
│   ├── utils/            # 工具函数
│   │   ├── storage.ts           # LocalStorage封装
│   │   ├── indexedDB.ts         # IndexedDB封装
│   │   ├── opportunityIndexedDB.ts # 机会分析DB
│   │   ├── format.ts            # 数据格式化
│   │   ├── indicators.ts        # 技术指标计算
│   │   ├── constants.ts         # 常量定义
│   │   ├── exportUtils.ts       # 数据导出工具
│   │   ├── opportunityExportUtils.ts # 机会导出工具
│   │   ├── groupUtils.ts        # 分组工具
│   │   └── concurrencyManager.ts # 并发管理
│   ├── types/            # 类型定义
│   │   └── stock.ts      # 股票相关类型
│   ├── App.tsx           # 主应用组件
│   └── main.tsx          # 应用入口
├── public/               # 静态资源
└── index.html            # HTML模板
```

## 使用说明

### 基础操作
1. **添加自选股**：在搜索栏输入股票代码或名称，选择后自动添加到列表
2. **查看 K 线图**：点击列表中的股票，进入详情页查看 K 线图
3. **切换周期**：在详情页点击"分时"、"日 K"、"周 K"、"月 K"、"年 K"按钮切换
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
- **懒加载**：非关键组件延迟加载，提高应用启动速度

## 注意事项

1. **图标文件**：打包时需要提供 `build/icon.ico` 图标文件
2. **跨域配置**：已在 Electron 环境中配置了适当的 Referer 头，解决跨域问题
3. **API 限制**：使用第三方 API 可能存在访问频率限制

## 待优化功能

- [ ] 真实 API 接口集成
- [ ] 自动更新功能完善
- [ ] 系统托盘图标
- [ ] 更多技术指标支持
- [ ] 自定义技术指标功能
- [ ] 历史数据批量导入
- [ ] 多账户支持
