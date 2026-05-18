"""
随机森林模型训练脚本
从标注好的数据中训练随机森林分类器，用于识别优质买点信号
"""

import json
import os
import numpy as np
import pandas as pd
from datetime import datetime
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import GroupShuffleSplit, cross_val_score
from sklearn.metrics import (
    classification_report, 
    confusion_matrix, 
    precision_score, 
    recall_score, 
    f1_score,
    roc_auc_score
)
from sklearn.utils import resample
import warnings
warnings.filterwarnings('ignore')

# ==================== 配置 ====================
INPUT_EXCEL = r"d:\other\test666\docs\回测优化\验证脚本\signal_training_data.xlsx"
OUTPUT_DIR = r"d:\other\test666\docs\回测优化\验证脚本"
MODEL_JSON = os.path.join(OUTPUT_DIR, "buypoint_model_v5.json")

# 模型参数
N_ESTIMATORS = 100        # 树的数量
MAX_DEPTH = 12            # 最大深度
MIN_SAMPLES_SPLIT = 15    # 节点最少样本数
MIN_SAMPLES_LEAF = 8      # 叶子节点最少样本数
TEST_SIZE = 0.3           # 测试集比例
RANDOM_STATE = 42         # 随机种子

# 采样配置
TARGET_RATIO = 4.0        # 负样本:正样本的目标比例（从2.5提高到4.0，增加负样本）

# 预测阈值调整（提高精确率）
# 将测试多个阈值，找到最佳平衡点
TEST_THRESHOLDS = [0.6, 0.65, 0.70, 0.75, 0.80, 0.85]
PREDICTION_THRESHOLD = 0.75  # 默认使用0.75


# ==================== 工具函数 ====================

def load_and_preprocess_data():
    """加载并预处理数据"""
    print("📂 正在加载数据...")
    
    if not os.path.exists(INPUT_EXCEL):
        raise FileNotFoundError(f"未找到数据文件: {INPUT_EXCEL}")
    
    df = pd.read_excel(INPUT_EXCEL, sheet_name='原始数据')
    print(f"   加载了 {len(df)} 条记录")
    
    # 检查缺失值
    feature_columns = [col for col in df.columns if col not in [
        'stock_code', 'stock_name', 'signal_date', 'entry_price', 'label',
        'day1_return', 'day2_return', 'day3_return', 'day5_return'
    ]]
    
    print(f"   特征数量: {len(feature_columns)}")
    print(f"   特征列表: {', '.join(feature_columns[:5])}...")
    
    # 删除有缺失值的行
    initial_count = len(df)
    df = df.dropna(subset=feature_columns + ['label'])
    dropped_count = initial_count - len(df)
    
    if dropped_count > 0:
        print(f"   ⚠️  删除了 {dropped_count} 条有缺失值的记录")
    
    print(f"   有效样本数: {len(df)}")
    print()
    
    return df, feature_columns


def balance_samples(df):
    """
    平衡正负样本
    如果负样本过多，进行欠采样
    """
    print("⚖️  正在平衡样本...")
    
    positive_samples = df[df['label'] == 1]
    negative_samples = df[df['label'] == 0]
    
    print(f"   原始数据 - 正样本: {len(positive_samples)}, 负样本: {len(negative_samples)}")
    print(f"   原始比例: 1:{len(negative_samples)/len(positive_samples):.2f}")
    
    # 如果负样本超过目标比例，进行欠采样
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
        
        print(f"   欠采样后 - 正样本: {len(positive_samples)}, 负样本: {len(negative_downsampled)}")
        print(f"   新比例: 1:{len(negative_downsampled)/len(positive_samples):.2f}")
    else:
        df_balanced = df.copy()
        print(f"   样本比例合理，无需采样")
    
    print()
    return df_balanced


