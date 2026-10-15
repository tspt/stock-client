/**
 * AI 胜率回评页面
 *
 * 按日期截面重算 AI 打分，用截面日之后的真实收益衡量它到底有没有区分度。
 *
 * 数据源：机会分析已经在用的 `stockHistory` 日线（一键分析 / K线弹窗写入），
 * 不需要额外准备数据；除权跳空造成的失真由回评侧按板别识别后整条剔除。
 *
 * 页面只保留状态编排与 JSX：回评编排在 hooks/useAiBacktestEngine，
 * 展示单元在 components/common/。
 */

import { Layout, Typography } from 'antd';
import { TrophyOutlined } from '@ant-design/icons';
import { AiBacktestRunnerCard } from '@/components/common/AiBacktestRunnerCard/AiBacktestRunnerCard';
import { AiBacktestReport } from '@/components/common/AiBacktestReport/AiBacktestReport';
import { useAiBacktestEngine } from '@/hooks/useAiBacktestEngine';
import styles from './AiBacktestPage.module.css';

const { Header, Content } = Layout;
const { Title, Text } = Typography;

export function AiBacktestPage() {
  const {
    localTotal,
    availableCount,
    loadingUniverse,
    selectedMarket,
    nameType,
    horizon,
    running,
    progress,
    aggregate,
    lastRun,
    error,
    run,
    cancel,
    setSelectedMarket,
    setNameType,
    setHorizon,
  } = useAiBacktestEngine();

  return (
    <Layout className={styles.page}>
      <Header className={styles.header}>
        <div className={styles.headerContent}>
          <div className={styles.headerLeft}>
            <Title className={styles.pageTitle} level={5}>
              <TrophyOutlined className={styles.titleIcon} /> AI 胜率回评
            </Title>
            <Text className={styles.pageSubtitle}>
              把机会分析的 AI 输出（趋势方向 / 置信度 / 综合评分）放到历史截面上回测，用真实前向收益衡量胜率
            </Text>
          </div>
        </div>
      </Header>

      <Content className={styles.content}>
        <div className={styles.body}>
          <AiBacktestRunnerCard
            localTotal={localTotal}
            availableCount={availableCount}
            loadingUniverse={loadingUniverse}
            selectedMarket={selectedMarket}
            nameType={nameType}
            horizon={horizon}
            onSelectedMarketChange={setSelectedMarket}
            onNameTypeChange={setNameType}
            onHorizonChange={setHorizon}
            running={running}
            progress={progress}
            error={error}
            onRun={run}
            onCancel={cancel}
          />
          <AiBacktestReport aggregate={aggregate} lastRun={lastRun} />
        </div>
      </Content>
    </Layout>
  );
}
