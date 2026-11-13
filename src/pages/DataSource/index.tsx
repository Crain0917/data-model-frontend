import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  App,
  Button,
  Input,
  Pagination,
  Select,
  Table,
  Tooltip,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  CloudServerOutlined,
  DatabaseOutlined,
  DeleteOutlined,
  EditOutlined,
  ExclamationCircleOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
  ThunderboltOutlined,
  WarningOutlined,
  CheckCircleOutlined,
} from '@ant-design/icons';
import { deleteDataSource, listDataSources, testDataSource, USE_MOCK } from '../../api/datasource';
import type { DataSource } from '../../types';
import { DataSourceStatus as DsStatus } from '../../components/StatusTag';
import EmptyState from '../../components/EmptyState';
import DataSourceDrawer from './DataSourceDrawer';
import { testFailureText } from '../../utils/connectionError';

const TYPE_LABEL: Record<string, string> = {
  MYSQL: 'MySQL',
  DORIS: 'Doris',
  DM8: '达梦 DM8',
};

export default function DataSourcePage() {
  const { message, modal } = App.useApp();
  const [all, setAll] = useState<DataSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [keyword, setKeyword] = useState('');
  const [debounced, setDebounced] = useState('');
  const [type, setType] = useState<string>('');
  const [page, setPage] = useState(1);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<DataSource | null>(null);
  const [testingId, setTestingId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listDataSources({ page: 1, size: 200, keyword: debounced || undefined, type: type || undefined });
      setAll(res.list);
    } catch (e) {
      setError((e as Error).message || '加载失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  }, [debounced, type]);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(keyword.trim()), 300);
    return () => clearTimeout(timer);
  }, [keyword]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [debounced, type]);

  const stats = useMemo(() => {
    const success = all.filter((d) => d.lastTestStatus === 'SUCCESS').length;
    const failed = all.filter((d) => d.lastTestStatus === 'FAILED').length;
    return { total: all.length, success, failed, unknown: all.length - success - failed };
  }, [all]);

  const paged = useMemo(() => all.slice((page - 1) * 20, page * 20), [all, page]);

  const runTest = async (record: DataSource) => {
    setTestingId(record.id);
    try {
      const result = await testDataSource(record.id);
      if (result.success) {
        message.success(`连接成功（耗时 ${result.latencyMs}ms）`);
      } else {
        message.error(testFailureText(result, record));
      }
      await load();
    } catch (e) {
      const err = e as Error & { data?: { message?: string } };
      message.error(err.data?.message || err.message || '连接测试失败');
      await load();
    } finally {
      setTestingId(null);
    }
  };

  const remove = (record: DataSource) => {
    modal.confirm({
      title: `删除数据源「${record.name}」？`,
      icon: <ExclamationCircleOutlined style={{ color: 'var(--danger)' }} />,
      content: (
        <div style={{ fontSize: 13, lineHeight: 1.7, color: 'var(--text-secondary)' }}>
          删除后，引用该数据源的任务节点将无法执行。该操作不可撤销。
        </div>
      ),
      okText: '删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        try {
          await deleteDataSource(record.id);
          message.success('数据源已删除');
          await load();
        } catch (e) {
          message.error((e as Error).message || '删除失败');
        }
      },
    });
  };

  const columns: ColumnsType<DataSource> = [
    {
      title: '名称',
      dataIndex: 'name',
      width: 160,
      render: (value: string, record) => (
        <div>
          <div className="ds-table-name">{value}</div>
          {record.remark ? <div className="ds-table-sub">{record.remark}</div> : null}
        </div>
      ),
    },
    {
      title: '类型',
      dataIndex: 'type',
      width: 100,
      render: (value: string) => <span className={`type-tag type-tag--${value}`}>{TYPE_LABEL[value] || value}</span>,
    },
    {
      title: '地址:端口',
      dataIndex: 'host',
      width: 150,
      render: (_: string, record) => (
        <span className="host-cell">
          {record.host}:{record.port}
        </span>
      ),
    },
    {
      title: '默认库',
      dataIndex: 'dbName',
      width: 108,
      render: (value: string) => <span className="mono" style={{ fontSize: 12.5 }}>{value}</span>,
    },
    {
      title: '状态',
      dataIndex: 'lastTestStatus',
      width: 90,
      render: (value: string) => <DsStatus status={value} />,
    },
    {
      title: '最后连通性检测时间',
      dataIndex: 'lastTestTime',
      width: 143,
      render: (value: string | null) => (
        <span className="tabular" style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>
          {value || '—'}
        </span>
      ),
    },
    {
      title: '操作',
      key: 'action',
      width: 210,
      render: (_, record) => (
        <div className="row-actions">
          <Button
            type="link"
            size="small"
            icon={<ThunderboltOutlined />}
            loading={testingId === record.id}
            onClick={() => runTest(record)}
          >
            测试连接
          </Button>
          <Button
            type="link"
            size="small"
            icon={<EditOutlined />}
            onClick={() => {
              setEditing(record);
              setDrawerOpen(true);
            }}
          >
            编辑
          </Button>
          <Button type="link" size="small" danger icon={<DeleteOutlined />} onClick={() => remove(record)}>
            删除
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="page-title">
            数据源管理
            {USE_MOCK ? <span className="chip chip--warning">演示数据</span> : null}
          </h1>
          <p className="page-desc">
            数据源只用于拉取表结构与执行 Doris SQL，业务数据流不经过平台服务。
          </p>
        </div>
        <Button
          type="primary"
          size="large"
          icon={<PlusOutlined />}
          onClick={() => {
            setEditing(null);
            setDrawerOpen(true);
          }}
        >
          新建数据源
        </Button>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, minmax(0,1fr))',
          gap: 14,
          marginBottom: 18,
        }}
      >
        {[
          { label: '数据源总数', value: stats.total, icon: <DatabaseOutlined />, tint: 'var(--color-primary)', soft: 'var(--color-primary-soft)' },
          { label: '连接正常', value: stats.success, icon: <CheckCircleOutlined />, tint: 'var(--success)', soft: 'var(--success-soft)' },
          { label: '连接异常', value: stats.failed, icon: <WarningOutlined />, tint: 'var(--danger)', soft: 'var(--danger-soft)' },
          { label: '未测试', value: stats.unknown, icon: <CloudServerOutlined />, tint: 'var(--text-secondary)', soft: 'var(--bg-subtle)' },
        ].map((item) => (
          <div
            key={item.label}
            className="card"
            style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}
          >
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: 11,
                display: 'grid',
                placeItems: 'center',
                background: item.soft,
                color: item.tint,
                fontSize: 17,
              }}
            >
              {item.icon}
            </div>
            <div>
              <div style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.1 }} className="tabular">
                {item.value}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 2 }}>{item.label}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="card" style={{ padding: '14px 16px 18px' }}>
        <div className="toolbar" style={{ marginBottom: 14 }}>
          <Input
            allowClear
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            prefix={<SearchOutlined style={{ color: 'var(--text-tertiary)' }} />}
            placeholder="搜索数据源名称"
            style={{ width: 260 }}
          />
          <Select
            value={type}
            onChange={setType}
            style={{ width: 150 }}
            options={[
              { value: '', label: '全部类型' },
              { value: 'MYSQL', label: 'MySQL' },
              { value: 'DORIS', label: 'Doris' },
              { value: 'DM8', label: '达梦 DM8' },
            ]}
          />
          <div className="toolbar-spacer" />
          <Tooltip title="刷新列表">
            <Button icon={<ReloadOutlined />} onClick={load} loading={loading}>
              刷新
            </Button>
          </Tooltip>
        </div>

        {error ? (
          <EmptyState
            icon={<ExclamationCircleOutlined />}
            title="加载失败，请稍后重试"
            text={error}
            action={<Button type="primary" onClick={load}>重试</Button>}
          />
        ) : loading ? (
          <div style={{ padding: '8px 0' }}>
            {[0, 1, 2].map((i) => (
              <div key={i} className="skeleton-row" />
            ))}
          </div>
        ) : all.length === 0 ? (
          keyword || type ? (
            <EmptyState
              icon={<SearchOutlined />}
              title="没有匹配的数据源"
              action={
                <Button
                  onClick={() => {
                    setKeyword('');
                    setType('');
                  }}
                >
                  清空筛选
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={<DatabaseOutlined />}
              title="还没有数据源"
              text="数据源用于拉取表结构与执行 Doris SQL，业务数据不会经过本平台。"
              action={
                <Button
                  type="primary"
                  icon={<PlusOutlined />}
                  onClick={() => {
                    setEditing(null);
                    setDrawerOpen(true);
                  }}
                >
                  新建数据源
                </Button>
              }
            />
          )
        ) : (
          <>
            <Table
              rowKey="id"
              size="middle"
              columns={columns}
              dataSource={paged}
              pagination={false}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
              <Pagination
                current={page}
                pageSize={20}
                total={all.length}
                showSizeChanger={false}
                showTotal={(t) => `共 ${t} 个数据源`}
                onChange={setPage}
              />
            </div>
          </>
        )}
      </div>

      <DataSourceDrawer
        open={drawerOpen}
        record={editing}
        onClose={() => setDrawerOpen(false)}
        onSaved={load}
      />
    </div>
  );
}
