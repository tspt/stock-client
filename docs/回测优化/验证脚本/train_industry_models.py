"""
分行业训练随机森林模型
为每个主要行业训练独立的模型，以提高精确率
"""

import json
import os
import numpy as np
import pandas as pd
from datetime import datetime
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import GroupShuffleSplit
from sklearn.metrics import precision_score, recall_score, f1_score, roc_auc_score, confusion_matrix
from sklearn.utils import resample
import warnings
warnings.filterwarnings('ignore')

# ==================== 配置 ====================
INPUT_EXCEL = r"d:\other\test666\docs\回测优化\验证脚本\signal_training_data_with_industry.xlsx"
OUTPUT_DIR = r"d:\other\test666\docs\回测优化\验证脚本\industry_models"

# 创建输出目录
os.makedirs(OUTPUT_DIR, exist_ok=True)

# 模型参数（使用之前优化后的参数）
N_ESTIMATORS = 100
MAX_DEPTH = 12
MIN_SAMPLES_SPLIT = 15
MIN_SAMPLES_LEAF = 8
TEST_SIZE = 0.3
RANDOM_STATE = 42
TARGET_RATIO = 4.0  # 负样本:正样本 = 4:1
PREDICTION_THRESHOLD = 0.60  # 使用之前优化的阈值

# 选择要训练的行业（所有样本数>=500的行业）
# 会自动从数据中识别，不需要手动指定
MAJOR_INDUSTRIES = None  # 设置为None表示自动选择

def load_and_filter_by_industry(df, industry_name):
    """加载并过滤特定行业的数据"""
    print(f"\n📂 正在加载 {industry_name} 行业数据...")
    
    df_industry = df[df['industry_name'] == industry_name].copy()
    print(f"   该行业共有 {len(df_industry)} 条记录")
    
    if len(df_industry) < 100:
        print(f"   ⚠️  样本数太少，跳过")
        return None
    
    # 检查标签分布
    positive_count = (df_industry['label'] == 1).sum()
    negative_count = (df_industry['label'] == 0).sum()
    print(f"   正样本: {positive_count}, 负样本: {negative_count}")
    print(f"   正样本比例: {positive_count/len(df_industry)*100:.2f}%")
    
    if positive_count < 50:
        print(f"   ⚠️  正样本太少，跳过")
        return None
    
    return df_industry

def balance_samples(df):
    """平衡正负样本"""
    positive_samples = df[df['label'] == 1]
    negative_samples = df[df['label'] == 0]
    
    if len(negative_samples) > len(positive_samples) * TARGET_RATIO:
        n_negative_target = int(len(positive_samples) * TARGET_RATIO)
        negative_downsampled = resample(
            negative_samples,
            replace=False,
            n_samples=n_negative_target,
            random_state=RANDOM_STATE
        )
        df_balanced = pd.concat([positive_samples, negative_downsampled])
        df_balanced = df_balanced.sample(frac=1, random_state=RANDOM_STATE).reset_index(drop=True)
        print(f"   ⚖️  欠采样后 - 正样本: {len(positive_samples)}, 负样本: {len(negative_downsampled)}")
    else:
        df_balanced = df.copy()
        print(f"   ⚖️  样本比例合理，无需采样")
    
    return df_balanced

