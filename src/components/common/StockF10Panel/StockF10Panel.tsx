/**
 * F10 资料面板：股东人数 / 十大流通股东 / 机构持仓，纵向堆叠三块。
 *
 * 挂在日K抽屉与周K抽屉的图表下方（见 `KlineDrawerShell` 的 body 已支持纵向滚动），
 * 两处共用同一份实现，只在调用处传 `code` 与 `enabled`。
 *
 * 加载策略：默认**不发请求**——先读 IndexedDB 缓存，有则直接渲染，
 * 没有则区块停在「点击加载」态，由用户点按钮才请求东财并写回缓存。
 * 三个区块互相独立，加载其中一块不会连带请求另外两块。
 */

import { F10_SECTION_FREE_HOLDERS, F10_SECTION_HOLDER_NUM, F10_SECTION_ORG_HOLDINGS } from '@/utils/config/f10';
import { useStockF10 } from '@/hooks/useStockF10';
import { F10SectionCard } from './F10SectionCard';
import { FreeHolderTable } from './FreeHolderTable';
import { HolderNumTable } from './HolderNumTable';
import { OrgHoldingTable } from './OrgHoldingTable';
import styles from './StockF10Panel.module.css';

export interface StockF10PanelProps {
  /** 统一格式股票代码（SH600000 / SZ000001） */
  code: string;
  /** 是否启用（通常传抽屉的 open）；false 时不读缓存也不展示 */
  enabled: boolean;
}

export function StockF10Panel({ code, enabled }: StockF10PanelProps) {
  const { holderNum, freeHolders, orgHoldings } = useStockF10(code, enabled);

  return (
    <div className={styles.panel}>
      <F10SectionCard
        title={F10_SECTION_HOLDER_NUM.title}
        hint={F10_SECTION_HOLDER_NUM.hint}
        loaded={holderNum.data !== null}
        loading={holderNum.loading}
        error={holderNum.error}
        updatedAt={holderNum.updatedAt}
        onLoad={holderNum.load}
      >
        <HolderNumTable data={holderNum.data ?? []} />
      </F10SectionCard>

      <F10SectionCard
        title={F10_SECTION_FREE_HOLDERS.title}
        hint={F10_SECTION_FREE_HOLDERS.hint}
        loaded={freeHolders.data !== null}
        loading={freeHolders.loading}
        error={freeHolders.error}
        updatedAt={freeHolders.updatedAt}
        onLoad={freeHolders.load}
      >
        <FreeHolderTable data={freeHolders.data ?? []} />
      </F10SectionCard>

      <F10SectionCard
        title={F10_SECTION_ORG_HOLDINGS.title}
        hint={F10_SECTION_ORG_HOLDINGS.hint}
        loaded={orgHoldings.data !== null}
        loading={orgHoldings.loading}
        error={orgHoldings.error}
        updatedAt={orgHoldings.updatedAt}
        onLoad={orgHoldings.load}
      >
        <OrgHoldingTable data={orgHoldings.data ?? []} />
      </F10SectionCard>
    </div>
  );
}

export default StockF10Panel;
