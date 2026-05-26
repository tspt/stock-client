const fs = require('fs');
const path = require('path');

function checkDirs() {
    const baseDir = path.join(process.cwd(), 'docs', '回测优化');
    if (!fs.existsSync(baseDir)) {
        console.log('Base dir not found');
        return;
    }
    
    const contents = fs.readdirSync(baseDir);
    console.log('Contents of Base Dir:', contents);
    
    for (const item of contents) {
        const fullPath = path.join(baseDir, item);
        if (fs.statSync(fullPath).isDirectory()) {
            const subContents = fs.readdirSync(fullPath);
            console.log(`Dir: ${item}, Files: ${subContents.length}`);
            if (subContents.length > 0) {
                console.log(`First file in ${item}: ${subContents[0]}`);
            }
        }
    }
}

checkDirs();
