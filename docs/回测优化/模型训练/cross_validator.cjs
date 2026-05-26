/**
 * 交叉验证评估模块
 *
 * 使用时间序列交叉验证（避免未来信息泄露）
 * 计算精确率、召回率、F1、AUC-ROC等指标
 */

/**
 * 时间序列交叉验证分割
 * @param {Array} samples - 样本数组（已按时间排序）
 * @param {number} nSplits - 分割次数
 * @param {number} testRatio - 测试集比例
 * @returns {Array} 包含train/test索引的数组
 */
function timeSeriesSplit(samples, nSplits = 5, testRatio = 0.2) {
  const splits = [];
  const nSamples = samples.length;

  if (nSamples < 100) {
    // 样本太少，只做一个分割
    const splitIndex = Math.floor(nSamples * (1 - testRatio));
    splits.push({
      trainIndices: Array.from({ length: splitIndex }, (_, i) => i),
      testIndices: Array.from({ length: nSamples - splitIndex }, (_, i) => splitIndex + i),
    });
    return splits;
  }

  // 计算每个fold的大小
  const foldSize = Math.floor(nSamples / (nSplits + 1));

  for (let i = 0; i < nSplits; i++) {
    const trainEnd = foldSize * (i + 1);
    const testStart = trainEnd;
    const testEnd = Math.min(trainEnd + foldSize, nSamples);

    if (testEnd > nSamples) break;

    const trainIndices = Array.from({ length: trainEnd }, (_, idx) => idx);
    const testIndices = Array.from({ length: testEnd - testStart }, (_, idx) => testStart + idx);

    splits.push({ trainIndices, testIndices });
  }

  return splits;
}

/**
 * 计算混淆矩阵
 * @param {Array} yTrue - 真实标签
 * @param {Array} yPred - 预测标签
 * @returns {Object} 混淆矩阵
 */
function confusionMatrix(yTrue, yPred) {
  let tp = 0,
    fp = 0,
    tn = 0,
    fn = 0;

  for (let i = 0; i < yTrue.length; i++) {
    if (yTrue[i] === 1 && yPred[i] === 1) tp++;
    else if (yTrue[i] === 0 && yPred[i] === 1) fp++;
    else if (yTrue[i] === 0 && yPred[i] === 0) tn++;
    else if (yTrue[i] === 1 && yPred[i] === 0) fn++;
  }

  return { tp, fp, tn, fn };
}

/**
 * 计算精确率
 * @param {Object} cm - 混淆矩阵
 * @returns {number} 精确率
 */
function precision(cm) {
  return cm.tp + cm.fp > 0 ? cm.tp / (cm.tp + cm.fp) : 0;
}

/**
 * 计算召回率
 * @param {Object} cm - 混淆矩阵
 * @returns {number} 召回率
 */
function recall(cm) {
  return cm.tp + cm.fn > 0 ? cm.tp / (cm.tp + cm.fn) : 0;
}

/**
 * 计算F1分数
 * @param {number} prec - 精确率
 * @param {number} rec - 召回率
 * @returns {number} F1分数
 */
function f1Score(prec, rec) {
  return prec + rec > 0 ? (2 * prec * rec) / (prec + rec) : 0;
}

/**
 * 计算准确率
 * @param {Object} cm - 混淆矩阵
 * @returns {number} 准确率
 */
function accuracy(cm) {
  const total = cm.tp + cm.fp + cm.tn + cm.fn;
  return total > 0 ? (cm.tp + cm.tn) / total : 0;
}

/**
 * 计算AUC-ROC（简化版）
 * @param {Array} yTrue - 真实标签
 * @param {Array} yScores - 预测概率/分数
 * @returns {number} AUC值
 */
