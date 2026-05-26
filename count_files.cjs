const fs = require('fs');
const path = require('path');
const dir = path.join(process.cwd(), 'docs', '回测优化', '股票数据');
console.log('Checking dir:', dir);
if (fs.existsSync(dir)) {
    const files = fs.readdirSync(dir);
    console.log('Files found:', files.length);
} else {
    console.log('Dir does not exist');
}