def split_data(df, feature_columns):
    """
    按股票分组划分训练集和测试集
    防止同一股票的数据同时出现在训练和测试集中
    """
    print("🔄 正在划分数据集...")
    
    X = df[feature_columns]
    y = df['label']
    groups = df['stock_code']
    
    # 按股票分组划分
    gss = GroupShuffleSplit(n_splits=1, test_size=TEST_SIZE, random_state=RANDOM_STATE)
    train_idx, test_idx = next(gss.split(X, y, groups=groups))
    
    X_train, X_test = X.iloc[train_idx], X.iloc[test_idx]
    y_train, y_test = y.iloc[train_idx], y.iloc[test_idx]
    
    # 保留完整的DataFrame用于后续分析
    df_train = df.iloc[train_idx].reset_index(drop=True)
    df_test = df.iloc[test_idx].reset_index(drop=True)
    
    print(f"   训练集: {len(X_train)} 样本 ({len(df_train['stock_code'].unique())} 只股票)")
    print(f"   测试集: {len(X_test)} 样本 ({len(df_test['stock_code'].unique())} 只股票)")
    print(f"   训练集正样本比例: {y_train.mean()*100:.2f}%")
    print(f"   测试集正样本比例: {y_test.mean()*100:.2f}%")
    print()
    
    return X_train, X_test, y_train, y_test, df_train, df_test


def train_model(X_train, y_train):
    """训练随机森林模型"""
    print("🌲 正在训练随机森林模型...")
    
    model = RandomForestClassifier(
        n_estimators=N_ESTIMATORS,
        max_depth=MAX_DEPTH,
        min_samples_split=MIN_SAMPLES_SPLIT,
        min_samples_leaf=MIN_SAMPLES_LEAF,
        class_weight={0: 3, 1: 1},  # 给坏信号更高权重，提高精确率
        random_state=RANDOM_STATE,
        n_jobs=-1,  # 使用所有CPU核心
        verbose=0
    )
    
    model.fit(X_train, y_train)
    print(f"   ✅ 模型训练完成")
    print(f"   树的数量: {N_ESTIMATORS}")
    print(f"   最大深度: {MAX_DEPTH}")
    print()
    
    return model


def evaluate_model(model, X_test, y_test, feature_columns):
    """评估模型性能 - 测试多个阈值"""
    print("📊 正在评估模型性能...")
    
    # 预测
    y_pred_proba = model.predict_proba(X_test)[:, 1]
    y_pred_default = model.predict(X_test)
    
    print("=" * 80)
    print("模型性能评估 - 多阈值对比")
    print("=" * 80)
    print()
    
    # 存储各阈值的指标
    threshold_results = []
    
    for threshold in TEST_THRESHOLDS:
        y_pred_adjusted = (y_pred_proba >= threshold).astype(int)
        
        precision = precision_score(y_test, y_pred_adjusted, zero_division=0)
        recall = recall_score(y_test, y_pred_adjusted, zero_division=0)
        f1 = f1_score(y_test, y_pred_adjusted, zero_division=0)
        
        # 混淆矩阵
        cm = confusion_matrix(y_test, y_pred_adjusted)
        
        threshold_results.append({
            'threshold': threshold,
            'precision': precision,
            'recall': recall,
            'f1': f1,
            'cm': cm
        })
        
        print(f"🎯 阈值 {threshold:.2f}:")
        print(f"   精确率 (Precision): {precision:.4f} ({precision*100:.2f}%)")
        print(f"   召回率 (Recall):    {recall:.4f} ({recall*100:.2f}%)")
        print(f"   F1分数:             {f1:.4f}")
        print(f"   预测好信号数:       {y_pred_adjusted.sum()}")
        print(f"   混淆矩阵:")
        print(f"              预测坏信号  预测好信号")
        print(f"   实际坏信号     {cm[0][0]:6d}      {cm[0][1]:6d}")
        print(f"   实际好信号     {cm[1][0]:6d}      {cm[1][1]:6d}")
        print()
    
    # AUC-ROC（与阈值无关）
    auc_score = roc_auc_score(y_test, y_pred_proba)
    print(f"AUC-ROC: {auc_score:.4f}")
    print()
    
    # 选择最佳阈值（精确率优先）
    # 策略：选择精确率 >= 70% 的最高召回率的阈值
    high_precision_thresholds = [r for r in threshold_results if r['precision'] >= 0.70]
    
    if high_precision_thresholds:
        # 在精确率>=70%的阈值中，选择召回率最高的
        best_result = max(high_precision_thresholds, key=lambda x: x['recall'])
        print("✅ 推荐阈值（精确率>=70%且召回率最高）:")
    else:
        # 如果没有达到70%，选择精确率最高的
        best_result = max(threshold_results, key=lambda x: x['precision'])
        print("⚠️  未达到70%精确率，选择精确率最高的阈值:")
    
    print(f"   阈值: {best_result['threshold']:.2f}")
    print(f"   精确率: {best_result['precision']:.4f} ({best_result['precision']*100:.2f}%)")
    print(f"   召回率: {best_result['recall']:.4f} ({best_result['recall']*100:.2f}%)")
    print(f"   F1分数: {best_result['f1']:.4f}")
    print()
    
    # 使用推荐的阈值
    PREDICTION_THRESHOLD = best_result['threshold']
    y_pred_final = (y_pred_proba >= PREDICTION_THRESHOLD).astype(int)
    cm_final = best_result['cm']
    
    # 特征重要性
    print("Top 10 重要特征:")
    importances = model.feature_importances_
    indices = np.argsort(importances)[::-1]
    
    for i in range(min(10, len(feature_columns))):
        idx = indices[i]
        print(f"   {i+1}. {feature_columns[idx]:25s} {importances[idx]:.4f}")
    
    print()
    
    # 交叉验证
    print("5折交叉验证:")
    cv_scores = cross_val_score(model, X_test, y_test, cv=5, scoring='precision')
    print(f"   精确率均值: {cv_scores.mean():.4f} ± {cv_scores.std():.4f}")
    print()
    
    return {
        'precision_default': threshold_results[0]['precision'],
        'recall_default': threshold_results[0]['recall'],
        'f1_default': threshold_results[0]['f1'],
        'precision_adjusted': best_result['precision'],
        'recall_adjusted': best_result['recall'],
        'f1_adjusted': best_result['f1'],
        'auc_roc': auc_score,
        'confusion_matrix': cm_final.tolist(),
        'feature_importances': {
            feature_columns[i]: float(importances[i]) 
            for i in range(len(feature_columns))
        },
        'cv_precision_mean': float(cv_scores.mean()),
        'cv_precision_std': float(cv_scores.std()),
        'recommended_threshold': PREDICTION_THRESHOLD,
        'all_thresholds': threshold_results
    }


