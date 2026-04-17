/**
 * 行业板块页面 - 展示申万二级行业列表
 */

import { useState, useMemo } from 'react';
import { Layout, Input } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import { SHENWAN_INDUSTRIES } from '@/data/shenwanIndustries';
import type { ShenwanIndustry } from '@/types/stock';
import styles from './SectorPage.module.css';

const { Header, Content } = Layout;

export function SectorPage() {
  const [searchKeyword, setSearchKeyword] = useState('');

  // 过滤行业数据
  const filteredIndustries = useMemo(() => {
    if (!searchKeyword) return SHENWAN_INDUSTRIES;
    const keyword = searchKeyword.toLowerCase();
    return SHENWAN_INDUSTRIES.filter(
      (industry) =>
        industry.name.toLowerCase().includes(keyword) ||
        industry.code.toLowerCase().includes(keyword)
    );
  }, [searchKeyword]);

  return (
    <Layout className={styles.sectorPage}>
      <Header className={styles.header}>
        <div className={styles.searchWrapper}>
          <Input
            className={styles.searchBar}
            placeholder="搜索行业..."
            prefix={<SearchOutlined style={{ color: 'var(--ant-color-text-quaternary)' }} />}
            value={searchKeyword}
            onChange={(e) => setSearchKeyword(e.target.value)}
            allowClear
            size="small"
            bordered={false}
          />
        </div>
      </Header>
      <Content className={styles.content}>
        <div className={styles.industryGrid}>
          {filteredIndustries.map((industry) => (
            <div
              key={industry.code}
              className={styles.industryItem}
              title={`${industry.name} (${industry.code})`}
            >
              {industry.name}
            </div>
          ))}
        </div>
      </Content>
    </Layout>
  );
}
