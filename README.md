# 破忒头工具桌面应用

基于 Electron + React + TypeScript 开发的破忒头工具桌面应用。

## 功能特性

- 📊 股票列表管理（自选股）
- 📈 K 线图展示（分时图、日 K、周 K、月 K、年 K）
- 🔍 股票搜索功能（支持代码和名称搜索）
- 📱 实时行情更新（10 秒轮询）
- 🎨 深色/浅色主题切换
- 💾 本地数据存储（LocalStorage）
- 📊 技术指标（MA、MACD、KDJ、RSI）
- 🔄 列表排序（涨幅、跌幅、默认）

## 技术栈

- **前端框架**: React 18 + TypeScript
- **构建工具**: Vite
- **UI 组件库**: Ant Design 5
- **图表库**: ECharts
- **桌面框架**: Electron
- **状态管理**: Zustand
- **数据源**: 新浪财经/腾讯财经 API

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
│   │   └── ThemeToggle/  # 主题切换
│   ├── pages/            # 页面
│   │   ├── ListPage/     # 列表页
│   │   └── DetailPage/   # 详情页
│   ├── services/         # API服务
│   │   └── stockApi.ts   # 股票数据API
│   ├── hooks/            # 自定义Hooks
│   │   ├── usePolling.ts      # 轮询Hook
│   │   ├── useStockList.ts    # 股票列表Hook
│   │   ├── useKLineData.ts    # K线数据Hook
│   │   └── useTheme.ts        # 主题Hook
│   ├── stores/           # 状态管理
│   │   ├── stockStore.ts # 股票数据Store
│   │   └── themeStore.ts # 主题Store
│   ├── utils/            # 工具函数
│   │   ├── storage.ts    # LocalStorage封装
│   │   ├── format.ts     # 数据格式化
│   │   ├── indicators.ts # 技术指标计算
│   │   └── constants.ts  # 常量定义
│   ├── types/            # 类型定义
│   │   └── stock.ts      # 股票相关类型
│   ├── App.tsx           # 主应用组件
│   └── main.tsx          # 应用入口
├── public/               # 静态资源
└── index.html            # HTML模板
```

## 使用说明

1. **添加自选股**：在搜索栏输入股票代码或名称，选择后自动添加到列表
2. **查看 K 线图**：点击列表中的股票，进入详情页查看 K 线图
3. **切换周期**：在详情页点击"分时"、"日 K"、"周 K"、"月 K"、"年 K"按钮切换
4. **排序**：在列表页点击"排序"按钮，选择排序方式
5. **删除股票**：在列表项右侧点击"删除"按钮
6. **切换主题**：点击右上角主题切换按钮

## 注意事项

1. **API 数据源**：当前使用模拟数据，实际使用时需要配置真实的新浪/腾讯财经 API 接口
2. **图标文件**：打包时需要提供 `build/icon.ico` 图标文件
3. **跨域问题**：Electron 环境下可能需要配置 CORS 或使用代理

## 待优化功能

- [ ] 真实 API 接口集成
- [ ] 数据缓存优化（IndexedDB）
- [ ] 自动更新功能完善
- [ ] 系统托盘图标
- [ ] 更多技术指标
- [ ] 数据导出功能
