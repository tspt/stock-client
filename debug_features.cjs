const { extractIndustryFeatures } = require('./docs/回测优化/模型训练/feature_engineer.cjs');
const fs = require('fs');
const path = require('path');

async function debugFeatures() {
  const dataDir = './docs/回测优化/股票数据';
  const files = fs.readdirSync(dataDir).slice(0, 50); // 取50个文件
  const stocks = [];
  
  for (const file of files) {
    try {
      const content = fs.readFileSync(path.join(dataDir, file), 'utf8');
      const jsonData = JSON.parse(content);
      if (jsonData.data && jsonData.data.dailyLines) {
        stocks.push({
          code: jsonData.data.code,
          name: jsonData.data.name,
          klineData: jsonData.data.dailyLines,
          industry: jsonData.industry ? jsonData.industry.name : '其他'
        });
      }
    } catch (e) {}
  }
  
  console.log(`Loaded ${stocks.length} stocks.`);
  
  console.log('Extracting features...');
  const result = extractIndustryFeatures(stocks, 60);
  const samples = result.samples;
  
  const posSamples = samples.filter(s => s.label === 1);
  const negSamples = samples.filter(s => s.label === 0);
  
  console.log(`Total samples: ${samples.length}`);
  console.log(`Positive samples: ${posSamples.length}`);
  console.log(`Negative samples: ${negSamples.length}`);
  
  if (posSamples.length === 0) {
    console.log('No positive samples found! Check labeling logic.');
    return;
  }
  
  const nFeatures = samples[0].features.length;
  console.log(`\nFeature Analysis (${nFeatures} features):`);
  
  for (let i = 0; i < nFeatures; i++) {
    const posVals = posSamples.map(s => s.features[i]);
    const negVals = negSamples.map(s => s.features[i]);
    
    const posMean = posVals.reduce((a, b) => a + b, 0) / posVals.length;
    const negMean = negVals.reduce((a, b) => a + b, 0) / negVals.length;
    
    console.log(`Feature ${i}: PosMean=${posMean.toFixed(4)}, NegMean=${negMean.toFixed(4)}, Diff=${(posMean - negMean).toFixed(4)}`);
  }
}

debugFeatures();
