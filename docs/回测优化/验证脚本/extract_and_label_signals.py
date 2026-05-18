"""
信号数据提取与标注脚本
从回测数据中提取所有信号点，并标注好坏信号
标注规则：1日、2日、3日、5日收益中≥2个为正 → 好信号(1)，否则坏信号(0)
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
STOCK_DATA_DIR = r"d:\other\test666\docs\回测优化\股票数据"
OUTPUT_DIR = r"d:\other\test666\docs\回测优化\验证脚本"

# ==================== 工具函数 ====================

def load_backtest_data():
    """加载所有回测数据文件"""
    print("[1/4] 正在加载回测数据...")
    
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
                
                all_signals.append({
                    'stock_code': code,
                    'stock_name': name,
                    'signal_date': signal_date,
                    'entry_price': entry_price,
                    'day1_return': day1,
                    'day2_return': day2,
                    'day3_return': day3,
                    'day5_return': day5,
                })
    
    print(f"   共提取 {len(all_signals)} 个信号")
    return all_signals


def label_signal(day1, day2, day3, day5):
    """
    标注信号质量
    规则：1日、2日、3日、5日中≥2个为正 → 好信号(1)，否则坏信号(0)
    """
    positive_count = 0
    
    for ret in [day1, day2, day3, day5]:
        if ret is not None and ret > 0:
            positive_count += 1
    
    return 1 if positive_count >= 2 else 0


# 全局错误计数器
error_count = 0

def calculate_features(stock_code, stock_name, signal_date, entry_price):
    """
    从股票K线数据中计算特征
    返回特征字典，如果数据不足则返回None
    """
    global error_count
    
    # 使用股票名称查找文件（去除特殊字符）
    clean_name = stock_name.replace(' ', '').replace('*', '')
    stock_file = os.path.join(STOCK_DATA_DIR, f"{clean_name}.json")
    
    if not os.path.exists(stock_file):
        # 尝试其他可能的文件名格式
        alternative_names = [
            stock_name,  # 原始名称
            stock_name.replace('XD', ''),  # 去除XD前缀
            stock_name.replace('N', ''),  # 去除N前缀
        ]
        for alt_name in alternative_names:
            alt_file = os.path.join(STOCK_DATA_DIR, f"{alt_name}.json")
            if os.path.exists(alt_file):
                stock_file = alt_file
                break
        else:
            # 如果都找不到，返回None
            error_count += 1
            if error_count <= 5:
                print(f"   [DEBUG-FAIL] 文件不存在: {stock_name}, 尝试路径: {stock_file}")
            return None
    
    if not os.path.exists(stock_file):
        error_count += 1
        if error_count <= 5:
            print(f"   [DEBUG-FAIL] 最终文件不存在: {stock_name}")
        return None
    
    try:
        with open(stock_file, 'r', encoding='utf-8') as f:
            stock_data = json.load(f)
        
        daily_lines = stock_data.get('data', {}).get('dailyLines', [])
        
        if not daily_lines or len(daily_lines) < 20:  # 降低要求至20天
            error_count += 1
            if error_count <= 5:
                print(f"   [DEBUG-FAIL] K线数据不足: {stock_name}, 只有{len(daily_lines) if daily_lines else 0}条")
            return None
        
        # 找到信号日期对应的索引（只匹配日期，忽略时分秒）
        signal_timestamp = None
        try:
            # 将日期字符串转换为时间戳（设置为当天0点）
            from datetime import timezone
            dt = datetime.strptime(signal_date, '%Y-%m-%d')
            # 设置为当天0点UTC时间
            signal_timestamp = int(dt.replace(tzinfo=timezone.utc).timestamp() * 1000)
        except:
            return None
        
        # 查找匹配的K线数据（按日期匹配）
        signal_idx = None
        for i, line in enumerate(daily_lines):
            # 将K线时间戳转换为日期进行比较
            kline_date = datetime.fromtimestamp(line.get('time', 0) / 1000).strftime('%Y-%m-%d')
            if kline_date == signal_date:
                signal_idx = i
                break
        
        if signal_idx is None or signal_idx < 10:  # 降低要求至10
            error_count += 1
            if error_count <= 5:
                print(f"   [DEBUG-FAIL] 信号索引无效: {stock_name}, signal_idx={signal_idx}")
            return None
        
        # 提取信号日前60天的数据
        start_idx = max(0, signal_idx - 59)
        slice_data = daily_lines[start_idx:signal_idx + 1]
        
        if len(slice_data) < 20:
            error_count += 1
            if error_count <= 5:
                print(f"   [DEBUG-FAIL] 切片数据不足: {stock_name}, 只有{len(slice_data)}条")
            return None
        
        # 计算各种指标
        closes = [line['close'] for line in slice_data]
        highs = [line['high'] for line in slice_data]
        lows = [line['low'] for line in slice_data]
        volumes = [line['volume'] for line in slice_data]
        
        current_close = closes[-1]
        current_volume = volumes[-1]
        
        # 1. 价格位置特征
        highest_60d = max(highs[-60:]) if len(highs) >= 60 else max(highs)
        dist_from_high_60d = ((current_close - highest_60d) / highest_60d) * 100
        
        # 2. 移动平均线
        ma5 = np.mean(closes[-5:]) if len(closes) >= 5 else current_close
        ma10 = np.mean(closes[-10:]) if len(closes) >= 10 else current_close
        ma20 = np.mean(closes[-20:]) if len(closes) >= 20 else current_close
        
        dist_from_ma20 = ((current_close - ma20) / ma20) * 100 if ma20 > 0 else 0
        
        # 3. 布林带
        bb_middle = ma20
        bb_std = np.std(closes[-20:]) if len(closes) >= 20 else 0
        bb_upper = bb_middle + 2 * bb_std
        bb_lower = bb_middle - 2 * bb_std
        bb_width = (bb_upper - bb_lower) / bb_middle if bb_middle > 0 else 0
        price_bb_position = (current_close - bb_lower) / (bb_upper - bb_lower) if (bb_upper - bb_lower) > 0 else 0.5
        
        # 4. 趋势特征
        change_5d = ((closes[-1] - closes[-5]) / closes[-5]) * 100 if len(closes) >= 5 and closes[-5] > 0 else 0
        change_10d = ((closes[-1] - closes[-10]) / closes[-10]) * 100 if len(closes) >= 10 and closes[-10] > 0 else 0
        change_20d = ((closes[-1] - closes[-20]) / closes[-20]) * 100 if len(closes) >= 20 and closes[-20] > 0 else 0
        
        # MA斜率
        ma5_slope = (ma5 - np.mean(closes[-10:-5])) / np.mean(closes[-10:-5]) if len(closes) >= 10 and np.mean(closes[-10:-5]) > 0 else 0
        ma20_slope = (ma20 - np.mean(closes[-40:-20])) / np.mean(closes[-40:-20]) if len(closes) >= 40 and np.mean(closes[-40:-20]) > 0 else 0
        
        # 5. 波动特征
        atr_values = []
        for i in range(max(1, len(slice_data) - 14), len(slice_data)):
            high = highs[i]
            low = lows[i]
            prev_close = closes[i-1]
            tr = max(high - low, abs(high - prev_close), abs(low - prev_close))
            atr_values.append(tr)
        
        atr_14 = np.mean(atr_values) if atr_values else 0
        atr_percent = (atr_14 / current_close) * 100 if current_close > 0 else 0
        
        recent_volatility = np.std(closes[-10:]) / np.mean(closes[-10:]) if len(closes) >= 10 and np.mean(closes[-10:]) > 0 else 0
        
        # 6. 成交量特征
        avg_vol_5 = np.mean(volumes[-5:]) if len(volumes) >= 5 else current_volume
        avg_vol_10 = np.mean(volumes[-10:]) if len(volumes) >= 10 else current_volume
        
        volume_ratio = current_volume / avg_vol_5 if avg_vol_5 > 0 else 1
        volume_change_5d = (avg_vol_5 - avg_vol_10) / avg_vol_10 if avg_vol_10 > 0 else 0
        
        # 7. RSI指标
        def calculate_rsi(prices, period=14):
            if len(prices) < period + 1:
                return 50
            
            deltas = np.diff(prices[-period-1:])
            gains = np.where(deltas > 0, deltas, 0)
            losses = np.where(deltas < 0, -deltas, 0)
            
            avg_gain = np.mean(gains)
            avg_loss = np.mean(losses)
            
            if avg_loss == 0:
                return 100
            
            rs = avg_gain / avg_loss
            rsi = 100 - (100 / (1 + rs))
            return rsi
        
        rsi_14 = calculate_rsi(closes, 14)
        
        # 8. MACD柱状图（简化版）
        def calculate_macd_hist(prices):
            if len(prices) < 26:
                return 0
            
            ema12 = pd.Series(prices).ewm(span=12, adjust=False).mean().iloc[-1]
            ema26 = pd.Series(prices).ewm(span=26, adjust=False).mean().iloc[-1]
            macd_line = ema12 - ema26
            signal_line = pd.Series([macd_line]).ewm(span=9, adjust=False).mean().iloc[-1]
            return macd_line - signal_line
        
        macd_histogram = calculate_macd_hist(closes)
        
        return {
            'dist_from_high_60d': dist_from_high_60d,
            'price_bb_position': price_bb_position,
            'dist_from_ma20': dist_from_ma20,
            'change_5d': change_5d,
            'change_10d': change_10d,
            'change_20d': change_20d,
            'ma5_slope': ma5_slope,
            'ma20_slope': ma20_slope,
            'atr_percent': atr_percent,
            'bb_width': bb_width,
            'recent_volatility': recent_volatility,
            'volume_ratio': volume_ratio,
            'volume_change_5d': volume_change_5d,
            'rsi_14': rsi_14,
            'macd_histogram': macd_histogram,
        }
        
    except Exception as e:
        error_count += 1
        import traceback
        if error_count <= 10:  # 只打印前10个错误的详细信息
            print(f"   [WARN] 处理股票 {stock_code} ({stock_name}) 时出错: {str(e)}")
            print(f"      堆栈: {traceback.format_exc()}")
        return None


# ==================== 主流程 ====================

def main():
    print("=" * 80)
    print("信号数据提取与标注脚本")
    print("=" * 80)
    print()
    
    # Step 1: 加载回测数据
    signals = load_backtest_data()
    print()
    
    # Step 2: 标注信号
    print("[LABEL]  正在标注信号...")
    labeled_signals = []
    
    for sig in signals:
        label = label_signal(
            sig['day1_return'],
            sig['day2_return'],
            sig['day3_return'],
            sig['day5_return']
        )
        sig['label'] = label
        labeled_signals.append(sig)
    
    # 统计标注结果
    positive_count = sum(1 for s in labeled_signals if s['label'] == 1)
    negative_count = sum(1 for s in labeled_signals if s['label'] == 0)
    
    print(f"   好信号: {positive_count} ({positive_count/len(labeled_signals)*100:.2f}%)")
    print(f"   坏信号: {negative_count} ({negative_count/len(labeled_signals)*100:.2f}%)")
    print()
    
    # Step 3: 计算特征（可能需要较长时间）
    print("[FEAT] 正在计算特征（这可能需要几分钟）...")
    
    features_list = []
    success_count = 0
    fail_count = 0
    
    for i, sig in enumerate(labeled_signals):
        if i % 500 == 0:
            print(f"   进度: {i}/{len(labeled_signals)} ({i/len(labeled_signals)*100:.1f}%)")
        
        # 前10个信号打印调试信息
        if i < 10:
            print(f"   [DEBUG] 处理第{i+1}个信号: {sig['stock_code']} - {sig['stock_name']}, 日期: {sig['signal_date']}")
        
        features = calculate_features(
            sig['stock_code'],
            sig['stock_name'],
            sig['signal_date'],
            sig['entry_price']
        )
        
        if features:
            features.update(sig)
            features_list.append(features)
            success_count += 1
        else:
            fail_count += 1
    
    print(f"   [OK] 成功: {success_count}, [FAIL] 失败: {fail_count}")
    print()
    
    if not features_list:
        print("[FAIL] 错误: 没有成功提取任何特征数据")
        return
    
    # Step 4: 创建DataFrame并导出
    print("[EXCEL] 正在生成Excel文件...")
    
    df = pd.DataFrame(features_list)
    
    # 重新排列列顺序
    base_columns = [
        'stock_code', 'stock_name', 'signal_date', 'entry_price', 'label',
        'day1_return', 'day2_return', 'day3_return', 'day5_return'
    ]
    feature_columns = [col for col in df.columns if col not in base_columns]
    
    df = df[base_columns + feature_columns]
    
    # 创建Excel文件
    output_excel = os.path.join(OUTPUT_DIR, "signal_training_data.xlsx")
    
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
                positive_count,
                negative_count,
                f"{positive_count/len(df)*100:.2f}%",
                f"{negative_count/len(df)*100:.2f}%",
                f"1:{negative_count/positive_count:.2f}" if positive_count > 0 else "N/A"
            ]
        }
        stats_df = pd.DataFrame(stats_data)
        stats_df.to_excel(writer, sheet_name='数据统计', index=False)
        
        # Sheet 3: 特征统计
        feature_stats = df[feature_columns].describe()
        feature_stats.to_excel(writer, sheet_name='特征统计')
        
        # Sheet 4: 好信号vs坏信号对比
        comparison_data = []
        for col in feature_columns:
            good_mean = df[df['label'] == 1][col].mean()
            bad_mean = df[df['label'] == 0][col].mean()
            good_std = df[df['label'] == 1][col].std()
            bad_std = df[df['label'] == 0][col].std()
            
            comparison_data.append({
                '特征': col,
                '好信号均值': good_mean,
                '好信号标准差': good_std,
                '坏信号均值': bad_mean,
                '坏信号标准差': bad_std,
                '差异': good_mean - bad_mean
            })
        
        comparison_df = pd.DataFrame(comparison_data)
        comparison_df = comparison_df.sort_values('差异', key=abs, ascending=False)
        comparison_df.to_excel(writer, sheet_name='好坏信号对比', index=False)
    
    print(f"[OK] Excel文件已保存: {output_excel}")
    print()
    
    # Step 5: 保存CSV摘要
    output_csv = os.path.join(OUTPUT_DIR, "signal_label_summary.csv")
    summary_df = df[['stock_code', 'stock_name', 'signal_date', 'entry_price', 'label', 
                     'day1_return', 'day2_return', 'day3_return', 'day5_return']]
    summary_df.to_csv(output_csv, index=False, encoding='utf-8-sig')
    print(f"[OK] CSV摘要已保存: {output_csv}")
    print()
    
    print("=" * 80)
    print("[OK] 数据提取与标注完成！")
    print("=" * 80)
    print()
    print("下一步: 运行 train_random_forest_model.py 进行模型训练")


if __name__ == "__main__":
    main()
