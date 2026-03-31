/**
 * 机会分析页：筛选条件（单 Card + 手风琴 Collapse，节省纵向空间）
 */

import type { Dispatch, SetStateAction } from 'react';
import { Card, Button, Space, Collapse, InputNumber, Checkbox } from 'antd';
import { FilterOutlined } from '@ant-design/icons';
import type { ConsolidationType } from '@/types/stock';
import styles from './OpportunityPage.module.css';

type NumRange = { min?: number; max?: number };
type SetRange = Dispatch<SetStateAction<NumRange>>;

export interface OpportunityFiltersPanelProps {
  filterPanelActiveKey: string | undefined;
  setFilterPanelActiveKey: (v: string | undefined) => void;
  priceRange: { min?: number; max?: number };
  setPriceRange: SetRange;
  marketCapRange: { min?: number; max?: number };
  setMarketCapRange: SetRange;
  turnoverRateRange: { min?: number; max?: number };
  setTurnoverRateRange: SetRange;
  peRatioRange: { min?: number; max?: number };
  setPeRatioRange: SetRange;
  kdjJRange: { min?: number; max?: number };
  setKdjJRange: SetRange;
  recentLimitUpCount: number | undefined;
  setRecentLimitUpCount: (v: number | undefined) => void;
  recentLimitDownCount: number | undefined;
  setRecentLimitDownCount: (v: number | undefined) => void;
  limitUpPeriod: number;
  setLimitUpPeriod: (v: number) => void;
  limitDownPeriod: number;
  setLimitDownPeriod: (v: number) => void;
  consolidationTypes: ConsolidationType[];
  setConsolidationTypes: (v: ConsolidationType[]) => void;
  consolidationLookback: number;
  setConsolidationLookback: (v: number) => void;
  consolidationConsecutive: number;
  setConsolidationConsecutive: (v: number) => void;
  consolidationThreshold: number;
  setConsolidationThreshold: (v: number) => void;
  consolidationRequireAboveMa10: boolean;
  setConsolidationRequireAboveMa10: (v: boolean) => void;
  consolidationFilterEnabled: boolean;
  setConsolidationFilterEnabled: (v: boolean) => void;
  trendLineLookback: number;
  setTrendLineLookback: (v: number) => void;
  trendLineConsecutive: number;
  setTrendLineConsecutive: (v: number) => void;
  trendLineFilterEnabled: boolean;
  setTrendLineFilterEnabled: (v: boolean) => void;
  sharpMoveWindowBars: number;
  setSharpMoveWindowBars: (v: number) => void;
  sharpMoveMagnitude: number;
  setSharpMoveMagnitude: (v: number) => void;
  sharpMoveOnlyDrop: boolean;
  setSharpMoveOnlyDrop: (v: boolean) => void;
  sharpMoveOnlyRise: boolean;
  setSharpMoveOnlyRise: (v: boolean) => void;
  sharpMoveDropThenRiseLoose: boolean;
  setSharpMoveDropThenRiseLoose: (v: boolean) => void;
  sharpMoveRiseThenDropLoose: boolean;
  setSharpMoveRiseThenDropLoose: (v: boolean) => void;
  sharpMoveDropFlatRise: boolean;
  setSharpMoveDropFlatRise: (v: boolean) => void;
  sharpMoveRiseFlatDrop: boolean;
  setSharpMoveRiseFlatDrop: (v: boolean) => void;
  consolidationTypeOptions: { label: string; value: ConsolidationType }[];
}

