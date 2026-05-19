/**
 * 随机森林算法实现
 *
 * 基于Bootstrap采样和特征子集选择
 * 支持分类任务，使用多数投票机制
 */

const DecisionTree = require('./decision_tree.cjs');

class RandomForest {
  constructor({
    nTrees = 100,
    maxDepth = 10,
    minSamplesSplit = 2,
    minSamplesLeaf = 1,
    maxFeatures = null, // null表示sqrt(n_features)
    bootstrap = true,
    oobScore = false,
  } = {}) {
    this.nTrees = nTrees;
    this.maxDepth = maxDepth;
    this.minSamplesSplit = minSamplesSplit;
    this.minSamplesLeaf = minSamplesLeaf;
    this.maxFeatures = maxFeatures;
    this.bootstrap = bootstrap;
    this.oobScore = oobScore;

    this.trees = [];
    this.featureImportance = null;
    this.oobScoreValue = null;
  }

  /**
   * Bootstrap采样
   * @param {number} nSamples - 样本总数
   * @returns {Array} 采样的索引数组
   */
  bootstrapSample(nSamples) {
    const indices = [];
    for (let i = 0; i < nSamples; i++) {
      indices.push(Math.floor(Math.random() * nSamples));
    }
    return indices;
  }

  /**
   * 计算袋外分数 (Out-of-Bag Score)
   * @param {Array} X - 特征矩阵
   * @param {Array} y - 标签数组
   */
  calculateOOBScore(X, y) {
    const nSamples = X.length;
    const oobPredictions = new Array(nSamples).fill(null).map(() => []);

    // 对每棵树，记录哪些样本没有被用于训练
    for (let t = 0; t < this.trees.length; t++) {
      const treeInfo = this.treeTrainingInfo[t];
      const trainingIndices = new Set(treeInfo.indices);

      for (let i = 0; i < nSamples; i++) {
        if (!trainingIndices.has(i)) {
          // 这个样本是袋外样本
          const prediction = this.trees[t].predictSample(X[i]);
          oobPredictions[i].push(prediction);
        }
      }
    }

    // 计算袋外预测的准确率
    let correct = 0;
    let total = 0;

    for (let i = 0; i < nSamples; i++) {
      if (oobPredictions[i].length > 0) {
        // 多数投票
        const votes = {};
        oobPredictions[i].forEach((pred) => {
          votes[pred] = (votes[pred] || 0) + 1;
        });

        let majorityVote = 0;
        let maxVotes = 0;
        for (const pred in votes) {
          if (votes[pred] > maxVotes) {
            maxVotes = votes[pred];
            majorityVote = parseInt(pred);
          }
        }

        if (majorityVote === y[i]) {
          correct++;
        }
        total++;
      }
    }

    this.oobScoreValue = total > 0 ? correct / total : 0;
    return this.oobScoreValue;
  }

