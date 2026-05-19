/**
 * 决策树算法实现 (CART)
 *
 * 使用基尼不纯度作为分裂标准
 * 支持分类任务
 */

class DecisionTree {
  constructor({
    maxDepth = 10,
    minSamplesSplit = 2,
    minSamplesLeaf = 1,
    maxFeatures = null, // null表示使用所有特征
  } = {}) {
    this.maxDepth = maxDepth;
    this.minSamplesSplit = minSamplesSplit;
    this.minSamplesLeaf = minSamplesLeaf;
    this.maxFeatures = maxFeatures;
    this.tree = null;
    this.featureImportance = null;
  }

  /**
   * 计算基尼不纯度
   * @param {Array} y - 标签数组
   * @returns {number} 基尼不纯度
   */
  giniImpurity(y) {
    const n = y.length;
    if (n === 0) return 0;

    const counts = {};
    y.forEach((label) => {
      counts[label] = (counts[label] || 0) + 1;
    });

    let impurity = 1;
    for (const label in counts) {
      const prob = counts[label] / n;
      impurity -= prob * prob;
    }

    return impurity;
  }

  /**
   * 找到最佳分裂点
   * @param {Array} X - 特征矩阵
   * @param {Array} y - 标签数组
   * @returns {Object} 最佳分裂信息
   */
  findBestSplit(X, y) {
    const nSamples = X.length;
    const nFeatures = X[0].length;

    // 确定要考虑的特征数量
    const nFeaturesToConsider = this.maxFeatures
      ? Math.min(this.maxFeatures, nFeatures)
      : nFeatures;

    // 随机选择特征子集（如果指定了maxFeatures）
    let featureIndices = Array.from({ length: nFeatures }, (_, i) => i);
    if (nFeaturesToConsider < nFeatures) {
      // Fisher-Yates shuffle
      for (let i = featureIndices.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [featureIndices[i], featureIndices[j]] = [featureIndices[j], featureIndices[i]];
      }
      featureIndices = featureIndices.slice(0, nFeaturesToConsider);
    }

    let bestGini = Infinity;
    let bestFeature = null;
    let bestThreshold = null;
    let bestLeftIndices = null;
    let bestRightIndices = null;

    const parentGini = this.giniImpurity(y);

    // 遍历选定的特征
    for (const featureIdx of featureIndices) {
      // 获取该特征的所有唯一值作为候选阈值
      const values = [...new Set(X.map((row) => row[featureIdx]))].sort((a, b) => a - b);

      // 如果唯一值太多，采样一些阈值
      const thresholds = values.length > 20 ? this.sampleThresholds(values, 20) : values;

      for (const threshold of thresholds) {
        const leftIndices = [];
        const rightIndices = [];

        for (let i = 0; i < nSamples; i++) {
          if (X[i][featureIdx] <= threshold) {
            leftIndices.push(i);
          } else {
            rightIndices.push(i);
          }
        }

        // 检查分裂是否满足最小样本要求
        if (leftIndices.length < this.minSamplesLeaf || rightIndices.length < this.minSamplesLeaf) {
          continue;
        }

        // 计算加权基尼不纯度
        const leftY = leftIndices.map((i) => y[i]);
        const rightY = rightIndices.map((i) => y[i]);

        const leftGini = this.giniImpurity(leftY);
        const rightGini = this.giniImpurity(rightY);

        const weightedGini =
          (leftIndices.length / nSamples) * leftGini + (rightIndices.length / nSamples) * rightGini;

        // 更新最佳分裂
        if (weightedGini < bestGini) {
          bestGini = weightedGini;
          bestFeature = featureIdx;
          bestThreshold = threshold;
          bestLeftIndices = leftIndices;
          bestRightIndices = rightIndices;
        }
      }
    }

    // 如果没有找到有效的分裂，返回null
    if (bestFeature === null) {
      return null;
    }

    return {
      featureIndex: bestFeature,
      threshold: bestThreshold,
      leftIndices: bestLeftIndices,
      rightIndices: bestRightIndices,
      giniGain: parentGini - bestGini,
    };
  }

  /**
   * 从排序的值中采样阈值
   * @param {Array} values - 排序后的值
   * @param {number} nSamples - 采样数量
   * @returns {Array} 采样的阈值
   */
  sampleThresholds(values, nSamples) {
    if (values.length <= nSamples) return values;

    const step = Math.floor(values.length / nSamples);
    const sampled = [];

    for (let i = 0; i < values.length; i += step) {
      sampled.push(values[i]);
    }

    return sampled;
  }