function calculateAUC(yTrue, yScores) {
  // 创建正负样本对
  const positiveIndices = yTrue
    .map((label, idx) => (label === 1 ? idx : -1))
    .filter((idx) => idx !== -1);
  const negativeIndices = yTrue
    .map((label, idx) => (label === 0 ? idx : -1))
    .filter((idx) => idx !== -1);

  if (positiveIndices.length === 0 || negativeIndices.length === 0) {
    return 0.5; // 无法计算
  }

  let concordant = 0;
  let tied = 0;
  let totalPairs = 0;

  // 采样以避免计算量过大
  const maxPairs = 10000;
  const sampledPositive =
    positiveIndices.length > 100
      ? positiveIndices.sort(() => Math.random() - 0.5).slice(0, 100)
      : positiveIndices;
  const sampledNegative =
    negativeIndices.length > 100
      ? negativeIndices.sort(() => Math.random() - 0.5).slice(0, 100)
      : negativeIndices;

  for (const posIdx of sampledPositive) {
    for (const negIdx of sampledNegative) {
      totalPairs++;
      if (yScores[posIdx] > yScores[negIdx]) {
        concordant++;
      } else if (yScores[posIdx] === yScores[negIdx]) {
        tied++;
      }
    }
  }

  return (concordant + 0.5 * tied) / totalPairs;
}

/**
 * 评估单个模型的性能
 * @param {Object} model - 模型对象（需要有predict方法）
 * @param {Array} X - 特征矩阵
 * @param {Array} y - 标签数组
 * @returns {Object} 性能指标
 */
function evaluateModel(model, X, y) {
  const yPred = model.predict(X);
  const cm = confusionMatrix(y, yPred);

  const prec = precision(cm);
  const rec = recall(cm);
  const f1 = f1Score(prec, rec);
  const acc = accuracy(cm);

  // 如果模型支持概率预测，计算AUC
  let auc = 0.5;
  if (model.predictWithProbability) {
    const yScores = X.map((sample) => {
      const result = model.predictWithProbability(sample);
      return result.probability || 0;
    });
    auc = calculateAUC(y, yScores);
  }

  return {
    accuracy: acc,
    precision: prec,
    recall: rec,
    f1: f1,
    auc: auc,
    confusionMatrix: cm,
    nSamples: y.length,
    nPositive: y.filter((label) => label === 1).length,
    nNegative: y.filter((label) => label === 0).length,
  };
}

/**
 * 平衡采样：对负样本进行欠采样，使正负样本比例更平衡 (1:1)
 * @param {Array} X - 特征矩阵
 * @param {Array} y - 标签数组
 * @returns {Object} 包含平衡后的X和y
 */
function balanceData(X, y) {
  const posIndices = y.map((label, i) => (label === 1 ? i : -1)).filter((i) => i !== -1);
  const negIndices = y.map((label, i) => (label === 0 ? i : -1)).filter((i) => i !== -1);

  if (posIndices.length === 0 || negIndices.length <= posIndices.length) {
    return { X, y };
  }

  // 随机打乱负样本索引
  const shuffledNeg = [...negIndices];
  for (let i = shuffledNeg.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffledNeg[i], shuffledNeg[j]] = [shuffledNeg[j], shuffledNeg[i]];
  }

  // 选取 1 倍于正样本数量的负样本
  const selectedNegIndices = shuffledNeg.slice(0, posIndices.length);
  const combinedIndices = [...posIndices, ...selectedNegIndices];

  // 再次打乱组合后的索引
  for (let i = combinedIndices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [combinedIndices[i], combinedIndices[j]] = [combinedIndices[j], combinedIndices[i]];
  }

  return {
    X: combinedIndices.map((i) => X[i]),
    y: combinedIndices.map((i) => y[i]),
  };
}

/**
 * 执行时间序列交叉验证
 * @param {Object} modelClass - 模型类
 * @param {Array} samples - 样本数组（已按时间排序）
 * @param {Object} modelParams - 模型参数
 * @param {number} nSplits - 分割次数
 * @returns {Object} 交叉验证结果
 */
