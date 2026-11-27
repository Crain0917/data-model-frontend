import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Alert, Button, Collapse, Modal, Space, Spin, Table, Tag } from 'antd';
import { CloudServerOutlined, DatabaseOutlined, ReloadOutlined } from '@ant-design/icons';
import type { ColumnInfo, FlowNode, NodeDataPreview } from '../types';
import { previewNodeData } from '../api/flow';
import { ApiError } from '../api/http';

interface PreviewModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  flowId: string;
  nodeId?: string;
  dagJson?: unknown;
  fallbackColumns?: ColumnInfo[];
  /** 单次预览最多读取的行数，默认 100；大模型节点为 20。 */
  limit?: number;
  /** 附加说明，例如大模型预览会真实调用模型。 */
  notice?: string;
  /** 用于把 4091 返回的 nodeId 显示成节点名称。 */
  nodes?: FlowNode[];
  /** 4091 时一键选中出问题的上游节点。 */
  onLocateNode?: (nodeId: string) => void;
}

interface PreviewError {
  code: number;
  message: string;
  nodeId?: string | null;
  reason?: string | null;
}

const SOURCE_LABEL: Record<string, { text: string; color: string; icon: ReactNode }> = {
  SOURCE_DB: { text: '源库（过滤条件下推）', color: 'blue', icon: <DatabaseOutlined /> },
  DORIS: { text: 'Doris 物化表', color: 'green', icon: <CloudServerOutlined /> },
  MOCK: { text: 'Mock 演示数据', color: 'orange', icon: <CloudServerOutlined /> },
  LLM: { text: '大模型调用结果', color: 'purple', icon: <CloudServerOutlined /> },
};

