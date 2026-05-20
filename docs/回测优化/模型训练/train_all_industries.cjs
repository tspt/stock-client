/**
 * 并行训练主控脚本
 *
 * 功能：
 * - 加载所有股票数据并按行业分组
 * - 使用多进程并行训练各行业模型
 * - 实时监控训练进度
 * - 生成总体训练报告
 */

const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const os = require('os');
const fs = require('fs');
const path = require('path');
const { loadData } = require('./data_loader.cjs');
const { trainIndustryModel } = require('./train_single_industry.cjs');

// ==================== Worker线程代码 ====================

if (!isMainThread) {
  // Worker线程执行训练任务
  (async () => {
    const { industryName, stocks, options } = workerData;

    try {
      const result = await trainIndustryModel(industryName, stocks, options);
      parentPort.postMessage({ type: 'complete', result });
    } catch (error) {
      parentPort.postMessage({
        type: 'error',
        industryName,
        error: error.message,
      });
    }
  })();
}

// ==================== 主线程代码 ====================
else {
  /**
   * 创建输出目录
   */
  function ensureOutputDirs() {
    const outputDir = path.join(__dirname, '..', '..', '..', 'public', 'models', 'industry');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
  }

  /**
   * 保存训练报告
   * @param {Array} results - 训练结果数组
   */
  function saveTrainingReport(results) {
    const reportPath = path.join(__dirname, 'training_report.json');

    const successResults = results.filter((r) => r.success);
    const failedResults = results.filter((r) => !r.success);

    const report = {
      generatedAt: new Date().toISOString(),
      totalIndustries: results.length,
      successful: successResults.length,
      failed: failedResults.length,
      results: results.map((r) => ({
        industryName: r.industryName,
        success: r.success,
        metrics: r.metrics
          ? {
              accuracy: r.metrics.accuracy,
              precision: r.metrics.precision,
              recall: r.metrics.recall,
              f1: r.metrics.f1,
              auc: r.metrics.auc,
            }
          : null,
        sampleStats: r.sampleStats,
        bestConfig: r.bestConfig,
        error: r.reason,
      })),
    };

    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf-8');
    console.log(`\n📄 训练报告已保存: ${reportPath}`);
  }

  /**
   * 生成模型索引文件
   * @param {Array} results - 训练结果数组
   * @param {Map} industryToModelMap - 行业到模型的映射
   */
  function generateModelIndex(results, industryToModelMap) {
    const indexPath = path.join(
      __dirname,
      '..',
      '..',
      '..',
      'public',
      'models',
      'industry',
      'model-index.json'
    );

    const successResults = results.filter((r) => r.success);

    const index = {
      generatedAt: new Date().toISOString(),
      version: 'v5.0-rf-clustered',
      totalModels: successResults.length,
      models: successResults.map((r) => ({
        industryName: r.industryName,
        fileName: `${r.industryName.replace(/[\/\\:*?"<>|]/g, '_')}_model.json`,
        performance: r.metrics
          ? {
              accuracy: r.metrics.accuracy,
              precision: r.metrics.precision,
              recall: r.metrics.recall,
              f1: r.metrics.f1,
              auc: r.metrics.auc,
            }
          : null,
        trainingDate: new Date().toISOString(),
        stockCount: r.sampleStats ? r.sampleStats.total : 0,
      })),
      industryToModelMap: Object.fromEntries(industryToModelMap), // 导出映射关系
    };

    fs.writeFileSync(indexPath, JSON.stringify(index, null, 2), 'utf-8');
    console.log(`📑 模型索引已生成: ${indexPath}`);
  }

  /**
   * 主函数：并行训练所有行业模型
   */
  async function main() {
    console.log('\n' + '='.repeat(60));
    console.log('🚀 分行业/聚类随机森林模型训练系统');
    console.log('='.repeat(60) + '\n');

    // 确保输出目录存在
    ensureOutputDirs();

    // 步骤1: 加载数据
    console.log('📦 步骤1: 加载数据...\n');
    const { industryMap, industryToModelMap } = loadData(500);

    const industries = Array.from(industryMap.entries());
    console.log(`📋 共发现 ${industries.length} 个模型组需要训练\n`);

    // 步骤2: 配置并行训练
    const maxWorkers = Math.min(os.cpus().length, 8); // 最多8个并行
    console.log(`⚙️  并行配置: 最多 ${maxWorkers} 个Worker线程\n`);

    // 步骤3: 分批并行训练
    const results = [];
    let completed = 0;
    let failed = 0;

    console.log('🏃 开始并行训练...\n');
    const startTime = Date.now();

    // 分批处理
    for (let i = 0; i < industries.length; i += maxWorkers) {
      const batch = industries.slice(i, i + maxWorkers);
      const batchNum = Math.floor(i / maxWorkers) + 1;
      const totalBatches = Math.ceil(industries.length / maxWorkers);

      console.log(`\n📦 批次 ${batchNum}/${totalBatches} (${batch.length} 个行业)`);
      console.log('-'.repeat(60));

      // 创建Worker线程
      const workers = [];
      const promises = [];

      for (const [industryName, stocks] of batch) {
        const promise = new Promise((resolve, reject) => {
          const worker = new Worker(__filename, {
            workerData: {
              industryName,
              stocks,
              options: {
                useQuickSearch: false, // 完整搜索
                trainRatio: 0.8,
                startIndex: 60,
              },
            },
          });

          worker.on('message', (msg) => {
            if (msg.type === 'complete') {
              resolve(msg.result);
            } else if (msg.type === 'error') {
              resolve({
                industryName: msg.industryName,
                success: false,
                reason: msg.error,
              });
            }
          });

          worker.on('error', (err) => {
            resolve({
              industryName,
              success: false,
              reason: err.message,
            });
          });

          worker.on('exit', (code) => {
            if (code !== 0) {
              resolve({
                industryName,
                success: false,
                reason: `Worker退出码: ${code}`,
              });
            }
          });
        });

        promises.push(promise);
      }

      // 等待当前批次完成
      const batchResults = await Promise.all(promises);
      results.push(...batchResults);

      // 统计进度
      batchResults.forEach((r) => {
        if (r.success) {
          completed++;
        } else {
          failed++;
        }
      });

      console.log(`\n✅ 批次完成: ${completed} 成功, ${failed} 失败`);
      console.log(`📊 总进度: ${results.length}/${industries.length}\n`);
    }

    // 步骤4: 生成报告
    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000 / 60).toFixed(2);

    console.log('\n' + '='.repeat(60));
    console.log('🎉 训练完成!');
    console.log('='.repeat(60));
    console.log(`⏱️  总耗时: ${duration} 分钟`);
    console.log(`✅ 成功: ${completed} 个行业`);
    console.log(`❌ 失败: ${failed} 个行业`);
    console.log(`📊 总计: ${results.length} 个行业\n`);

    // 保存报告和索引
    saveTrainingReport(results);
    generateModelIndex(results, industryToModelMap);

    console.log('\n✨ 所有任务完成！\n');
  }

  // 执行主函数
  main().catch((error) => {
    console.error('❌ 训练过程出错:', error);
    process.exit(1);
  });
}
