"""测试单个股票的特征计算"""
import json
import os
import numpy as np
from datetime import datetime, timezone

STOCK_DATA_DIR = r"d:\other\test666\docs\回测优化\股票数据"

def test_calculate_features():
    # 测试数据
    stock_code = "SH600004"
    stock_name = "白云机场"
    signal_date = "2024-06-14"
    entry_price = 10.06
    
    print(f"测试股票: {stock_code} - {stock_name}")
    print(f"信号日期: {signal_date}, 入场价: {entry_price}")
    print()
    
    # 查找文件
    clean_name = stock_name.replace(' ', '').replace('*', '')
    stock_file = os.path.join(STOCK_DATA_DIR, f"{clean_name}.json")
    print(f"文件路径: {stock_file}")
    print(f"文件存在: {os.path.exists(stock_file)}")
    print()
    
    if not os.path.exists(stock_file):
        print("文件不存在！")
        return
    
    # 加载数据
    with open(stock_file, 'r', encoding='utf-8') as f:
        stock_data = json.load(f)
    
    daily_lines = stock_data.get('data', {}).get('dailyLines', [])
    print(f"K线数据条数: {len(daily_lines)}")
    
    if not daily_lines or len(daily_lines) < 60:
        print("K线数据不足60条！")
        return
    
    # 找到信号日期对应的索引
    signal_timestamp = None
    try:
        dt = datetime.strptime(signal_date, '%Y-%m-%d')
        signal_timestamp = int(dt.replace(tzinfo=timezone.utc).timestamp() * 1000)
        print(f"信号时间戳: {signal_timestamp}")
    except Exception as e:
        print(f"日期转换失败: {e}")
        return
    
    # 查找最接近的K线数据（允许±1天的误差）
    signal_idx = None
    min_diff = float('inf')
    
    for i, line in enumerate(daily_lines):
        diff = abs(line['time'] - signal_timestamp)
        if diff < min_diff:
            min_diff = diff
            signal_idx = i
    
    # 如果差异超过2天，认为找不到
    if min_diff > 2 * 86400000:  # 2天
        print(f"未找到信号日期 {signal_date} 对应的K线数据")
        print(f"第一个K线时间: {daily_lines[0]['time']} ({datetime.fromtimestamp(daily_lines[0]['time']/1000).strftime('%Y-%m-%d')})")
        print(f"最后一个K线时间: {daily_lines[-1]['time']} ({datetime.fromtimestamp(daily_lines[-1]['time']/1000).strftime('%Y-%m-%d')})")
        
        closest_date = datetime.fromtimestamp(daily_lines[signal_idx]['time']/1000).strftime('%Y-%m-%d')
        print(f"最接近的K线日期: {closest_date}, 差异: {min_diff/86400000:.1f}天")
        return
    
    closest_date = datetime.fromtimestamp(daily_lines[signal_idx]['time']/1000).strftime('%Y-%m-%d')
    print(f"找到K线索引: {signal_idx}, 日期: {closest_date}, 时间差异: {min_diff/86400000:.2f}天")
    
    print(f"信号日期在K线中的索引: {signal_idx}")
    print(f"信号日期的收盘价: {daily_lines[signal_idx]['close']}")
    
    # 提取数据
    closes = np.array([line['close'] for line in daily_lines[:signal_idx+1]])
    highs = np.array([line['high'] for line in daily_lines[:signal_idx+1]])
    lows = np.array([line['low'] for line in daily_lines[:signal_idx+1]])
    volumes = np.array([line['volume'] for line in daily_lines[:signal_idx+1]])
    
    print(f"可用于计算的K线数量: {len(closes)}")
    
    if len(closes) < 60:
        print("数据不足60天，无法计算特征")
        return
    
    current_close = closes[-1]
    
    # 计算特征
    print("\n=== 开始计算特征 ===")
    
    # 1. 价格位置特征
    highest_60d = max(highs[-60:])
    dist_from_high_60d = ((current_close - highest_60d) / highest_60d) * 100
    print(f"1. 距离60日最高价: {dist_from_high_60d:.2f}%")
    
    ma5 = np.mean(closes[-5:])
    ma20 = np.mean(closes[-20:])
    dist_from_ma20 = ((current_close - ma20) / ma20) * 100 if ma20 > 0 else 0
    print(f"2. 距离MA20: {dist_from_ma20:.2f}%")
    
    bb_middle = ma20
    bb_std = np.std(closes[-20:])
    bb_upper = bb_middle + 2 * bb_std
    bb_lower = bb_middle - 2 * bb_std
    bb_width = (bb_upper - bb_lower) / bb_middle if bb_middle > 0 else 0
    price_bb_position = (current_close - bb_lower) / (bb_upper - bb_lower) if (bb_upper - bb_lower) > 0 else 0.5
    print(f"3. 布林带位置: {price_bb_position:.2f}")
    print(f"4. 布林带宽度: {bb_width:.4f}")
    
    # 2. 趋势特征
    change_5d = ((closes[-1] / closes[-5]) - 1) * 100 if len(closes) >= 5 else 0
    change_10d = ((closes[-1] / closes[-10]) - 1) * 100 if len(closes) >= 10 else 0
    change_20d = ((closes[-1] / closes[-20]) - 1) * 100 if len(closes) >= 20 else 0
    print(f"5. 5日涨幅: {change_5d:.2f}%")
    print(f"6. 10日涨幅: {change_10d:.2f}%")
    print(f"7. 20日涨幅: {change_20d:.2f}%")
    
    ma5_slope = ((ma5 / closes[-6]) - 1) * 100 if len(closes) >= 6 else 0
    ma20_slope = ((ma20 / closes[-21]) - 1) * 100 if len(closes) >= 21 else 0
    print(f"8. MA5斜率: {ma5_slope:.2f}%")
    print(f"9. MA20斜率: {ma20_slope:.2f}%")
    
    # 3. 波动特征
    atr_14 = np.mean([(highs[-i] - lows[-i]) for i in range(1, min(15, len(highs)))])
    atr_percent = (atr_14 / current_close) * 100 if current_close > 0 else 0
    print(f"10. ATR百分比: {atr_percent:.2f}%")
    
    recent_volatility = np.std(closes[-10:]) / np.mean(closes[-10:]) if len(closes) >= 10 and np.mean(closes[-10:]) > 0 else 0
    print(f"11. 近期波动率: {recent_volatility:.4f}")
    
    # 4. 成交量特征
    vol_5 = np.mean(volumes[-5:]) if len(volumes) >= 5 else np.mean(volumes)
    vol_20 = np.mean(volumes[-20:]) if len(volumes) >= 20 else np.mean(volumes)
    volume_ratio = vol_5 / vol_20 if vol_20 > 0 else 1
    print(f"12. 成交量比率(5/20): {volume_ratio:.2f}")
    
    vol_change_5d = ((volumes[-1] / volumes[-5]) - 1) * 100 if len(volumes) >= 5 and volumes[-5] > 0 else 0
    print(f"13. 成交量5日变化: {vol_change_5d:.2f}%")
    
    # 5. RSI
    if len(closes) >= 15:
        deltas = np.diff(closes[-15:])
        seed_gains = deltas[deltas > 0].sum() if len(deltas[deltas > 0]) > 0 else 0
        seed_losses = -deltas[deltas < 0].sum() if len(deltas[deltas < 0]) > 0 else 0
        avg_gain = seed_gains / 14
        avg_loss = seed_losses / 14
        rs = avg_gain / avg_loss if avg_loss > 0 else 100
        rsi_14 = 100 - (100 / (1 + rs))
    else:
        rsi_14 = 50
    print(f"14. RSI(14): {rsi_14:.2f}")
    
    # 6. MACD
    if len(closes) >= 26:
        ema12 = pd_ema(closes, 12)
        ema26 = pd_ema(closes, 26)
        macd_line = ema12 - ema26
        signal_line = pd_ema(np.array([macd_line]), 9)[0] if len(closes) >= 34 else macd_line
        macd_histogram = macd_line - signal_line
    else:
        macd_histogram = 0
    print(f"15. MACD柱状图: {macd_histogram:.4f}")
    
    print("\n=== 所有特征计算成功！===")

def pd_ema(prices, period):
    """计算EMA"""
    if len(prices) < period:
        return np.mean(prices)
    multiplier = 2 / (period + 1)
    ema = np.mean(prices[:period])
    for price in prices[period:]:
        ema = (price - ema) * multiplier + ema
    return ema

if __name__ == "__main__":
    test_calculate_features()
