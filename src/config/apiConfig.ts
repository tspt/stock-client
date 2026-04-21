/**
 * API配置常量
 */

/**
 * 东方财富API Cookie
 * 用于访问东方财富接口时的身份验证
 * 注意: Cookie会过期,需要定期更新
 * 从环境变量中读取,优先使用环境变量,否则使用默认值
 */
export const EASTMONEY_COOKIE =
  import.meta.env.VITE_EASTMONEY_COOKIE ||
  'qgqp_b_id=bbc0617e3cb2dc57a01a180bf42c5699; st_nvi=ag3tM1_X60y-i0DWTE3xN8d49; nid18=0b5773ebb0161842630243c68615db83; nid18_create_time=1776414142507; gviem=GBiXeBQx_Btc1P_-qRWsSe5bf; gviem_create_time=1776414142507; emshistory=%5B%22%E7%83%AD%E9%97%A8%E6%A6%82%E5%BF%B5%22%5D; fullscreengg=1; fullscreengg2=1; st_si=28923217678881; st_asi=delete; st_pvi=74712614833523; st_sp=2023-12-13%2014%3A18%3A45; st_inirUrl=https%3A%2F%2Fwww.baidu.com%2Flink; st_sn=35; st_psi=2026042113301949-113200301353-6170937344';
