"""
简化版数据提取脚本 - 仅使用回测数据中的收益率信息
暂不计算K线特征，用于快速验证流程
"""

import json
import os
import glob
from datetime import datetime
import pandas as pd
import numpy as np
from pathlib import Path

# ==================== 配置 ====================
BACKTEST_DATA_DIR = r"d:\other\test666\docs\回测优化\历史回测数据"
OUTPUT_DIR = r"d:\other\test666\docs\回测优化\验证脚本"

# ==================== 工具函数 ====================

def load_and_label_signals():
    """加载回测数据并标注信号"""
    print("[1/2] 正在加载和标注回测数据...")
    
    pattern = os.path.join(BACKTEST_DATA_DIR, "backtest_filtered_*.json")
    files = sorted(glob.glob(pattern))
    
    if not files:
        raise FileNotFoundError(f"未找到回测数据文件: {pattern}")
    
    print(f"   找到 {len(files)} 个回测数据文件")
    
    all_signals = []
    
    for file_path in files:
        with open(file_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        # 遍历每只股票
        for stock in data.get('data', []):
            code = stock['code']
            name = stock['name']
            
            # 遍历每个信号
            for signal in stock.get('signals', []):
                signal_date = signal['signalDate']
                entry_price = signal['entryPrice']
                returns = signal.get('returns', {})
                
                # 提取各周期收益
                day1 = returns.get('day1', {}).get('value', None)
                day2 = returns.get('day2', {}).get('value', None)
                day3 = returns.get('day3', {}).get('value', None)
                day5 = returns.get('day5', {}).get('value', None)
                
                # 标注信号质量
                positive_count = 0
                for ret in [day1, day2, day3, day5]:
                    if ret is not None and ret > 0:
                        positive_count += 1
                
                label = 1 if positive_count >= 2 else 0
                
                all_signals.append({
                    'stock_code': code,
                    'stock_name': name,
                    'signal_date': signal_date,
                    'entry_price': entry_price,
                    'label': label,
                    'day1_return': day1,
                    'day2_return': day2,
                    'day3_return': day3,
                    'day5_return': day5,
                    'positive_count': positive_count,
                })
    
    print(f"   共提取 {len(all_signals)} 个信号")
    
    # 统计标注结果
    positive_count = sum(1 for s in all_signals if s['label'] == 1)
    negative_count = sum(1 for s in all_signals if s['label'] == 0)
    
    print(f"   好信号: {positive_count} ({positive_count/len(all_signals)*100:.2f}%)")
    print(f"   坏信号: {negative_count} ({negative_count/len(all_signals)*100:.2f}%)")
    print()
    
    return all_signals


# ==================== 主流程 ====================

def main():
    print("=" * 80)
    print("简化版信号数据提取脚本（无K线特征）")
    print("=" * 80)
    print()
    
    # Step 1: 加载和标注数据
    signals = load_and_label_signals()
    
    # Step 2: 创建DataFrame并导出
    print("[2/2] 正在生成Excel文件...")
    
    df = pd.DataFrame(signals)
    
    # 创建Excel文件
    output_excel = os.path.join(OUTPUT_DIR, "signal_training_data_simple.xlsx")
    
    with pd.ExcelWriter(output_excel, engine='openpyxl') as writer:
        # Sheet 1: 原始数据
        df.to_excel(writer, sheet_name='原始数据', index=False)
        
        # Sheet 2: 数据统计
        stats_data = {
            '指标': [
                '总样本数',
                '好信号数量',
                '坏信号数量',
                '好信号比例',
                '坏信号比例',
                '正负样本比'
            ],
            '数值': [
                len(df),
                df[df['label'] == 1].shape[0],
                df[df['label'] == 0].shape[0],
                f"{df[df['label'] == 1].shape[0]/len(df)*100:.2f}%",
                f"{df[df['label'] == 0].shape[0]/len(df)*100:.2f}%",
                f"1:{df[df['label'] == 0].shape[0]/df[df['label'] == 1].shape[0]:.2f}" if df[df['label'] == 1].shape[0] > 0 else "N/A"
            ]
        }
        stats_df = pd.DataFrame(stats_data)
        stats_df.to_excel(writer, sheet_name='数据统计', index=False)
        
        # Sheet 3: 收益率分布统计
        return_stats = df[['day1_return', 'day2_return', 'day3_return', 'day5_return']].describe()
        return_stats.to_excel(writer, sheet_name='收益率统计')
        
        # Sheet 4: 好信号vs坏信号收益率对比
        comparison_data = []
        for col in ['day1_return', 'day2_return', 'day3_return', 'day5_return']:
            good_mean = df[df['label'] == 1][col].mean()
            bad_mean = df[df['label'] == 0][col].mean()
            good_std = df[df['label'] == 1][col].std()
            bad_std = df[df['label'] == 0][col].std()
            
            comparison_data.append({
                '周期': col,
                '好信号均值': good_mean,
                '好信号标准差': good_std,
                '坏信号均值': bad_mean,
                '坏信号标准差': bad_std,
                '差异': good_mean - bad_mean
            })
        
        comparison_df = pd.DataFrame(comparison_data)
        comparison_df.to_excel(writer, sheet_name='好坏信号对比', index=False)
    
    print(f"[OK] Excel文件已保存: {output_excel}")
    print()
    
    # 保存CSV摘要
    output_csv = os.path.join(OUTPUT_DIR, "signal_label_summary_simple.csv")
    summary_df = df[['stock_code', 'stock_name', 'signal_date', 'entry_price', 'label', 
                     'day1_return', 'day2_return', 'day3_return', 'day5_return', 'positive_count']]
    summary_df.to_csv(output_csv, index=False, encoding='utf-8-sig')
    print(f"[OK] CSV摘要已保存: {output_csv}")
    print()
    
    print("=" * 80)
    print("[OK] 数据提取与标注完成！")
    print("=" * 80)
    print()
    print("说明: 此版本未包含K线特征，仅用于验证数据标注流程")
    print("下一步: 需要修复完整版的特征计算逻辑")


if __name__ == "__main__":
    main()
