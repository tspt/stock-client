import type { KLineData } from '@/types/stock';
import { runBacktestScreening } from '@/utils/analysis/backtestUtils';
import { setIndustryModels } from '@/utils/analysis/mlBuypointModel_v5';

interface BacktestRequest {
  requestId: string;
  code: string;
  name: string;
  klineData: KLineData[];
  industryName?: string; // 可选的行业名称（v4.0版本不使用行业模型）
}

interface BacktestSignal {
  code: string;
  name: string;
  signalDate: string; // YYYY-MM-DD
  entryPrice: number;
  returns: {
    day1?: { value: number; actualDays: number }; // 1日收益
    day2?: { value: number; actualDays: number }; // 2日收益
    day3?: { value: number; actualDays: number }; // 可选，数据不足时为空
    day5?: { value: number; actualDays: number };
    day10?: { value: number; actualDays: number }; // 两周
    day20?: { value: number; actualDays: number }; // 一个月
  };
}

// Worker初始化时加载行业模型
let modelsLoaded = false;
let isLoadingModels = false;
let isFirstTask = true;  // 标记是否是第一个任务
const taskQueue: BacktestRequest[] = [];

async function loadIndustryModelsInWorker() {
  if (modelsLoaded) return;
  if (isLoadingModels) {
    // 正在加载中，等待
    while (isLoadingModels) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return;
  }

  isLoadingModels = true;

  try {
    console.log('[Worker] 开始加载行业模型...');

    // 发送加载开始消息
    self.postMessage({
      type: 'MODEL_LOADING_START',
    });

    // 加载索引
    const indexResponse = await fetch('/models/industry/model-index.json');
    const index = await indexResponse.json();

    console.log(`[Worker] 找到 ${index.totalModels} 个模型`);

    const models = [];

    // 逐个加载模型
    for (let i = 0; i < index.models.length; i++) {
      const modelMeta = index.models[i];
      try {
        const modelResponse = await fetch(`/models/industry/${modelMeta.fileName}`);
        const modelData = await modelResponse.json();

        models.push({
          industryName: modelMeta.industryName,
          modelData,
          metadata: modelMeta,
        });

        // 每加载10个或最后一个时发送进度
        if (models.length % 10 === 0 || models.length === index.totalModels) {
          const progress = Math.round((models.length / index.totalModels) * 100);
          self.postMessage({
            type: 'MODEL_LOADING_PROGRESS',
            progress,
            loaded: models.length,
            total: index.totalModels,
          });
          console.log(`[Worker] 已加载 ${models.length}/${index.totalModels} (${progress}%)`);
        }
      } catch (error) {
        console.error(`[Worker] 加载模型失败: ${modelMeta.industryName}`, error);
      }
    }

    // 设置到全局缓存
    setIndustryModels(models);
    modelsLoaded = true;
    isLoadingModels = false;

    // 发送加载完成消息
    self.postMessage({
      type: 'MODEL_LOADING_COMPLETE',
      count: models.length,
    });

    console.log(`[Worker] ✅ 成功加载 ${models.length} 个行业模型`);

    // 处理等待队列中的任务
    while (taskQueue.length > 0) {
      const task = taskQueue.shift()!;
      processBacktestTask(task);
    }
  } catch (error) {
    console.error('[Worker]  加载行业模型失败:', error);
    isLoadingModels = false;
    self.postMessage({
      type: 'MODEL_LOADING_ERROR',
      error: (error as Error).message,
    });
  }
}

async function processBacktestTask(request: BacktestRequest) {
  const { requestId, code, name, klineData, industryName } = request;
  const signals: BacktestSignal[] = [];
  const len = klineData.length;

  // 回测所有可能的信号日期
  // startIndex: v5.0模型需要至少60天历史数据才能计算完整特征
  // endIndex: 回测到最后一天，确保最近信号被统计
  const startIndex = 60; // v5.0模型需要60天数据（28个特征）
  const endIndex = len - 1;

  for (let i = startIndex; i <= endIndex; i++) {
    const isBuyPoint = runBacktestScreening(klineData, i, industryName);

    if (isBuyPoint) {
      const signalDate = new Date(klineData[i].time).toISOString().split('T')[0];
      const entryPrice = klineData[i].close;

      // 计算未来收益
      const returns: BacktestSignal['returns'] = {};

      // 1日收益
      if (i + 1 < len) {
        const day1Close = klineData[i + 1].close;
        returns.day1 = {
          value: ((day1Close - entryPrice) / entryPrice) * 100,
          actualDays: 1,
        };
      }

      // 2日收益
      if (i + 2 < len) {
        const day2Close = klineData[i + 2].close;
        returns.day2 = {
          value: ((day2Close - entryPrice) / entryPrice) * 100,
          actualDays: 2,
        };
      }

      // 3日收益
      if (i + 3 < len) {
        const day3Close = klineData[i + 3].close;
        returns.day3 = {
          value: ((day3Close - entryPrice) / entryPrice) * 100,
          actualDays: 3,
        };
      }

      // 5日收益
      if (i + 5 < len) {
        const day5Close = klineData[i + 5].close;
        returns.day5 = {
          value: ((day5Close - entryPrice) / entryPrice) * 100,
          actualDays: 5,
        };
      }

      // 10日收益（两周）
      if (i + 10 < len) {
        const day10Close = klineData[i + 10].close;
        returns.day10 = {
          value: ((day10Close - entryPrice) / entryPrice) * 100,
          actualDays: 10,
        };
      }

      // 20日收益（一个月）
      if (i + 20 < len) {
        const day20Close = klineData[i + 20].close;
        returns.day20 = {
          value: ((day20Close - entryPrice) / entryPrice) * 100,
          actualDays: 20,
        };
      }

      signals.push({
        code,
        name,
        signalDate,
        entryPrice,
        returns,
      });
    }

    // 每100个K线发送一次进度
    if (i % 100 === 0) {
      const progress = Math.round(((i - startIndex) / (endIndex - startIndex)) * 100);
      self.postMessage({
        type: 'progress',
        requestId,
        progress,
      });
    }
  }

  // 发送结果
  self.postMessage({
    type: 'result',
    requestId,
    signals,
  });
}

self.onmessage = (e: MessageEvent<BacktestRequest>) => {
  const msg = e.data;

  // 第一个任务到达时，触发模型加载
  if (isFirstTask && !modelsLoaded) {
    isFirstTask = false;
    console.log('[Worker] 收到第一个任务，开始加载模型...');
    loadIndustryModelsInWorker();  // 注意：不要await，让它异步执行
  }

  // 如果模型还没加载完成，将任务加入队列
  if (!modelsLoaded) {
    taskQueue.push(msg);
    console.log(`[Worker] 任务已加入队列，当前队列长度: ${taskQueue.length}`);
    return;
  }

  // 模型已加载，直接处理
  processBacktestTask(msg);
};
