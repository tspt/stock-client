const fs = require('fs');
const path = require('path');
const { loadData } = require('./docs/回测优化/模型训练/data_loader.cjs');

async function checkMissingIndustries() {
  const { industryMap, industryToModelMap } = loadData(500);
  const industries = Array.from(industryMap.keys());
  
  const modelDir = './public/models/industry';
  const files = fs.readdirSync(modelDir).filter(f => f.endsWith('_model.json'));
  const existingIndustries = files.map(f => f.replace('_model.json', ''));
  
  console.log(`Total industries expected: ${industries.length}`);
  console.log(`Total models found: ${existingIndustries.length}`);
  
  const missing = industries.filter(i => !existingIndustries.includes(i));
  console.log('\nMissing industries:');
  console.log(missing);
  
  // Also check if existing models are "dud" models (only root node)
  console.log('\nChecking for "dud" models (root-only):');
  for (const file of files) {
    const content = JSON.parse(fs.readFileSync(path.join(modelDir, file), 'utf8'));
    const isDud = content.trees.every(t => !t.tree.left && !t.tree.right);
    if (isDud) {
      console.log(`  [DUD] ${file}`);
    }
  }
}

checkMissingIndustries();