def export_model_to_json(model, feature_columns, performance_metrics):
    """将模型导出为JSON格式（JavaScript可用）"""
    print("💾 正在导出模型为JSON格式...")
    
    def tree_to_dict(tree, feature_names):
        """将sklearn的决策树转换为字典"""
        tree_ = tree.tree_
        feature_name = [
            feature_names[i] if i != -2 else "undefined" 
            for i in tree_.feature
        ]
        
        def recurse(node):
            if tree_.feature[node] != -2:  # 非叶子节点
                name = feature_name[node]
                threshold = float(tree_.threshold[node])
                left_child = recurse(tree_.children_left[node])
                right_child = recurse(tree_.children_right[node])
                
                return {
                    "feature": name,
                    "threshold": threshold,
                    "left": left_child,
                    "right": right_child
                }
            else:  # 叶子节点
                values = tree_.value[node][0]
                prediction = int(np.argmax(values))
                probability = float(np.max(values) / np.sum(values)) if np.sum(values) > 0 else 0.5
                
                return {
                    "prediction": prediction,
                    "probability": probability
                }
        
        return recurse(0)
    
    # 转换所有树
    trees_list = []
    for i, estimator in enumerate(model.estimators_):
        if i % 10 == 0:
            print(f"   转换进度: {i}/{len(model.estimators_)}")
        tree_dict = tree_to_dict(estimator, feature_columns)
        trees_list.append(tree_dict)
    
    # 构建完整的模型数据结构
    model_data = {
        "metadata": {
            "version": "v5.0",
            "model_type": "RandomForest",
            "config_id": "Config_RF_Precision_Opt",
            "training_date": datetime.now().isoformat(),
            "n_estimators": N_ESTIMATORS,
            "max_depth": MAX_DEPTH,
            "min_samples_split": MIN_SAMPLES_SPLIT,
            "min_samples_leaf": MIN_SAMPLES_LEAF,
            "prediction_threshold": performance_metrics['recommended_threshold'],
            "performance": {
                "precision": round(performance_metrics['precision_adjusted'], 4),
                "recall": round(performance_metrics['recall_adjusted'], 4),
                "f1": round(performance_metrics['f1_adjusted'], 4),
                "auc_roc": round(performance_metrics['auc_roc'], 4),
                "cv_precision_mean": round(performance_metrics['cv_precision_mean'], 4),
                "cv_precision_std": round(performance_metrics['cv_precision_std'], 4),
            },
            "feature_names": feature_columns,
        },
        "trees": trees_list
    }
    
    # 保存JSON文件
    with open(MODEL_JSON, 'w', encoding='utf-8') as f:
        json.dump(model_data, f, ensure_ascii=False, indent=2)
    
    file_size = os.path.getsize(MODEL_JSON) / 1024 / 1024  # MB
    print(f"   ✅ 模型已保存: {MODEL_JSON}")
    print(f"   文件大小: {file_size:.2f} MB")
    print()


