/**
 * 周线战法历史回测（右侧 Drawer，与机会分析页「筛选条件」同款交互）
 *
 * 用当前已加载的周K缓存，逐周回溯六大战法的历史信号，
 * 统计各自的胜率、收益分布与离场原因，回答
 * 「哪种战法胜率高、适合持有 2-4 周」。
 *
 * destroyOnClose 保持 false：关闭抽屉不卸载内容，
 * 回测进度与结果都保留，再次打开不必重算（只有改参数或重新分析才重跑）。
 */

import { useEffect, useMemo, useState } from 'react';
import { Alert, Checkbox, Drawer, Progress, Select, Space, Table, Tag, Tooltip, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { KLineData } from '@/types/stock';
import {
  BACKTEST_EXCLUSION_LABELS,
  createWeeklyBacktestSession,
  WEEKLY_SETUP_GRADE_LABELS,
  type BacktestExclusionReason,
  type BacktestExitPolicy,
  type WeeklyBacktestExcludedSample,
  type WeeklyBacktestExclusions,
  type WeeklyBacktestResult,
  type WeeklyBacktestStats,
  type WeeklySetupGrade,
} from '@/utils/analysis/weekly';

const { Text } = Typography;

/** 抽屉宽度：列较多，尽量加宽以减少横向滚动 */
const BACKTEST_DRAWER_WIDTH = 'min(1320px, calc(100vw - 48px))' as const;

interface WeeklyBacktestDrawerProps {
  open: boolean;
  klines: Map<string, KLineData[]>;
  names: Map<string, string>;
  onClose: () => void;
}

const HOLD_WEEK_OPTIONS = [1, 2, 3, 4, 5, 6, 8].map((w) => ({
  label: `${w} 周`,
  value: w,
}));

const EXIT_POLICY_OPTIONS: Array<{ label: string; value: BacktestExitPolicy }> = [
  { label: '固定持有到期', value: 'hold' },
  { label: '命中卖出信号即离场', value: 'signal' },
];

/**
 * 档位过滤：满分档 = 战法条件全部成立，部分档 = 形态基本成型但缺关键确认。
 * 不选表示不限档位（默认）。
 */
const GRADE_OPTIONS = (Object.keys(WEEKLY_SETUP_GRADE_LABELS) as WeeklySetupGrade[]).map(
  (key) => ({ label: WEEKLY_SETUP_GRADE_LABELS[key], value: key })
);

/**
 * 上市初期保护：信号周距「最早一根周K」不足 N 自然周时剔除。
 * 0 表示不限制（默认）——minBars 默认 60 已跳过上市不满约 59 周的信号。
 */
const NEW_STOCK_WEEK_OPTIONS = [
  { label: '不限', value: 0 },
  { label: '13 周内', value: 13 },
  { label: '26 周内', value: 26 },
  { label: '52 周内', value: 52 },
];

/** 被剔除样本的明细列（用于人工核对「到底是不是新股 / 停牌股」） */
const EXCLUDED_COLUMNS: ColumnsType<WeeklyBacktestExcludedSample> = [
  {
    title: '代码',
    dataIndex: 'code',
    width: 80,
    render: (code: string) => code.replace(/^(SH|SZ|BJ|sh|sz|bj)/, ''),
  },
  { title: '名称', dataIndex: 'name', width: 110 },
  {
    title: '信号周',
    dataIndex: 'signalTime',
    width: 110,
    render: (time: number) => new Date(time).toLocaleDateString('zh-CN'),
  },
  {
    title: '应得收益',
    dataIndex: 'returnPct',
    width: 100,
    render: (value: number) => signedPct(value, 1),
  },
  {
    title: '原因',
    dataIndex: 'reason',
    render: (reason: BacktestExclusionReason) => BACKTEST_EXCLUSION_LABELS[reason],
  },
];

function pct(value: number, digits = 2): string {
  return Number.isFinite(value) ? `${value.toFixed(digits)}%` : '-';
}

function returnColor(value: number): string {
  if (!Number.isFinite(value)) return '#595959';
  return value > 0 ? '#cf1322' : value < 0 ? '#389e0d' : '#595959';
}

function signedPct(value: number, digits = 2) {
  return <span style={{ color: returnColor(value) }}>{pct(value, digits)}</span>;
}

function profitFactorText(value: number): string {
  if (!Number.isFinite(value)) return '∞';
  return value.toFixed(2);
}

/** 把剔除统计拼成「停牌/缺周 12、超出涨跌幅极限 3」这样的短句 */
function exclusionSummaryText(byReason: WeeklyBacktestExclusions['byReason']): string {
  const parts = (Object.keys(BACKTEST_EXCLUSION_LABELS) as BacktestExclusionReason[])
    .filter((reason) => (byReason[reason] ?? 0) > 0)
    .map((reason) => `${BACKTEST_EXCLUSION_LABELS[reason]} ${byReason[reason]}`);
  return parts.length > 0 ? parts.join('、') : '无';
}

function buildColumns(
  useStopLoss: boolean,
  exitPolicy: BacktestExitPolicy
): ColumnsType<WeeklyBacktestStats> {
  const cols: ColumnsType<WeeklyBacktestStats> = [
    {
      title: '分组',
      dataIndex: 'label',
      width: 170,
      render: (label: string, row) => (
        <span>
          {label}
          {row.trades < 30 && row.trades > 0 && (
            <Tooltip title="样本少于 30 笔，结论不稳健，仅供参考">
              <Tag color="orange" style={{ marginInlineStart: 6 }}>
                样本少
              </Tag>
            </Tooltip>
          )}
        </span>
      ),
    },
    {
      title: '样本数',
      dataIndex: 'trades',
      width: 80,
      sorter: (a, b) => a.trades - b.trades,
      render: (v: number) => v.toLocaleString('zh-CN'),
    },
    {
      title: '胜率',
      dataIndex: 'winRate',
      width: 86,
      sorter: (a, b) => a.winRate - b.winRate,
      render: (v: number, row) =>
        row.trades === 0 ? (
          <Text type="secondary">-</Text>
        ) : (
          <strong style={{ color: v >= 50 ? '#cf1322' : '#595959' }}>{pct(v, 1)}</strong>
        ),
    },
    {
      title: '平均收益',
      dataIndex: 'avgReturn',
      width: 92,
      sorter: (a, b) => a.avgReturn - b.avgReturn,
      render: (v: number, row) => (row.trades === 0 ? <Text type="secondary">-</Text> : signedPct(v)),
    },
    {
      title: '中位数',
      dataIndex: 'medianReturn',
      width: 86,
      sorter: (a, b) => a.medianReturn - b.medianReturn,
      render: (v: number, row) => (row.trades === 0 ? <Text type="secondary">-</Text> : signedPct(v)),
    },
    {
      title: '平均盈利',
      dataIndex: 'avgWin',
      width: 90,
      render: (v: number, row) => (row.trades === 0 ? '-' : pct(v)),
    },
    {
      title: '平均亏损',
      dataIndex: 'avgLoss',
      width: 90,
      render: (v: number, row) => (row.trades === 0 ? '-' : pct(v)),
    },
    {
      title: <Tooltip title="总盈利 / 总亏损，大于 1 才是正期望">盈亏比</Tooltip>,
      dataIndex: 'profitFactor',
      width: 86,
      sorter: (a, b) => a.profitFactor - b.profitFactor,
      render: (v: number, row) =>
        row.trades === 0 ? <Text type="secondary">-</Text> : profitFactorText(v),
    },
    {
      title: '最佳',
      dataIndex: 'bestReturn',
      width: 80,
      render: (v: number, row) => (row.trades === 0 ? '-' : signedPct(v, 1)),
    },
    {
      title: '最差',
      dataIndex: 'worstReturn',
      width: 80,
      render: (v: number, row) => (row.trades === 0 ? '-' : signedPct(v, 1)),
    },
    {
      title: <Tooltip title="持有期内平均最大浮亏，衡量拿不拿得住">平均最大浮亏</Tooltip>,
      dataIndex: 'avgMaxAdverse',
      width: 116,
      sorter: (a, b) => a.avgMaxAdverse - b.avgMaxAdverse,
      render: (v: number, row) => (row.trades === 0 ? '-' : pct(v, 1)),
    },
    {
      title: '平均持有',
      dataIndex: 'avgHoldWeeks',
      width: 92,
      render: (v: number, row) => (row.trades === 0 ? '-' : `${v.toFixed(1)} 周`),
    },
  ];

  if (useStopLoss) {
    cols.push({
      title: <Tooltip title="盘中触及信号周给出的止损位，按止损价或跳空开盘价离场">止损离场</Tooltip>,
      dataIndex: 'stopRate',
      width: 92,
      render: (v: number, row) => (row.trades === 0 ? '-' : pct(v, 1)),
    });
  }
  if (exitPolicy === 'signal') {
    cols.push({
      title: <Tooltip title="命中第四章卖出信号，提前当周收盘离场">提前离场</Tooltip>,
      dataIndex: 'signalRate',
      width: 92,
      render: (v: number, row) => (row.trades === 0 ? '-' : pct(v, 1)),
    });
  }

  return cols;
}

export function WeeklyBacktestDrawer({ open, klines, names, onClose }: WeeklyBacktestDrawerProps) {
  const [holdWeeks, setHoldWeeks] = useState(2);
  const [exitPolicy, setExitPolicy] = useState<BacktestExitPolicy>('hold');
  const [grade, setGrade] = useState<WeeklySetupGrade | undefined>(undefined);
  const [useStopLoss, setUseStopLoss] = useState(false);
  const [applyGates, setApplyGates] = useState(false);
  /** 极端样本过滤：默认开启，避免「停牌缺周 / 复权异常」造出物理上不可能的收益 */
  const [filterExtremes, setFilterExtremes] = useState(true);
  const [newStockMinWeeks, setNewStockMinWeeks] = useState(0);

  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [result, setResult] = useState<WeeklyBacktestResult | null>(null);

  /** 首次展开后才开始计算（抽屉内容在首次展开时才挂载） */
  const [armed, setArmed] = useState(open);
  useEffect(() => {
    if (open) setArmed(true);
  }, [open]);

  /**
   * 依赖里刻意不含 open：关闭/再次打开抽屉只是切换可见性，
   * 不会打断进度，也不会丢弃已有的回测结果。
   */
  useEffect(() => {
    if (!armed) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const session = createWeeklyBacktestSession(klines, names, {
      holdWeeks,
      exitPolicy,
      grade,
      useStopLoss,
      applyGates,
      filterExtremes,
      newStockMinWeeks,
    });

    setResult(null);
    setRunning(true);
    setProgress({ done: 0, total: session.total });

    // 分块执行：每批只算少量股票，留出时间给浏览器重绘进度
    const tick = () => {
      if (cancelled) return;
      const hasMore = session.step(15);
      setProgress({ done: session.processed, total: session.total });
      if (hasMore) {
        timer = setTimeout(tick, 0);
      } else {
        setResult(session.getResult());
        setRunning(false);
      }
    };
    timer = setTimeout(tick, 0);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [
    armed,
    klines,
    names,
    holdWeeks,
    exitPolicy,
    grade,
    useStopLoss,
    applyGates,
    filterExtremes,
    newStockMinWeeks,
  ]);

  const columns = useMemo(
    () => buildColumns(useStopLoss, exitPolicy),
    [useStopLoss, exitPolicy]
  );

  const tableProps = useMemo(() => {
    const totalWidth = columns.reduce((sum, col) => sum + (Number(col.width) || 100), 0);
    return {
      size: 'small' as const,
      pagination: false as const,
      columns,
      rowKey: 'key',
      scroll: { x: totalWidth },
      locale: { emptyText: '暂无样本' },
    };
  }, [columns]);

  const percent = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <Drawer
      title={
        <Space size="middle" wrap>
          <span>六大战法历史回测</span>
          <span
            style={{
              fontSize: 12,
              color: 'var(--ant-color-text-secondary)',
              fontWeight: 'normal',
            }}
          >
            💡 信号当周收盘确认、次周开盘买入；同一战法上一笔未离场前不重复计数
          </span>
        </Space>
      }
      placement="right"
      width={BACKTEST_DRAWER_WIDTH}
      open={open}
      onClose={onClose}
      destroyOnClose={false}
      styles={{ body: { paddingTop: 8 } }}
    >
      <Space direction="vertical" size={12} style={{ width: '100%' }}>
        <Space wrap size={[16, 8]} align="center">
          <Space size={6}>
            <span style={{ fontSize: 13 }}>持有周期：</span>
            <Select
              value={holdWeeks}
              options={HOLD_WEEK_OPTIONS}
              style={{ width: 88 }}
              onChange={setHoldWeeks}
              disabled={running}
            />
          </Space>
          <Space size={6}>
            <span style={{ fontSize: 13 }}>出场策略：</span>
            <Select
              value={exitPolicy}
              options={EXIT_POLICY_OPTIONS}
              style={{ width: 176 }}
              onChange={setExitPolicy}
              disabled={running}
            />
          </Space>
          <Space size={6}>
            <span style={{ fontSize: 13 }}>档位：</span>
            <Select
              allowClear
              value={grade}
              placeholder="不限"
              options={GRADE_OPTIONS}
              style={{ width: 104 }}
              onChange={(value: WeeklySetupGrade | undefined) => setGrade(value)}
              disabled={running}
            />
          </Space>
          <Checkbox
            checked={useStopLoss}
            onChange={(e) => setUseStopLoss(e.target.checked)}
            disabled={running}
          >
            <Tooltip title="信号周用「MA20 与近 8 周结构低点取更近者」定止损，盘中跌破即离场">
              启用止损
            </Tooltip>
          </Checkbox>
          <Checkbox
            checked={applyGates}
            onChange={(e) => setApplyGates(e.target.checked)}
            disabled={running}
          >
            <Tooltip title="非空头排列 + 站上 60 周线 + 当周不过热。默认关闭，以便衡量战法本身">
              套用硬门槛
            </Tooltip>
          </Checkbox>
          <Checkbox
            checked={filterExtremes}
            onChange={(e) => setFilterExtremes(e.target.checked)}
            disabled={running}
          >
            <Tooltip title="剔除三类无法真实成交的样本：停牌/缺周造成的跨月跳空、收益超出涨跌幅物理极限（如主板两周 >159%）、上市初期。关闭后极端值会重新进入统计">
              极端样本过滤
            </Tooltip>
          </Checkbox>
          <Space size={6}>
            <span style={{ fontSize: 13 }}>上市初期：</span>
            <Select
              value={newStockMinWeeks}
              options={NEW_STOCK_WEEK_OPTIONS}
              style={{ width: 104 }}
              onChange={setNewStockMinWeeks}
              disabled={running || !filterExtremes}
            />
          </Space>
        </Space>

        {running && (
          <div>
            <Progress percent={percent} status="active" size="small" />
            <Text type="secondary" style={{ fontSize: 12 }}>
              正在回溯历史信号：{progress.done} / {progress.total} 只
            </Text>
          </div>
        )}

        {!running && result && (
          <>
            <Alert
              type="info"
              showIcon
              message="口径说明"
              description={
                <ul style={{ margin: 0, paddingInlineStart: 18, fontSize: 12 }}>
                  <li>
                    信号在当周<b>收盘后确认</b>，<b>次周开盘买入</b>，收益按
                    {exitPolicy === 'hold' ? `持有 ${result.holdWeeks} 周后的收盘价` : '离场周收盘价'}
                    计算，不使用未来信息。
                  </li>
                  <li>
                    同一只票、同一战法，上一笔未离场前不重复计数；一段连续形态只算一笔样本。
                  </li>
                  <li>
                    样本 = {result.scannedStocks} 只股票（另有 {result.skippedStocks} 只因历史不足被跳过）
                    的最近若干年已收盘周K。样本越少，胜率越容易失真。
                  </li>
                  {result.excluded.total > 0 && (
                    <li>
                      已剔除 <b>{result.excluded.total.toLocaleString('zh-CN')}</b> 笔极端样本（
                      {exclusionSummaryText(result.excluded.byReason)}
                      ）。这些样本的周K存在停牌缺周或复权异常，
                      「信号次周开盘买入」无法真实成立，因此不计入统计。
                    </li>
                  )}
                  {result.grade && (
                    <li>
                      已按档位过滤：只统计<b>{result.grade === 'full' ? '满分档' : '部分档'}</b>
                      信号。冷却期与共振仍按完整信号序列推进，因此与「不限」时的档位拆分口径一致
                      （满分档 + 部分档 = 不限档位）。
                    </li>
                  )}
                  <li>胜率按「收益 &gt; 0」计；平盘计入未盈利。</li>
                </ul>
              }
            />

            {result.excluded.samples.length > 0 && (
              <details>
                <summary style={{ cursor: 'pointer', fontSize: 12, color: 'var(--ant-color-text-secondary)' }}>
                  查看被剔除的样本明细（收益最异常的 {result.excluded.samples.length} 条，可据此核对是否新股 / 停牌股）
                </summary>
                <Table<WeeklyBacktestExcludedSample>
                  size="small"
                  rowKey={(row) => `${row.code}-${row.signalTime}-${row.reason}`}
                  pagination={false}
                  style={{ marginTop: 8 }}
                  columns={EXCLUDED_COLUMNS}
                  dataSource={result.excluded.samples}
                />
              </details>
            )}

            <div>
              <Text strong>按战法汇总</Text>
              <Table<WeeklyBacktestStats>
                {...tableProps}
                style={{ marginTop: 8 }}
                dataSource={[result.overall, ...result.bySetup]}
              />
            </div>

            {!result.grade && result.bySetupGrade.length > 0 && (
              <div>
                <Text strong>按战法 × 档位（满分档 vs 部分档）</Text>
                <Table<WeeklyBacktestStats>
                  {...tableProps}
                  style={{ marginTop: 8 }}
                  dataSource={result.bySetupGrade}
                />
              </div>
            )}

            {result.byHitCount.length > 0 && (
              <div>
                <Text strong>按共振强度（战法相关度高，共振溢价有限）</Text>
                <Table<WeeklyBacktestStats>
                  {...tableProps}
                  style={{ marginTop: 8 }}
                  dataSource={result.byHitCount}
                />
              </div>
            )}
          </>
        )}
      </Space>
    </Drawer>
  );
}

export default WeeklyBacktestDrawer;
