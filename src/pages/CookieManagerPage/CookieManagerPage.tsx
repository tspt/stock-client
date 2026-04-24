/**
 * Cookie管理页面
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Card,
  Table,
  Button,
  Space,
  Progress,
  Tag,
  Modal,
  Input,
  message,
  Statistic,
  Row,
  Col,
  Popconfirm,
  Radio,
} from 'antd';
import {
  KeyOutlined,
  PlusOutlined,
  DeleteOutlined,
  ReloadOutlined,
  ClearOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  StopOutlined,
  DownloadOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import CookiePoolManager from '@/utils/storage/cookiePoolManager';
import type { CookieEntry, CookieOperationLog } from '@/types/cookie';
import styles from './CookieManagerPage.module.css';

const { TextArea } = Input;

export function CookieManagerPage() {
  const [cookies, setCookies] = useState<CookieEntry[]>([]);
  const [stats, setStats] = useState({
    totalCount: 0,
    activeCount: 0,
    avgHealthScore: 0,
    totalRequests: 0,
    successRate: 0,
  });
  const [logs, setLogs] = useState<CookieOperationLog[]>([]);
  const [isAddModalVisible, setIsAddModalVisible] = useState(false);
  const [isAutoFetchModalVisible, setIsAutoFetchModalVisible] = useState(false);
  const [addCookieText, setAddCookieText] = useState('');
  const [autoFetchCount, setAutoFetchCount] = useState(50);

  // 进度状态
  const [fetchProgress, setFetchProgress] = useState<{
    current: number;
    total: number;
    batch: number;
    totalBatches: number;
    status: string;
    cookie?: string;
  } | null>(null);
  const progressListenerRef = useRef<(() => void) | null>(null);
  const [isFetching, setIsFetching] = useState(false);
  const [loading, setLoading] = useState(false);

  // 分页状态
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 10,
  });

  // 导出对话框状态
  const [isExportModalVisible, setIsExportModalVisible] = useState(false);
  const [exportFilter, setExportFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [exporting, setExporting] = useState(false);

  // 导入功能
  const fileInputRef = useRef<HTMLInputElement>(null);

  const cookiePool = CookiePoolManager.getInstance();

  // 加载数据
  const loadData = async () => {
    setLoading(true);
    try {
      const allCookies = cookiePool.getAllCookies();
      setCookies(allCookies);
      setStats(cookiePool.getStats());
      setLogs(cookiePool.getOperationLogs(20));
    } catch (error) {
      message.error('加载数据失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // 手动添加Cookie
  const handleAddCookie = async () => {
    if (!addCookieText.trim()) {
      message.warning('请输入Cookie');
      return;
    }

    const cookieLines = addCookieText
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    if (cookieLines.length === 0) {
      message.warning('没有有效的Cookie');
      return;
    }

    setLoading(true);
    try {
      const successCount = await cookiePool.addCookiesBatch(cookieLines, 'manual');
      message.success(`成功添加 ${successCount}/${cookieLines.length} 个Cookie`);
      setIsAddModalVisible(false);
      setAddCookieText('');
      await loadData();
    } catch (error) {
      message.error('添加Cookie失败');
    } finally {
      setLoading(false);
    }
  };

  // 自动获取Cookie
  const handleAutoFetch = async () => {
    if (!window.electronAPI) {
      message.error('Electron API不可用');
      return;
    }

    setIsFetching(true);
    setFetchProgress({
      current: 0,
      total: autoFetchCount,
      batch: 0,
      totalBatches: Math.ceil(autoFetchCount / 12),
      status: '准备中...',
    });

    // 设置进度监听器
    const electronAPI = window.electronAPI as any;
    if (electronAPI.onCookieFetchProgress) {
      const unsubscribe = electronAPI.onCookieFetchProgress((progress: any) => {
        setFetchProgress(progress);
      });
      progressListenerRef.current = unsubscribe;
    }

    try {
      const result = await electronAPI.fetchEastMoneyCookies(autoFetchCount);

      if (result.success && result.cookies) {
        // 如果有UA信息，则分别保存
        if (result.userAgents && result.userAgents.length > 0) {
          let successCount = 0;
          for (let i = 0; i < result.cookies.length; i++) {
            const cookieValue = result.cookies[i];
            const userAgent = result.userAgents[i];
            const added = await cookiePool.addCookieWithUA(cookieValue, userAgent, 'auto');
            if (added) successCount++;
          }
          message.success(`成功获取并添加 ${successCount} 个Cookie（带UA绑定）`);
        } else {
          // 兼容旧版本，没有UA信息
          const successCount = await cookiePool.addCookiesBatch(result.cookies, 'auto');
          message.success(`成功获取并添加 ${successCount} 个Cookie`);
        }
        setIsAutoFetchModalVisible(false);
        await loadData();
      } else {
        message.error(`获取失败: ${result.error}`);
      }
    } catch (error) {
      message.error('获取Cookie失败');
    } finally {
      setIsFetching(false);
      setFetchProgress(null);
      // 清理监听器
      if (progressListenerRef.current) {
        progressListenerRef.current();
        progressListenerRef.current = null;
      }
    }
  };

  // 取消获取
  const handleCancelFetch = async () => {
    const electronAPI = window.electronAPI as any;
    if (!electronAPI?.cancelFetchEastMoneyCookies) {
      message.error('取消功能不可用');
      return;
    }

    try {
      await electronAPI.cancelFetchEastMoneyCookies();
      message.info('已发送取消请求，正在停止...');
    } catch (error) {
      message.error('取消失败');
    }
  };

  // 导出Cookie
  const handleExportCookies = async () => {
    setExporting(true);
    try {
      const blob = await cookiePool.exportCookies(exportFilter, 'json');

      // 创建下载链接
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;

      // 使用后端生成的文件名
      const filename = (blob as any).name || 'cookies_export.json';
      a.download = filename;

      // 触发下载
      document.body.appendChild(a);
      a.click();

      // 清理
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      message.success(`导出成功: ${filename}`);
      setIsExportModalVisible(false);
    } catch (error) {
      message.error(`导出失败: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setExporting(false);
    }
  };

  // 导入Cookie
  const handleImportCookies = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // 验证文件类型
    if (!file.name.endsWith('.json')) {
      message.error('只支持JSON格式的Cookie文件');
      return;
    }

    try {
      const result = await cookiePool.importCookies(file);

      if (result.error) {
        message.error(result.error);
      } else {
        let msg = `成功导入 ${result.successCount} 个Cookie`;
        if (result.skippedCount > 0) {
          msg += `，跳过 ${result.skippedCount} 个重复`;
        }
        message.success(msg);
        await loadData();
      }
    } catch (error) {
      message.error(`导入失败: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      // 清空文件输入，允许重复选择同一文件
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // 触发文件选择
  const handleTriggerImport = () => {
    fileInputRef.current?.click();
  };

  // 测试单个Cookie
  const handleTestCookie = async (cookieId: string) => {
    try {
      const isValid = await cookiePool.testCookie(cookieId);
      message.success(isValid ? 'Cookie有效' : 'Cookie无效');
      await loadData();
    } catch (error) {
      message.error('测试失败');
    }
  };

  // 删除Cookie
  const handleDeleteCookie = async (cookieId: string) => {
    try {
      await cookiePool.removeCookie(cookieId);
      message.success('删除成功');
      await loadData();
    } catch (error) {
      message.error('删除失败');
    }
  };

  // 清空所有Cookie
  const handleClearAll = async () => {
    try {
      await cookiePool.clearAll();
      message.success('已清空所有Cookie');
      await loadData();
    } catch (error) {
      message.error('清空失败');
    }
  };

  // 删除所有有失败记录的Cookie
  const handleDeleteFailedCookies = async () => {
    try {
      // 统计全局有失败记录的Cookie数量
      const allCookies = cookiePool.getAllCookies();
      const failedCookies = allCookies.filter((c) => c.failureCount > 0);

      if (failedCookies.length === 0) {
        message.info('没有失败记录的Cookie');
        return;
      }

      for (const cookie of failedCookies) {
        await cookiePool.removeCookie(cookie.id);
      }

      message.success(`已删除 ${failedCookies.length} 个有失败记录的Cookie`);
      await loadData();
    } catch (error) {
      message.error('删除失败');
    }
  };

  // 计算当前有失败记录的Cookie数量（用于按钮显示）
  const failedCookiesCount = useMemo(() => {
    return cookies.filter((c) => c.failureCount > 0).length;
  }, [cookies]);

  // 表格列定义
  const columns: ColumnsType<CookieEntry> = [
    {
      title: 'ID',
      dataIndex: 'id',
      key: 'id',
      width: 120,
      render: (id: string) => <span className={styles.idText}>{id.substring(0, 12)}...</span>,
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 160,
      render: (timestamp: number) => new Date(timestamp).toLocaleString('zh-CN'),
    },
    {
      title: '最后使用',
      dataIndex: 'lastUsedAt',
      key: 'lastUsedAt',
      width: 160,
      render: (timestamp: number) =>
        timestamp > 0 ? new Date(timestamp).toLocaleString('zh-CN') : '-',
    },
    {
      title: '成功/失败',
      key: 'counts',
      width: 120,
      render: (_, record) => (
        <span>
          <span style={{ color: '#52c41a' }}>{record.successCount}</span>
          {' / '}
          <span style={{ color: '#ff4d4f' }}>{record.failureCount}</span>
        </span>
      ),
    },
    {
      title: '健康评分',
      dataIndex: 'healthScore',
      key: 'healthScore',
      width: 150,
      render: (score: number) => (
        <Progress
          percent={Math.round(score)}
          size="small"
          status={score >= 80 ? 'success' : score >= 50 ? 'normal' : 'exception'}
          format={(percent) => `${percent}%`}
        />
      ),
    },
    {
      title: '状态',
      dataIndex: 'isActive',
      key: 'isActive',
      width: 80,
      render: (isActive: boolean) => (
        <Tag color={isActive ? 'green' : 'red'}>{isActive ? '活跃' : '失效'}</Tag>
      ),
    },
    {
      title: '操作',
      key: 'action',
      width: 150,
      fixed: 'right',
      render: (_, record) => (
        <Space size="small">
          <Button
            type="link"
            size="small"
            icon={<ReloadOutlined />}
            onClick={() => handleTestCookie(record.id)}
          >
            测试
          </Button>
          <Popconfirm
            title="确定删除此Cookie？"
            onConfirm={() => handleDeleteCookie(record.id)}
            okText="确定"
            cancelText="取消"
          >
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div className={styles.container}>
      <Card className={styles.cardBox} title="Cookie池管理" extra={<Button icon={<ReloadOutlined />} onClick={loadData}>刷新</Button>}>
        {/* 统计信息 */}
        <Row gutter={16} className={styles.statsRow}>
          <Col span={6}>
            <Card size="small">
              <Statistic
                title="总数量"
                value={stats.totalCount}
                suffix={`/ 200`}
                valueStyle={{ color: '#1890ff' }}
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card size="small">
              <Statistic
                title="活跃数量"
                value={stats.activeCount}
                valueStyle={{ color: '#52c41a' }}
                prefix={<CheckCircleOutlined />}
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card size="small">
              <Statistic
                title="平均健康评分"
                value={stats.avgHealthScore.toFixed(1)}
                suffix="/ 100"
                valueStyle={{ color: stats.avgHealthScore >= 80 ? '#52c41a' : '#faad14' }}
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card size="small">
              <Statistic
                title="成功率"
                value={(stats.successRate * 100).toFixed(1)}
                suffix="%"
                valueStyle={{ color: stats.successRate >= 0.8 ? '#52c41a' : '#ff4d4f' }}
              />
            </Card>
          </Col>
        </Row>

        {/* 操作按钮 */}
        <div className={styles.actionButtons}>
          <Space>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => setIsAddModalVisible(true)}
            >
              手动添加
            </Button>
            <Button
              icon={<KeyOutlined />}
              onClick={() => setIsAutoFetchModalVisible(true)}
              loading={isFetching}
            >
              自动获取
            </Button>
            <Button icon={<ReloadOutlined />} onClick={() => cookiePool.testAllCookies()}>
              测试全部
            </Button>
            <Popconfirm
              title="确定清空所有Cookie？此操作不可恢复！"
              onConfirm={handleClearAll}
              okText="确定"
              cancelText="取消"
              okButtonProps={{ danger: true }}
            >
              <Button danger icon={<ClearOutlined />}>
                清空全部
              </Button>
            </Popconfirm>
            <Popconfirm
              title={`确定删除所有有失败记录的Cookie？共 ${failedCookiesCount} 个`}
              onConfirm={handleDeleteFailedCookies}
              okText="确定"
              cancelText="取消"
              okButtonProps={{ danger: true }}
            >
              <Button
                danger
                icon={<DeleteOutlined />}
                disabled={failedCookiesCount === 0}
              >
                删除失败 ({failedCookiesCount})
              </Button>
            </Popconfirm>
            <Button icon={<UploadOutlined />} onClick={handleTriggerImport}>
              导入Cookie
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              style={{ display: 'none' }}
              onChange={handleImportCookies}
            />
            <Button icon={<DownloadOutlined />} onClick={() => setIsExportModalVisible(true)}>
              导出Cookie
            </Button>
          </Space>
        </div>

        {/* Cookie列表 */}
        <Table
          columns={columns}
          dataSource={cookies}
          rowKey="id"
          loading={loading}
          pagination={{
            current: pagination.current,
            pageSize: pagination.pageSize,
            total: cookies.length,
            showSizeChanger: true,
            showTotal: (total) => `共 ${total} 条`,
            position: ['bottomCenter'],
            onChange: (page, pageSize) => {
              setPagination({ current: page, pageSize });
            },
            onShowSizeChange: (current, pageSize) => {
              setPagination({ current, pageSize });
            },
          }}
          scroll={{ x: 1000, y: 400 }}
          size="small"
        />

        {/* 操作日志 */}
        <Card title="最近操作日志" size="small" className={styles.logCard}>
          <div className={styles.logList}>
            {logs.length === 0 ? (
              <div className={styles.emptyLog}>暂无操作记录</div>
            ) : (
              logs.map((log, index) => (
                <div key={index} className={styles.logItem}>
                  <span className={styles.logTime}>
                    {new Date(log.timestamp).toLocaleTimeString('zh-CN')}
                  </span>
                  <Tag color={log.success ? 'green' : 'red'} className={styles.logAction}>
                    {log.action}
                  </Tag>
                  <span className={styles.logMessage}>{log.message}</span>
                </div>
              ))
            )}
          </div>
        </Card>
      </Card>

      {/* 手动添加对话框 */}
      <Modal
        title="手动添加Cookie"
        open={isAddModalVisible}
        onOk={handleAddCookie}
        onCancel={() => {
          setIsAddModalVisible(false);
          setAddCookieText('');
        }}
        confirmLoading={loading}
        width={600}
      >
        <p>每行一个Cookie字符串：</p>
        <TextArea
          rows={8}
          value={addCookieText}
          onChange={(e) => setAddCookieText(e.target.value)}
          placeholder="qgqp_b_id=xxx; st_nvi=xxx; ..."
        />
        <div className={styles.hint}>
          提示：可以从浏览器开发者工具中复制Cookie，每行粘贴一个
        </div>
      </Modal>

      {/* 自动获取对话框 */}
      <Modal
        title="自动获取Cookie"
        open={isAutoFetchModalVisible}
        styles={{ body: { height: 400, overflowY: 'auto' } }}
        onCancel={() => {
          if (isFetching) {
            Modal.confirm({
              title: '确认取消',
              content: '正在获取Cookie，确定要取消吗？',
              onOk: () => {
                handleCancelFetch();
                setIsAutoFetchModalVisible(false);
              },
            });
          } else {
            setIsAutoFetchModalVisible(false);
          }
        }}
        footer={[
          <Button key="cancel" onClick={() => {
            if (isFetching) {
              handleCancelFetch();
            }
            setIsAutoFetchModalVisible(false);
          }}>
            {isFetching ? '取消' : '关闭'}
          </Button>,
          isFetching ? (
            <Button key="stop" danger icon={<StopOutlined />} onClick={handleCancelFetch}>
              停止获取
            </Button>
          ) : (
            <Button key="submit" type="primary" onClick={handleAutoFetch} loading={isFetching}>
              开始获取
            </Button>
          ),
        ]}
      >
        <div className={styles.autoFetchContent}>
          {!isFetching ? (
            <>
              <p>获取数量：</p>
              <Input
                type="number"
                min={1}
                max={200}
                value={autoFetchCount}
                onChange={(e) => {
                  const value = e.target.value;
                  if (value === '') {
                    setAutoFetchCount(1); // 空值时设置为最小值1
                  } else {
                    const num = parseInt(value);
                    if (!isNaN(num)) {
                      setAutoFetchCount(Math.min(Math.max(num, 1), 200)); // 限制在1-200范围内
                    }
                  }
                }}
                style={{ width: 120 }}
              />
              <div className={styles.warning}>
                <p>⚠️ 注意事项：</p>
                <ul>
                  <li>需要安装 Google Chrome 或 Microsoft Edge 浏览器</li>
                  <li>采用分批获取策略，每批12个，批次间暂停30-60秒</li>
                  <li>获取过程可能需要较长时间，请耐心等待</li>
                  <li>建议每次获取不超过200个Cookie</li>
                  <li>使用无痕模式，自动清除缓存，提高Cookie多样性</li>
                </ul>
              </div>
            </>
          ) : (
            <div className={styles.progressContainer}>
              <div className={styles.progressInfo}>
                <p><strong>状态：</strong>{fetchProgress?.status || '准备中...'}</p>
                <p><strong>进度：</strong>{fetchProgress?.current || 0} / {fetchProgress?.total || 0}</p>
                <p><strong>批次：</strong>{fetchProgress?.batch || 0} / {fetchProgress?.totalBatches || 0}</p>
                {fetchProgress?.cookie && (
                  <p><strong>当前：</strong>{fetchProgress.cookie}</p>
                )}
              </div>
              <Progress
                percent={Math.round(((fetchProgress?.current || 0) / (fetchProgress?.total || 1)) * 100)}
                status="active"
                strokeColor={{
                  '0%': '#108ee9',
                  '100%': '#87d068',
                }}
              />
              <div className={styles.progressTip}>
                提示：可以点击“停止获取”按钮随时中断
              </div>
            </div>
          )}
        </div>
      </Modal>

      {/* 导出Cookie对话框 */}
      <Modal
        title="导出Cookie"
        open={isExportModalVisible}
        onOk={handleExportCookies}
        onCancel={() => setIsExportModalVisible(false)}
        confirmLoading={exporting}
        okText="导出"
      >
        <div style={{ padding: '16px 0' }}>
          <div style={{ marginBottom: 24, padding: '12px', background: '#f5f5f5', borderRadius: '4px' }}>
            <p style={{ margin: 0, fontSize: 13, color: '#595959' }}>
              <strong>说明：</strong>仅支持JSON格式导出，包含完整元数据，可用于备份和恢复
            </p>
          </div>

          <div>
            <p style={{ fontWeight: 500, marginBottom: 12 }}>导出范围：</p>
            <Radio.Group
              value={exportFilter}
              onChange={(e) => setExportFilter(e.target.value)}
              style={{ width: '100%' }}
            >
              <Radio value="all" style={{ display: 'block', marginBottom: 8 }}>
                全部Cookie ({stats.totalCount}个)
              </Radio>
              <Radio value="active" style={{ display: 'block', marginBottom: 8 }}>
                仅活跃Cookie ({stats.activeCount}个)
              </Radio>
              <Radio value="inactive" style={{ display: 'block' }}>
                仅失效Cookie ({stats.totalCount - stats.activeCount}个)
              </Radio>
            </Radio.Group>
          </div>
        </div>
      </Modal>
    </div>
  );
};


