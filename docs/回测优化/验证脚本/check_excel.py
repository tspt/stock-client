import pandas as pd

# 读取Excel文件
excel_file = 'signal_training_data.xlsx'
df = pd.read_excel(excel_file, sheet_name='原始数据')

print('Excel文件列名:')
print(df.columns.tolist())
print(f'\n总记录数: {len(df)}')
print(f'\n前3行数据:')
print(df.head(3))

# 检查是否有股票代码字段
if 'stock_code' in df.columns:
    print(f'\n股票代码示例: {df["stock_code"].head(5).tolist()}')
