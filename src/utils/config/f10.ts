/**
 * F10 资料面板的展示常量（单一数据源）
 *
 * 这里只放「跨文件可能复用」的元数据：区块标题与说明、接口枚举默认值、表格滚动高度。
 * 各表格的列定义（含 render 与配色）留在对应组件内，与项目现有表格组件一致
 * （参考 `components/FundamentalAnalysisCard/FinancialStatementsTab.tsx`）。
 */

import type { F10SectionKey } from '@/types/f10';

/** 区块元数据：标题 + 一句话说明（说明用于告诉用户这块数据能看出什么） */
export interface F10SectionMeta {
  key: F10SectionKey;
  title: string;
  hint: string;
}

/** 股东人数区块 */
export const F10_SECTION_HOLDER_NUM: F10SectionMeta = {
  key: 'holderNum',
  title: '股东人数',
  hint: '股东户数减少 + 户均持股增加，通常意味着筹码趋于集中（最多保留最近 12 期）',
};

/** 十大流通股东区块 */
export const F10_SECTION_FREE_HOLDERS: F10SectionMeta = {
  key: 'freeHolders',
  title: '十大流通股东',
  hint: '最新报告期的前十大流通股东名单与持股变动',
};

/** 机构持仓区块 */
export const F10_SECTION_ORG_HOLDINGS: F10SectionMeta = {
  key: 'orgHoldings',
  title: '机构持仓',
  hint: '按报告期横向对比机构家数、合计持股、合计市值与占比；红涨绿跌为环比上一期',
};

/**
 * 机构持仓的机构类型过滤值。
 * '00' = 合计（东财官网默认口径）；其余取值（基金 / QFII / 社保等）暂未启用，
 * 后续若需要加切换，在此扩展选项即可。
 */
export const F10_ORG_TYPE_DEFAULT = '00';
