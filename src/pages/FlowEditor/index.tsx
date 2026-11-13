import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { App, Button, Dropdown, Input, Tooltip } from 'antd';
import {
  ArrowLeftOutlined,
  CheckCircleFilled,
  CloudUploadOutlined,
  CopyOutlined,
  DeleteOutlined,
  EditOutlined,
  ExclamationCircleOutlined,
  HistoryOutlined,
  PlayCircleFilled,
  ReloadOutlined,
  SaveOutlined,
  WarningFilled,
} from '@ant-design/icons';
import type { DataSource, FlowRun, NodeRun, TableInfo } from '../../types';
import { listDataSources } from '../../api/datasource';
import { listColumns, listTables } from '../../api/datasource';
import { appendRun, deleteFlow, duplicateFlow, markFlowRun, updateFlowMeta } from '../../api/flow';
import { createNode, buildNodeSql } from '../../utils/dagUtils';
import { dagWarnings } from '../../utils/validation';
import { useFlowStore } from './store';
import DataSourceColumn from './DataSourceColumn';
import TableColumn from './TableColumn';
import Canvas from './Canvas';
import ConfigDrawer from './ConfigDrawer';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function stamp(d = new Date()) {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function runIdStamp(d: Date) {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

export default function FlowEditorPage() {
  const { flowId } = useParams<{ flowId: string }>();
  const navigate = useNavigate();
  const { message, modal } = App.useApp();

  const flow = useFlowStore((s) => s.flow);
  const nodes = useFlowStore((s) => s.nodes);
  const edges = useFlowStore((s) => s.edges);
  const loading = useFlowStore((s) => s.loading);
  const error = useFlowStore((s) => s.error);
  const saveStatus = useFlowStore((s) => s.saveStatus);
  const lastSavedAt = useFlowStore((s) => s.lastSavedAt);
  const changeSeq = useFlowStore((s) => s.changeSeq);
  const load = useFlowStore((s) => s.load);
  const save = useFlowStore((s) => s.save);
  const addNode = useFlowStore((s) => s.addNode);
  const setRunStatus = useFlowStore((s) => s.setRunStatus);
  const setFlowMeta = useFlowStore((s) => s.setFlowMeta);

  const [dataSources, setDataSources] = useState<DataSource[]>([]);
  const [dsLoading, setDsLoading] = useState(true);
  const [dsId, setDsId] = useState<number | null>(null);
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [tablesLoading, setTablesLoading] = useState(false);
  const [tablesError, setTablesError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');

  useEffect(() => {
    if (flowId) load(flowId);
  }, [flowId, load]);

  useEffect(() => {
    let alive = true;
    setDsLoading(true);
    listDataSources({ page: 1, size: 200 })
      .then((res) => {
        if (alive) setDataSources(res.list);
      })
      .catch((e) => {
        if (alive) message.error((e as Error).message || '数据源加载失败');
      })
      .finally(() => {
        if (alive) setDsLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [message]);

  useEffect(() => {
    if (!flow || !dataSources.length) return;
    setDsId((prev) => {
      if (prev && dataSources.some((d) => d.id === prev)) return prev;
      if (flow.dataSourceId && dataSources.some((d) => d.id === flow.dataSourceId)) return flow.dataSourceId;
      return dataSources[0].id;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flow?.id, dataSources]);

  const loadTables = useCallback(
    async (id: number) => {
      setTablesLoading(true);
      setTablesError(null);
      try {
        const list = await listTables(id);
        setTables(list);
      } catch (e) {
        setTablesError((e as Error).message || '表列表加载失败');
        setTables([]);
      } finally {
        setTablesLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (!dsId) {
      setTables([]);
      return;
    }
    loadTables(dsId);
  }, [dsId, loadTables]);

  useEffect(() => {
    if (!flow || changeSeq === 0) return;
    const timer = setTimeout(() => {
      void save();
    }, 2000);
    return () => clearTimeout(timer);
  }, [changeSeq, flow, save]);

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (useFlowStore.getState().changeSeq > 0) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      const s = useFlowStore.getState();
      if (s.changeSeq > 0) void s.save(true);
    };
  }, []);

  const warnings = useMemo(() => dagWarnings(nodes, edges), [nodes, edges]);

  const selectedDs = dataSources.find((d) => d.id === dsId) || null;

  const addSource = async (table: TableInfo) => {
    if (!selectedDs) return;
    try {
      const columns = await listColumns(selectedDs.id, table.tableName);
      const count = nodes.filter(
        (n) => n.data.kind === 'source' && (n.data.config as { tableName?: string }).tableName === table.tableName,
      ).length;
      const label = count ? `${table.tableName} #${count + 1}` : table.tableName;
      const sourceCount = nodes.filter((n) => n.data.kind === 'source').length;
      addNode(
        createNode(
          'source',
          { x: 80 + (sourceCount % 2) * 40, y: 460 + sourceCount * 90 },
          {
            dataSourceId: selectedDs.id,
            dataSourceName: selectedDs.name,
            dbName: selectedDs.dbName,
            tableName: table.tableName,
            fields: columns.map((c) => ({ name: c.name, type: c.type })),
          },
          label,
        ),
      );
      message.success(`已添加 Source 节点：${table.tableName}`);
    } catch (e) {
      message.error(`加载字段失败：${(e as Error).message}`);
    }
  };

  const runFlow = async () => {
    if (!flow || running) return;
    if (!nodes.length) {
      message.warning('画布为空，请先拖入数据表或添加节点');
      return;
    }
    if (warnings.length) {
      message.warning(`配置待检查：${warnings[0]}${warnings.length > 1 ? ` 等 ${warnings.length} 项` : ''}`);
      return;
    }
    setRunning(true);
    message.loading({ content: '任务执行中…', key: 'flow-run', duration: 0 });
    const ordered = [...nodes].sort((a, b) => a.position.x - b.position.x || a.position.y - b.position.y);
    const started = new Date();
    const nodeRuns: NodeRun[] = [];
    for (const node of ordered) {
      setRunStatus(node.id, 'RUNNING');
      await sleep(420);
      const status = node.data.kind === 'sink' ? 'SKIPPED' : 'SUCCESS';
      const duration = 260 + Math.round(Math.random() * 900);
      setRunStatus(node.id, status);
      nodeRuns.push({
        nodeId: node.id,
        nodeName: node.data.label,
        status,
        rows: status === 'SKIPPED' ? null : 1000 + Math.floor(Math.random() * 90000),
        durationMs: duration,
        sql: buildNodeSql(node, nodes, edges, flow.id),
        logs: [
          `[${stamp(new Date())}] ${node.data.label} 开始执行`,
          status === 'SKIPPED'
            ? `[${stamp(new Date())}] v1 未启用 Sink，节点跳过`
            : `[${stamp(new Date())}] 执行完成，耗时 ${duration}ms`,
        ],
      });
    }
    const ended = new Date();
    const run: FlowRun = {
      id: `R-${flow.id}-${runIdStamp(started)}`,
      flowId: flow.id,
      flowName: flow.name,
      status: 'SUCCESS',
      startTime: stamp(started),
      endTime: stamp(ended),
      durationMs: ended.getTime() - started.getTime(),
      trigger: 'MANUAL',
      nodes: nodeRuns,
    };
    appendRun(run);
    markFlowRun(flow.id, 'SUCCESS');
    setFlowMeta({ lastRunStatus: 'SUCCESS', lastRunTime: stamp(ended) });
    setRunning(false);
    message.success({ content: `执行完成：${ordered.length} 个节点`, key: 'flow-run', duration: 2.5 });
    setTimeout(() => {
      ordered.forEach((n) => setRunStatus(n.id, null));
    }, 6000);
  };

  const commitName = async () => {
    const next = nameDraft.trim();
    setEditingName(false);
    if (!flow || !next || next === flow.name) return;
    if (next.length > 50) {
      message.warning('任务名称不能超过 50 个字符');
      return;
    }
    await updateFlowMeta(flow.id, { name: next });
    setFlowMeta({ name: next });
    message.success('任务名称已更新');
  };

  const moreMenu = {
    items: [
      {
        key: 'save',
        icon: <SaveOutlined />,
        label: '手动保存',
        onClick: async () => {
          await save(true);
          message.success('已保存');
        },
      },
      {
        key: 'reload',
        icon: <ReloadOutlined />,
        label: '重新加载画布',
        onClick: () => flowId && load(flowId),
      },
      {
        key: 'copy',
        icon: <CopyOutlined />,
        label: '复制任务',
        onClick: async () => {
          if (!flow) return;
          await duplicateFlow(flow.id);
          message.success('任务已复制');
        },
      },
      { type: 'divider' as const },
      {
        key: 'delete',
        icon: <DeleteOutlined />,
        label: '删除任务',
        danger: true,
        onClick: () => {
          if (!flow) return;
          modal.confirm({
            title: `删除任务「${flow.name}」？`,
            content: '画布、配置与执行记录将一并删除，该操作不可撤销。',
            okText: '删除',
            okButtonProps: { danger: true },
            cancelText: '取消',
            onOk: async () => {
              await deleteFlow(flow.id);
              message.success('任务已删除');
              navigate('/flow');
            },
          });
        },
      },
    ],
  };

  if (loading) {
    return (
      <div className="editor-shell">
        <div className="editor-topbar">
          <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate('/flow')} />
          <span className="editor-title">加载中…</span>
        </div>
        <div style={{ padding: 40 }}>
          <div className="skeleton-row" style={{ height: 60 }} />
          <div className="skeleton-row" style={{ height: 400 }} />
        </div>
      </div>
    );
  }

  if (error || !flow) {
    return (
      <div className="editor-shell">
        <div className="editor-topbar">
          <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate('/flow')} />
          <span className="editor-title">任务加载失败</span>
        </div>
        <div style={{ display: 'grid', placeItems: 'center', flex: 1 }}>
          <div className="card" style={{ padding: 40, textAlign: 'center', maxWidth: 420 }}>
            <ExclamationCircleOutlined style={{ fontSize: 34, color: 'var(--danger)' }} />
            <h3 style={{ margin: '14px 0 6px' }}>{error || '任务不存在'}</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>请返回任务列表后重试。</p>
            <Button type="primary" onClick={() => navigate('/flow')}>
              返回任务列表
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="editor-shell">
      <div className="editor-topbar">
        <Tooltip title="返回任务列表">
          <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate('/flow')} />
        </Tooltip>
        <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>任务管理 /</span>
        {editingName ? (
          <Input
            size="small"
            value={nameDraft}
            style={{ width: 260 }}
            maxLength={50}
            autoFocus
            onChange={(e) => setNameDraft(e.target.value)}
            onPressEnter={commitName}
            onBlur={commitName}
          />
        ) : (
          <div className="editor-title" onClick={() => { setNameDraft(flow.name); setEditingName(true); }} style={{ cursor: 'text' }}>
            {flow.name}
            <EditOutlined style={{ fontSize: 11, marginLeft: 6, color: 'var(--text-tertiary)' }} />
          </div>
        )}
        <span className="chip">flow_{flow.id}</span>
        {warnings.length ? (
          <Tooltip
            title={
              <div style={{ fontSize: 12 }}>
                {warnings.slice(0, 5).map((w) => (
                  <div key={w}>• {w}</div>
                ))}
                {warnings.length > 5 ? <div>… 共 {warnings.length} 项</div> : null}
              </div>
            }
          >
            <span className="chip chip--warning">
              <WarningFilled /> {warnings.length} 项待检查
            </span>
          </Tooltip>
        ) : null}

        <div className="toolbar-spacer" />

        <span className="soft-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {saveStatus === 'dirty' ? (
            <>
              <span className="status-dot status-dot--idle" /> 未保存
            </>
          ) : saveStatus === 'saving' ? (
            <>
              <span className="status-dot" style={{ background: 'var(--info)' }} /> 保存中…
            </>
          ) : saveStatus === 'error' ? (
            <button
              onClick={() => save(true)}
              style={{ border: 0, background: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: 12 }}
            >
              保存失败，点击重试
            </button>
          ) : (
            <>
              <span className="status-dot status-dot--success" /> 已保存 {lastSavedAt || ''}
            </>
          )}
        </span>

        <Tooltip title="执行引擎 M4 接入，当前按 DAG 顺序模拟节点执行">
          <Button type="primary" icon={<PlayCircleFilled />} loading={running} onClick={runFlow}>
            运行任务
          </Button>
        </Tooltip>
        <Button icon={<HistoryOutlined />} onClick={() => navigate(`/logs?flowId=${flow.id}`)}>
          执行历史
        </Button>
        <Dropdown menu={moreMenu} trigger={['click']}>
          <Button icon={<CloudUploadOutlined />} />
        </Dropdown>
      </div>

      <div className="editor-body">
        <DataSourceColumn
          dataSources={dataSources}
          loading={dsLoading}
          selectedId={dsId}
          onSelect={setDsId}
          onOpenCreate={() => window.open('/data-source', '_blank')}
        />
        <TableColumn
          dataSource={selectedDs}
          tables={tables}
          loading={tablesLoading}
          error={tablesError}
          onRefresh={() => dsId && loadTables(dsId)}
          onAdd={addSource}
        />
        <div className="canvas-area">
          <Canvas flowId={flow.id} nodes={nodes} edges={edges} />
          <ConfigDrawer nodes={nodes} edges={edges} flowId={flow.id} dataSources={dataSources} />
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 18px', borderTop: '1px solid var(--border)', background: 'var(--bg-elevated)', fontSize: 11, color: 'var(--text-tertiary)' }}>
        <CheckCircleFilled style={{ color: 'var(--success)' }} />
        节点 {nodes.length} · 连线 {edges.length} · 变更自动保存（2s 防抖）
        <span style={{ marginLeft: 'auto' }}>v1 · Sink 仅占位</span>
      </div>
    </div>
  );
}