  /**
   * 训练随机森林
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

    const nSamples = X.length;
    const nFeatures = X[0].length;

    // 如果没有指定maxFeatures，使用sqrt(n_features)
    if (this.maxFeatures === null) {
      this.maxFeatures = Math.floor(Math.sqrt(nFeatures));
    }

    console.log(`🌲 开始训练随机森林: ${this.nTrees}棵树, ${nSamples}个样本, ${nFeatures}个特征`);

    this.trees = [];
    this.treeTrainingInfo = []; // 记录每棵树的训练信息（用于OOB）
    const featureImportanceSum = new Array(nFeatures).fill(0);

    for (let i = 0; i < this.nTrees; i++) {
      let trainX, trainY, trainIndices;

      if (this.bootstrap) {
        // Bootstrap采样
        trainIndices = this.bootstrapSample(nSamples);
        trainX = trainIndices.map((idx) => X[idx]);
        trainY = trainIndices.map((idx) => y[idx]);
      } else {
        trainX = X;
        trainY = y;
        trainIndices = Array.from({ length: nSamples }, (_, idx) => idx);
      }

      // 创建并训练决策树
      const tree = new DecisionTree({
        maxDepth: this.maxDepth,
        minSamplesSplit: this.minSamplesSplit,
        minSamplesLeaf: this.minSamplesLeaf,
        maxFeatures: this.maxFeatures,
      });

      tree.fit(trainX, trainY);
      this.trees.push(tree);
      this.treeTrainingInfo.push({ indices: trainIndices });

      // 累加特征重要性
      if (tree.featureImportance) {
        for (let j = 0; j < nFeatures; j++) {
          featureImportanceSum[j] += tree.featureImportance[j] || 0;
        }
      }

      // 打印进度
      if ((i + 1) % 10 === 0 || i === this.nTrees - 1) {
        console.log(`  进度: ${i + 1}/${this.nTrees} 棵树已完成`);
      }
    }

    // 计算平均特征重要性
    this.featureImportance = featureImportanceSum.map((val) => val / this.nTrees);

    // 计算袋外分数（如果启用）
    if (this.oobScore) {
      this.calculateOOBScore(X, y);
      console.log(`📊 袋外分数 (OOB Score): ${(this.oobScoreValue * 100).toFixed(2)}%`);
    }

    console.log('✅ 随机森林训练完成');
  }

  /**
   * 预测单个样本（多数投票）
   * @param {Array} sample - 单个样本的特征向量
   * @returns {number} 预测的类别
   */
  predictSample(sample) {
    const votes = {};

    for (const tree of this.trees) {
      const prediction = tree.predictSample(sample);
      votes[prediction] = (votes[prediction] || 0) + 1;
    }

    // 找出得票最多的类别
    let majorityVote = 0;
    let maxVotes = 0;
    for (const pred in votes) {
      if (votes[pred] > maxVotes) {
        maxVotes = votes[pred];
        majorityVote = parseInt(pred);
      }
    }

    return majorityVote;
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
   * 预测并返回概率（各类别的投票比例）
   * @param {Array} sample - 单个样本
   * @returns {Object} 包含预测值和各类别概率
   */
  predictWithProbability(sample) {
    const votes = {};

    for (const tree of this.trees) {
      const prediction = tree.predictSample(sample);
      votes[prediction] = (votes[prediction] || 0) + 1;
    }

    // 计算概率
    const probabilities = {};
    for (const pred in votes) {
      probabilities[pred] = votes[pred] / this.trees.length;
    }

    // 找出得票最多的类别
    let majorityVote = 0;
    let maxProb = 0;
    for (const pred in probabilities) {
      if (probabilities[pred] > maxProb) {
        maxProb = probabilities[pred];
        majorityVote = parseInt(pred);
      }
    }

    return {
      prediction: majorityVote,
      probability: maxProb,
      allProbabilities: probabilities,
    };
  }

  /**
   * 将随机森林转换为JSON格式（用于保存）
   * @returns {Object} JSON格式的随机森林
   */
  toJSON() {
    return {
      nTrees: this.nTrees,
      maxDepth: this.maxDepth,
      minSamplesSplit: this.minSamplesSplit,
      minSamplesLeaf: this.minSamplesLeaf,
      maxFeatures: this.maxFeatures,
      bootstrap: this.bootstrap,
      trees: this.trees.map((tree) => tree.toJSON()),
      featureImportance: this.featureImportance,
      oobScore: this.oobScoreValue,
    };
  }

  /**
   * 从JSON格式加载随机森林
   * @param {Object} json - JSON格式的随机森林
   */
  fromJSON(json) {
    this.nTrees = json.nTrees;
    this.maxDepth = json.maxDepth;
    this.minSamplesSplit = json.minSamplesSplit;
    this.minSamplesLeaf = json.minSamplesLeaf;
    this.maxFeatures = json.maxFeatures;
    this.bootstrap = json.bootstrap;

    this.trees = json.trees.map((treeJson) => {
      const tree = new DecisionTree();
      tree.fromJSON(treeJson);
      return tree;
    });

    this.featureImportance = json.featureImportance;
    this.oobScoreValue = json.oobScore;
  }

  /**
   * 获取模型统计信息
   * @returns {Object} 模型统计信息
   */
  getStats() {
    return {
      nTrees: this.nTrees,
      maxDepth: this.maxDepth,
      minSamplesSplit: this.minSamplesSplit,
      minSamplesLeaf: this.minSamplesLeaf,
      maxFeatures: this.maxFeatures,
      featureImportance: this.featureImportance,
      oobScore: this.oobScoreValue,
    };
  }
}

module.exports = RandomForest;
