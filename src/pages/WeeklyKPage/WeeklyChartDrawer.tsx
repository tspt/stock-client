/**
 * 周K图表抽屉：蜡烛图 + 周线均线 + 成交量 + MACD + KDJ，右侧并排展示筹码分布
 *
 * 左侧K线由周线选股页面已缓存的周K数据直接传入（只有「周」一种周期，不额外发请求）；
 * 筹码分布由 `useChipDistribution` 按需拉取（默认周线口径，与周线选股页面口径一致）。
 *
 * 与机会分析页 DailyChartDrawer 对齐（不依赖任何 ECharts 内部 API）：
 * 1. 由当前 dataZoom 可见窗口 + 均线，在本地推导出价格上下限并取整；
 * 2. 把同一个价格区间同时赋给左侧K线主图与右侧筹码面板的纵轴；
 * 3. 两侧绘图区的像素范围一致——筹码画布只覆盖「标题留白 + 主图」这一段高度，
 *    主图网格用同样的像素定位，故同一价格落在同一水平线。
 * 于是缩放周K时筹码面板同步重算、实时跟随；十字星移动时右侧筹码切换为对应那一周的分布。
 *
 * 采用 Drawer 形态：抽屉高度占满视口，
 * 为后续在图表下方追加「股东户数 / 机构持仓 / 十大流通股东」等纵向内容预留空间。
 * 注意：筹码画布刻意不与左侧整列（主图 + 成交量 + 副图 + 缩放条）等高，
 * 只与主图等高，否则筹码条会一直画到副图区间。
 */

import { useMemo } from 'react';
import { Space, Tag, Tooltip, Typography } from 'antd';
import ReactECharts from 'echarts-for-react';
import type { KLineData } from '@/types/stock';
import type { ChipPeriod } from '@/types/chipDistribution';
import { buildChipChartOption } from '@/utils/chart/chipChartOption';
import { buildStockKlineOption } from '@/utils/chart/stockKlineOption';
import { YI, type WeeklyAnalysis } from '@/utils/analysis/weekly';
import {
  CHART_HEIGHT,
  MAIN_GRID_HEIGHT_PX,
  MAIN_GRID_TOP_PX,
} from '@/utils/config/stockDrawerLayout';
import { ChipDistributionPanel } from '@/components/common/ChipDistributionPanel/ChipDistributionPanel';
import { ChipStatsPanel } from '@/components/common/ChipStatsPanel/ChipStatsPanel';
import { KlineDrawerShell } from '@/components/common/KlineDrawerShell/KlineDrawerShell';
import { StockF10Panel } from '@/components/common/StockF10Panel/StockF10Panel';
import { useKlineChipSync } from '@/hooks/useKlineChipSync';
import { useRecordNavigation } from '@/hooks/useRecordNavigation';
import { useTempListToggle } from '@/hooks/useTempListToggle';
import { useThemeStore } from '@/stores/themeStore';

const { Text } = Typography;

interface WeeklyChartDrawerProps {
  open: boolean;
  code: string;
  name: string;
  kline: KLineData[];
  analysis: WeeklyAnalysis | null;
  /** 表格当前展示顺序的股票列表，用于 ← / → 快速切换上一行 / 下一行 */
  records?: Array<{ code: string; name: string }>;
  /** 切换相邻行时回调，父级据此更新弹窗数据 */
  onNavigate?: (record: { code: string; name: string }) => void;
  onClose: () => void;
}

