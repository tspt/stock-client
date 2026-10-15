/**
 * AI 胜率回评结果报告：总体指标 + 三个维度的分桶表。
 *
 * 只负责展示；统计口径全部来自 `utils/analysis/aiBacktest` 的聚合结果。
 * 样本不足的桶会被显式标记，避免把噪声当结论。
 */

import { Alert, Card, Space, Statistic, Table, Tag, Typography } from 'antd';
import { BarChartOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import {
  AI_BACKTEST_HIT_THRESHOLD,
  AI_BACKTEST_HORIZON_OPTIONS,
  AI_BACKTEST_MIN_BUCKET_SAMPLES,
} from '@/utils/config/aiBacktestOptions';
import { describeMarketAndNameFilter } from '@/utils/config/opportunityPageOptions';
import type {
  AiBacktestAggregate,
  AiBacktestBucketStat,
  AiBacktestDimensionStat,
} from '@/utils/analysis/aiBacktest';
import type { AiBacktestRunSummary } from '@/hooks/useAiBacktestEngine';
import styles from './AiBacktestReport.module.css';

const { Text } = Typography;

export interface AiBacktestReportProps {
  aggregate: AiBacktestAggregate | null;
  lastRun: AiBacktestRunSummary | null;
}

function fmtPct(value: number | null): string {
  return value == null ? '—' : `${value.toFixed(2)}%`;
}

function excessClass(excess: number | null): string {
  if (excess == null) return '';
  if (excess > 0.5) return styles.positive;
  if (excess < -0.5) return styles.negative;
  return '';
}

/** 单个维度的分桶表 */
function BucketTable({
  title,
  buckets,
  benchmark,
}: {
  title: string;
  buckets: AiBacktestBucketStat[];
  benchmark: number | null;
}) {
  const columns: ColumnsType<AiBacktestBucketStat> = [
    {
      title: '分组',
      dataIndex: 'key',
      width: 110,
      render: (key: string, record) => (
        <Space size={4}>
          <span>{key}</span>
          {!record.sufficient && record.sampleCount > 0 && <Tag color="orange">样本不足</Tag>}
        </Space>
      ),
    },
    { title: '样本数', dataIndex: 'sampleCount', width: 80, align: 'right' },
    {
      title: '胜率',
      dataIndex: 'winRate',
      width: 90,
      align: 'right',
      render: (value: number | null) => fmtPct(value),
      sorter: (a, b) => (a.winRate ?? -1) - (b.winRate ?? -1),
    },
    {
      title: '平均收益',
      dataIndex: 'avgReturn',
      width: 100,
      align: 'right',
      render: (value: number | null) => fmtPct(value),
      sorter: (a, b) => (a.avgReturn ?? -999) - (b.avgReturn ?? -999),
    },
    {
      title: '相对基准',
      key: 'excess',
      width: 100,
      align: 'right',
      render: (_, record) => {
        const excess =
          record.avgReturn == null || benchmark == null ? null : record.avgReturn - benchmark;
        const text = excess == null ? '—' : `${excess >= 0 ? '+' : ''}${excess.toFixed(2)}%`;
        return <span className={excessClass(excess)}>{text}</span>;
      },
    },
    {
      title: `达标率(≥${AI_BACKTEST_HIT_THRESHOLD}%)`,
      dataIndex: 'hitRate',
      width: 110,
      align: 'right',
      render: (value: number | null) => fmtPct(value),
    },
    {
      title: '最大 / 最小',
      key: 'range',
      width: 150,
      align: 'right',
      render: (_, record) => (
        <span className={styles.mono}>
          {fmtPct(record.maxReturn)} / {fmtPct(record.minReturn)}
        </span>
      ),
    },
  ];

  return (
    <div className={styles.tableBlock}>
      <div className={styles.tableTitle}>{title}</div>
      <Table<AiBacktestBucketStat>
        size="small"
        rowKey="key"
        columns={columns}
        dataSource={buckets}
        pagination={false}
      />
    </div>
  );
}

/** 单个桶的胜率：相对基准着色，样本不足时降级为灰字 */
function BucketWinRate({
  bucket,
  benchmark,
}: {
  bucket: AiBacktestBucketStat;
  benchmark: number | null;
}) {
  if (bucket.winRate == null) return <span className={styles.muted}>—</span>;
  const excess =
    benchmark == null ? null : bucket.winRate - benchmark * 100;
  const cls = excess == null ? '' : excess > 1 ? styles.positive : excess < -1 ? styles.negative : '';
  return (
    <span className={`${styles.mono} ${cls}`} title={`n=${bucket.sampleCount}`}>
      {bucket.winRate.toFixed(1)}%
    </span>
  );
}

/** 分项评分表：IC + 等频五分桶胜率，用来定位信息来自哪个维度 */
function DimensionTable({
  dimensions,
  benchmark,
}: {
  dimensions: AiBacktestDimensionStat[];
  benchmark: number | null;
}) {
  const columns: ColumnsType<AiBacktestDimensionStat> = [
    { title: '维度', dataIndex: 'label', width: 90 },
    {
      title: 'RankIC',
      key: 'ic',
      width: 100,
      align: 'right',
      render: (_, record) => {
        const ic = record.ic;
        const cls = ic == null ? '' : ic >= 0.02 ? styles.positive : ic <= -0.02 ? styles.negative : '';
        return <span className={cls}>{ic == null ? '—' : ic.toFixed(4)}</span>;
      },
    },
    {
      title: '最低20%',
      key: 'b0',
      width: 90,
      align: 'right',
      render: (_, record) => <BucketWinRate bucket={record.buckets[0]} benchmark={benchmark} />,
    },
    {
      title: '20%~40%',
      key: 'b1',
      width: 90,
      align: 'right',
      render: (_, record) => <BucketWinRate bucket={record.buckets[1]} benchmark={benchmark} />,
    },
    {
      title: '40%~60%',
      key: 'b2',
      width: 90,
      align: 'right',
      render: (_, record) => <BucketWinRate bucket={record.buckets[2]} benchmark={benchmark} />,
    },
    {
      title: '60%~80%',
      key: 'b3',
      width: 90,
      align: 'right',
      render: (_, record) => <BucketWinRate bucket={record.buckets[3]} benchmark={benchmark} />,
    },
    {
      title: '最高20%',
      key: 'b4',
      width: 90,
      align: 'right',
      render: (_, record) => <BucketWinRate bucket={record.buckets[4]} benchmark={benchmark} />,
    },
    {
      title: '样本数',
      key: 'n',
      width: 90,
      align: 'right',
      render: (_, record) => (
        <span className={styles.mono}>
          {record.buckets.reduce((sum, b) => sum + b.sampleCount, 0)}
        </span>
      ),
    },
  ];

  return (
    <div className={styles.tableBlock}>
      <div className={styles.tableTitle}>
        按分项评分（等频五分桶）
        <Text type="secondary" className={styles.tableHint}>
          ｜ IC 正 = 分数越高后续越好；桶内数字为该桶胜率
        </Text>
      </div>
      <Table<AiBacktestDimensionStat>
        size="small"
        rowKey="key"
        columns={columns}
        dataSource={dimensions}
        pagination={false}
      />
    </div>
  );
}

export function AiBacktestReport({ aggregate, lastRun }: AiBacktestReportProps) {
  const horizonLabel =
    AI_BACKTEST_HORIZON_OPTIONS.find((item) => item.value === aggregate?.horizon)?.label ?? '';
  const gapSkipped = lastRun?.skipped?.gap ?? 0;

  if (!lastRun) {
    return (
      <Card
        className={styles.card}
        title={
          <Space>
            <BarChartOutlined />
            <span>回评结果</span>
          </Space>
        }
      >
        <Alert
          type="info"
          showIcon
          message="尚未执行回评"
          description="准备好数据后点击「开始回评」。回评会按日期截面重算 AI 打分，并用截面日之后的真实收益衡量它有没有区分度。"
        />
      </Card>
    );
  }

  if (lastRun.cancelled) {
    return (
      <Card
        className={styles.card}
        title={
          <Space>
            <BarChartOutlined />
            <span>回评结果</span>
          </Space>
        }
      >
        <Alert type="warning" showIcon message="本次回评已取消，未产出结果" />
      </Card>
    );
  }

  return (
    <Card
      className={styles.card}
      title={
        <Space>
          <BarChartOutlined />
          <span>回评结果</span>
          {horizonLabel && <Tag color="blue">主口径 {horizonLabel}</Tag>}
        </Space>
      }
      extra={
        <Text type="secondary" className={styles.runMeta}>
          {describeMarketAndNameFilter(lastRun.selectedMarket, lastRun.nameType)} ｜{' '}
          {lastRun.sectionDates.length} 个截面 × {lastRun.universeSize} 只
          {lastRun.droppedByLimit > 0 ? `（另有 ${lastRun.droppedByLimit} 只因上限未参与）` : ''}
          ，共 {lastRun.rows} 条样本
          {gapSkipped > 0 ? `（已剔除 ${gapSkipped} 条除权跳空样本）` : ''}
        </Text>
      }
    >
      <div className={styles.body}>
        {!aggregate ? (
          <Alert type="warning" showIcon message="没有产出可用的统计结果（样本可能为空）" />
        ) : (
          <>
            <div className={styles.statsRow}>
              <Statistic title="可用样本" value={aggregate.usableRows} suffix="条" />
              <Statistic
                title="胜率"
                value={aggregate.overall.winRate ?? 0}
                suffix="%"
                precision={2}
              />
              <Statistic
                title="平均收益"
                value={aggregate.overall.avgReturn ?? 0}
                suffix="%"
                precision={2}
              />
              <Statistic
                title={`达标率(≥${AI_BACKTEST_HIT_THRESHOLD}%)`}
                value={aggregate.overall.hitRate ?? 0}
                suffix="%"
                precision={2}
              />
              <Statistic
                title="置信度 IC"
                value={aggregate.confidenceIC ?? 0}
                precision={4}
                valueStyle={{ color: (aggregate.confidenceIC ?? 0) > 0.02 ? '#cf1322' : undefined }}
              />
              <Statistic
                title="评分 IC"
                value={aggregate.scoreIC ?? 0}
                precision={4}
                valueStyle={{ color: (aggregate.scoreIC ?? 0) > 0.02 ? '#cf1322' : undefined }}
              />
            </div>

            {aggregate.overall.sampleCount < AI_BACKTEST_MIN_BUCKET_SAMPLES && (
              <Alert
                type="warning"
                showIcon
                message={`总体样本仅 ${aggregate.overall.sampleCount} 条，低于 ${AI_BACKTEST_MIN_BUCKET_SAMPLES} 条阈值，结论仅供参考`}
              />
            )}

            <BucketTable
              title="按趋势方向"
              buckets={aggregate.byDirection}
              benchmark={aggregate.benchmarkAvgReturn}
            />
            <BucketTable
              title="按置信度"
              buckets={aggregate.byConfidence}
              benchmark={aggregate.benchmarkAvgReturn}
            />
            <DimensionTable
              dimensions={aggregate.dimensions}
              benchmark={aggregate.benchmarkAvgReturn}
            />
            <BucketTable
              title="按综合评分（等频五分桶）"
              buckets={aggregate.byTotalScore}
              benchmark={aggregate.benchmarkAvgReturn}
            />

            <Alert
              type="info"
              showIcon
              className={styles.caveat}
              message="结论边界（务必先读）"
              description={
                <ul className={styles.caveatList}>
                  <li>
                    基准 = 全池等权平均收益（{fmtPct(aggregate.benchmarkAvgReturn)}）。<strong>只有分桶显著高于基准，才说明该 AI 输出有区分度。</strong>
                  </li>
                  <li>IC 为「逐截面 RankIC 后取均值」，避免同截面样本混算高估相关性；|IC| &lt; 0.02 基本等于无区分度。</li>
                  <li>回测评分剔除了 PE / 换手率（历史不可得，填入即未来函数），与线上评分不完全等值。</li>
                  <li>
                    数据源是<strong>不复权</strong>日线，除权跳空会同时污染指标与前向收益，已按板别识别并整条剔除
                    （本次剔除 {gapSkipped} 条）；实测该类样本约占 0.4%，剔除后仍可能残留少量小比例送转与现金分红造成的轻微偏差。
                  </li>
                  <li>universe 取本地现存股票，<strong>存在生存者偏差</strong>（期间退市/ST 的样本不在内），胜率可能偏高。</li>
                  <li>未计交易成本与滑点，入场价按截面日收盘价。</li>
                </ul>
              }
            />
          </>
        )}
      </div>
    </Card>
  );
}
