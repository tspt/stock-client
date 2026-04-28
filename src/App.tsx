/**
 * 主应用组件
 */

import { Suspense, lazy, useEffect, useState } from 'react';
import { ConfigProvider, App as AntdApp, theme, Layout, Tabs, Spin } from 'antd';
import { StockOutlined, BellOutlined, BarChartOutlined, FireOutlined, ClusterOutlined, AppstoreOutlined, PartitionOutlined, KeyOutlined, DatabaseOutlined, SafetyCertificateOutlined, TrophyOutlined, HistoryOutlined, ExperimentOutlined } from '@ant-design/icons';
import zhCN from 'antd/locale/zh_CN';
import { useTheme } from '@/hooks/useTheme';
import { useStockStore, setAppInstance } from '@/stores/stockStore';
import { initNotificationNavigation } from '@/services/alerts';
import { ThemeToggle } from '@/components/ThemeToggle/ThemeToggle';
import { ErrorBoundary } from '@/components/ErrorBoundary/ErrorBoundary';
import { logger } from '@/utils/business/logger';
import CookiePoolManager from '@/utils/storage/cookiePoolManager';
import styles from './App.module.css';
import { POLLING_INTERVAL } from '@/utils/config/constants';

const ListPage = lazy(() => import('@/pages/ListPage/ListPage').then((m) => ({ default: m.ListPage })));
const DetailPage = lazy(() => import('@/pages/DetailPage/DetailPage').then((m) => ({ default: m.DetailPage })));
const AlertPage = lazy(() => import('@/pages/AlertPage/AlertPage').then((m) => ({ default: m.AlertPage })));
const OpportunityPage = lazy(() =>
  import('@/pages/OpportunityPage/OpportunityPage').then((m) => ({ default: m.OpportunityPage }))
);
const AnalysisRecordPage = lazy(() =>
  import('@/pages/AnalysisRecordPage/AnalysisRecordPage').then((m) => ({ default: m.AnalysisRecordPage }))
);
const HotPage = lazy(() => import('@/pages/HotPage/HotPage').then((m) => ({ default: m.HotPage })));
const IndustrySectorPage = lazy(() => import('@/pages/IndustrySectorPage/IndustrySectorPage').then((m) => ({ default: m.IndustrySectorPage })));
const ConceptSectorPage = lazy(() => import('@/pages/ConceptSectorPage/ConceptSectorPage').then((m) => ({ default: m.ConceptSectorPage })));
const SectorConstituentsPage = lazy(() => import('@/pages/SectorConstituentsPage/SectorConstituentsPage').then((m) => ({ default: m.SectorConstituentsPage })));
const BillboardPage = lazy(() => import('@/pages/BillboardPage/BillboardPage').then((m) => ({ default: m.BillboardPage })));
const CookieManagerPage = lazy(() => import('@/pages/CookieManagerPage/CookieManagerPage').then((m) => ({ default: m.CookieManagerPage })));
const DataManagerPage = lazy(() => import('@/pages/DataManagerPage/DataManagerPage').then((m) => ({ default: m.DataManagerPage })));
const BacktestPage = lazy(() => import('@/pages/BacktestPage/BacktestPage').then((m) => ({ default: m.BacktestPage })));

const { Header, Content } = Layout;

