import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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

/**
 * SQL 预览按需请求：抽屉打开一次、控件失焦且配置变化、手动刷新、点击「预览 SQL」。
 * 输入过程中不请求，避免每敲一个字都打后端。
 */
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
  const [stale, setStale] = useState(false);

  const dagRef = useRef(dagJson);
  const keyRef = useRef(configKey);
  const requestedKeyRef = useRef<string | null>(null);
  const loadingRef = useRef(false);
  const aliveRef = useRef(true);
  const seqRef = useRef(0);
  const onPreviewSqlRef = useRef(onPreviewSql);
  dagRef.current = dagJson;
  keyRef.current = configKey;
  onPreviewSqlRef.current = onPreviewSql;

  const request = useCallback(
    async (openAfter: boolean) => {
      const seq = ++seqRef.current;
      const key = keyRef.current;
      requestedKeyRef.current = key;
      loadingRef.current = true;
      setLoading(true);
      setError(null);
      try {
        const res = await previewNodeSql(flowId, node.id, JSON.parse(dagRef.current));
        if (!aliveRef.current || seq !== seqRef.current) return;
        setRemote(res);
        setStale(keyRef.current !== key);
        if (openAfter) onPreviewSqlRef.current(res.displaySql || res.sql || '');
      } catch (e) {
        if (!aliveRef.current || seq !== seqRef.current) return;
        setRemote(null);
        setError((e as Error).message || 'SQL 预览失败');
      } finally {
        if (aliveRef.current && seq === seqRef.current) {
          loadingRef.current = false;
          setLoading(false);
        }
      }
    },
    [flowId, node.id],
  );

  // 抽屉/节点面板打开时只请求一次；之后的改动等待失焦。
  useEffect(() => {
    aliveRef.current = true;
    requestedKeyRef.current = null;
    setStale(false);
    void request(false);
    return () => {
      aliveRef.current = false;
      seqRef.current += 1;
    };
  }, [request]);

  // 表单控件失焦且配置与上次请求不同，才补一次请求。
  useEffect(() => {
    const onFocusOut = (e: FocusEvent) => {
      // 只把「离开配置表单控件」当作编辑完成；从页面其他位置点入输入框不算。
      const target = e.target as HTMLElement | null;
      const tag = (target?.tagName || '').toLowerCase();
      const editable = tag === 'input' || tag === 'textarea' || Boolean(target?.isContentEditable);
      if (!editable || !target?.closest('.config-drawer, .config-modal')) return;
      window.setTimeout(() => {
        if (!aliveRef.current || loadingRef.current) return;
        if (keyRef.current !== requestedKeyRef.current) {
          setStale(true);
          void request(false);
        }
      }, 180);
    };
    document.addEventListener('focusout', onFocusOut);
    return () => document.removeEventListener('focusout', onFocusOut);
  }, [request]);

  useEffect(() => {
    if (requestedKeyRef.current === null) return;
    setStale(keyRef.current !== requestedKeyRef.current);
  }, [configKey]);

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
        {stale && !loading ? (
          <span style={{ color: 'var(--warning, #d97706)' }}>配置已修改，失焦后刷新</span>
        ) : null}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          <Tooltip title="重新获取预览">
            <Button
              size="small"
              type="text"
              icon={<ReloadOutlined />}
              loading={loading}
              onClick={() => void request(false)}
            />
          </Tooltip>
          <Button
            size="small"
            icon={<FormOutlined />}
            loading={loading}
            onClick={async () => {
              if (onPreviewClick) {
                const sql = await onPreviewClick();
                if (sql) onPreviewSql(sql);
                return;
              }
              await request(true);
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
            <Button size="small" onClick={() => void request(false)}>
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
