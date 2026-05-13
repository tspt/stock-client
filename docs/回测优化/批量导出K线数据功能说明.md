# 批量导出 K 线数据功能说明

## 功能概述

在历史回测页面新增了"批量导出 K 线数据"功能，支持一次性导出多只股票的 K 线数据到本地 JSON 文件。

## 主要特性

1. **批量选择股票**：参考现有的"导出指定股票"弹窗界面，支持多选股票
2. **智能合并数据**：如果目标 JSON 文件中 `buypointDate` 字段不为空数组，则保留原有的买点日期，只更新 `data` 字段
3. **自动扫描目录**：打开弹窗时自动扫描股票数据目录，获取最新的股票列表
4. **详细反馈**：导出完成后显示成功和失败的统计信息

## 使用流程

1. 在历史回测页面顶部工具栏点击"批量导出 K 线数据"按钮
2. 在弹出的模态框中，系统会自动扫描并显示股票数据目录中的所有股票
3. 通过点击股票卡片或"全选"按钮选择需要导出的股票
4. 点击"导出"按钮开始批量导出
5. 导出完成后会显示统计信息（总计、成功、失败数量）

## 技术实现

### 前端 (BacktestPage.tsx)

- 新增状态管理：`batchExportModalOpen`、`batchExporting`
- 新增处理函数：
  - `handleOpenBatchExportModal`：打开批量导出模态框
  - `handleScanStockDirectoryForBatchExport`：扫描股票目录
  - `handleBatchExportKlineData`：执行批量导出逻辑

### Electron 主进程 (main.ts)

- 新增 IPC 处理器：`batch-export-kline-data`
- 实现逻辑：
  1. 接收渲染进程传递的完整股票数据（包含 K 线数据）
  2. 遍历每只股票，检查目标文件是否存在
  3. 如果文件存在且 `buypointDate` 不为空，则保留原有值
  4. 构建新的数据结构并写入文件
  5. 返回详细的执行结果

### Preload 脚本 (preload.ts)

- 暴露新 API：`batchExportKlineData`
- 类型定义：完整的输入输出类型声明

### 类型定义 (electron.d.ts)

- 添加 `batchExportKlineData` 方法的 TypeScript 类型定义

## 数据格式

导出的 JSON 文件格式与单个导出相同：

```json
{
  "data": {
    "code": "SH603989",
    "name": "艾华集团",
    "dailyLines": [...],
    "latestQuote": {...},
    "updatedAt": 1777473644115
  },
  "buypointDate": ["2025-04-07", "2025-06-23"]
}
```

## 注意事项

1. **buypointDate 保护机制**：只有当目标文件中的 `buypointDate` 为空数组或不存在时，才会被覆盖；否则保留原有值
2. **数据来源**：K 线数据从 IndexedDB 中读取，确保先执行过回测或数据同步
3. **保存位置**：所有导出的文件保存在 `docs/回测优化/股票数据` 目录
4. **错误处理**：单只股票导出失败不会影响其他股票，最终会显示详细的成功/失败统计

## 测试建议

1. 先在机会分析页面触发数据同步，确保 IndexedDB 中有股票数据
2. 执行一次全量回测，生成回测结果
3. 点击"批量导出 K 线数据"按钮
4. 选择几只股票进行导出测试
5. 检查 `docs/回测优化/股票数据` 目录下的 JSON 文件是否正确生成
6. 手动修改某个文件的 `buypointDate` 为非空数组，再次导出该股票，验证 `buypointDate` 是否被保留
