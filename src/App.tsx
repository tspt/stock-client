/**
 * 主应用组件
 */

import { useEffect, useState } from 'react';
import { ConfigProvider, App as AntdApp, theme, Layout, Tabs } from 'antd';
import { StockOutlined, BellOutlined, BarChartOutlined } from '@ant-design/icons';
import zhCN from 'antd/locale/zh_CN';
import { useTheme } from '@/hooks/useTheme';
import { useStockStore } from '@/stores/stockStore';
import { initNotificationNavigation } from '@/services/notificationService';
import { ThemeToggle } from '@/components/ThemeToggle/ThemeToggle';
import { ListPage } from '@/pages/ListPage/ListPage';
import { DetailPage } from '@/pages/DetailPage/DetailPage';
import { AlertPage } from '@/pages/AlertPage/AlertPage';
import { OverviewPage } from '@/pages/OverviewPage/OverviewPage';
import { OpportunityPage } from '@/pages/OpportunityPage/OpportunityPage';
import styles from './App.module.css';

const { Header, Content } = Layout;

function AppContent() {
  const { theme: currentTheme } = useTheme();
  const { setSelectedStock } = useStockStore();
  const [activeTab, setActiveTab] = useState('stocks');

  // 检查 electronAPI 是否可用
  useEffect(() => {
    const checkElectronAPI = () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const win = window as any;
      return win.electronAPI;
    };

    const electronAPI = checkElectronAPI();
    console.log('[App] 应用启动，检查 electronAPI:', {
      hasWindow: typeof window !== 'undefined',
      hasElectronAPI: !!electronAPI,
      electronAPIKeys: electronAPI ? Object.keys(electronAPI) : [],
    });

    // 延迟检查，确保 preload 脚本已执行
    const checkInterval = setInterval(() => {
      const api = checkElectronAPI();
      if (api) {
        console.log('[App] electronAPI 已可用');
        clearInterval(checkInterval);
      } else {
        console.warn('[App] electronAPI 仍然不可用，继续等待...');
      }
    }, 500);

    return () => {
      clearInterval(checkInterval);
    };
  }, []);

  // 初始化通知导航监听
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const electronAPI = (window as any).electronAPI;
    if (!electronAPI) {
      console.warn('[App] electronAPI 不可用，跳过通知导航初始化');
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
                      <div className={styles.stocksLayout}>
                        <div className={styles.leftPanel}>
                          <ListPage />
                        </div>
                        <div className={styles.rightPanel}>
                          <DetailPage />
                        </div>
                      </div>
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
                      <div className={styles.alertsLayout}>
                        <AlertPage />
                      </div>
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
                      <div className={styles.overviewLayout}>
                        <OverviewPage />
                      </div>
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
                      <div className={styles.opportunityLayout}>
                        <OpportunityPage />
                      </div>
                    ),
                  },
                ]}
              />
            </Content>
          </Layout>
        </div>
      </AntdApp>
    </ConfigProvider>
  );
}

export default AppContent;

