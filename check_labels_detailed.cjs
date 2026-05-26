const fs = require('fs');
const path = require('path');
const { labelStockSignals } = require('./docs/回测优化/模型训练/signal_labeler.cjs');

async function checkLabelsByIndustry() {
    const dataDir = path.join(__dirname, 'docs/回测优化/股票数据');
    if (!fs.existsSync(dataDir)) {
        console.log(`Directory not found: ${dataDir}`);
        return;
    }
    const files = fs.readdirSync(dataDir).filter(f => f.endsWith('.json'));
    
    const industryStats = {};
    
    for (const file of files) {
        try {
            const content = fs.readFileSync(path.join(dataDir, file), 'utf-8');
            const jsonData = JSON.parse(content);
            const klineData = jsonData.data ? jsonData.data.dailyLines : jsonData;
            const industry = jsonData.industry ? jsonData.industry.name : 'Unknown';
            
            if (!klineData || klineData.length < 100) continue;
            
            const labeledData = labelStockSignals(klineData);
            const total = labeledData.length;
            const positive = labeledData.filter(d => d.label === 1).length;
            
            if (!industryStats[industry]) {
                industryStats[industry] = { total: 0, positive: 0 };
            }
            industryStats[industry].total += total;
            industryStats[industry].positive += positive;
        } catch (e) {}
    }
    
    console.log('Industry | Total | Positive | Rate');
    console.log('---|---|---|---');
    for (const [industry, stats] of Object.entries(industryStats)) {
        const rate = (stats.positive / stats.total * 100).toFixed(2);
        console.log(`${industry} | ${stats.total} | ${stats.positive} | ${rate}%`);
    }
}

checkLabelsByIndustry();
