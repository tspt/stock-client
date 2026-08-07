# 股票数据

本目录用于存放历史回测页从 IndexedDB `stockHistory` 导出的 K 线 JSON。

这些 JSON 是本地生成产物，体积较大且会随每次导出变化，不提交到 Git。

在新电脑上使用时：

1. 先运行机会分析，让 IndexedDB 中生成或更新 `stockHistory`。
2. 打开历史回测页。
3. 点击「导出 K 线数据」重新生成本目录 JSON。
