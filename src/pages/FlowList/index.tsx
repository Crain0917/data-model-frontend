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
  ExclamationCircleOutlined,
  PartitionOutlined,
  PlusOutlined,
  SearchOutlined,
  ThunderboltFilled,
} from '@ant-design/icons';
import { createFlow, deleteFlow, duplicateFlow, listFlows, updateFlowMeta } from '../../api/flow';
import type { FlowSummary } from '../../types';
import { StatusTag } from '../../components/StatusTag';
import EmptyState from '../../components/EmptyState';

export default function FlowListPage() {
  const navigate = useNavigate();
  const { message, modal } = App.useApp();
  const [flows, setFlows] = useState<FlowSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [renaming, setRenaming] = useState<FlowSummary | null>(null);
  const [createForm] = Form.useForm<{ name: string; description: string }>();
  const [renameForm] = Form.useForm<{ name: string; description: string }>();

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

  const submitRename = async () => {
    if (!renaming) return;
    const values = await renameForm.validateFields();
    await updateFlowMeta(renaming.id, { name: values.name.trim(), description: values.description?.trim() || '' });
    message.success('任务信息已更新');
    setRenaming(null);
    load();
  };

  const remove = (flow: FlowSummary) => {
    modal.confirm({
      title: `删除任务「${flow.name}」？`,
      icon: <ExclamationCircleOutlined style={{ color: 'var(--danger)' }} />,
      content: '任务的画布、配置与执行记录将一并删除。该操作不可撤销。',
      okText: '删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        await deleteFlow(flow.id);
        message.success('任务已删除');
        load();
      },
    });
  };

  const copy = async (flow: FlowSummary) => {
    const item = await duplicateFlow(flow.id);
    message.success('任务已复制');
    load();
    void item;
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
                        onClick: () => {
                          renameForm.setFieldsValue({ name: flow.name, description: flow.description });
                          setRenaming(flow);
                        },
                      },
                      { key: 'copy', icon: <CopyOutlined />, label: '复制任务', onClick: () => copy(flow) },
                      { type: 'divider' },
                      {
                        key: 'delete',
                        icon: <DeleteOutlined />,
                        label: '删除任务',
                        danger: true,
                        onClick: () => remove(flow),
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
        destroyOnHidden
      >
        <Form form={createForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            name="name"
            label="任务名称"
            rules={[
              { required: true, message: '请输入任务名称' },
              { max: 50, message: '任务名称不能超过 50 个字符' },
            ]}
          >
            <Input placeholder="如 订单清洗与城市汇总" autoFocus />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input.TextArea rows={3} maxLength={200} showCount placeholder="一句话说明这个任务做什么" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        open={Boolean(renaming)}
        title="编辑任务信息"
        okText="保存"
        cancelText="取消"
        onCancel={() => setRenaming(null)}
        onOk={submitRename}
        destroyOnHidden
      >
        <Form form={renameForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            name="name"
            label="任务名称"
            rules={[
              { required: true, message: '请输入任务名称' },
              { max: 50, message: '任务名称不能超过 50 个字符' },
            ]}
          >
            <Input />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input.TextArea rows={3} maxLength={200} showCount />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