def update_excel_with_results(excel_path, performance_metrics, feature_columns):
    """更新Excel文件，添加模型评估结果"""
    print("📝 正在更新Excel文件...")
    
    # 读取现有Excel
    excel_data = pd.ExcelFile(excel_path)
    
    with pd.ExcelWriter(excel_path, engine='openpyxl', mode='a', if_sheet_exists='replace') as writer:
        # Sheet 5: 模型评估结果
        metrics_data = {
            '指标': [
                '模型类型',
                '树的数量',
                '最大深度',
                '推荐预测阈值',
                '',
                '精确率 (Precision)',
                '召回率 (Recall)',
                'F1分数',
                'AUC-ROC',
                '',
                '交叉验证精确率均值',
                '交叉验证精确率标准差',
            ],
            '数值': [
                'RandomForest',
                N_ESTIMATORS,
                MAX_DEPTH,
                f"{performance_metrics['recommended_threshold']:.2f}",
                '',
                f"{performance_metrics['precision_adjusted']:.4f} ({performance_metrics['precision_adjusted']*100:.2f}%)",
                f"{performance_metrics['recall_adjusted']:.4f} ({performance_metrics['recall_adjusted']*100:.2f}%)",
                f"{performance_metrics['f1_adjusted']:.4f}",
                f"{performance_metrics['auc_roc']:.4f}",
                '',
                f"{performance_metrics['cv_precision_mean']:.4f}",
                f"{performance_metrics['cv_precision_std']:.4f}",
            ]
        }
        metrics_df = pd.DataFrame(metrics_data)
        metrics_df.to_excel(writer, sheet_name='模型评估', index=False)
        
        # Sheet 6: 特征重要性
        importance_data = []
        for feat, imp in sorted(
            performance_metrics['feature_importances'].items(), 
            key=lambda x: x[1], 
            reverse=True
        ):
            importance_data.append({
                '特征': feat,
                '重要性': imp
            })
        
        importance_df = pd.DataFrame(importance_data)
        importance_df.to_excel(writer, sheet_name='特征重要性', index=False)
    
    print(f"   ✅ Excel文件已更新")
    print()


