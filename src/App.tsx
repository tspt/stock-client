/**
 * 主应用组件
 */

import { ConfigProvider, App as AntdApp, theme } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { useTheme } from '@/hooks/useTheme';
import { ListPage } from '@/pages/ListPage/ListPage';
import { DetailPage } from '@/pages/DetailPage/DetailPage';
import styles from './App.module.css';

function AppContent() {
  const { theme: currentTheme } = useTheme();

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
          <div className={styles.mainLayout}>
            <div className={styles.leftPanel}>
              <ListPage />
            </div>
            <div className={styles.rightPanel}>
              <DetailPage />
            </div>
          </div>
        </div>
      </AntdApp>
    </ConfigProvider>
  );
}

export default AppContent;

