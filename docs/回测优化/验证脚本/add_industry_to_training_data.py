"""
为训练数据添加行业信息
从股票JSON文件中提取行业信息，并添加到训练数据Excel中
"""

import json
import os
import pandas as pd
from tqdm import tqdm

# 配置
STOCK_DATA_DIR = r"d:\other\test666\docs\回测优化\股票数据"
INPUT_EXCEL = r"d:\other\test666\docs\回测优化\验证脚本\signal_training_data.xlsx"
OUTPUT_EXCEL = r"d:\other\test666\docs\回测优化\验证脚本\signal_training_data_with_industry.xlsx"

def build_industry_mapping():
    """构建股票代码到行业的映射"""
    print("🔍 正在构建行业映射...")
    
    industry_map = {}
    files = [f for f in os.listdir(STOCK_DATA_DIR) if f.endswith('.json')]
    
    for filename in tqdm(files, desc="处理股票数据"):
        try:
            filepath = os.path.join(STOCK_DATA_DIR, filename)
            with open(filepath, 'r', encoding='utf-8') as f:
                data = json.load(f)
            
            stock_code = data.get('data', {}).get('code', '')
            industry = data.get('industry', {})
            industry_name = industry.get('name', '未知')
            industry_code = industry.get('code', 'UNKNOWN')
            
            if stock_code:
                industry_map[stock_code] = {
                    'industry_name': industry_name,
                    'industry_code': industry_code
                }
        except Exception as e:
            pass
    
    print(f"✅ 构建了 {len(industry_map)} 个股票的行业映射")
    return industry_map

def add_industry_to_training_data():
    """为训练数据添加行业信息"""
    print("\n📊 正在为训练数据添加行业信息...")
    
    # 构建行业映射
    industry_map = build_industry_mapping()
    
    # 读取训练数据
    print("\n📂 正在读取训练数据...")
    df = pd.read_excel(INPUT_EXCEL, sheet_name='原始数据')
    print(f"   读取了 {len(df)} 条记录")
    
    # 添加行业信息
    print("\n⚙️  正在匹配行业信息...")
    df['industry_name'] = df['stock_code'].map(
        lambda x: industry_map.get(x, {}).get('industry_name', '未知')
    )
    df['industry_code'] = df['stock_code'].map(
        lambda x: industry_map.get(x, {}).get('industry_code', 'UNKNOWN')
    )
    
    # 统计匹配情况
    matched = (df['industry_name'] != '未知').sum()
    unmatched = len(df) - matched
    print(f"   ✅ 匹配成功: {matched} 条 ({matched/len(df)*100:.2f}%)")
    print(f"   ⚠️  未匹配: {unmatched} 条 ({unmatched/len(df)*100:.2f}%)")
    
    # 保存到新Excel
    print(f"\n💾 正在保存到: {OUTPUT_EXCEL}")
    with pd.ExcelWriter(OUTPUT_EXCEL, engine='openpyxl') as writer:
        df.to_excel(writer, sheet_name='原始数据', index=False)
    
    print("✅ 完成！")
    
    # 显示行业分布
    print("\n📈 训练数据中的行业分布（Top 20）:")
    print("=" * 80)
    industry_counts = df['industry_name'].value_counts()
    for i, (industry, count) in enumerate(industry_counts.head(20).items(), 1):
        print(f"{i:2d}. {industry:20s}: {count:6d} 条记录")
    
    return df

if __name__ == "__main__":
    add_industry_to_training_data()