function AppContent() {
  const { theme: currentTheme } = useTheme();
  const { setSelectedStock } = useStockStore();
  const [activeTab, setActiveTab] = useState('cookie-manager');

  // 检查 electronAPI 是否可用
  useEffect(() => {
    const checkElectronAPI = () => {
      return window.electronAPI;
    };

    const electronAPI = checkElectronAPI();
    logger.debug('[App] 应用启动，检查 electronAPI:', {
      hasWindow: typeof window !== 'undefined',
      hasElectronAPI: !!electronAPI,
      electronAPIKeys: electronAPI ? Object.keys(electronAPI) : [],
    });

    // 延迟检查，确保 preload 脚本已执行
    let checkInterval: ReturnType<typeof setInterval> | undefined;
    checkInterval = setInterval(() => {
      const api = checkElectronAPI();
      if (api) {
        if (checkInterval !== undefined) {
          clearInterval(checkInterval);
          checkInterval = undefined;
        }
        logger.info('[App] electronAPI 已可用');
      } else {
        logger.warn('[App] electronAPI 仍然不可用，继续等待...');
      }
    }, POLLING_INTERVAL / 20); // 500ms = 10000ms / 20

    return () => {
      if (checkInterval !== undefined) {
        clearInterval(checkInterval);
      }
    };
  }, []);

  // 初始化通知导航监听
  useEffect(() => {
    const electronAPI = window.electronAPI;
    if (!electronAPI) {
      logger.warn('[App] electronAPI 不可用，跳过通知导航初始化');
      return;
    }
    const cleanup = initNotificationNavigation((code: string) => {
      setSelectedStock(code);
      setActiveTab('stocks');
    });
    return cleanup;
  }, [setSelectedStock]);

  // 初始化Cookie池管理器
  useEffect(() => {
    // 尽早注册监听器（在Cookie池初始化之前）
    let cleanupListener: (() => void) | undefined;
    const electronAPI = window.electronAPI as any;
    if (electronAPI?.ipcRenderer) {
      const handler = (_event: any, cookieValue: string) => {
        logger.warn('[App] 收到主进程通知：标记Cookie失效');
        const cookiePool = CookiePoolManager.getInstance();
        cookiePool.reportFailure(cookieValue).catch((err) => {
          logger.error('[App] 标记Cookie失败:', err);
        });
      };
      electronAPI.ipcRenderer.on('cookie-pool:mark-failed', handler);
      cleanupListener = () => {
        electronAPI.ipcRenderer.removeListener('cookie-pool:mark-failed', handler);
      };
    }

    CookiePoolManager.getInstance()
      .initialize()
      .then(() => {
        logger.info('[App] Cookie池管理器初始化完成');
      })
      .catch((error) => {
        logger.error('[App] Cookie池管理器初始化失败:', error);
      });

    return () => {
      if (cleanupListener) {
        cleanupListener();
      }
    };
  }, []);

  // 当切换到提醒管理/机会分析 tab 时，清除选中的股票
  useEffect(() => {
    if (activeTab === 'alerts' || activeTab === 'opportunity') {
      setSelectedStock(null);
    }
  }, [activeTab, setSelectedStock]);

  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        algorithm: currentTheme === 'dark' ? theme.darkAlgorithm : theme.defaultAlgorithm,
        token: {
          colorPrimary: '#1890ff',
        },
        components: {
          Spin: {
            colorBgContainer: '#f5f7fa',
          },
        },
      }}
    >
      <AntdApp>
        {(() => {
          // 初始化 App 实例供 stockStore 使用
          const app = AntdApp.useApp();
          setAppInstance(app);
          return null;
        })()}
        <ErrorBoundary>
          <div className={styles.app} data-theme={currentTheme}>
            <Layout className={styles.mainLayout}>
              <Header className={styles.header}>
                <div className={styles.headerContent}>
                  <h1 className={styles.title}>破忒头工具</h1>
                  <ThemeToggle />
                </div>
              </Header>
              <Content className={styles.content}>
                <Tabs
                  tabPosition={"left"}
                  activeKey={activeTab}
                  onChange={setActiveTab}
                  className={styles.mainTabs}
                  destroyOnHidden
                  items={[
                    {
                      key: 'hot',
                      label: (
                        <span>
                          <FireOutlined className={styles.mgr6} />
                          热门行情
                        </span>
                      ),
                      children: (
                        <Suspense
                          fallback={
                            <div className={styles.suspenseFallback}>
                              <Spin size="large" />
                            </div>
                          }
                        >
                          <div className={styles.hotLayout}>
                            <HotPage />
                          </div>
                        </Suspense>
                      ),
                    },
                    {
                      key: 'industry-sector',
                      label: (
                        <span>
                          <AppstoreOutlined className={styles.mgr6} />
                          行业板块
                        </span>
                      ),
                      children: (
                        <Suspense
                          fallback={
                            <div className={styles.suspenseFallback}>
                              <Spin size="large" />
                            </div>
                          }
                        >
                          <div className={styles.sectorLayout}>
                            <IndustrySectorPage />
                          </div>
                        </Suspense>
                      ),
                    },
                    {
                      key: 'concept-sector',
                      label: (
                        <span>
                          <ClusterOutlined className={styles.mgr6} />
                          概念板块
                        </span>
                      ),
                      children: (
                        <Suspense
                          fallback={
                            <div className={styles.suspenseFallback}>
                              <Spin size="large" />
                            </div>
                          }
                        >
                          <div className={styles.sectorLayout}>
                            <ConceptSectorPage />
                          </div>
                        </Suspense>
                      ),
                    },
                    {
                      key: 'sector-stocks',
                      label: (
                        <span>
                          <PartitionOutlined className={styles.mgr6} />
                          成分股大全
                        </span>
                      ),
                      children: (
                        <Suspense
                          fallback={
                            <div className={styles.suspenseFallback}>
                              <Spin size="large" />
                            </div>
                          }
                        >
                          <div className={styles.sectorLayout}>
                            <SectorConstituentsPage />
                          </div>
                        </Suspense>
                      ),
                    },
                    {
                      key: 'billboard',
                      label: (
                        <span>
                          <TrophyOutlined className={styles.mgr6} />
                          龙虎榜
                        </span>
                      ),
                      children: (
                        <Suspense
                          fallback={
                            <div className={styles.suspenseFallback}>
                              <Spin size="large" />
                            </div>
                          }
                        >
                          <div className={styles.sectorLayout}>
                            <BillboardPage />
                          </div>
                        </Suspense>
                      ),
                    },
                    {
                      key: 'opportunity',
                      label: (
                        <span>
                          <BarChartOutlined className={styles.mgr6} />
                          机会分析
                        </span>
                      ),
                      children: (
                        <Suspense
                          fallback={
                            <div className={styles.suspenseFallback}>
                              <Spin size="large" />
                            </div>
                          }
                        >
                          <div className={styles.opportunityLayout}>
                            <OpportunityPage />
                          </div>
                        </Suspense>
                      ),
                    },
                    {
                      key: 'analysis-records',
                      label: (
                        <span>
                          <HistoryOutlined className={styles.mgr6} />
                          分析记录
                        </span>
                      ),
                      children: (
                        <Suspense
                          fallback={
                            <div className={styles.suspenseFallback}>
                              <Spin size="large" />
                            </div>
                          }
                        >
                          <div className={styles.opportunityLayout}>
                            <AnalysisRecordPage />
                          </div>
                        </Suspense>
                      ),
                    },
                    {
                      key: 'backtest',
                      label: (
                        <span>
                          <ExperimentOutlined className={styles.mgr6} />
                          历史回测
                        </span>
                      ),
                      children: (
                        <Suspense
                          fallback={
                            <div className={styles.suspenseFallback}>
                              <Spin size="large" />
                            </div>
                          }
                        >
                          <div className={styles.opportunityLayout}>
                            <BacktestPage />
                          </div>
                        </Suspense>
                      ),
                    },
                    {
                      key: 'stocks',
                      label: (
                        <span>
                          <StockOutlined className={styles.mgr6} />
                          股票列表
                        </span>
                      ),
                      children: (
                        <Suspense
                          fallback={
                            <div className={styles.suspenseFallback}>
                              <Spin size="large" />
                            </div>
                          }
                        >
                          <div className={styles.stocksLayout}>
                            <div className={styles.leftPanel}>
                              <ListPage />
                            </div>
                            <div className={styles.rightPanel}>
                              <DetailPage />
                            </div>
                          </div>
                        </Suspense>
                      ),
                    },
                    {
                      key: 'alerts',
                      label: (
                        <span>
                          <BellOutlined className={styles.mgr6} />
                          提醒管理
                        </span>
                      ),
                      children: (
                        <Suspense
                          fallback={
                            <div className={styles.suspenseFallback}>
                              <Spin size="large" />
                            </div>
                          }
                        >
                          <div className={styles.alertsLayout}>
                            <AlertPage />
                          </div>
                        </Suspense>
                      ),
                    },
                    {
                      key: 'cookie-manager',
                      label: (
                        <span>
                          <SafetyCertificateOutlined className={styles.mgr6} />
                          Cookie管理
                        </span>
                      ),
                      children: (
                        <Suspense
                          fallback={
                            <div className={styles.suspenseFallback}>
                              <Spin size="large" />
                            </div>
                          }
                        >
                          <div className={styles.cookieManagerLayout}>
                            <CookieManagerPage />
                          </div>
                        </Suspense>
                      ),
                    },
                    {
                      key: 'data-manager',
                      label: (
                        <span>
                          <DatabaseOutlined className={styles.mgr6} />
                          数据管理
                        </span>
                      ),
                      children: (
                        <Suspense
                          fallback={
                            <div className={styles.suspenseFallback}>
                              <Spin size="large" />
                            </div>
                          }
                        >
                          <div className={styles.cookieManagerLayout}>
                            <DataManagerPage />
                          </div>
                        </Suspense>
                      ),
                    },
                  ]}
                />
              </Content>
            </Layout>
          </div>
        </ErrorBoundary>
      </AntdApp>
    </ConfigProvider>
  );
}

export default AppContent;

