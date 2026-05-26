const fs = require('fs');
const path = require('path');

function generateIndex() {
  const modelDir = './public/models/industry';
  const files = fs.readdirSync(modelDir).filter(f => f.endsWith('_model.json'));
  
  const models = [];
  const industryToModelMap = {};
  
  // Load existing map from the old index if possible
  let oldIndex = { industryToModelMap: {} };
  try {
    oldIndex = JSON.parse(fs.readFileSync(path.join(modelDir, 'model-index.json'), 'utf8'));
  } catch (e) {}

  for (const file of files) {
    try {
      const content = JSON.parse(fs.readFileSync(path.join(modelDir, file), 'utf8'));
      const industryName = content.industryName;
      
      // Check if it's a dud
      const isDud = content.trees.every(t => !t.tree.left && !t.tree.right);
      
      if (!isDud) {
        models.push({
          industryName: industryName,
          fileName: file,
          trainingDate: content.trainingDate,
          version: content.version,
          isDud: false
        });
      } else {
        console.log(`Skipping dud model: ${industryName}`);
      }
    } catch (e) {
      console.error(`Error reading ${file}: ${e.message}`);
    }
  }
  
  const index = {
    generatedAt: new Date().toISOString(),
    version: 'v5.0-rf-clustered',
    totalModels: models.length,
    models: models,
    industryToModelMap: oldIndex.industryToModelMap || {}
  };
  
  fs.writeFileSync(path.join(modelDir, 'model-index.json'), JSON.stringify(index, null, 2));
  console.log(`Generated index with ${models.length} valid models.`);
}

generateIndex();
