/**
 * 数据加载和预处理模块
 *
 * 功能：
 * - 读取所有股票JSON文件
 * - 按行业分组
 * - 验证数据质量
 * - 清洗异常数据
 */

const fs = require('fs');
const path = require('path');
const { getGroupName } = require('./industry_groups.cjs');

const STOCK_DATA_DIR = path.join(__dirname, '..', '股票数据');

/**
 * 行业分组策略配置
 */
const GROUPING_CONFIG = {
  MIN_STOCKS_FOR_SPECIFIC_MODEL: 30, // 降低门槛，让更多行业拥有独立模型
};

/**
 * 加载单个股票数据文件
 * @param {string} filePath - 文件路径
 * @returns {Object|null} 股票数据对象或null（如果加载失败）
 */
function loadStockFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const jsonData = JSON.parse(content);

    // 验证数据结构
    if (!jsonData.data || !jsonData.data.dailyLines) {
      console.warn(`⚠️  文件结构不完整: ${path.basename(filePath)}`);
      return null;
    }

    // 提取关键信息
    const stockCode = jsonData.data.code;
    const stockName = jsonData.data.name;
    const klineData = jsonData.data.dailyLines;
    const industry = jsonData.industry;

    // 验证必要字段
    if (!stockCode || !klineData || klineData.length === 0) {
      console.warn(`⚠️  缺少必要数据: ${path.basename(filePath)}`);
      return null;
    }

    // 验证K线数据格式
    const validKline = klineData.every(
      (k) => k.time && k.open && k.high && k.low && k.close && k.volume !== undefined
    );

    if (!validKline) {
      console.warn(`⚠️  K线数据格式错误: ${path.basename(filePath)}`);
      return null;
    }

    return {
      code: stockCode,
      name: stockName,
      klineData: klineData,
      industry: industry ? industry.name : null,
      industryCode: industry ? industry.code : null,
      buypointDate: jsonData.buypointDate || [],
    };
  } catch (error) {
    console.warn(`⚠️  加载文件失败: ${path.basename(filePath)} - ${error.message}`);
    return null;
  }
}

/**
 * 加载所有股票数据
 * @returns {Array} 股票数据数组
 */
function loadAllStocks() {
  console.log('📂 开始加载股票数据...');
  console.log(`📁 数据目录: ${STOCK_DATA_DIR}\n`);

  // 读取所有JSON文件
  const files = fs.readdirSync(STOCK_DATA_DIR).filter((f) => f.endsWith('.json'));

  if (files.length === 0) {
    console.error('❌ 股票数据目录为空');
    process.exit(1);
  }

  console.log(`发现 ${files.length} 个股票数据文件\n`);

  // 加载所有股票数据
  const stocks = [];
  let successCount = 0;
  let failCount = 0;

  for (const file of files) {
    const filePath = path.join(STOCK_DATA_DIR, file);
    const stock = loadStockFile(filePath);

    if (stock) {
      stocks.push(stock);
      successCount++;
    } else {
      failCount++;
    }
  }

  console.log(`✅ 成功加载: ${successCount} 只股票`);
  console.log(`❌ 加载失败: ${failCount} 只股票\n`);

  return stocks;
}

/**
 * 验证股票数据质量
 * @param {Object} stock - 股票数据对象
 * @param {number} minDays - 最小天数要求
 * @returns {boolean} 是否通过验证
 */
function validateStockData(stock, minDays = 500) {
  // 检查K线数据长度
  if (stock.klineData.length < minDays) {
    return false;
  }

  // 检查是否有异常价格（负数或零）
  const hasInvalidPrice = stock.klineData.some(
    (k) => k.open <= 0 || k.high <= 0 || k.low <= 0 || k.close <= 0
  );

  if (hasInvalidPrice) {
    return false;
  }

  // 检查成交量是否为负
  const hasInvalidVolume = stock.klineData.some((k) => k.volume < 0);

  if (hasInvalidVolume) {
    return false;
  }

  return true;
}

/**
 * 过滤和清洗股票数据
 * @param {Array} stocks - 股票数据数组
 * @param {number} minDays - 最小天数要求
 * @returns {Array} 清洗后的股票数据数组
 */
