/**
 * 主应用组件
 */

import { useEffect, useState } from 'react';
import { ConfigProvider, App as AntdApp, theme, Layout, Tabs } from 'antd';
import { StockOutlined, BellOutlined } from '@ant-design/icons';
import zhCN from 'antd/locale/zh_CN';
import { useTheme } from '@/hooks/useTheme';
import { useStockStore } from '@/stores/stockStore';
import { initNotificationNavigation } from '@/services/notificationService';
import { ThemeToggle } from '@/components/ThemeToggle/ThemeToggle';
import { ListPage } from '@/pages/ListPage/ListPage';
import { DetailPage } from '@/pages/DetailPage/DetailPage';
import { AlertPage } from '@/pages/AlertPage/AlertPage';
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

    // 10秒后停止检查
    const timeout = setTimeout(() => {
      clearInterval(checkInterval);
      const api = checkElectronAPI();
      if (!api) {
        console.error('[App] 警告：10秒后 electronAPI 仍然不可用！');
        console.error('[App] 请检查：');
        console.error('  1. preload 脚本是否正确编译（npm run build:electron）');
        console.error('  2. 主进程是否正确加载了 preload 脚本');
        console.error('  3. 控制台是否有 [Preload] 相关的日志');
      }
    }, 10000);

    return () => {
      clearInterval(checkInterval);
      clearTimeout(timeout);
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

  // 当切换到提醒管理tab时，清除选中的股票
  useEffect(() => {
    if (activeTab === 'alerts') {
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
                activeKey={activeTab}
                onChange={setActiveTab}
                className={styles.mainTabs}
                items={[
                  {
                    key: 'stocks',
                    label: (
                      <span>
                        <StockOutlined />
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
                        <BellOutlined />
                        提醒管理
                      </span>
                    ),
                    children: (
                      <div className={styles.alertsLayout}>
                        <AlertPage />
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

