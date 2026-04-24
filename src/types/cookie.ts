/**
 * Cookie池相关类型定义
 */

/**
 * Cookie条目接口
 */
export interface CookieEntry {
  /** 唯一ID (使用时间戳+随机数) */
  id: string;
  /** Cookie字符串 */
  value: string;
  /** 创建时间 */
  createdAt: number;
  /** 最后使用时间 */
  lastUsedAt: number;
  /** 成功次数 */
  successCount: number;
  /** 失败次数 */
  failureCount: number;
  /** 是否激活 */
  isActive: boolean;
  /** 健康评分 (0-100) */
  healthScore: number;
  /** 获取Cookie时使用的User-Agent（仅用于东方财富接口） */
  userAgent?: string;
}

/**
 * Cookie池统计信息
 */
export interface CookiePoolStats {
  /** 总Cookie数量 */
  totalCount: number;
  /** 活跃Cookie数量 */
  activeCount: number;
  /** 平均健康评分 */
  avgHealthScore: number;
  /** 总请求数 */
  totalRequests: number;
  /** 成功率 */
  successRate: number;
}

/**
 * Cookie操作日志
 */
export interface CookieOperationLog {
  /** 时间戳 */
  timestamp: number;
  /** 操作类型 */
  action: 'add' | 'remove' | 'test' | 'auto-fetch' | 'success' | 'failure';
  /** 是否成功 */
  success: boolean;
  /** 消息 */
  message: string;
  /** Cookie ID（可选） */
  cookieId?: string;
}
