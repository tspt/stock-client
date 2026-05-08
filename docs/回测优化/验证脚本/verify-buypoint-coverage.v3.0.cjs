/**
 * 验证手动买点与模型信号的覆盖情况
 *
 * 功能：
 * 1. 扫描股票数据目录中所有股票的手动买点日期
 * 2. 对比历史回测导出文件中的信号日期
 * 3. 统计覆盖率，找出漏报的买点
  * 
 * 版本: v3.0
 * 创建时间: 2026-05-08
*/

const fs = require('fs');
const path = require('path');

// 配置路径
const STOCK_DATA_DIR = path.join(__dirname, '..', '股票数据');
const EXPORT_FILE = path.join(__dirname, '..', '历史回测数据', 'backtest_export_latest.json');
const COVERAGE_REPORT = path.join(__dirname, '..', '买点验证报告', 'BUYPOINT_COVERAGE_REPORT.json');

/**
 * 解析各种格式的日期字符串为标准格式 (YYYY-MM-DD)
 */
function parseDate(dateStr) {
  if (!dateStr) return null;

  dateStr = dateStr.trim();

  // 格式1: 2026/03/20
  if (/^\d{4}\/\d{1,2}\/\d{1,2}$/.test(dateStr)) {
    const parts = dateStr.split('/');
    return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
  }

  // 格式2: 2025-04-07
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(dateStr)) {
    const parts = dateStr.split('-');
    return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
  }

  // 格式3: 2026年4月9日
  const match = dateStr.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
  if (match) {
    return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
  }

  return null;
}

/**
 * 从股票数据文件中提取手动买点日期
 */
function extractManualBuyPoints(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');

  // 查找"日期买点："后面的内容
  const match = content.match(/日期买点：(.+)$/m);
  if (!match) {
    return [];
  }

  const datesStr = match[1];
  const dates = [];

  // 分割日期（支持中文逗号、英文逗号、空格）
  const parts = datesStr.split(/[,，\s]+/).filter((p) => p.trim());

  parts.forEach((part) => {
    const normalized = parseDate(part);
    if (normalized) {
      dates.push(normalized);
    } else {
      console.warn(`⚠️  无法解析日期: ${part}`);
    }
  });

  return dates.sort();
}

/**
 * 从导出文件中获取某只股票的信号日期
 */
function getSignalDates(exportData, stockCode) {
  const stock = exportData.data.find((s) => s.code === stockCode);
  if (!stock) {
    return [];
  }

  return stock.signals.map((sig) => sig.signalDate).sort();
}

/**
 * 主函数
 */
async function main() {
  console.log('🔍 开始验证手动买点覆盖情况...\n');

  // 读取导出文件
  let exportData;
  try {
    exportData = JSON.parse(fs.readFileSync(EXPORT_FILE, 'utf-8'));
    console.log(`✅ 成功加载导出文件`);
    console.log(`   总股票数: ${exportData.totalStocks}`);
    console.log(`   总信号数: ${exportData.totalSignals}\n`);
  } catch (error) {
    console.error(`❌ 读取导出文件失败: ${error.message}`);
    process.exit(1);
  }

  // 扫描股票数据目录
  const files = fs.readdirSync(STOCK_DATA_DIR).filter((f) => f.endsWith('.json'));
  console.log(`📂 找到 ${files.length} 个股票文件\n`);

  // 统计结果
  const results = {
    totalManualPoints: 0,
    coveredPoints: 0,
    missedPoints: 0,
    stocks: [],
  };

  // 遍历每个股票文件
  files.forEach((filename, index) => {
    const filePath = path.join(STOCK_DATA_DIR, filename);
    const stockName = filename.replace('.json', '');

    // 读取JSON文件并提取手动买点
    let manualDates = [];
    let stockCode = '';
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const jsonData = JSON.parse(content);

      // 从JSON中提取股票代码
      stockCode = jsonData.data?.code || '';
      if (!stockCode) {
        console.warn(`⚠️  ${stockName}: 无法提取股票代码`);
        return;
      }

      // 从JSON中提取买点日期
      const buyPointDates = jsonData.buypointDate || [];
      manualDates = buyPointDates
        .map((date) => parseDate(date))
        .filter((date) => date !== null)
        .sort();
    } catch (error) {
      console.warn(`⚠️  ${stockName}: 解析文件失败 - ${error.message}`);
      return;
    }

    if (manualDates.length === 0) {
      console.log(`[${index + 1}/${files.length}] ${stockName}: 无手动买点标记`);
      return;
    }

    // 获取信号日期
    const signalDates = getSignalDates(exportData, stockCode);

    // 对比分析
    const covered = [];
    const missed = [];

    manualDates.forEach((manualDate) => {
      if (signalDates.includes(manualDate)) {
        covered.push(manualDate);
      } else {
        missed.push(manualDate);
      }
    });

    // 统计
    results.totalManualPoints += manualDates.length;
    results.coveredPoints += covered.length;
    results.missedPoints += missed.length;

    // 记录结果
    results.stocks.push({
      name: stockName,
      code: stockCode,
      manualCount: manualDates.length,
      coveredCount: covered.length,
      missedCount: missed.length,
      coverage:
        manualDates.length > 0 ? ((covered.length / manualDates.length) * 100).toFixed(1) : 0,
      manualDates,
      coveredDates: covered,
      missedDates: missed,
    });

    // 输出简要信息
    const status = missed.length === 0 ? '✅' : '❌';
    console.log(`[${index + 1}/${files.length}] ${status} ${stockName} (${stockCode}):`);
    console.log(`     手动买点: ${manualDates.length} 个`);
    console.log(`     已覆盖: ${covered.length} 个`);
    if (missed.length > 0) {
      console.log(`     ⚠️  未覆盖: ${missed.length} 个 - ${missed.join(', ')}`);
    }
  });

  // 输出汇总报告
  console.log('\n' + '='.repeat(80));
  console.log('📊 验证结果汇总');
  console.log('='.repeat(80));
  console.log(`总手动买点数: ${results.totalManualPoints}`);
  console.log(`已覆盖买点数: ${results.coveredPoints}`);
  console.log(`未覆盖买点数: ${results.missedPoints}`);
  console.log(
    `整体覆盖率: ${((results.coveredPoints / results.totalManualPoints) * 100).toFixed(2)}%`
  );
  console.log('='.repeat(80));

  // 按覆盖率排序，找出问题最严重的股票
  const sortedStocks = results.stocks
    .filter((s) => s.missedCount > 0)
    .sort((a, b) => parseFloat(a.coverage) - parseFloat(b.coverage));

  if (sortedStocks.length > 0) {
    console.log('\n❌ 需要优化的股票（按覆盖率从低到高）:');
    sortedStocks.forEach((stock) => {
      console.log(`\n${stock.name} (${stock.code}):`);
      console.log(`  覆盖率: ${stock.coverage}% (${stock.coveredCount}/${stock.manualCount})`);
      console.log(`  未覆盖日期: ${stock.missedDates.join(', ')}`);
    });
  }

  // 保存详细报告
  const reportPath = path.join(__dirname, '..', '买点验证报告', 'BUYPOINT_COVERAGE_REPORT.json');
  fs.writeFileSync(reportPath, JSON.stringify(results, null, 2), 'utf-8');
  console.log(`\n💾 详细报告已保存到: ${reportPath}`);

  console.log('\n✅ 验证完成！');
}

main().catch((error) => {
  console.error('❌ 执行失败:', error);
  process.exit(1);
});
