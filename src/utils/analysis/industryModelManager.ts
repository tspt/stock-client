/**
 * 行业模型管理器
 * 负责加载和管理53个行业模型
 */

import type {
  IndustryModelIndex,
  IndustryModelMetadata,
  LoadedIndustryModel,
  IndustryModelManagerConfig,
} from '@/types/industryModel';

export class IndustryModelManager {
  private models: Map<string, LoadedIndustryModel> = new Map();
  private index: IndustryModelIndex | null = null;
  private config: Required<IndustryModelManagerConfig>;

  constructor(config: IndustryModelManagerConfig = {}) {
    this.config = {
      baseUrl: config.baseUrl || '/models/industry',
      timeout: config.timeout || 60000, // 60秒超时
      failFast: config.failFast !== undefined ? config.failFast : true, // 默认失败时中断
    };
  }

  /**
   * 加载所有行业模型
   * @param onProgress 进度回调函数 (0-100)
   */
  async loadAllModels(onProgress?: (progress: number) => void): Promise<void> {
    console.log('🔄 开始加载行业模型...');

    try {
      // 步骤1: 加载索引文件
      if (onProgress) onProgress(5);
      await this.loadIndex();

      if (!this.index) {
        throw new Error('模型索引加载失败');
      }

      console.log(`📦 找到 ${this.index.totalModels} 个模型`);

      // 步骤2: 逐个加载模型
      const totalModels = this.index.models.length;
      let loadedCount = 0;

      for (const modelMeta of this.index.models) {
        try {
          await this.loadSingleModel(modelMeta);
          loadedCount++;

          // 更新进度（5%用于加载索引，95%用于加载模型）
          const progress = 5 + (loadedCount / totalModels) * 95;
          if (onProgress) onProgress(Math.round(progress));

          console.log(`✅ 已加载: ${modelMeta.industryName} (${loadedCount}/${totalModels})`);
        } catch (error) {
          console.error(`❌ 加载模型失败: ${modelMeta.industryName}`, error);

          if (this.config.failFast) {
            throw new Error(`模型加载失败: ${modelMeta.industryName}`);
          }
          // 如果不failFast，继续加载下一个
        }
      }

      console.log(`✅ 所有模型加载完成！共 ${loadedCount}/${totalModels} 个`);
    } catch (error) {
      console.error('❌ 模型加载过程中出错:', error);
      throw error;
    }
  }

  /**
   * 加载模型索引
   */
  private async loadIndex(): Promise<void> {
    const response = await fetch(`${this.config.baseUrl}/model-index.json`);

    if (!response.ok) {
      throw new Error(`加载索引失败: ${response.status} ${response.statusText}`);
    }

    this.index = await response.json();
    console.log('📄 模型索引加载成功');
  }

  /**
   * 加载单个模型
   */
  private async loadSingleModel(metadata: IndustryModelMetadata): Promise<void> {
    const response = await fetch(`${this.config.baseUrl}/${metadata.fileName}`);

    if (!response.ok) {
      throw new Error(`加载模型文件失败: ${metadata.fileName}`);
    }

    const modelData = await response.json();

    this.models.set(metadata.industryName, {
      industryName: metadata.industryName,
      modelData,
      metadata,
    });
  }

  /**
   * 根据行业名称获取模型
   * @param industryName 行业名称
   * @returns 模型对象，如果未找到返回null
   */
  getModel(industryName: string): LoadedIndustryModel | null {
    return this.models.get(industryName) || null;
  }

  /**
   * 检查是否有某个行业的模型
   */
  hasModel(industryName: string): boolean {
    return this.models.has(industryName);
  }

  /**
   * 获取所有已加载的行业名称列表
   */
  getLoadedIndustries(): string[] {
    console.log('getLoadedIndustries called, models size:', this.models.size);
    return Array.from(this.models.keys());
  }

  /**
   * 获取所有已加载的模型
   */
  getAllModels(): LoadedIndustryModel[] {
    console.log('getAllModels called, returning', this.models.size, 'models');
    return Array.from(this.models.values());
  }

  /**
   * 获取已加载的模型数量
   */
  getLoadedCount(): number {
    return this.models.size;
  }

  /**
   * 获取模型索引
   */
  getIndex(): IndustryModelIndex | null {
    return this.index;
  }

  /**
   * 清空所有缓存的模型
   */
  clearCache(): void {
    this.models.clear();
    this.index = null;
    console.log('🗑️ 模型缓存已清空');
  }

  /**
   * 获取模型统计信息
   */
  getStats() {
    if (!this.index) {
      return null;
    }

    const highPrecision = this.index.models.filter((m) => m.precision >= 0.9).length;
    const mediumPrecision = this.index.models.filter(
      (m) => m.precision >= 0.7 && m.precision < 0.9
    ).length;
    const lowPrecision = this.index.models.filter((m) => m.precision < 0.7).length;

    return {
      total: this.index.totalModels,
      loaded: this.models.size,
      highPrecision,
      mediumPrecision,
      lowPrecision,
      totalSize: this.index.models.reduce((sum, m) => sum + m.fileSize, 0),
    };
  }
}

// 导出单例实例（可选）
export const industryModelManager = new IndustryModelManager();
