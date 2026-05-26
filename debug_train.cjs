const { loadData } = require('./docs/回测优化/模型训练/data_loader.cjs');
const { trainIndustryModel } = require('./docs/回测优化/模型训练/train_single_industry.cjs');

async function debugSingleIndustry() {
  const { industryMap } = loadData(500);
  const industryName = '半导体';
  const stocks = industryMap.get(industryName);
  
  if (!stocks) {
    console.error(`Industry ${industryName} not found`);
    return;
  }
  
  console.log(`Training ${industryName} with ${stocks.length} stocks...`);
  
  const result = await trainIndustryModel(industryName, stocks, {
    useQuickSearch: true, // Use quick search for faster debugging
    trainRatio: 0.8,
    startIndex: 60
  });
  
  console.log('\nResult:');
  console.log(JSON.stringify(result, null, 2));
}

debugSingleIndustry();