export function OpportunityFiltersPanel({
  filterPanelActiveKey,
  setFilterPanelActiveKey,
  priceRange,
  setPriceRange,
  marketCapRange,
  setMarketCapRange,
  turnoverRateRange,
  setTurnoverRateRange,
  peRatioRange,
  setPeRatioRange,
  kdjJRange,
  setKdjJRange,
  recentLimitUpCount,
  setRecentLimitUpCount,
  recentLimitDownCount,
  setRecentLimitDownCount,
  limitUpPeriod,
  setLimitUpPeriod,
  limitDownPeriod,
  setLimitDownPeriod,
  consolidationTypes,
  setConsolidationTypes,
  consolidationLookback,
  setConsolidationLookback,
  consolidationConsecutive,
  setConsolidationConsecutive,
  consolidationThreshold,
  setConsolidationThreshold,
  consolidationRequireAboveMa10,
  setConsolidationRequireAboveMa10,
  consolidationFilterEnabled,
  setConsolidationFilterEnabled,
  trendLineLookback,
  setTrendLineLookback,
  trendLineConsecutive,
  setTrendLineConsecutive,
  trendLineFilterEnabled,
  setTrendLineFilterEnabled,
  sharpMoveWindowBars,
  setSharpMoveWindowBars,
  sharpMoveMagnitude,
  setSharpMoveMagnitude,
  sharpMoveOnlyDrop,
  setSharpMoveOnlyDrop,
  sharpMoveOnlyRise,
  setSharpMoveOnlyRise,
  sharpMoveDropThenRiseLoose,
  setSharpMoveDropThenRiseLoose,
  sharpMoveRiseThenDropLoose,
  setSharpMoveRiseThenDropLoose,
  sharpMoveDropFlatRise,
  setSharpMoveDropFlatRise,
  sharpMoveRiseFlatDrop,
  setSharpMoveRiseFlatDrop,
  consolidationTypeOptions,
}: OpportunityFiltersPanelProps) {
  return (
    <Card
      className={styles.filterCard}
      size="small"
      title={
        <Space wrap size="small">
          <FilterOutlined />
          <span>筛选条件</span>
          <span className={styles.filterHint}>手风琴模式，同时只展开一类</span>
        </Space>
      }
      extra={
        <Button type="link" size="small" onClick={() => setFilterPanelActiveKey(undefined)}>
          全部收起
        </Button>
      }
    >
      <Collapse
        accordion
        bordered={false}
        size="small"
        className={styles.filterCollapse}
        activeKey={filterPanelActiveKey}
        onChange={(key) => {
          const k = Array.isArray(key) ? key[0] : key;
          setFilterPanelActiveKey(k ?? undefined);
        }}
        items={[
          {
            key: 'data',
            label: '数据筛选',
            children: (
              <div className={styles.filterContent}>
                <div className={styles.filterRow}>
                  <div className={styles.filterItem}>
                    <span className={styles.filterLabel}>价格范围：</span>
                    <InputNumber
                      value={priceRange.min}
                      min={0}
                      step={0.01}
                      precision={2}
                      style={{ width: 100 }}
                      placeholder="最低价"
                      onChange={(v) => {
                        setPriceRange((prev) => ({
                          ...prev,
                          min: typeof v === 'number' && isFinite(v) ? v : undefined,
                        }));
                      }}
                    />
                    <span style={{ margin: '0 4px' }}>~</span>
                    <InputNumber
                      value={priceRange.max}
                      min={0}
                      step={0.01}
                      precision={2}
                      style={{ width: 100 }}
                      placeholder="最高价"
                      onChange={(v) => {
                        setPriceRange((prev) => ({
                          ...prev,
                          max: typeof v === 'number' && isFinite(v) ? v : undefined,
                        }));
                      }}
                    />
                  </div>
                  <div className={styles.filterItem}>
                    <span className={styles.filterLabel}>总市值(亿)：</span>
                    <InputNumber
                      value={marketCapRange.min}
                      min={0}
                      step={0.01}
                      precision={2}
                      style={{ width: 100 }}
                      placeholder="最小值"
                      onChange={(v) => {
                        setMarketCapRange((prev) => ({
                          ...prev,
                          min: typeof v === 'number' && isFinite(v) ? v : undefined,
                        }));
                      }}
                    />
                    <span style={{ margin: '0 4px' }}>~</span>
                    <InputNumber
                      value={marketCapRange.max}
                      min={0}
                      step={0.01}
                      precision={2}
                      style={{ width: 100 }}
                      placeholder="最大值"
                      onChange={(v) => {
                        setMarketCapRange((prev) => ({
                          ...prev,
                          max: typeof v === 'number' && isFinite(v) ? v : undefined,
                        }));
                      }}
                    />
                  </div>
                  <div className={styles.filterItem}>
                    <span className={styles.filterLabel}>换手率(%)：</span>
                    <InputNumber
                      value={turnoverRateRange.min}
                      min={0}
                      max={100}
                      step={0.01}
                      precision={2}
                      style={{ width: 100 }}
                      placeholder="最小值"
                      onChange={(v) => {
                        setTurnoverRateRange((prev) => ({
                          ...prev,
                          min: typeof v === 'number' && isFinite(v) ? v : undefined,
                        }));
                      }}
                    />
                    <span style={{ margin: '0 4px' }}>~</span>
                    <InputNumber
                      value={turnoverRateRange.max}
                      min={0}
                      max={100}
                      step={0.01}
                      precision={2}
                      style={{ width: 100 }}
                      placeholder="最大值"
                      onChange={(v) => {
                        setTurnoverRateRange((prev) => ({
                          ...prev,
                          max: typeof v === 'number' && isFinite(v) ? v : undefined,
                        }));
                      }}
                    />
                  </div>
                  <div className={styles.filterItem}>
                    <span className={styles.filterLabel}>市盈率：</span>
                    <InputNumber
                      value={peRatioRange.min}
                      min={0}
                      step={0.01}
                      precision={2}
                      style={{ width: 100 }}
                      placeholder="最小值"
                      onChange={(v) => {
                        setPeRatioRange((prev) => ({
                          ...prev,
                          min: typeof v === 'number' && isFinite(v) ? v : undefined,
                        }));
                      }}
                    />
                    <span style={{ margin: '0 4px' }}>~</span>
                    <InputNumber
                      value={peRatioRange.max}
                      min={0}
                      step={0.01}
                      precision={2}
                      style={{ width: 100 }}
                      placeholder="最大值"
                      onChange={(v) => {
                        setPeRatioRange((prev) => ({
                          ...prev,
                          max: typeof v === 'number' && isFinite(v) ? v : undefined,
                        }));
                      }}
                    />
                  </div>
                  <div className={styles.filterItem}>
                    <span className={styles.filterLabel}>KDJ-J：</span>
                    <InputNumber
                      value={kdjJRange.min}
                      step={0.01}
                      precision={2}
                      style={{ width: 100 }}
                      placeholder="最小值"
                      onChange={(v) => {
                        setKdjJRange((prev) => ({
                          ...prev,
                          min: typeof v === 'number' && isFinite(v) ? v : undefined,
                        }));
                      }}
                    />
                    <span style={{ margin: '0 4px' }}>~</span>
                    <InputNumber
                      value={kdjJRange.max}
                      step={0.01}
                      precision={2}
                      style={{ width: 100 }}
                      placeholder="最大值"
                      onChange={(v) => {
                        setKdjJRange((prev) => ({
                          ...prev,
                          max: typeof v === 'number' && isFinite(v) ? v : undefined,
                        }));
                      }}
                    />
                  </div>
                </div>
                <div className={styles.filterRow}>
                  <div className={styles.filterItem}>
                    <span className={styles.filterLabel}>最近涨停数：</span>
                    <InputNumber
                      value={recentLimitUpCount}
                      min={0}
                      step={1}
                      style={{ width: 100 }}
                      onChange={(v) => {
                        setRecentLimitUpCount(typeof v === 'number' && isFinite(v) ? Math.floor(v) : undefined);
                      }}
                    />
                  </div>
                  <div className={styles.filterItem}>
                    <span className={styles.filterLabel}>涨停周期范围：</span>
                    <InputNumber
                      value={limitUpPeriod}
                      min={1}
                      max={100}
                      step={1}
                      style={{ width: 100 }}
                      onChange={(v) => {
                        const next = typeof v === 'number' && isFinite(v) ? Math.floor(v) : 10;
                        setLimitUpPeriod(next);
                      }}
                    />
                    <span style={{ marginLeft: 4 }}>天</span>
                  </div>
                  <div className={styles.filterItem}>
                    <span className={styles.filterLabel}>最近跌停数：</span>
                    <InputNumber
                      value={recentLimitDownCount}
                      min={0}
                      step={1}
                      style={{ width: 100 }}
                      onChange={(v) => {
                        setRecentLimitDownCount(typeof v === 'number' && isFinite(v) ? Math.floor(v) : undefined);
                      }}
                    />
                  </div>
                  <div className={styles.filterItem}>
                    <span className={styles.filterLabel}>跌停周期范围：</span>
                    <InputNumber
                      value={limitDownPeriod}
                      min={1}
                      max={100}
                      step={1}
                      style={{ width: 100 }}
                      onChange={(v) => {
                        const next = typeof v === 'number' && isFinite(v) ? Math.floor(v) : 10;
                        setLimitDownPeriod(next);
                      }}
                    />
                    <span style={{ marginLeft: 4 }}>天</span>
                  </div>
                </div>
              </div>
            ),
          },
          {
            key: 'consolidation',
            label: '横盘筛选',
            children: (
              <div className={styles.filterContent}>
                <div className={styles.filterRow}>
                  <div className={styles.filterItem}>
                    <Checkbox
                      checked={consolidationFilterEnabled}
                      onChange={(e) => setConsolidationFilterEnabled(e.target.checked)}
                    >
                      启用横盘筛选（关闭后不按横盘过滤列表）
                    </Checkbox>
                  </div>
                </div>
                <div className={styles.filterRow}>
                  <div className={styles.filterItem}>
                    <span className={styles.filterLabel}>横盘类型：</span>
                    <Checkbox.Group
                      value={consolidationTypes}
                      onChange={(values) => {
                        setConsolidationTypes(values as ConsolidationType[]);
                      }}
                    >
                      {consolidationTypeOptions.map((item) => (
                        <Checkbox key={item.value} value={item.value}>
                          {item.label}
                        </Checkbox>
                      ))}
                    </Checkbox.Group>
                  </div>
                </div>
                <div className={styles.filterRow}>
                  <div className={styles.filterItem}>
                    <span className={styles.filterLabel}>检索根数：</span>
                    <InputNumber
                      value={consolidationLookback}
                      min={3}
                      max={500}
                      step={1}
                      style={{ width: 100 }}
                      onChange={(v) => {
                        const next = typeof v === 'number' && isFinite(v) ? Math.floor(v) : 10;
                        const clamped = Math.min(500, Math.max(3, next));
                        setConsolidationLookback(clamped);
                        if (consolidationConsecutive > clamped) {
                          setConsolidationConsecutive(Math.max(3, clamped));
                        }
                      }}
                    />
                    <span style={{ marginLeft: 4 }}>根（从最新K线向前）</span>
                  </div>
                  <div className={styles.filterItem}>
                    <span className={styles.filterLabel}>连续根数：</span>
                    <InputNumber
                      value={consolidationConsecutive}
                      min={3}
                      max={consolidationLookback}
                      step={1}
                      style={{ width: 100 }}
                      onChange={(v) => {
                        const next = typeof v === 'number' && isFinite(v) ? Math.floor(v) : 3;
                        const maxN = Math.max(3, consolidationLookback);
                        setConsolidationConsecutive(Math.min(maxN, Math.max(3, next)));
                      }}
                    />
                  </div>
                  <div className={styles.filterItem}>
                    <span className={styles.filterLabel}>波动阈值(%)：</span>
                    <InputNumber
                      value={consolidationThreshold}
                      min={0}
                      max={20}
                      step={0.1}
                      precision={1}
                      style={{ width: 100 }}
                      onChange={(v) => {
                        const next = typeof v === 'number' && isFinite(v) ? v : 2;
                        setConsolidationThreshold(next);
                      }}
                    />
                  </div>
                </div>
                <div className={styles.filterRow}>
                  <div className={styles.filterItem}>
                    <Checkbox
                      checked={consolidationRequireAboveMa10}
                      onChange={(e) => setConsolidationRequireAboveMa10(e.target.checked)}
                    >
                      连续根数段内每日收盘价均在MA10之上
                    </Checkbox>
                  </div>
                </div>
                <div className={styles.filterRow}>
                  <div className={styles.filterItem}>
                    <span className={styles.filterLabel}>命中说明：</span>
                    <span>
                      检索窗内任一段「连续根数」满足横盘即命中；勾选 MA10 则该段每日收盘≥当日 MA10。类型见左列，本列为简要波动与位置。
                    </span>
                  </div>
                </div>
              </div>
            ),
          },
          {
            key: 'trendLine',
            label: '趋势线筛选',
            children: (
              <div className={styles.filterContent}>
                <div className={styles.filterRow}>
                  <div className={styles.filterItem}>
                    <Checkbox
                      checked={trendLineFilterEnabled}
                      onChange={(e) => setTrendLineFilterEnabled(e.target.checked)}
                    >
                      启用趋势线筛选（与横盘同时开启时为 AND）
                    </Checkbox>
                  </div>
                </div>
                <div className={styles.filterRow}>
                  <div className={styles.filterItem}>
                    <span className={styles.filterLabel}>检索根数：</span>
                    <InputNumber
                      value={trendLineLookback}
                      min={3}
                      max={500}
                      step={1}
                      style={{ width: 100 }}
                      onChange={(v) => {
                        const next = typeof v === 'number' && isFinite(v) ? Math.floor(v) : 10;
                        const clamped = Math.min(500, Math.max(3, next));
                        setTrendLineLookback(clamped);
                        if (trendLineConsecutive > clamped) {
                          setTrendLineConsecutive(Math.max(3, clamped));
                        }
                      }}
                    />
                    <span style={{ marginLeft: 4 }}>根</span>
                  </div>
                  <div className={styles.filterItem}>
                    <span className={styles.filterLabel}>连续根数：</span>
                    <InputNumber
                      value={trendLineConsecutive}
                      min={3}
                      max={trendLineLookback}
                      step={1}
                      style={{ width: 100 }}
                      onChange={(v) => {
                        const next = typeof v === 'number' && isFinite(v) ? Math.floor(v) : 3;
                        const maxN = Math.max(3, trendLineLookback);
                        setTrendLineConsecutive(Math.min(maxN, Math.max(3, next)));
                      }}
                    />
                  </div>
                </div>
                <div className={styles.filterRow}>
                  <div className={styles.filterItem}>
                    <span className={styles.filterLabel}>说明：</span>
                    <span>
                      窗内取<strong>最靠后</strong>一段连续 N 根：每日收盘≥昨收且≥当日 MA5（当前K线周期下的 5
                      周期均线）。
                    </span>
                  </div>
                </div>
              </div>
            ),
          },
          {
            key: 'sharpMove',
            label: '单日异动筛选',
            children: (
              <div className={styles.filterContent}>
                <div className={styles.filterRow}>
                  <div className={styles.filterItem}>
                    <span className={styles.filterLabel}>最近：</span>
                    <InputNumber
                      value={sharpMoveWindowBars}
                      min={5}
                      max={500}
                      step={1}
                      style={{ width: 100 }}
                      onChange={(v) => {
                        const next = typeof v === 'number' && isFinite(v) ? Math.max(1, Math.floor(v)) : 60;
                        setSharpMoveWindowBars(next);
                      }}
                    />
                    <span style={{ marginLeft: 4 }}>根K线</span>
                    <span className={styles.filterLabel} style={{ marginLeft: 16 }}>
                      阈值 M：
                    </span>
                    <InputNumber
                      value={sharpMoveMagnitude}
                      min={0.5}
                      max={30}
                      step={0.5}
                      style={{ width: 100 }}
                      onChange={(v) => {
                        const next = typeof v === 'number' && isFinite(v) && v > 0 ? v : 6;
                        setSharpMoveMagnitude(next);
                      }}
                    />
                    <span style={{ marginLeft: 4 }}>%</span>
                  </div>
                </div>
                <div className={styles.filterRow}>
                  <div className={styles.filterItem} style={{ flexWrap: 'wrap', gap: 8 }}>
                    <Checkbox checked={sharpMoveOnlyDrop} onChange={(e) => setSharpMoveOnlyDrop(e.target.checked)}>
                      仅急跌
                    </Checkbox>
                    <Checkbox checked={sharpMoveOnlyRise} onChange={(e) => setSharpMoveOnlyRise(e.target.checked)}>
                      仅急涨
                    </Checkbox>
                    <Checkbox
                      checked={sharpMoveDropThenRiseLoose}
                      onChange={(e) => setSharpMoveDropThenRiseLoose(e.target.checked)}
                    >
                      急跌→急涨
                    </Checkbox>
                    <Checkbox
                      checked={sharpMoveRiseThenDropLoose}
                      onChange={(e) => setSharpMoveRiseThenDropLoose(e.target.checked)}
                    >
                      急涨→急跌
                    </Checkbox>
                    <Checkbox
                      checked={sharpMoveDropFlatRise}
                      onChange={(e) => setSharpMoveDropFlatRise(e.target.checked)}
                    >
                      急跌横盘急涨
                    </Checkbox>
                    <Checkbox
                      checked={sharpMoveRiseFlatDrop}
                      onChange={(e) => setSharpMoveRiseFlatDrop(e.target.checked)}
                    >
                      急涨横盘急跌
                    </Checkbox>
                  </div>
                </div>
                <div className={styles.filterRow}>
                  <div className={styles.filterItem}>
                    <span style={{ color: 'var(--ant-color-text-secondary)' }}>
                      勾选多项时满足<strong>任一</strong>即保留；未勾选任何形态则不按本项筛选。横盘指中间日涨跌幅绝对值小于
                      M。
                    </span>
                  </div>
                </div>
              </div>
            ),
          },
        ]}
      />
    </Card>
  );
}
