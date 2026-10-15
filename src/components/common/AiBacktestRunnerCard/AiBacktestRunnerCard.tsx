/**
 * AI 胜率回评执行卡片：基础筛选（市场 / 名称）+ 采样参数 + 运行/取消 + 进度。
 *
 * 只负责参数收集与触发，编排逻辑在 `hooks/useAiBacktestEngine`。
 * 市场 / 名称的选项与默认值直接复用机会分析页的常量，避免两页口径分叉。
 */

import { useState } from 'react';
import { Alert, Button, Card, Select, Space, Tag } from 'antd';
import { PlayCircleOutlined, StopOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { ProgressCard } from '../ProgressCard/ProgressCard';
import { MARKET_OPTIONS, NAME_TYPE_OPTIONS } from '@/utils/config/opportunityPageOptions';
import {
  AI_BACKTEST_DEFAULT_SECTION_COUNT,
  AI_BACKTEST_DEFAULT_SECTION_STEP,
  AI_BACKTEST_DEFAULT_UNIVERSE_LIMIT,
  AI_BACKTEST_HORIZON_OPTIONS,
  AI_BACKTEST_SECTION_COUNT_OPTIONS,
  AI_BACKTEST_SECTION_STEP_OPTIONS,
  AI_BACKTEST_UNIVERSE_LIMIT_OPTIONS,
  type AiBacktestHorizon,
} from '@/utils/config/aiBacktestOptions';
import type { AiBacktestRunParams } from '@/hooks/useAiBacktestEngine';
import styles from './AiBacktestRunnerCard.module.css';

export interface AiBacktestRunnerCardProps {
  /** 本地有日线的股票总数（未筛选） */
  localTotal: number;
  /** 通过市场/名称筛选后的股票数 */
  availableCount: number;
  /** 股票池是否仍在加载 */
  loadingUniverse: boolean;
  /** 选中的市场（多选） */
  selectedMarket: string[];
  /** 名称类型：all / st / non_st */
  nameType: string;
  /** 主口径 */
  horizon: AiBacktestHorizon;
  onSelectedMarketChange: (markets: string[]) => void;
  onNameTypeChange: (nameType: string) => void;
  onHorizonChange: (horizon: AiBacktestHorizon) => void;
  running: boolean;
  progress: { completed: number; total: number; percent: number };
  error: string | null;
  onRun: (params: AiBacktestRunParams) => void;
  onCancel: () => void;
}

export function AiBacktestRunnerCard({
  localTotal,
  availableCount,
  loadingUniverse,
  selectedMarket,
  nameType,
  horizon,
  onSelectedMarketChange,
  onNameTypeChange,
  onHorizonChange,
  running,
  progress,
  error,
  onRun,
  onCancel,
}: AiBacktestRunnerCardProps) {
  const [universeLimit, setUniverseLimit] = useState(AI_BACKTEST_DEFAULT_UNIVERSE_LIMIT);
  const [sectionCount, setSectionCount] = useState(AI_BACKTEST_DEFAULT_SECTION_COUNT);
  const [sectionStep, setSectionStep] = useState(AI_BACKTEST_DEFAULT_SECTION_STEP);

  const noLocalData = !loadingUniverse && localTotal === 0;
  const filteredOut = !loadingUniverse && localTotal > 0 && availableCount === 0;

  return (
    <Card
      className={styles.card}
      title={
        <Space>
          <ThunderboltOutlined />
          <span>执行回评</span>
        </Space>
      }
      extra={
        <Space wrap>
          <Button
            type="primary"
            icon={<PlayCircleOutlined />}
            loading={running}
            disabled={noLocalData || filteredOut}
            onClick={() => onRun({ universeLimit, sectionCount, sectionStep })}
          >
            开始回评
          </Button>
          {running && (
            <Button icon={<StopOutlined />} onClick={onCancel}>
              取消
            </Button>
          )}
        </Space>
      }
    >
      <div className={styles.body}>
        <div className={styles.controls}>
          <div className={styles.control}>
            <span className={styles.controlLabel}>市场</span>
            <Select
              className={styles.selectWide}
              mode="multiple"
              value={selectedMarket}
              onChange={onSelectedMarketChange}
              options={MARKET_OPTIONS}
              disabled={running}
              placeholder="选择市场"
            />
          </div>
          <div className={styles.control}>
            <span className={styles.controlLabel}>名称</span>
            <Select
              className={styles.select}
              value={nameType}
              onChange={onNameTypeChange}
              options={NAME_TYPE_OPTIONS}
              disabled={running}
            />
          </div>
          <Tag className={styles.availableTag} color={availableCount > 0 ? 'blue' : 'orange'}>
            {loadingUniverse
              ? '正在读取本地日线…'
              : `符合条件 ${availableCount} 只 / 本地共 ${localTotal} 只`}
          </Tag>
        </div>

        <div className={styles.controls}>
          <div className={styles.control}>
            <span className={styles.controlLabel}>股票池上限</span>
            <Select
              className={styles.select}
              value={universeLimit}
              onChange={setUniverseLimit}
              options={AI_BACKTEST_UNIVERSE_LIMIT_OPTIONS}
              disabled={running}
            />
          </div>
          <div className={styles.control}>
            <span className={styles.controlLabel}>采样截面数</span>
            <Select
              className={styles.select}
              value={sectionCount}
              onChange={setSectionCount}
              options={AI_BACKTEST_SECTION_COUNT_OPTIONS}
              disabled={running}
            />
          </div>
          <div className={styles.control}>
            <span className={styles.controlLabel}>采样间隔</span>
            <Select
              className={styles.select}
              value={sectionStep}
              onChange={setSectionStep}
              options={AI_BACKTEST_SECTION_STEP_OPTIONS}
              disabled={running}
            />
          </div>
          <div className={styles.control}>
            <span className={styles.controlLabel}>主口径</span>
            <Select
              className={styles.select}
              value={horizon}
              onChange={onHorizonChange}
              options={AI_BACKTEST_HORIZON_OPTIONS}
              disabled={running || availableCount === 0}
              title="切换口径只做本地重聚合，不会重跑回评"
            />
          </div>
        </div>

        {running && (
          <ProgressCard
            percent={progress.percent}
            status="active"
            text={`正在重算 ${progress.completed}/${progress.total} 个 (股票 × 截面) 组合`}
          />
        )}

        {noLocalData && !running && (
          <Alert
            type="warning"
            showIcon
            message="本地还没有日线数据"
            description="回评直接使用机会分析的日线（stockHistory）。请先在「机会分析」页执行一次一键分析，把 K 线拉到本地。"
          />
        )}

        {filteredOut && !running && (
          <Alert
            type="warning"
            showIcon
            message="当前市场 / 名称条件没有筛出任何股票"
            description="本地有日线数据，但都被筛选条件排除了。请放宽市场或名称条件。"
          />
        )}

        {universeLimit === 0 && availableCount > 0 && (
          <Alert
            type="warning"
            showIcon
            message="已选择全量股票池"
            description="全市场 K 线结构化克隆进 Worker 的代价很大（数千只 × 数百根），可能造成明显卡顿。建议先用有限股票数跑通，再考虑全量。"
          />
        )}

        {error && <Alert type="error" showIcon message={error} closable />}
      </div>
    </Card>
  );
}
