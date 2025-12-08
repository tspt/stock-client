/**
 * 列表页
 */

import { Layout } from 'antd';
import { SearchBar } from '@/components/SearchBar/SearchBar';
import { StockList } from '@/components/StockList/StockList';
import { ThemeToggle } from '@/components/ThemeToggle/ThemeToggle';
import { useAllStocks } from '@/hooks/useAllStocks';
import styles from './ListPage.module.css';

const { Header, Content } = Layout;

export function ListPage() {
  // 加载所有股票列表
  useAllStocks();

  return (
    <Layout className={styles.listPage}>
      <Header className={styles.header}>
        <div className={styles.headerContent}>
          <h1 className={styles.title}>破忒头工具</h1>
          <ThemeToggle />
        </div>
      </Header>
      <Content className={styles.content}>
        <SearchBar />
        <StockList />
      </Content>
    </Layout>
  );
}

