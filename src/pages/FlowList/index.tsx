import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  App,
  Button,
  Dropdown,
  Form,
  Input,
  Modal,
  Tag,
} from 'antd';
import {
  CopyOutlined,
  DeleteOutlined,
  EditOutlined,
  EllipsisOutlined,
  PartitionOutlined,
  PlusOutlined,
  SearchOutlined,
  ThunderboltFilled,
} from '@ant-design/icons';
import { createFlow, duplicateFlow, listFlows } from '../../api/flow';
import type { FlowDeleteResult, FlowSummary } from '../../types';
import { StatusTag } from '../../components/StatusTag';
import EmptyState from '../../components/EmptyState';
import EditFlowModal from '../../components/EditFlowModal';
import DeleteFlowModal from '../../components/DeleteFlowModal';

export default function FlowListPage() {
  const navigate = useNavigate();
  const { message } = App.useApp();
  const [flows, setFlows] = useState<FlowSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<FlowSummary | null>(null);
  const [deleting, setDeleting] = useState<FlowSummary | null>(null);
  const [createForm] = Form.useForm<{ name: string; description: string }>();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setFlows(await listFlows());
    } catch (e) {
      message.error((e as Error).message || '任务列表加载失败');
    } finally {
      setLoading(false);
    }
  }, [message]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = flows.filter((f) =>
    keyword.trim() ? f.name.toLowerCase().includes(keyword.trim().toLowerCase()) : true,
  );

  const openCreate = () => {
    createForm.resetFields();
    setCreateOpen(true);
  };

  const submitCreate = async () => {
    const values = await createForm.validateFields();
    const flow = await createFlow(values.name.trim(), values.description?.trim() || '');
    message.success('任务已创建');
    setCreateOpen(false);
    navigate(`/flow/${flow.id}/editor`);
  };

  const onDeleted = (result: FlowDeleteResult) => {
    if (result.failedTables?.length) {
      message.warning(
        `任务已删除，但 ${result.failedTables.length} 张节点表删除失败：${result.failedTables
          .map((t) => t.dorisTable)
          .join('、')}`,
        6,
      );
    } else {
      message.success(
        result.deletedTables?.length
          ? `任务已删除，Doris 表清理 ${result.deletedTables.length} 张`
          : '任务已删除',
      );
    }
    setFlows((prev) => prev.filter((f) => f.id !== deleting?.id));
    void load();
  };

  const copy = async (flow: FlowSummary) => {
    try {
      await duplicateFlow(flow.id);
      message.success('任务已复制');
      load();
    } catch (e) {
      message.error((e as Error).message || '复制失败');
    }
  };

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="page-title">任务管理</h1>
          <p className="page-desc">创建数据编排任务，进入画布拖拽节点、连线并自动保存 DAG。</p>
        </div>
        <Button type="primary" size="large" icon={<PlusOutlined />} onClick={openCreate}>
          新建任务
        </Button>
      </div>

      <div className="toolbar" style={{ marginBottom: 16 }}>
        <Input
          allowClear
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          prefix={<SearchOutlined style={{ color: 'var(--text-tertiary)' }} />}
          placeholder="搜索任务名称"
          style={{ width: 280 }}
        />
        <div className="toolbar-spacer" />
        <span className="soft-label">共 {filtered.length} 个任务</span>
      </div>

      {loading ? (
        <div className="flow-grid">
          {[0, 1, 2].map((i) => (
            <div key={i} className="card" style={{ padding: 18 }}>
              <div className="skeleton-row" style={{ width: '60%' }} />
              <div className="skeleton-row" />
              <div className="skeleton-row" style={{ width: '40%' }} />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<PartitionOutlined />}
            title={keyword ? '没有匹配的任务' : '还没有任务'}
            text={keyword ? undefined : '新建一个任务，从左侧拖入数据表开始编排数据流。'}
            action={
              keyword ? (
                <Button onClick={() => setKeyword('')}>清空搜索</Button>
              ) : (
                <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
                  新建任务
                </Button>
              )
            }
          />
        </div>
      ) : (
        <div className="flow-grid">
          {filtered.map((flow) => (
            <div
              key={flow.id}
              className="card flow-card"
              onClick={() => navigate(`/flow/${flow.id}/editor`)}
            >
              <div className="flow-card-head">
                <div style={{ display: 'flex', gap: 12, minWidth: 0 }}>
                  <div className="flow-card-icon">
                    <PartitionOutlined />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <h3 className="flow-card-title">{flow.name}</h3>
                    <span className="run-id">ID {flow.id}</span>
                  </div>
                </div>
                <Dropdown
                  trigger={['click']}
                  menu={{
                    items: [
                      {
                        key: 'rename',
                        icon: <EditOutlined />,
                        label: '编辑信息',
                        onClick: (info) => {
                          info.domEvent.stopPropagation();
                          setEditing(flow);
                        },
                      },
                      {
                        key: 'copy',
                        icon: <CopyOutlined />,
                        label: '复制任务',
                        onClick: (info) => {
                          info.domEvent.stopPropagation();
                          copy(flow);
                        },
                      },
                      { type: 'divider' },
                      {
                        key: 'delete',
                        icon: <DeleteOutlined />,
                        label: '删除任务',
                        danger: true,
                        onClick: (info) => {
                          info.domEvent.stopPropagation();
                          setDeleting(flow);
                        },
                      },
                    ],
                  }}
                >
                  <Button
                    type="text"
                    size="small"
                    icon={<EllipsisOutlined />}
                    onClick={(e) => e.stopPropagation()}
                  />
                </Dropdown>
              </div>
              <p className="flow-card-desc" style={{ marginTop: 12 }}>
                {flow.description || '暂无描述'}
              </p>
              <div style={{ marginTop: 12, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <StatusTag status={flow.lastRunStatus} />
                {flow.lastRunTime ? (
                  <span className="chip">最后执行 {flow.lastRunTime.slice(5, 16)}</span>
                ) : (
                  <span className="chip">从未执行</span>
                )}
              </div>
              <div className="flow-card-meta">
                <span>
                  <b>{flow.nodeCount}</b> 个节点
                </span>
                <span>更新于 {flow.updateTime.slice(5, 16)}</span>
                <div className="toolbar-spacer" />
                {flow.nodeCount > 0 ? (
                  <Tag color="processing" icon={<ThunderboltFilled />} style={{ margin: 0, borderRadius: 999 }}>
                    DAG
                  </Tag>
                ) : (
                  <Tag style={{ margin: 0, borderRadius: 999 }}>空白画布</Tag>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={createOpen}
        title="新建任务"
        okText="创建并进入画布"
        cancelText="取消"
        onCancel={() => setCreateOpen(false)}
        onOk={submitCreate}
        forceRender
      >
        <Form form={createForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            name="name"
            label="任务名称"
            rules={[
              { required: true, whitespace: true, message: '请输入任务名称' },
              { min: 2, max: 100, message: '任务名称需为 2–100 个字符' },
            ]}
          >
            <Input placeholder="如 订单清洗与城市汇总" maxLength={100} autoFocus />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input.TextArea rows={3} maxLength={200} showCount placeholder="一句话说明这个任务做什么" />
          </Form.Item>
        </Form>
      </Modal>

      <EditFlowModal
        open={Boolean(editing)}
        flow={editing}
        onClose={() => setEditing(null)}
        onSaved={(result) => {
          setFlows((prev) =>
            prev.map((f) =>
              f.id === result.id
                ? {
                    ...f,
                    name: result.name,
                    description: result.description,
                    updateTime: result.updateTime || f.updateTime,
                  }
                : f,
            ),
          );
        }}
      />

      <DeleteFlowModal
        open={Boolean(deleting)}
        flow={deleting}
        onClose={() => setDeleting(null)}
        onDeleted={onDeleted}
      />

    </div>
  );
}
