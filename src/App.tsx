/**
 * 主应用组件
 */

import { Suspense, lazy, useEffect, useState } from 'react';
import { ConfigProvider, App as AntdApp, theme, Layout, Tabs, Spin } from 'antd';
import { StockOutlined, BellOutlined, BarChartOutlined } from '@ant-design/icons';
import zhCN from 'antd/locale/zh_CN';
import { useTheme } from '@/hooks/useTheme';
import { useStockStore } from '@/stores/stockStore';
import { initNotificationNavigation } from '@/services/notificationNavigation';
import { ThemeToggle } from '@/components/ThemeToggle/ThemeToggle';
import { ErrorBoundary } from '@/components/ErrorBoundary/ErrorBoundary';
import { logger } from '@/utils/logger';
import styles from './App.module.css';

const ListPage = lazy(() => import('@/pages/ListPage/ListPage').then((m) => ({ default: m.ListPage })));
const DetailPage = lazy(() => import('@/pages/DetailPage/DetailPage').then((m) => ({ default: m.DetailPage })));
const AlertPage = lazy(() => import('@/pages/AlertPage/AlertPage').then((m) => ({ default: m.AlertPage })));
const OverviewPage = lazy(() => import('@/pages/OverviewPage/OverviewPage').then((m) => ({ default: m.OverviewPage })));
const OpportunityPage = lazy(() =>
  import('@/pages/OpportunityPage/OpportunityPage').then((m) => ({ default: m.OpportunityPage }))
);

const { Header, Content } = Layout;

function AppContent() {
  const { theme: currentTheme } = useTheme();
  const { setSelectedStock } = useStockStore();
  const [activeTab, setActiveTab] = useState('stocks');

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
    }, 500);

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
                              <Spin size="large" tip="加载中..." />
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
                              <Spin size="large" tip="加载中..." />
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
                              <Spin size="large" tip="加载中..." />
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
                              <Spin size="large" tip="加载中..." />
                            </div>
                          }
                        >
                          <div className={styles.opportunityLayout}>
                            <OpportunityPage />
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

