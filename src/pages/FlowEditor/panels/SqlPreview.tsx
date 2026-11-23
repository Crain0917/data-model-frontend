import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Button, Tooltip } from 'antd';
import { CloudServerOutlined, FormOutlined, LoadingOutlined, ReloadOutlined } from '@ant-design/icons';
import type { FlowEdge, FlowNode, SinkConfig, SinkTableModel } from '../../../types';
import { toDagJson } from '../../../utils/dagJson';
import { previewNodeSql, type NodeSqlPreview } from '../../../api/flow';

interface Props {
  node: FlowNode;
  nodes: FlowNode[];
  edges: FlowEdge[];
  flowId: string;
  onPreviewSql: (sql: string) => void;
  /** 面板有未提交草稿时：先提交再取最新 SQL，拿到的结果用于打开预览弹窗。 */
  onPreviewClick?: () => Promise<string | null> | string | null;
}

export default function SqlPreview({
  node,
  nodes,
  edges,
  flowId,
  onPreviewSql,
  onPreviewClick,
}: Props) {
  const dagJson = useMemo(() => JSON.stringify(toDagJson(nodes, edges)), [nodes, edges]);
  const configKey = useMemo(() => JSON.stringify(node.data.config), [node.data.config]);
  const [remote, setRemote] = useState<NodeSqlPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;
    setLoading(true);
    setError(null);
    const timer = window.setTimeout(() => {
      previewNodeSql(flowId, node.id, JSON.parse(dagJson))
        .then((res) => {
          if (!aliveRef.current) return;
          setRemote(res);
          setError(null);
        })
        .catch((e) => {
          if (!aliveRef.current) return;
          setRemote(null);
          setError((e as Error).message || 'SQL 预览失败');
        })
        .finally(() => {
          if (aliveRef.current) setLoading(false);
        });
    }, 300);
    return () => {
      aliveRef.current = false;
      window.clearTimeout(timer);
    };
  }, [flowId, node.id, configKey, dagJson, reloadToken]);

  const sinkCfg = node.data.kind === 'sink' ? (node.data.config as Partial<SinkConfig>) : null;
  const sinkModel = (() => {
    if (!sinkCfg || String(sinkCfg.targetType ?? '').toUpperCase() !== 'DORIS') return null;
    const model = String(sinkCfg.tableModel ?? '').toUpperCase() as SinkTableModel;
    return model === 'UNIQUE' || model === 'DUPLICATE' ? model : null;
  })();

  const displaySql = remote?.displaySql || remote?.sql || '';
  const upstreamMissing = remote?.upstreamMissing || [];
  const missingLabels = upstreamMissing.map((id) => nodes.find((n) => n.id === id)?.data.label || id);

  const statusChip = loading ? (
    <span className="chip chip--info" style={{ height: 20 }}>
      <LoadingOutlined /> 获取中
    </span>
  ) : error ? (
    <span className="chip chip--danger" style={{ height: 20 }}>
      <FormOutlined /> 预览失败
    </span>
  ) : (
    <span className="chip chip--success" style={{ height: 20 }}>
      <CloudServerOutlined /> 后端生成
    </span>
  );

  return (
    <div style={{ marginTop: 12 }}>
      <div className="form-hint" style={{ marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
        <span>SQL 预览</span>
        <Tooltip title={error ? '后端生成失败，不回落本地 SQL' : '由后端 SQL Builder 生成，与执行 SQL 同源'}>
          {statusChip}
        </Tooltip>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          <Tooltip title="重新获取预览">
            <Button size="small" type="text" icon={<ReloadOutlined />} onClick={() => setReloadToken((v) => v + 1)} />
          </Tooltip>
          <Button
            size="small"
            icon={<FormOutlined />}
            disabled={onPreviewClick ? false : !displaySql || loading || Boolean(error)}
            onClick={async () => {
              if (onPreviewClick) {
                const sql = await onPreviewClick();
                if (sql) onPreviewSql(sql);
                return;
              }
              onPreviewSql(displaySql);
            }}
          >
            预览 SQL
          </Button>
        </div>
      </div>

      {error ? (
        <Alert
          type="error"
          showIcon
          style={{ marginBottom: 8 }}
          message="SQL 预览失败"
          description={`${error}（未使用本地生成的 SQL 兜底）`}
          action={
            <Button size="small" onClick={() => setReloadToken((v) => v + 1)}>
              重试
            </Button>
          }
        />
      ) : null}

      {missingLabels.length ? (
        <div className="warn-line" style={{ marginBottom: 6 }}>
          <span>⚠️</span>
          <span>上游尚未物化：{missingLabels.join('、')}。预览可查看，执行前需先跑上游。</span>
        </div>
      ) : null}

      {remote?.sink ? (
        <div
          style={{
            display: 'flex',
            gap: 6,
            flexWrap: 'wrap',
            marginBottom: 6,
            alignItems: 'center',
            fontSize: 11.5,
          }}
        >
          <span className="chip">
            目标 {remote.sink.targetType}:{remote.sink.targetTable || '未填写'}
          </span>
          <span className="chip">{remote.sink.writeMode === 'OVERWRITE' ? '覆盖写入' : '追加写入'}</span>
          <span className="chip">字段映射 {remote.sink.fieldMapping.length} 个</span>
          {remote.sink.targetType === 'DORIS' ? (
            <span className="chip">Stream Load</span>
          ) : (
            <span className="chip">JDBC 批插</span>
          )}
          {sinkModel === 'UNIQUE' ? (
            <span className="chip">
              Unique Key · 主键 {(sinkCfg?.keyColumns || []).join('、') || '未选择'}
            </span>
          ) : sinkModel === 'DUPLICATE' ? (
            <span className="chip">Duplicate Key · 仅追加</span>
          ) : null}
        </div>
      ) : null}

      <pre className="sql-preview" style={{ maxHeight: 220 }}>
        {loading && !displaySql ? '-- 正在请求后端生成 SQL…' : displaySql || '-- 暂无 SQL 预览'}
      </pre>
      {remote ? (
        <div className="form-hint" style={{ marginTop: 4 }}>
          {remote.sink
            ? 'Sink 预览仅展示由后端生成的写入计划，不会在目标库建表或写入数据。'
            : `展示的是已绑值 SQL，仅供查看与复制；实际执行使用参数化 SQL${
                remote.params?.length ? `（参数 ${remote.params.length} 个）` : ''
              }。`}
        </div>
      ) : null}
    </div>
  );
}