export function WeeklyChartDrawer({
  open,
  code,
  name,
  kline,
  analysis,
  records = [],
  onNavigate,
  onClose,
}: WeeklyChartDrawerProps) {
  /** 临时列表：加入 / 取消 + ↑↓ 快捷键（与日K抽屉共用同一实现） */
  const {
    inTempList,
    tempListCount,
    add: handleAddToTempList,
    remove: handleRemoveFromTempList,
  } = useTempListToggle({ code, name, enabled: open });

  /** 深色主题下副图配色需切换 */
  const isDark = useThemeStore((state) => state.theme === 'dark');
  /** 周线分析弹窗固定使用周线口径筹码 */
  const chipPeriod: ChipPeriod = 'week';

  /** ← / →（或底部按钮）在表格行之间切换：切换后 code / kline 变化会自动复位缩放、十字星与筹码 */
  const navigation = useRecordNavigation({
    enabled: open,
    records,
    currentCode: code,
    onNavigate,
  });

  /** 缩放窗口 + 十字星 + 筹码 + 价格区间：与日K抽屉同一份实现，只有筹码口径不同 */
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
      // 周线口径：tooltip 首行与 K 线 series 名都用「周」，标题涨幅加粗
      periodLabel: '周',
      titleChgBold: true,
    });
  }, [kline, indicators, priceRange, zoom, isDark, hoverIndex]);

  const chipOption = useMemo(
    () =>
      chip
        ? buildChipChartOption(chip, {
            priceRange: priceRange ?? undefined,
            // 画布已裁剪到「标题留白 + 主图」区间，故网格改用固定像素：
            // 绘图区上沿与高度都与左侧主图完全一致；
            // 横向留白由筹码面板按「图形靠左、数字靠右」自行决定
            grid: { top: MAIN_GRID_TOP_PX, height: MAIN_GRID_HEIGHT_PX },
          })
        : null,
    [chip, priceRange]
  );

  return (
    <KlineDrawerShell
      open={open}
      onClose={onClose}
      title={`${name || ''} ${code} 周线分析`}
      industry={analysis?.industryName}
      concepts={analysis?.concepts}
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
      {analysis && (
        <div style={{ marginBottom: 12, flexShrink: 0 }}>
          <Space wrap size={[6, 6]}>
            <Text strong>评分 {analysis.score}</Text>
            {analysis.pxAboveMa8 && <Tag color="orange">站上周MA8</Tag>}
            {analysis.pxAboveMa60 && <Tag color="purple">站上60周线</Tag>}
            {analysis.ma60FlatOrUp && <Tag color="purple">60周线走平/上翘</Tag>}
            {analysis.macdBottomDivergence && <Tag color="green">MACD底背离</Tag>}
            {analysis.runningWeekIncluded && <Tag color="default">含未完成本周</Tag>}
            {analysis.setups.length > 0 && (
              <Space wrap size={[4, 4]}>
                {analysis.setups.map((hit) => (
                  <Tooltip key={hit.key} title={hit.reasons.join('；')}>
                    <Tag color="red">
                      {hit.label} {hit.score}/{hit.max}
                    </Tag>
                  </Tooltip>
                ))}
              </Space>
            )}
          </Space>
          <div style={{ marginTop: 8 }}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              信号：{analysis.signals.join('；') || '无'}
            </Text>
          </div>
          <div style={{ marginTop: 4 }}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              乖离 {(analysis.extBias ?? 0).toFixed(2)} ATR（相对周MA20）｜周波动{' '}
              {(analysis.atrPct ?? 0).toFixed(2)}%｜周均成交额{' '}
              {analysis.avgAmount20w === undefined ? '-' : `${(analysis.avgAmount20w / YI).toFixed(1)}亿`}
              {analysis.stopLoss !== undefined && (
                <>
                  ｜参考止损 {analysis.stopLoss.toFixed(2)}
                  {analysis.riskPct !== undefined && `（风险 ${analysis.riskPct.toFixed(1)}%）`}
                </>
              )}
            </Text>
          </div>
          {analysis.warnings.length > 0 && (
            <div style={{ marginTop: 4 }}>
              <Text type="danger" style={{ fontSize: 12 }}>
                风险：{analysis.warnings.join('；')}
              </Text>
            </div>
          )}
          {analysis.exitSignals.length > 0 && (
            <div style={{ marginTop: 4 }}>
              <Text type="warning" style={{ fontSize: 12 }}>
                卖出信号：{analysis.exitSignals.join('；')}
              </Text>
            </div>
          )}
        </div>
      )}
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
            <div style={{ paddingTop: 40, textAlign: 'center' }}>暂无周K数据</div>
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
