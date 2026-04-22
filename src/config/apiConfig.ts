/**
 * API配置常量
 */

/**
 * 东方财富API Cookie
 * 用于访问东方财富接口时的身份验证
 * 注意: Cookie会过期,需要定期更新
 * 从环境变量中读取,优先使用环境变量,否则使用默认值
 *
 * 注意: 现在推荐使用Cookie池管理器自动管理Cookie
 * 此配置仅作为fallback使用
 */
export const EASTMONEY_COOKIE = import.meta.env.VITE_EASTMONEY_COOKIE || '';
