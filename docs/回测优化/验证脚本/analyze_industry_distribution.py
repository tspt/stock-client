"""
行业分布分析脚本
分析所有股票数据的行业分布，为分行业训练做准备
"""

import json
import os
from collections import defaultdict

# 配置
STOCK_DATA_DIR = r"d:\other\test666\docs\回测优化\股票数据"
OUTPUT_FILE = r"d:\other\test666\docs\回测优化\验证脚本\industry_analysis.json"

def analyze_industry_distribution():
    """分析所有股票的行业分布"""
    print("🔍 正在分析行业分布...")
    
    # 获取所有JSON文件
    files = [f for f in os.listdir(STOCK_DATA_DIR) if f.endswith('.json')]
    print(f"   找到 {len(files)} 个股票数据文件")
    
    # 统计行业分布
    industry_stats = defaultdict(lambda: {
        'count': 0,
        'stocks': [],
        'positive_samples': 0,
        'negative_samples': 0
    })
    
    processed = 0
    errors = 0
    
    for filename in files:
        try:
            filepath = os.path.join(STOCK_DATA_DIR, filename)
            with open(filepath, 'r', encoding='utf-8') as f:
                data = json.load(f)
            
            # 提取行业信息
            industry = data.get('industry', {})
            industry_name = industry.get('name', '未知')
            industry_code = industry.get('code', 'UNKNOWN')
            stock_code = data.get('data', {}).get('code', '')
            stock_name = data.get('data', {}).get('name', '')
            
            # 统计买点数据
            buypoint_dates = data.get('buypointDate', [])
            positive_count = len(buypoint_dates)
            
            # 估算负样本数量（假设每个股票有约100个交易日）
            daily_lines = data.get('data', {}).get('dailyLines', [])
            total_days = len(daily_lines)
            negative_count = max(0, total_days - positive_count)
            
            # 更新统计
            key = f"{industry_name} ({industry_code})"
            industry_stats[key]['count'] += 1
            industry_stats[key]['stocks'].append({
                'code': stock_code,
                'name': stock_name,
                'positive': positive_count,
                'negative': negative_count
            })
            industry_stats[key]['positive_samples'] += positive_count
            industry_stats[key]['negative_samples'] += negative_count
            
            processed += 1
            if processed % 500 == 0:
                print(f"   已处理 {processed}/{len(files)} 个文件...")
                
        except Exception as e:
            errors += 1
            if errors <= 5:
                print(f"   ⚠️  处理文件 {filename} 时出错: {e}")
    
    print(f"\n✅ 处理完成: {processed} 个成功, {errors} 个失败")
    
    # 转换为可序列化的格式
    result = {}
    for industry_key, stats in industry_stats.items():
        result[industry_key] = {
            'industry_name': industry_key.split(' (')[0],
            'industry_code': industry_key.split(' (')[1].rstrip(')') if '(' in industry_key else 'UNKNOWN',
            'stock_count': stats['count'],
            'total_positive_samples': stats['positive_samples'],
            'total_negative_samples': stats['negative_samples'],
            'total_samples': stats['positive_samples'] + stats['negative_samples'],
            'positive_ratio': round(stats['positive_samples'] / max(1, stats['positive_samples'] + stats['negative_samples']), 4),
            'sample_stocks': stats['stocks'][:5]  # 只保留前5个股票作为示例
        }
    
    # 按股票数量排序
    sorted_result = dict(sorted(result.items(), key=lambda x: x[1]['stock_count'], reverse=True))
    
    # 保存结果
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        json.dump(sorted_result, f, ensure_ascii=False, indent=2)
    
    print(f"\n📊 行业分布统计（Top 20）:")
    print("=" * 80)
    print(f"{'行业':<30} {'股票数':>8} {'正样本':>10} {'负样本':>10} {'正样本比例':>12}")
    print("-" * 80)
    
    for i, (industry, stats) in enumerate(list(sorted_result.items())[:20]):
        print(f"{industry:<30} {stats['stock_count']:>8} {stats['total_positive_samples']:>10} "
              f"{stats['total_negative_samples']:>10} {stats['positive_ratio']*100:>11.2f}%")
    
    print("\n" + "=" * 80)
    print(f"📁 详细结果已保存到: {OUTPUT_FILE}")
    
    # 建议的主要行业
    print("\n💡 建议单独建模的行业（股票数 >= 50）:")
    recommended = [(k, v) for k, v in sorted_result.items() if v['stock_count'] >= 50]
    for industry, stats in recommended:
        print(f"   - {industry}: {stats['stock_count']} 只股票, "
              f"{stats['total_positive_samples']} 个正样本")
    
    return sorted_result

if __name__ == "__main__":
    analyze_industry_distribution()
