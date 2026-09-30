/**
 * 机会分析页 K 线抽屉：蜡烛图 + 均线 + 成交量 + MACD + KDJ，右侧并排展示筹码分布
 *
 * K 线数据直接复用机会分析页已缓存的 `klineDataCache`（不再单独发请求，因此周期跟随
 * 列表顶部的分析周期）；筹码分布由 `useChipDistribution` 按需拉取，默认日线口径。
 *
 * 对齐策略（不依赖任何 ECharts 内部 API）：
 * 1. 由当前 dataZoom 可见窗口 + 均线，在本地推导出价格上下限并取整；
 * 2. 把同一个价格区间同时赋给左侧K线主图与右侧筹码面板的纵轴；
 * 3. 两侧绘图区的像素范围一致——筹码画布只覆盖「标题留白 + 主图」这一段高度，
 *    主图网格用同样的像素定位，故同一价格落在同一水平线。
 * 于是缩放K线时筹码面板同步重算、实时跟随。
 *
 * 采用 Drawer 形态：抽屉高度占满视口，
 * 为后续在图表下方追加「股东户数 / 机构持仓 / 十大流通股东」等纵向内容预留空间。
 * 注意：筹码画布刻意不与左侧整列（主图 + 成交量 + 副图 + 缩放条）等高，
 * 只与主图等高，否则筹码条会一直画到副图区间。
 */

import { useMemo } from 'react';
import { Typography } from 'antd';
import ReactECharts from 'echarts-for-react';
import type { KLineData, KLinePeriod, TradingSignal } from '@/types/stock';
import type { ChipPeriod } from '@/types/chipDistribution';
import { buildChipChartOption } from '@/utils/chart/chipChartOption';
import { buildStockKlineOption } from '@/utils/chart/stockKlineOption';
import {
  CHART_HEIGHT,
  MAIN_GRID_HEIGHT_PX,
  MAIN_GRID_TOP_PX,
} from '@/utils/config/stockDrawerLayout';
import { ChipDistributionPanel } from '@/components/common/ChipDistributionPanel/ChipDistributionPanel';
import { ChipStatsPanel } from '@/components/common/ChipStatsPanel/ChipStatsPanel';
import { TradingSignalLabel } from '@/components/common/TradingSignalLabel/TradingSignalLabel';
import { KlineDrawerShell } from '@/components/common/KlineDrawerShell/KlineDrawerShell';
import { StockF10Panel } from '@/components/common/StockF10Panel/StockF10Panel';
import { useDrawerChartColors } from '@/hooks/useDrawerChartColors';
import { useKlineChipSync } from '@/hooks/useKlineChipSync';
import { useRecordNavigation } from '@/hooks/useRecordNavigation';
import { useTempListToggle } from '@/hooks/useTempListToggle';
import { useThemeStore } from '@/stores/themeStore';

const { Text } = Typography;

/** K 线周期中文标签 */
const PERIOD_LABEL: Record<KLinePeriod, string> = {
  '1min': '1分钟',
  '5min': '5分钟',
  '15min': '15分钟',
  '30min': '30分钟',
  '60min': '60分钟',
  day: '日',
  week: '周',
  month: '月',
  year: '年',
};

interface DailyChartDrawerProps {
  open: boolean;
  code: string;
  name: string;
  /** 机会分析页缓存的 K 线数据（周期为 period） */
  kline: KLineData[];
  /** kline 的实际周期，用于标题 / tooltip 文案 */
  period: KLinePeriod;
  /** 所属行业名称，由页面传入（弹窗内不额外拉取股票列表） */
  industry?: string;
  /** 所属概念板块列表，由页面传入（弹窗内不额外拉取股票列表） */
  concepts?: Array<{ code?: string; name: string }>;
  /** 今日交易信号，由机会分析页传入；无信号数据时不展示该字段 */
  tradingSignal?: TradingSignal;
  /** 表格当前展示顺序的股票列表，用于 ← / → 快速切换上一行 / 下一行 */
  records?: Array<{ code: string; name: string }>;
  /** 切换相邻行时回调，父级据此更新弹窗数据 */
  onNavigate?: (record: { code: string; name: string }) => void;
  onClose: () => void;
}

