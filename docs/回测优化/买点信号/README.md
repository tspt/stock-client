# 买点信号

本目录用于存放根据 K 线数据扫描出的历史好买点信号。

这些 JSON 是本地生成产物，不提交到 Git。

生成方式：

```bash
npm run scan:buypoints
```

也可以在历史回测页基于当前 IndexedDB `stockHistory` 重新扫描并展示。
