const fs = require('fs');
const path = require('path');

function findDataDir() {
    const docsDir = path.join(__dirname, 'docs');
    const docsContent = fs.readdirSync(docsDir);
    
    const backtestDir = docsContent.find(d => d === '回测优化');
    if (!backtestDir) return;
    
    const backtestPath = path.join(docsDir, backtestDir);
    const backtestContent = fs.readdirSync(backtestPath);
    
    const dataDir = backtestContent.find(d => d === '股票数据');
    if (!dataDir) return;
    
    return path.join(backtestPath, dataDir);
}

const dataDir = findDataDir();
console.log('Found Data Dir:', dataDir);

if (dataDir) {
    const files = fs.readdirSync(dataDir);
    console.log('Files count:', files.length);
    if (files.length > 0) {
        console.log('First file:', files[0]);
        
        // Now do the stats
        const { labelStockSignals } = require('./docs/回测优化/模型训练/signal_labeler.cjs');
        const industryStats = {};
        
        for (const file of files.slice(0, 500)) {
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
        
        console.log('\nIndustry | Total | Positive | Rate');
        console.log('---|---|---|---');
        for (const [industry, stats] of Object.entries(industryStats)) {
            const rate = (stats.positive / stats.total * 100).toFixed(2);
            console.log(`${industry} | ${stats.total} | ${stats.positive} | ${rate}%`);
        }
    }
}
