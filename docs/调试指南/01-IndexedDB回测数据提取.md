# IndexedDB 历史回测数据提取指南

本文档介绍如何直接从浏览器控制台获取存储在本地 IndexedDB 中的股票历史回测数据。

## 1. 存储结构说明

项目使用 `StockOpportunityDB` 数据库存储机会分析及回测相关数据。

| 属性                 | 值                      |
| :------------------- | :---------------------- |
| **数据库名称**       | `StockOpportunityDB`    |
| **存储对象 (Store)** | `signalBacktestResults` |
| **主键 (Key)**       | `code` (股票代码)       |
| **索引**             | `signalDate` (信号日期) |

### 数据结构 (`SignalBacktestResult`)

```typescript
interface SignalBacktestResult {
  code: string; // 股票代码 (主键)
  name: string; // 股票名称
  signals: Array<{
    signalDate: string; // 信号产生日期 (YYYY-MM-DD)
    entryPrice: number; // 信号入场价格
    returns: {
      day3: number | null; // 3日收益率
      day5: number | null; // 5日收益率
      day10: number | null; // 10日收益率
      day20: number | null; // 20日收益率
    };
  }>;
  calculatedAt: number; // 数据计算时间戳
}
```

## 2. 浏览器控制台提取脚本

在应用运行状态下，打开浏览器开发者工具（F12），切换到 **Console (控制台)** 标签页，粘贴并运行以下代码：

```javascript
const DB_NAME = 'StockOpportunityDB';
const STORE_NAME = 'stockHistory';
const targetCode = 'SH603017'; // <--- 修改此处为目标股票代码

const dbRequest = indexedDB.open(DB_NAME);
dbRequest.onsuccess = () => {
  const db = dbRequest.result;
  const transaction = db.transaction([STORE_NAME], 'readonly');
  const store = transaction.objectStore(STORE_NAME);
  const request = store.get(targetCode);

  request.onsuccess = () => {
    console.log(request.result); // 直接打印 IndexedDB 中的原始对象
    db.close();
  };
};
```

## 3. 批量导出所有数据

如果需要导出数据库中所有股票的回测结果，可以使用 `getAll()` 方法：

```javascript
// 替换上述脚本中的 store.get(targetCode) 为：
const request = store.getAll();

// 在 onsuccess 中处理：
request.onsuccess = () => {
  const allData = request.result;
  console.log('所有回测数据:', JSON.stringify(allData, null, 2));
  // 可以将 JSON 字符串复制到剪贴板或保存到文件
};
```

## 4. 注意事项

1. **环境要求**：必须在应用已加载且 IndexedDB 初始化完成后执行。
2. **数据时效性**：回测数据基于本地缓存的历史 K 线，若清除缓存则数据会丢失。
3. **性能建议**：如果数据量极大，建议使用分页或按索引查询，避免一次性 `getAll` 导致页面卡顿。
