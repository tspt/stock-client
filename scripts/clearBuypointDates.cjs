const fs = require('fs');
const path = require('path');

// 股票数据目录路径
const dataDir = path.join(__dirname, '..', 'docs', '回测优化', '股票数据');

// 获取目录下所有JSON文件
const files = fs.readdirSync(dataDir).filter((file) => file.endsWith('.json'));

console.log(`找到 ${files.length} 个股票数据文件`);

let processedCount = 0;
let errorCount = 0;

// 遍历所有文件
files.forEach((file, index) => {
  const filePath = path.join(dataDir, file);

  try {
    // 读取文件内容
    const content = fs.readFileSync(filePath, 'utf8');

    // 解析JSON
    const data = JSON.parse(content);

    // 检查是否存在data对象和buypointDate字段
    if (data && typeof data === 'object') {
      // 将buypointDate字段设置为空数组
      data.buypointDate = [];

      // 将修改后的数据写回文件
      fs.writeFileSync(filePath, JSON.stringify(data, null, 4), 'utf8');

      processedCount++;

      // 每处理100个文件显示一次进度
      if ((index + 1) % 100 === 0) {
        console.log(`已处理 ${index + 1}/${files.length} 个文件`);
      }
    } else {
      console.warn(`警告: 文件 ${file} 格式不正确`);
      errorCount++;
    }
  } catch (error) {
    console.error(`处理文件 ${file} 时出错:`, error.message);
    errorCount++;
  }
});

console.log(`\n处理完成！`);
console.log(`成功处理: ${processedCount} 个文件`);
console.log(`出错: ${errorCount} 个文件`);
console.log(`总共: ${files.length} 个文件`);