def train_industry_model(df_industry, industry_name):
    """为单个行业训练模型"""
    print(f"\n🌲 正在训练 {industry_name} 行业模型...")
    
    # 特征列
    feature_columns = [col for col in df_industry.columns if col not in [
        'stock_code', 'stock_name', 'signal_date', 'entry_price', 'label',
        'day1_return', 'day2_return', 'day3_return', 'day5_return',
        'industry_name', 'industry_code'
    ]]
    
    # 划分数据集
    X = df_industry[feature_columns]
    y = df_industry['label']
    groups = df_industry['stock_code']
    
    gss = GroupShuffleSplit(n_splits=1, test_size=TEST_SIZE, random_state=RANDOM_STATE)
    train_idx, test_idx = next(gss.split(X, y, groups=groups))
    
    X_train, X_test = X.iloc[train_idx], X.iloc[test_idx]
    y_train, y_test = y.iloc[train_idx], y.iloc[test_idx]
    
    print(f"   训练集: {len(X_train)} 样本")
    print(f"   测试集: {len(X_test)} 样本")
    
    # 训练模型
    model = RandomForestClassifier(
        n_estimators=N_ESTIMATORS,
        max_depth=MAX_DEPTH,
        min_samples_split=MIN_SAMPLES_SPLIT,
        min_samples_leaf=MIN_SAMPLES_LEAF,
        class_weight={0: 3, 1: 1},  # 给坏信号更高权重
        random_state=RANDOM_STATE,
        n_jobs=-1,
        verbose=0
    )
    
    model.fit(X_train, y_train)
    print(f"   ✅ 模型训练完成")
    
    # 评估模型
    y_pred_proba = model.predict_proba(X_test)[:, 1]
    y_pred = (y_pred_proba >= PREDICTION_THRESHOLD).astype(int)
    
    precision = precision_score(y_test, y_pred, zero_division=0)
    recall = recall_score(y_test, y_pred, zero_division=0)
    f1 = f1_score(y_test, y_pred, zero_division=0)
    auc = roc_auc_score(y_test, y_pred_proba) if len(np.unique(y_test)) > 1 else 0.5
    
    print(f"\n📊 {industry_name} 模型性能:")
    print(f"   精确率: {precision:.4f} ({precision*100:.2f}%)")
    print(f"   召回率: {recall:.4f} ({recall*100:.2f}%)")
    print(f"   F1分数: {f1:.4f}")
    print(f"   AUC-ROC: {auc:.4f}")
    
    # 导出模型为JSON
    def tree_to_dict(tree, feature_names):
        tree_ = tree.tree_
        feature_name = [feature_names[i] if i != -2 else "undefined" for i in tree_.feature]
        
        def recurse(node):
            if tree_.feature[node] != -2:
                name = feature_name[node]
                threshold = float(tree_.threshold[node])
                left_child = recurse(tree_.children_left[node])
                right_child = recurse(tree_.children_right[node])
                return {"feature": name, "threshold": threshold, "left": left_child, "right": right_child}
            else:
                values = tree_.value[node][0]
                prediction = int(np.argmax(values))
                probability = float(np.max(values) / np.sum(values)) if np.sum(values) > 0 else 0.5
                return {"prediction": prediction, "probability": probability}
        
        return recurse(0)
    
    trees_list = []
    for estimator in model.estimators_:
        tree_dict = tree_to_dict(estimator, feature_columns)
        trees_list.append(tree_dict)
    
    model_data = {
        "metadata": {
            "version": "v5.0",
            "model_type": "RandomForest",
            "industry": industry_name,
            "training_date": datetime.now().isoformat(),
            "n_estimators": N_ESTIMATORS,
            "max_depth": MAX_DEPTH,
            "prediction_threshold": PREDICTION_THRESHOLD,
            "performance": {
                "precision": round(precision, 4),
                "recall": round(recall, 4),
                "f1": round(f1, 4),
                "auc_roc": round(auc, 4),
            },
            "feature_names": feature_columns,
        },
        "trees": trees_list
    }
    
    # 保存模型
    model_filename = f"{industry_name}_model.json".replace('/', '_').replace('\\', '_')
    model_path = os.path.join(OUTPUT_DIR, model_filename)
    
    with open(model_path, 'w', encoding='utf-8') as f:
        json.dump(model_data, f, ensure_ascii=False, indent=2)
    
    file_size = os.path.getsize(model_path) / 1024 / 1024
    print(f"\n💾 模型已保存: {model_path} ({file_size:.2f} MB)")
    
    return {
        'industry': industry_name,
        'precision': precision,
        'recall': recall,
        'f1': f1,
        'auc': auc,
        'model_path': model_path
    }

def main():
    print("=" * 80)
    print("分行业随机森林模型训练")
    print("=" * 80)
    
    # 读取带行业信息的训练数据
    print("\n📂 正在读取训练数据...")
    df = pd.read_excel(INPUT_EXCEL, sheet_name='原始数据')
    print(f"   总共 {len(df)} 条记录")
    
    # 自动识别所有行业及其样本数
    industry_counts = df['industry_name'].value_counts()
    print(f"\n📊 发现 {len(industry_counts)} 个行业")
    
    # 筛选样本数 >= 500 的行业
    MIN_SAMPLES = 500
    selected_industries = [ind for ind, count in industry_counts.items() if count >= MIN_SAMPLES]
    print(f"   选择样本数 >= {MIN_SAMPLES} 的行业: {len(selected_industries)} 个")
    print("\n选中的行业列表:")
    for i, (ind, count) in enumerate(industry_counts[industry_counts >= MIN_SAMPLES].items(), 1):
        print(f"   {i:2d}. {ind:20s}: {count:6d} 条记录")
    
    # 为每个选中的行业训练模型
    results = []
    for industry in selected_industries:
        try:
            # 过滤行业数据
            df_industry = load_and_filter_by_industry(df, industry)
            if df_industry is None:
                continue
            
            # 平衡样本
            df_balanced = balance_samples(df_industry)
            
            # 训练模型
            result = train_industry_model(df_balanced, industry)
            results.append(result)
            
        except Exception as e:
            print(f"\n❌ {industry} 行业训练失败: {e}")
            import traceback
            traceback.print_exc()
    
    # 汇总结果
    print("\n" + "=" * 80)
    print("训练结果汇总")
    print("=" * 80)
    print(f"{'行业':<15} {'精确率':>10} {'召回率':>10} {'F1分数':>10} {'AUC':>10}")
    print("-" * 80)
    
    for result in results:
        print(f"{result['industry']:<15} {result['precision']:>9.2%} {result['recall']:>9.2%} "
              f"{result['f1']:>10.4f} {result['auc']:>10.4f}")
    
    print(f"\n✅ 共成功训练 {len(results)} 个行业模型")
    print(f"📁 模型保存在: {OUTPUT_DIR}")

if __name__ == "__main__":
    main()