function filterAndCleanStocks(stocks, minDays = 500) {
  console.log(`🧹 开始清洗数据（最小天数要求: ${minDays}）...\n`);

  const cleaned = [];
  let removedCount = 0;
  const removalReasons = {
    insufficientData: 0,
    invalidPrice: 0,
    invalidVolume: 0,
  };

  for (const stock of stocks) {
    if (!validateStockData(stock, minDays)) {
      removedCount++;

      // 统计移除原因
      if (stock.klineData.length < minDays) {
        removalReasons.insufficientData++;
      } else {
        const hasInvalidPrice = stock.klineData.some(
          (k) => k.open <= 0 || k.high <= 0 || k.low <= 0 || k.close <= 0
        );
        if (hasInvalidPrice) {
          removalReasons.invalidPrice++;
        } else {
          removalReasons.invalidVolume++;
        }
      }
      continue;
    }

    // 额外清洗：确保数据按时间排序
    stock.klineData.sort((a, b) => a.time - b.time);

    cleaned.push(stock);
  }

  console.log(`✅ 清洗完成:`);
  console.log(`  - 保留: ${cleaned.length} 只股票`);
  console.log(`  - 移除: ${removedCount} 只股票`);
  console.log(`    * 数据不足: ${removalReasons.insufficientData}`);
  console.log(`    * 价格异常: ${removalReasons.invalidPrice}`);
  console.log(`    * 成交量异常: ${removalReasons.invalidVolume}\n`);

  return cleaned;
}

/**
 * 按行业或聚类分组股票数据
 * @param {Array} stocks - 股票数据数组
 * @returns {Map} 模型名称 -> 股票数组的映射
 */
function groupByModelGroup(stocks) {
  console.log('📊 正在根据样本量进行行业聚类分组...\n');

  // 1. 先按原始行业统计
  const rawIndustryMap = new Map();
  for (const stock of stocks) {
    if (!stock.industry) continue;
    if (!rawIndustryMap.has(stock.industry)) {
      rawIndustryMap.set(stock.industry, []);
    }
    rawIndustryMap.get(stock.industry).push(stock);
  }

  const finalGroupMap = new Map();
  const industryToModelMap = new Map(); // 记录每个行业最终指向哪个模型

  for (const [industryName, industryStocks] of rawIndustryMap.entries()) {
    let targetGroupName;

    if (industryStocks.length >= GROUPING_CONFIG.MIN_STOCKS_FOR_SPECIFIC_MODEL) {
      // 样本充足，使用独立行业模型
      targetGroupName = industryName;
    } else {
      // 样本不足，归类到大类模型
      targetGroupName = getGroupName(industryName);
    }

    if (!finalGroupMap.has(targetGroupName)) {
      finalGroupMap.set(targetGroupName, []);
    }
    finalGroupMap.get(targetGroupName).push(...industryStocks);
    industryToModelMap.set(industryName, targetGroupName);
  }

  console.log(`📋 原始行业数: ${rawIndustryMap.size}`);
  console.log(`🎯 最终训练模型数: ${finalGroupMap.size}\n`);

  // 打印分组详情
  const groupStats = Array.from(finalGroupMap.entries())
    .map(([name, stocks]) => ({ name, count: stocks.length }))
    .sort((a, b) => b.count - a.count);

  console.log('📈 训练分组分布:');
  groupStats.forEach((stat, idx) => {
    console.log(`  ${idx + 1}. ${stat.name}: ${stat.count} 只股票`);
  });
  console.log('');

  return { groupMap: finalGroupMap, industryToModelMap };
}

/**
 * 主函数：加载、分组和清洗数据
 * @param {number} minDays - 最小天数要求
 * @returns {Object} 包含行业映射和所有股票的對象
 */
function loadData(minDays = 500) {
  console.log('='.repeat(60));
  console.log('📦 数据加载模块 (支持行业聚类)');
  console.log('='.repeat(60) + '\n');

  // 1. 加载所有股票
  const allStocks = loadAllStocks();

  // 2. 清洗数据
  const cleanedStocks = filterAndCleanStocks(allStocks, minDays);

  // 3. 按模型分组
  const { groupMap, industryToModelMap } = groupByModelGroup(cleanedStocks);

  console.log('='.repeat(60));
  console.log('✅ 数据加载完成');
  console.log('='.repeat(60) + '\n');

  return {
    allStocks: cleanedStocks,
    industryMap: groupMap, // 为了兼容性，变量名保持 industryMap
    industryToModelMap: industryToModelMap,
  };
}

module.exports = {
  loadData,
  loadAllStocks,
  filterAndCleanStocks,
  validateStockData,
  loadStockFile,
};
