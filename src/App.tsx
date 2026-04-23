/**
 * 主应用组件
 */

import { Suspense, lazy, useEffect, useState } from 'react';
import { ConfigProvider, App as AntdApp, theme, Layout, Tabs, Spin } from 'antd';
import { StockOutlined, BellOutlined, BarChartOutlined, FireOutlined, ClusterOutlined, AppstoreOutlined, PartitionOutlined, KeyOutlined } from '@ant-design/icons';
import zhCN from 'antd/locale/zh_CN';
import { useTheme } from '@/hooks/useTheme';
import { useStockStore } from '@/stores/stockStore';
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
const OverviewPage = lazy(() => import('@/pages/OverviewPage/OverviewPage').then((m) => ({ default: m.OverviewPage })));
const OpportunityPage = lazy(() =>
  import('@/pages/OpportunityPage/OpportunityPage').then((m) => ({ default: m.OpportunityPage }))
);
const HotPage = lazy(() => import('@/pages/HotPage/HotPage').then((m) => ({ default: m.HotPage })));
const IndustrySectorPage = lazy(() => import('@/pages/IndustrySectorPage/IndustrySectorPage').then((m) => ({ default: m.IndustrySectorPage })));
const ConceptSectorPage = lazy(() => import('@/pages/ConceptSectorPage/ConceptSectorPage').then((m) => ({ default: m.ConceptSectorPage })));
const SectorConstituentsPage = lazy(() => import('@/pages/SectorConstituentsPage/SectorConstituentsPage').then((m) => ({ default: m.SectorConstituentsPage })));
const CookieManagerPage = lazy(() => import('@/pages/CookieManagerPage/CookieManagerPage').then((m) => ({ default: m.CookieManagerPage })));

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
    CookiePoolManager.getInstance()
      .initialize()
      .then(() => {
        logger.info('[App] Cookie池管理器初始化完成');
      })
      .catch((error) => {
        logger.error('[App] Cookie池管理器初始化失败:', error);
      });
  }, []);

  // 当切换到提醒管理/数据概况/机会分析 tab 时，清除选中的股票
  useEffect(() => {
    if (activeTab === 'alerts' || activeTab === 'overview' || activeTab === 'opportunity') {
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
      }}
    >
      <AntdApp>
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
                      key: 'overview',
                      label: (
                        <span>
                          <BarChartOutlined className={styles.mgr6} />
                          列表数据概况
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
                          <div className={styles.overviewLayout}>
                            <OverviewPage />
                          </div>
                        </Suspense>
                      ),
                    },
                    {
                      key: 'cookie-manager',
                      label: (
                        <span>
                          <KeyOutlined className={styles.mgr6} />
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

