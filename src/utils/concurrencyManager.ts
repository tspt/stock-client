/**
 * 并发管理器
 * 用于控制异步任务的并发执行数量
 */

export interface Task<T> {
  /** 任务函数 */
  fn: () => Promise<T>;
  /** 优先级（数字越大优先级越高，默认0） */
  priority?: number;
  /** 任务标识 */
  id?: string;
}

export interface ProgressInfo {
  /** 总任务数 */
  total: number;
  /** 已完成数 */
  completed: number;
  /** 失败数 */
  failed: number;
  /** 进度百分比 */
  percent: number;
}

export interface ConcurrencyManagerOptions {
  /** 最大并发数 */
  maxConcurrency?: number;
  /** 进度回调 */
  onProgress?: (progress: ProgressInfo) => void;
  /** 批次间延迟（毫秒） */
  batchDelay?: number;
}

/**
 * 并发管理器类
 */
export class ConcurrencyManager<T> {
  private maxConcurrency: number;
  private queue: Array<Task<T> & { resolve: (value: T) => void; reject: (error: Error) => void }> = [];
  private running: Set<Promise<void>> = new Set();
  private results: T[] = [];
  private errors: Array<{ task: Task<T>; error: Error }> = [];
  private onProgress?: (progress: ProgressInfo) => void;
  private cancelled: boolean = false;
  private totalTasks: number = 0;
  private completedTasks: number = 0;
  private failedTasks: number = 0;
  private batchDelay: number;

  constructor(options: ConcurrencyManagerOptions = {}) {
    this.maxConcurrency = options.maxConcurrency || 5;
    this.onProgress = options.onProgress;
    this.batchDelay = options.batchDelay || 100;
  }

  /**
   * 添加任务
   */
  addTask(task: Task<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push({
        ...task,
        resolve,
        reject,
      });
      this.totalTasks++;
    });
  }

  /**
   * 开始执行
   */
  async start(): Promise<{ results: T[]; errors: Array<{ task: Task<T>; error: Error }> }> {
    this.cancelled = false;
    this.results = [];
    this.errors = [];
    this.completedTasks = 0;
    this.failedTasks = 0;

    // 按优先级排序
    this.queue.sort((a, b) => (b.priority || 0) - (a.priority || 0));

    // 开始执行
    while (this.queue.length > 0 && !this.cancelled) {
      // 执行当前批次
      const batch: typeof this.queue = [];
      while (batch.length < this.maxConcurrency && this.queue.length > 0) {
        const task = this.queue.shift();
        if (task) {
          batch.push(task);
        }
      }

      // 并发执行当前批次
      const batchPromises = batch.map((task) => this.executeTask(task));
      await Promise.allSettled(batchPromises);

      // 批次间延迟
      if (this.queue.length > 0 && !this.cancelled && this.batchDelay > 0) {
        await new Promise((resolve) => setTimeout(resolve, this.batchDelay));
      }
    }

    return {
      results: this.results,
      errors: this.errors,
    };
  }

  /**
   * 执行单个任务
   */
  private async executeTask(
    task: Task<T> & { resolve: (value: T) => void; reject: (error: Error) => void }
  ): Promise<void> {
    if (this.cancelled) {
      task.reject(new Error('任务已取消'));
      return;
    }

    try {
      const result = await task.fn();
      if (!this.cancelled) {
        this.results.push(result);
        this.completedTasks++;
        task.resolve(result);
        this.updateProgress();
      }
    } catch (error) {
      if (!this.cancelled) {
        const err = error instanceof Error ? error : new Error(String(error));
        this.errors.push({ task, error: err });
        this.failedTasks++;
        this.completedTasks++;
        task.reject(err);
        this.updateProgress();
      }
    }
  }

  /**
   * 更新进度
   */
  private updateProgress(): void {
    if (this.onProgress) {
      const percent = this.totalTasks > 0 ? (this.completedTasks / this.totalTasks) * 100 : 0;
      this.onProgress({
        total: this.totalTasks,
        completed: this.completedTasks,
        failed: this.failedTasks,
        percent: Math.round(percent * 100) / 100,
      });
    }
  }

  /**
   * 取消执行
   */
  cancel(): void {
    this.cancelled = true;
    // 拒绝所有未执行的任务
    while (this.queue.length > 0) {
      const task = this.queue.shift();
      if (task) {
        task.reject(new Error('任务已取消'));
      }
    }
  }

  /**
   * 获取当前进度
   */
  getProgress(): ProgressInfo {
    const percent = this.totalTasks > 0 ? (this.completedTasks / this.totalTasks) * 100 : 0;
    return {
      total: this.totalTasks,
      completed: this.completedTasks,
      failed: this.failedTasks,
      percent: Math.round(percent * 100) / 100,
    };
  }

  /**
   * 设置最大并发数
   */
  setMaxConcurrency(max: number): void {
    this.maxConcurrency = Math.max(1, max);
  }

  /**
   * 重置状态
   */
  reset(): void {
    this.queue = [];
    this.running.clear();
    this.results = [];
    this.errors = [];
    this.cancelled = false;
    this.totalTasks = 0;
    this.completedTasks = 0;
    this.failedTasks = 0;
  }
}

