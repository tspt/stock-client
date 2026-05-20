/**
 * 行业模型类型定义
 */

/**
 * 行业模型元数据
 */
export interface IndustryModelMetadata {
  /** 行业名称 */
  industryName: string;
  /** 模型文件名 */
  fileName: string;
  /** 精确率 */
  precision: number;
  /** 召回率 */
  recall: number;
  /** F1分数 */
  f1: number;
  /** AUC-ROC */
  auc: number;
  /** 预测阈值 */
  predictionThreshold: number;
  /** 文件大小（字节） */
  fileSize: number;
  /** 训练时间 */
  trainingDate: string;
}

/**
 * 行业模型索引
 */
export interface IndustryModelIndex {
  /** 版本号 */
  version: string;
  /** 模型总数 */
  totalModels: number;
  /** 生成时间 */
  generatedAt: string;
  /** 模型列表 */
  models: IndustryModelMetadata[];
  /** 行业到模型的映射关系（用于聚类回退） */
  industryToModelMap?: Record<string, string>;
}

/**
 * 加载后的行业模型对象
 */
export interface LoadedIndustryModel {
  /** 行业名称 */
  industryName: string;
  /** 完整的模型JSON数据 */
  modelData: any;
  /** 模型元数据 */
  metadata: IndustryModelMetadata;
}

/**
 * 模型使用信息（用于回测结果）
 */
export interface ModelUsageInfo {
  /** 股票代码 */
  stockCode: string;
  /** 股票名称 */
  stockName: string;
  /** 行业名称 */
  industryName: string;
  /** 使用的模型名称 */
  modelName: string;
  /** 是否成功预测 */
  predicted: boolean;
  /** 跳过原因（如果未预测） */
  skippedReason?: string;
}

/**
 * 跳过的股票信息
 */
export interface SkippedStock {
  /** 股票代码 */
  code: string;
  /** 股票名称 */
  name: string;
  /** 跳过原因 */
  reason: string;
}

/**
 * 行业模型管理器配置
 */
export interface IndustryModelManagerConfig {
  /** 模型基础URL */
  baseUrl?: string;
  /** 加载超时时间（毫秒） */
  timeout?: number;
  /** 是否在加载失败时中断 */
  failFast?: boolean;
}
