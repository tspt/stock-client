"""
自动生成行业模型索引文件
扫描industry_models目录中的所有JSON模型文件，生成model-index.json
"""

import json
import os
from datetime import datetime

# 配置
SOURCE_DIR = r"d:\other\test666\docs\回测优化\验证脚本\industry_models"
TARGET_DIR = r"d:\other\test666\public\models\industry"
INDEX_FILE = os.path.join(TARGET_DIR, "model-index.json")

def generate_model_index():
    """生成模型索引文件"""
    print("🔍 正在扫描模型文件...")
    
    # 确保目标目录存在
    os.makedirs(TARGET_DIR, exist_ok=True)
    
    models = []
    json_files = [f for f in os.listdir(SOURCE_DIR) if f.endswith('_model.json')]
    
    print(f"   找到 {len(json_files)} 个模型文件")
    
    for filename in json_files:
        try:
            filepath = os.path.join(SOURCE_DIR, filename)
            
            # 读取模型文件
            with open(filepath, 'r', encoding='utf-8') as f:
                model_data = json.load(f)
            
            # 提取元数据
            metadata = model_data.get('metadata', {})
            industry_name = metadata.get('industry', filename.replace('_model.json', ''))
            performance = metadata.get('performance', {})
            
            model_info = {
                'industryName': industry_name,
                'fileName': filename,
                'precision': performance.get('precision', 0),
                'recall': performance.get('recall', 0),
                'f1': performance.get('f1', 0),
                'auc': performance.get('auc_roc', 0),
                'predictionThreshold': metadata.get('prediction_threshold', 0.6),
                'fileSize': os.path.getsize(filepath),
                'trainingDate': metadata.get('training_date', '')
            }
            
            models.append(model_info)
            
            # 复制文件到目标目录
            target_path = os.path.join(TARGET_DIR, filename)
            with open(filepath, 'r', encoding='utf-8') as src:
                content = src.read()
            with open(target_path, 'w', encoding='utf-8') as dst:
                dst.write(content)
            
        except Exception as e:
            print(f"   ⚠️  处理文件 {filename} 时出错: {e}")
    
    # 按行业名称排序
    models.sort(key=lambda x: x['industryName'])
    
    # 创建索引
    index = {
        'version': 'v5.0',
        'totalModels': len(models),
        'generatedAt': datetime.now().isoformat(),
        'models': models
    }
    
    # 保存索引文件
    with open(INDEX_FILE, 'w', encoding='utf-8') as f:
        json.dump(index, f, ensure_ascii=False, indent=2)
    
    print(f"\n✅ 索引文件已生成: {INDEX_FILE}")
    print(f"   共 {len(models)} 个模型")
    print(f"   文件大小: {os.path.getsize(INDEX_FILE) / 1024:.2f} KB")
    
    # 显示统计信息
    print(f"\n📊 模型统计:")
    high_precision = [m for m in models if m['precision'] >= 0.9]
    medium_precision = [m for m in models if 0.7 <= m['precision'] < 0.9]
    low_precision = [m for m in models if m['precision'] < 0.7]
    
    print(f"   高精确率 (>=90%): {len(high_precision)} 个")
    print(f"   中等精确率 (70-90%): {len(medium_precision)} 个")
    print(f"   低精确率 (<70%): {len(low_precision)} 个")
    
    total_size = sum(m['fileSize'] for m in models)
    print(f"\n💾 总文件大小: {total_size / 1024 / 1024:.2f} MB")
    
    return index

if __name__ == "__main__":
    generate_model_index()
