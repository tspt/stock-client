const fs = require('fs');
const path = require('path');

// 读取行业JSON文件
const industryFilePath = path.join(__dirname, '..', 'docs', '回测优化', '行业.json');
const industryData = JSON.parse(fs.readFileSync(industryFilePath, 'utf8'));

console.log(`原始行业数量: ${industryData.length}`);

// 需要排除的行业代码列表（从 opportunityAnalysisDefaults.ts 中提取）
const excludedIndustries = [
  'BK1020', // 航空机场
  'BK0421', // 铁路公路
  'BK0422', // 物流
  'BK0450', // 航运港口
  'BK0451', // 房地产开发
  // 'BK0465', // 化学制药 (这个被注释掉了，不计入)
  'BK0473', // 证券Ⅱ
  'BK0474', // 保险Ⅱ
  'BK0475', // 银行Ⅱ
  'BK0482', // 一般零售
  'BK0727', // 医疗服务
  'BK0732', // 贵金属
  'BK0734', // 饰品
  'BK0740', // 教育
  'BK1027', // 小金属
  'BK1028', // 燃气Ⅱ
  'BK1040', // 中药Ⅱ
  'BK1041', // 医疗器械
  'BK1042', // 医药商业
  'BK1044', // 生物制品
  'BK1045', // 房地产服务
  'BK1222', // 影视院线
  'BK1226', // 普钢
  'BK1227', // 特钢Ⅱ
  'BK1245', // 照明设备Ⅱ
  'BK1228', // 冶钢原料
  'BK1243', // 其他家电Ⅱ
  'BK1239', // 白色家电
  'BK1241', // 黑色家电
  'BK1240', // 厨卫电器
  'BK1244', // 小家电
  'BK1249', // 焦炭Ⅱ
  'BK1250', // 煤炭开采
  'BK1251', // 个护用品
  'BK1225', // 服装家纺
  'BK0424', // 水泥
  'BK1267', // 造纸
  'BK1247', // 基础建设
  'BK1252', // 化妆品
  'BK1253', // 医疗美容
  'BK1254', // 动物保健Ⅱ
  'BK1256', // 农产品加工
  'BK1257', // 农业综合Ⅱ
  'BK1258', // 饲料
  'BK1259', // 养殖业
  'BK1260', // 渔业
  'BK1261', // 种植业
  'BK1269', // 旅游零售Ⅱ
  'BK1270', // 专业连锁Ⅱ
  'BK1271', // 酒店餐饮
  'BK1272', // 旅游及景区
  'BK1274', // 炼化及贸易
  'BK1275', // 油服工程
  'BK1276', // 油气开采Ⅱ
  'BK1277', // 白酒Ⅱ
  'BK1279', // 非白酒
  'BK1280', // 食品加工
  'BK0440', // 家居用品
  'BK1281', // 休闲食品
  'BK1282', // 饮料乳品
];

console.log(`需要排除的行业数量: ${excludedIndustries.length}`);

// 过滤掉需要排除的行业
const filteredIndustries = industryData.filter((industry) => {
  return !excludedIndustries.includes(industry.code);
});

console.log(`过滤后行业数量: ${filteredIndustries.length}`);
console.log(`被排除的行业数量: ${industryData.length - filteredIndustries.length}`);

// 显示被排除的行业名称
const excludedNames = industryData
  .filter((industry) => excludedIndustries.includes(industry.code))
  .map((industry) => `${industry.code}: ${industry.name}`);

console.log('\n被排除的行业:');
excludedNames.forEach((name) => console.log(`  ${name}`));

// 将过滤后的数据写回文件
fs.writeFileSync(industryFilePath, JSON.stringify(filteredIndustries, null, 4), 'utf8');

console.log('\n行业.json 文件已更新！');
