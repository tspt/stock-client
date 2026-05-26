const fs = require('fs');
const path = require('path');
const { labelStockSignals } = require('./docs/回测优化/模型训练/signal_labeler.cjs');

async function checkLabels() {
    const dataDir = path.join(__dirname, 'docs/回测优化/股票数据');
    if (!fs.existsSync(dataDir)) {
        console.log(`Directory not found: ${dataDir}`);
        return;
    }
    const files = fs.readdirSync(dataDir).filter(f => f.endsWith('.json')).slice(0, 100);
    
    let totalSamples = 0;
    let positiveSamples = 0;
    
    for (const file of files) {
        try {
            const content = fs.readFileSync(path.join(dataDir, file), 'utf-8');
            const jsonData = JSON.parse(content);
            const klineData = jsonData.data ? jsonData.data.dailyLines : jsonData;
            
            if (!klineData || klineData.length < 100) continue;
            
            const labeledData = labelStockSignals(klineData);
            totalSamples += labeledData.length;
            positiveSamples += labeledData.filter(d => d.label === 1).length;
        } catch (e) {
            console.error(`Error processing ${file}: ${e.message}`);
        }
    }
    
    console.log(`Total Samples: ${totalSamples}`);
    console.log(`Positive Samples: ${positiveSamples}`);
    console.log(`Positive Rate: ${(positiveSamples / totalSamples * 100).toFixed(2)}%`);
}

checkLabels();