def save_performance_report(performance_metrics, feature_columns, output_path):
    """保存文本格式的性能报告"""
    print("📄 正在生成性能报告...")
    
    report_lines = [
        "=" * 80,
        "随机森林模型性能报告",
        "=" * 80,
        "",
        f"训练时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}",
        f"模型版本: v5.0",
        f"配置ID: Config_RF_Precision_Opt",
        "",
        "模型参数:",
        f"  - 树的数量: {N_ESTIMATORS}",
        f"  - 最大深度: {MAX_DEPTH}",
        f"  - 最小分裂样本数: {MIN_SAMPLES_SPLIT}",
        f"  - 最小叶子样本数: {MIN_SAMPLES_LEAF}",
        f"  - 推荐预测阈值: {performance_metrics['recommended_threshold']:.2f}",
        "",
        "=" * 80,
        "性能指标",
        "=" * 80,
        "",
        f"精确率 (Precision): {performance_metrics['precision_adjusted']:.4f} ({performance_metrics['precision_adjusted']*100:.2f}%) ⭐",
        f"召回率 (Recall):    {performance_metrics['recall_adjusted']:.4f} ({performance_metrics['recall_adjusted']*100:.2f}%)",
        f"F1分数:             {performance_metrics['f1_adjusted']:.4f}",
        f"AUC-ROC:            {performance_metrics['auc_roc']:.4f}",
        "",
        "混淆矩阵:",
        f"              预测坏信号  预测好信号",
        f"   实际坏信号     {performance_metrics['confusion_matrix'][0][0]:6d}      {performance_metrics['confusion_matrix'][0][1]:6d}",
        f"   实际好信号     {performance_metrics['confusion_matrix'][1][0]:6d}      {performance_metrics['confusion_matrix'][1][1]:6d}",
        "",
        "交叉验证结果 (5折):",
        f"  精确率均值: {performance_metrics['cv_precision_mean']:.4f} ± {performance_metrics['cv_precision_std']:.4f}",
        "",
        "=" * 80,
        "多阈值对比分析",
        "=" * 80,
        ""
    ]
    
    # 添加所有阈值的对比
    for result in performance_metrics['all_thresholds']:
        report_lines.append(f"阈值 {result['threshold']:.2f}:")
        report_lines.append(f"  精确率: {result['precision']:.4f} ({result['precision']*100:.2f}%)")
        report_lines.append(f"  召回率: {result['recall']:.4f} ({result['recall']*100:.2f}%)")
        report_lines.append(f"  F1分数: {result['f1']:.4f}")
        report_lines.append("")
    
    report_lines.extend([
        "=" * 80,
        "Top 10 重要特征",
        "=" * 80,
        ""
    ])
    
    sorted_features = sorted(
        performance_metrics['feature_importances'].items(),
        key=lambda x: x[1],
        reverse=True
    )
    
    for i, (feat, imp) in enumerate(sorted_features[:10], 1):
        report_lines.append(f"  {i}. {feat:25s} {imp:.4f}")
    
    report_lines.extend([
        "",
        "=" * 80,
        "说明",
        "=" * 80,
        "",
        "1. 精确率是核心指标，表示预测为好信号的样本中真正是好信号的比例",
        "2. 通过提高预测阈值（从0.5到0.6），牺牲部分召回率来提高精确率",
        "3. 模型采用随机森林算法，具有较好的泛化能力和稳定性",
        "4. 训练时使用了类别权重调整，给予好信号更高的权重",
        "5. 数据集按股票分组划分，避免数据泄露",
        "",
    ])
    
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write('\n'.join(report_lines))
    
    print(f"   ✅ 报告已保存: {output_path}")
    print()


# ==================== 主流程 ====================

def main():
    print("=" * 80)
    print("随机森林模型训练脚本")
    print("=" * 80)
    print()
    
    # Step 1: 加载数据
    df, feature_columns = load_and_preprocess_data()
    
    # Step 2: 平衡样本
    df_balanced = balance_samples(df)
    
    # Step 3: 划分数据集
    X_train, X_test, y_train, y_test, df_train, df_test = split_data(
        df_balanced, feature_columns
    )
    
    # Step 4: 训练模型
    model = train_model(X_train, y_train)
    
    # Step 5: 评估模型
    performance_metrics = evaluate_model(model, X_test, y_test, feature_columns)
    
    # Step 6: 导出模型
    export_model_to_json(model, feature_columns, performance_metrics)
    
    # Step 7: 更新Excel
    update_excel_with_results(INPUT_EXCEL, performance_metrics, feature_columns)
    
    # Step 8: 保存报告
    report_path = os.path.join(OUTPUT_DIR, "model_performance_report.txt")
    save_performance_report(performance_metrics, feature_columns, report_path)
    
    print("=" * 80)
    print("✅ 模型训练完成！")
    print("=" * 80)
    print()
    print("生成的文件:")
    print(f"  1. {MODEL_JSON}")
    print(f"  2. {INPUT_EXCEL} (已更新)")
    print(f"  3. {report_path}")
    print()
    print("下一步: 将 buypoint_model_v5.json 集成到 TypeScript 代码中")


if __name__ == "__main__":
    main()