function cellText(value: unknown) {
  if (value === null || value === undefined) return <span style={{ color: 'var(--text-tertiary)' }}>NULL</span>;
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export default function PreviewModal({
  open,
  onClose,
  title,
  flowId,
  nodeId,
  dagJson,
  fallbackColumns = [],
  limit = 100,
  notice,
  nodes = [],
  onLocateNode,
}: PreviewModalProps) {
  const [data, setData] = useState<NodeDataPreview | null>(null);
  const [error, setError] = useState<PreviewError | null>(null);
  const [loading, setLoading] = useState(false);
  const [token, setToken] = useState(0);

  const load = useCallback(() => setToken((v) => v + 1), []);

  useEffect(() => {
    if (!open || !nodeId) return;
    let alive = true;
    setLoading(true);
    setError(null);
    setData(null);
    previewNodeData(flowId, nodeId, dagJson, limit)
      .then((res) => {
        if (alive) setData(res);
      })
      .catch((e) => {
        if (!alive) return;
        const apiError = e as ApiError;
        const detail = (apiError.data || null) as Record<string, unknown> | null;
        setError({
          code: typeof apiError.code === 'number' ? apiError.code : -1,
          message: apiError.message || '数据预览失败',
          nodeId: detail && detail.nodeId != null ? String(detail.nodeId) : null,
          reason: detail && detail.reason != null ? String(detail.reason) : null,
        });
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [open, nodeId, flowId, dagJson, token, limit]);

  const columns = data?.columns?.length ? data.columns : fallbackColumns;
  const records = (data?.rows || []).map((row, index) => {
    const record: Record<string, unknown> = { __key: String(index) };
    columns.forEach((c, i) => {
      record[c.name] = row[i];
    });
    return record;
  });

  const tableColumns = columns.map((c) => ({
    title: (
      <span>
        {c.name}
        {c.type ? <Tag style={{ marginLeft: 4, fontSize: 9 }}>{c.type}</Tag> : null}
      </span>
    ),
    dataIndex: c.name,
    key: c.name,
    ellipsis: true,
    render: cellText,
  }));

  const sourceMeta = SOURCE_LABEL[data?.source || ''] || null;

  return (
    <Modal
      open={open}
      onCancel={onClose}
      width={920}
      title={title}
      footer={
        <Space>
          <Button icon={<ReloadOutlined />} onClick={load} loading={loading}>
            重新加载
          </Button>
          <Button type="primary" onClick={onClose}>
            关闭
          </Button>
        </Space>
      }
      destroyOnHidden
    >
      {loading ? (
        <div style={{ padding: '34px 0', textAlign: 'center' }}>
          <Spin />
          <div style={{ marginTop: 10, fontSize: 12.5, color: 'var(--text-secondary)' }}>
            正在读取预览数据…
          </div>
        </div>
      ) : error ? (
        error.code === 4091 ? (
          (() => {
            const targetNode = error.nodeId ? nodes.find((n) => n.id === error.nodeId) : undefined;
            const targetLabel = targetNode?.data.label || error.nodeId || '';
            const upstream = error.reason === 'UPSTREAM_NOT_MATERIALIZED';
            return (
              <Alert
                type="warning"
                showIcon
                message={
                  targetLabel
                    ? upstream
                      ? `上游节点「${targetLabel}」尚未执行，请先执行该节点`
                      : `节点「${targetLabel}」尚未执行，请先执行该节点`
                    : '节点尚未物化，请先执行任务'
                }
                description={
                  targetLabel
                    ? `该节点还没有 Doris 物化表（节点 ID：${error.nodeId}）；执行一次任务（或先跑该节点）后再预览。`
                    : '该节点还没有 Doris 物化表；执行一次任务（或先跑该节点）后再预览。'
                }
                action={
                  <Space direction="vertical" size={6}>
                    {error.nodeId && onLocateNode ? (
                      <Button size="small" type="primary" onClick={() => onLocateNode(error.nodeId!)}>
                        定位节点
                      </Button>
                    ) : null}
                    <Button size="small" onClick={load}>
                      重试
                    </Button>
                  </Space>
                }
              />
            );
          })()
        ) : (
          <Alert
            type="error"
            showIcon
            message="预览失败"
            description={error.message}
            action={
              <Button size="small" onClick={load}>
                重试
              </Button>
            }
          />
        )
      ) : (
        <>
          {notice ? (
            <Alert
              type="info"
              showIcon
              banner
              style={{ marginBottom: 10, fontSize: 12 }}
              message={notice}
            />
          ) : null}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              flexWrap: 'wrap',
              marginBottom: 10,
              fontSize: 12,
              color: 'var(--text-secondary)',
            }}
          >
            {sourceMeta ? (
              <Tag color={sourceMeta.color} icon={sourceMeta.icon} style={{ margin: 0 }}>
                {sourceMeta.text}
              </Tag>
            ) : null}
            {data?.sink ? (
              <Tag color="green" style={{ margin: 0 }} icon={<CloudServerOutlined />}>
                目标 {data.sink.targetType}:{data.sink.targetTable || '—'}
                {data.sink.writeMode === 'OVERWRITE' ? ' · 覆盖' : ' · 追加'}
              </Tag>
            ) : null}
            {data?.source === 'LLM' &&
            data.llm &&
            (typeof data.llm.calls === 'number' || typeof data.llm.batches === 'number') ? (
              <Tag color="purple" style={{ margin: 0 }}>
                模型调用 {data.llm.calls ?? '—'} 次 · {data.llm.batches ?? '—'} 批
              </Tag>
            ) : null}
            <span>
              返回 {data?.rows?.length || 0} 行 · 最多 {limit} 行
              {data?.truncated ? '（结果已截断）' : ''}
            </span>
            {data?.params?.length ? <span>参数 {data.params.length} 个</span> : null}
            {data?.sink ? (
              <span>映射 {data.sink.fieldMapping.length} 个字段 · 预览不写入目标表</span>
            ) : null}
            <span style={{ marginLeft: 'auto' }}>SQL 由后端生成</span>
          </div>

          <Table
            size="small"
            columns={tableColumns}
            dataSource={records}
            rowKey="__key"
            pagination={false}
            scroll={{ x: 'max-content', y: 420 }}
            locale={{ emptyText: '没有满足条件的数据（0 行）' }}
          />

          {data?.displaySql ? (
            <Collapse
              ghost
              size="small"
              style={{ marginTop: 8 }}
              items={[
                {
                  key: 'sql',
                  label: <span style={{ fontSize: 12 }}>查看后端预览 SQL</span>,
                  children: <pre className="sql-preview" style={{ maxHeight: 200 }}>{data.displaySql}</pre>,
                },
              ]}
            />
          ) : null}
        </>
      )}
    </Modal>
  );
}