  /**
   * 递归构建决策树
   * @param {Array} X - 特征矩阵
   * @param {Array} y - 标签数组
   * @param {number} depth - 当前深度
   * @returns {Object} 树节点
   */
  buildTree(X, y, depth = 0) {
    const nSamples = X.length;

    // 终止条件1：达到最大深度
    if (depth >= this.maxDepth) {
      return this.createLeafNode(y);
    }

    // 终止条件2：样本数太少
    if (nSamples < this.minSamplesSplit) {
      return this.createLeafNode(y);
    }

    // 终止条件3：所有样本属于同一类
    const uniqueLabels = [...new Set(y)];
    if (uniqueLabels.length === 1) {
      return this.createLeafNode(y);
    }

    // 寻找最佳分裂
    const split = this.findBestSplit(X, y);

    // 如果没有找到有效的分裂，创建叶子节点
    if (!split) {
      return this.createLeafNode(y);
    }

    // 记录特征重要性
    if (!this.featureImportance) {
      this.featureImportance = new Array(X[0].length).fill(0);
    }
    this.featureImportance[split.featureIndex] += split.giniGain * nSamples;

    // 分割数据
    const leftX = split.leftIndices.map((i) => X[i]);
    const leftY = split.leftIndices.map((i) => y[i]);
    const rightX = split.rightIndices.map((i) => X[i]);
    const rightY = split.rightIndices.map((i) => y[i]);

    // 递归构建左右子树
    const leftSubtree = this.buildTree(leftX, leftY, depth + 1);
    const rightSubtree = this.buildTree(rightX, rightY, depth + 1);

    return {
      featureIndex: split.featureIndex,
      threshold: split.threshold,
      left: leftSubtree,
      right: rightSubtree,
      samples: nSamples,
      prediction: null, // 内部节点没有预测值
    };
  }

  /**
   * 创建叶子节点
   * @param {Array} y - 标签数组
   * @returns {Object} 叶子节点
   */
  createLeafNode(y) {
    const counts = {};
    y.forEach((label) => {
      counts[label] = (counts[label] || 0) + 1;
    });

    // 多数投票
    let majorityLabel = 0;
    let maxCount = 0;
    for (const label in counts) {
      if (counts[label] > maxCount) {
        maxCount = counts[label];
        majorityLabel = parseInt(label);
      }
    }

    return {
      prediction: majorityLabel,
      probability: maxCount / y.length,
      samples: y.length,
    };
  }

  /**
   * 训练决策树
   * @param {Array} X - 特征矩阵 (二维数组)
   * @param {Array} y - 标签数组 (一维数组)
   */
  fit(X, y) {
    if (X.length !== y.length) {
      throw new Error('X和y的长度必须相同');
    }

    if (X.length === 0) {
      throw new Error('训练数据不能为空');
    }

    this.featureImportance = new Array(X[0].length).fill(0);
    this.tree = this.buildTree(X, y, 0);

    // 归一化特征重要性
    const totalImportance = this.featureImportance.reduce((sum, val) => sum + val, 0);
    if (totalImportance > 0) {
      this.featureImportance = this.featureImportance.map((val) => val / totalImportance);
    }
  }

  /**
   * 预测单个样本
   * @param {Array} sample - 单个样本的特征向量
   * @returns {number} 预测的类别
   */
  predictSample(sample) {
    let node = this.tree;

    while (node.prediction === null) {
      if (sample[node.featureIndex] <= node.threshold) {
        node = node.left;
      } else {
        node = node.right;
      }
    }

    return node.prediction;
  }

  /**
   * 预测多个样本
   * @param {Array} X - 特征矩阵
   * @returns {Array} 预测结果数组
   */
  predict(X) {
    return X.map((sample) => this.predictSample(sample));
  }

  /**
   * 预测并返回概率
   * @param {Array} sample - 单个样本
   * @returns {Object} 包含预测值和概率
   */
  predictWithProbability(sample) {
    let node = this.tree;

    while (node.prediction === null) {
      if (sample[node.featureIndex] <= node.threshold) {
        node = node.left;
      } else {
        node = node.right;
      }
    }

    return {
      prediction: node.prediction,
      probability: node.probability || 0,
    };
  }

  /**
   * 将树转换为JSON格式（用于保存）
   * @returns {Object} JSON格式的树
   */
  toJSON() {
    return {
      tree: this.tree,
      maxDepth: this.maxDepth,
      minSamplesSplit: this.minSamplesSplit,
      minSamplesLeaf: this.minSamplesLeaf,
      maxFeatures: this.maxFeatures,
      featureImportance: this.featureImportance,
    };
  }

  /**
   * 从JSON格式加载树
   * @param {Object} json - JSON格式的树
   */
  fromJSON(json) {
    this.tree = json.tree;
    this.maxDepth = json.maxDepth;
    this.minSamplesSplit = json.minSamplesSplit;
    this.minSamplesLeaf = json.minSamplesLeaf;
    this.maxFeatures = json.maxFeatures;
    this.featureImportance = json.featureImportance;
  }
}

module.exports = DecisionTree;