function crossValidate(modelClass, samples, modelParams = {}, nSplits = 5) {
  console.log(`🔄 执行${nSplits}折时间序列交叉验证...`);

  // 提取特征和标签
  const X = samples.map((s) => s.features);
  const y = samples.map((s) => s.label);

  // 执行时间序列分割
  const splits = timeSeriesSplit(samples, nSplits);

  const metrics = [];

  for (let i = 0; i < splits.length; i++) {
    const split = splits[i];
    console.log(`  Fold ${i + 1}/${splits.length}:`);

    // 准备训练和测试数据
    let trainX = split.trainIndices.map((idx) => X[idx]);
    let trainY = split.trainIndices.map((idx) => y[idx]);
    const testX = split.testIndices.map((idx) => X[idx]);
    const testY = split.testIndices.map((idx) => y[idx]);

    // 对训练集进行平衡采样，确保模型能学到正样本特征
    const balanced = balanceData(trainX, trainY);
    trainX = balanced.X;
    trainY = balanced.y;

    console.log(`    训练集: ${trainX.length} 样本 (平衡后), 测试集: ${testX.length} 样本`);

    // 训练模型
    const model = new modelClass(modelParams);
    model.fit(trainX, trainY);

    // 评估
    const foldMetrics = evaluateModel(model, testX, testY);
    metrics.push(foldMetrics);

    console.log(
      `    准确率: ${(foldMetrics.accuracy * 100).toFixed(2)}%, ` +
        `精确率: ${(foldMetrics.precision * 100).toFixed(2)}%, ` +
        `召回率: ${(foldMetrics.recall * 100).toFixed(2)}%, ` +
        `F1: ${foldMetrics.f1.toFixed(3)}, ` +
        `AUC: ${foldMetrics.auc.toFixed(3)}`
    );
  }

  // 计算平均指标
  const avgMetrics = {
    accuracy: metrics.reduce((sum, m) => sum + m.accuracy, 0) / metrics.length,
    precision: metrics.reduce((sum, m) => sum + m.precision, 0) / metrics.length,
    recall: metrics.reduce((sum, m) => sum + m.recall, 0) / metrics.length,
    f1: metrics.reduce((sum, m) => sum + m.f1, 0) / metrics.length,
    auc: metrics.reduce((sum, m) => sum + m.auc, 0) / metrics.length,
    stdAccuracy: calculateStd(metrics.map((m) => m.accuracy)),
    stdPrecision: calculateStd(metrics.map((m) => m.precision)),
    stdRecall: calculateStd(metrics.map((m) => m.recall)),
    stdF1: calculateStd(metrics.map((m) => m.f1)),
    nFolds: metrics.length,
  };

  console.log(`\n📊 平均性能指标:`);
  console.log(
    `  准确率: ${(avgMetrics.accuracy * 100).toFixed(2)}% ± ${(
      avgMetrics.stdAccuracy * 100
    ).toFixed(2)}%`
  );
  console.log(
    `  精确率: ${(avgMetrics.precision * 100).toFixed(2)}% ± ${(
      avgMetrics.stdPrecision * 100
    ).toFixed(2)}%`
  );
  console.log(
    `  召回率: ${(avgMetrics.recall * 100).toFixed(2)}% ± ${(avgMetrics.stdRecall * 100).toFixed(
      2
    )}%`
  );
  console.log(`  F1分数: ${avgMetrics.f1.toFixed(3)} ± ${avgMetrics.stdF1.toFixed(3)}`);
  console.log(`  AUC-ROC: ${avgMetrics.auc.toFixed(3)}\n`);

  return {
    foldMetrics: metrics,
    averageMetrics: avgMetrics,
  };
}

/**
 * 计算标准差
 * @param {Array} values - 数值数组
 * @returns {number} 标准差
 */
function calculateStd(values) {
  if (values.length === 0) return 0;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const variance = values.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / values.length;
  return Math.sqrt(variance);
}

module.exports = {
  timeSeriesSplit,
  confusionMatrix,
  precision,
  recall,
  f1Score,
  accuracy,
  calculateAUC,
  evaluateModel,
  crossValidate,
};
