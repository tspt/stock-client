# 买点场景

本目录用于存放历史好买点的场景分类结果，以及最新交易日场景扫描结果。

这些 JSON 是本地生成产物，不提交到 Git。

生成方式：

```bash
npm run classify:buypoints
npm run classify:latest
```

历史回测页也可以直接读取 IndexedDB `stockHistory` 做页面内扫描展示。