export function DailyChartDrawer({
  open,
  code,
  name,
  kline,
  period,
  industry,
  concepts,
  tradingSignal,
  records = [],
  onNavigate,
  onClose,
}: DailyChartDrawerProps) {
  /** 临时列表：加入 / 取消 + ↑↓ 快捷键（与周K抽屉共用同一实现） */
  const {
    inTempList,
    tempListCount,
    add: handleAddToTempList,
    remove: handleRemoveFromTempList,
  } = useTempListToggle({ code, name, enabled: open });

  /** 深色主题下副图配色需切换（黑色线条在深色底不可见） */
  const isDark = useThemeStore((state) => state.theme === 'dark');
  /** 筹码周期固定为日线口径 */
  const chipPeriod: ChipPeriod = 'day';

  /** K 线 / 成交量柱 / 筹码图配色：由抽屉右上角「低调配色」开关决定，关掉即恢复红绿蓝 */
  const chartColors = useDrawerChartColors(isDark);

  /** ← / →（或底部按钮）在表格行之间切换：切换后 code / kline 变化会自动复位缩放、十字星与筹码 */
  const navigation = useRecordNavigation({
    enabled: open,
    records,
    currentCode: code,
    onNavigate,
  });

  /** 缩放窗口 + 十字星 + 筹码 + 价格区间：与周K抽屉同一份实现，只有筹码口径不同 */
  const {
    chartRef,
    chipChartRef,
    handleAfterOpenChange,
    chartEvents,
    zoom,
    hoverIndex,
    indicators,
    priceRange,
    chip,
    chipDate,
    isFollowingCrosshair,
    chipLoading,
    chipError,
  } = useKlineChipSync({ code, kline, chipPeriod, enabled: open });

  const periodLabel = PERIOD_LABEL[period] ?? '日';

  const option = useMemo(() => {
    if (kline.length === 0 || !indicators) {
      return null;
    }
    return buildStockKlineOption({
      data: kline,
      indicators,
      yRange: priceRange,
      zoom,
      isDark,
      hoverIndex,
      periodLabel,
      upDownColors: chartColors.upDown,
      bollColors: chartColors.boll,
    });
  }, [kline, periodLabel, indicators, priceRange, zoom, isDark, chartColors, hoverIndex]);

  const chipOption = useMemo(
    () =>
      chip
        ? buildChipChartOption(chip, {
            priceRange: priceRange ?? undefined,
            // 画布已裁剪到「标题留白 + 主图」区间，故网格改用固定像素：
            // 绘图区上沿与高度都与左侧主图完全一致；
            // 横向留白由筹码面板按「图形靠左、数字靠右」自行决定
            grid: { top: MAIN_GRID_TOP_PX, height: MAIN_GRID_HEIGHT_PX },
            barColors: chartColors.chip,
          })
        : null,
    [chip, priceRange, chartColors]
  );

  return (
    <KlineDrawerShell
      open={open}
      onClose={onClose}
      title={`${name || ''} ${code}`}
      industry={industry}
      concepts={concepts}
      navigationText={
        navigation.currentIndex >= 0 && navigation.total > 1
          ? `第 ${navigation.currentIndex + 1} / ${navigation.total} 只`
          : undefined
      }
      tempListCount={tempListCount}
      inTempList={inTempList}
      onAddToTempList={handleAddToTempList}
      onRemoveFromTempList={handleRemoveFromTempList}
      tempListDisabled={!code}
      onAfterOpenChange={handleAfterOpenChange}
    >
      <div
        style={{
          marginBottom: 8,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          flexWrap: 'wrap',
          flexShrink: 0,
        }}
      >
        {chipDate && (
          <Text type="secondary" style={{ fontSize: 14, paddingLeft: 12 }}>
            筹码日期 <Text strong>{chipDate}</Text>
            {isFollowingCrosshair ? '（跟随十字星）' : '（最新）'}
          </Text>
        )}
        {tradingSignal && (
          <Text
            type="secondary"
            style={{ fontSize: 14, display: 'inline-flex', alignItems: 'center', gap: 4 }}
          >
            交易信号
            <TradingSignalLabel signal={tradingSignal} fontSize={14} />
          </Text>
        )}
        {chipLoading && (
          <Text type="secondary" style={{ fontSize: 12 }}>
            筹码计算中…
          </Text>
        )}
        {!chipLoading && chipError && (
          <Text type="danger" style={{ fontSize: 12 }}>
            筹码分布：{chipError}
          </Text>
        )}
        {period !== 'day' && (
          <Text type="warning" style={{ fontSize: 12 }}>
            当前列表缓存为{periodLabel}线数据，如需日K请将顶部周期切换为「日」后重新分析
          </Text>
        )}
      </div>
      <div
        style={{
          display: 'flex',
          height: CHART_HEIGHT,
          /**
           * 不参与纵向收缩：抽屉 body 已允许滚动，
           * 高度不足时由 body 滚动而不是把 K 线主图压扁。
           */
          flexShrink: 0,
          minHeight: 0,
        }}
      >
        <div style={{ flex: 1, minWidth: 0, height: '100%' }}>
          {option ? (
            <ReactECharts
              ref={chartRef}
              option={option}
              onEvents={chartEvents}
              lazyUpdate
              style={{ height: '100%', width: '100%' }}
              opts={{ renderer: 'canvas' }}
            />
          ) : (
            <div style={{ paddingTop: 40, textAlign: 'center' }}>暂无K线数据</div>
          )}
        </div>
        <ChipDistributionPanel option={chipOption} loading={chipLoading} chartRef={chipChartRef} />
        <ChipStatsPanel chip={chip} loading={chipLoading} />
      </div>
      {/* 图表下方的 F10 资料：默认只读缓存，未命中时由用户点击各区块按钮按需拉取 */}
      <StockF10Panel code={code} enabled={open} />
    </KlineDrawerShell>
  );
}
