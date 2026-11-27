import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { App, Button, Dropdown, Tooltip } from 'antd';
import {
  ArrowLeftOutlined,
  CheckCircleFilled,
  CloudUploadOutlined,
  CopyOutlined,
  DeleteOutlined,
  EditOutlined,
  ExclamationCircleOutlined,
  HistoryOutlined,
  MenuUnfoldOutlined,
  PlayCircleFilled,
  ReloadOutlined,
  SaveOutlined,
  ThunderboltOutlined,
  WarningFilled,
} from '@ant-design/icons';
import type { DataSource, FlowDeleteResult, FlowRun, TableInfo } from '../../types';
import { listDataSources } from '../../api/datasource';
import { listColumns, listTables } from '../../api/datasource';
import {
  duplicateFlow,
  getRun,
  listRuns,
  startMiddleRun,
  startNodeRun,
  startRun,
} from '../../api/flow';
import { createNode } from '../../utils/dagUtils';
import { dagWarnings } from '../../utils/validation';
import { dirtyDraftIds, useFlowStore } from './store';
import DataSourceColumn from './DataSourceColumn';
import TableColumn from './TableColumn';
import Canvas from './Canvas';
import ConfigDrawer from './ConfigDrawer';
import EditFlowModal from '../../components/EditFlowModal';
import DeleteFlowModal from '../../components/DeleteFlowModal';

const FAIL_STAGE_LABEL: Record<string, string> = {
  SOURCE_READ: '源库读取',
  TYPE_MAPPING: '类型映射',
  STREAM_LOAD: 'Stream Load 写入',
  SINK_WRITE: 'Sink 写入',
  DORIS_EXEC: 'Doris 计算',
  VALIDATE: '行数校验',
  OTHER: '执行',
};

function durationText(ms?: number | null) {
  if (ms == null) return '—';
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

const COLLAPSE_KEY = 'df.editor.collapsed';
type CollapsedState = { ds: boolean; tables: boolean };

function readCollapsed(): CollapsedState {
  try {
    const raw = localStorage.getItem(COLLAPSE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<CollapsedState>;
      return { ds: Boolean(parsed.ds), tables: Boolean(parsed.tables) };
    }
  } catch {
    // 本地存储不可用时保持默认展开
  }
  return { ds: false, tables: false };
}

function CollapsedRail({ label, onExpand }: { label: string; onExpand: () => void }) {
  return (
    <div className="editor-rail">
      <Tooltip title={`展开${label}侧栏`} placement="right">
        <Button type="text" size="small" icon={<MenuUnfoldOutlined />} onClick={onExpand} />
      </Tooltip>
      <span className="editor-rail-label">{label}</span>
    </div>
  );
}

export default function FlowEditorPage() {
  const { flowId } = useParams<{ flowId: string }>();
  const navigate = useNavigate();
  const { message } = App.useApp();

  const flow = useFlowStore((s) => s.flow);
  const nodes = useFlowStore((s) => s.nodes);
  const edges = useFlowStore((s) => s.edges);
  const loading = useFlowStore((s) => s.loading);
  const error = useFlowStore((s) => s.error);
  const saveStatus = useFlowStore((s) => s.saveStatus);
  const saveError = useFlowStore((s) => s.saveError);
  const lastSavedAt = useFlowStore((s) => s.lastSavedAt);
  const changeSeq = useFlowStore((s) => s.changeSeq);
  const drafts = useFlowStore((s) => s.drafts);
  const baselines = useFlowStore((s) => s.baselines);
  const load = useFlowStore((s) => s.load);
  const save = useFlowStore((s) => s.save);
  const addNode = useFlowStore((s) => s.addNode);
  const setRunStatus = useFlowStore((s) => s.setRunStatus);
  const setFlowMeta = useFlowStore((s) => s.setFlowMeta);
  const whenDraftsResolved = useFlowStore((s) => s.whenDraftsResolved);
  const dirtyDraftCount = dirtyDraftIds(nodes, drafts, baselines).length;

  const [dataSources, setDataSources] = useState<DataSource[]>([]);
  const [dsLoading, setDsLoading] = useState(true);
  const [dsId, setDsId] = useState<number | null>(null);
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [tablesLoading, setTablesLoading] = useState(false);
  const [tablesError, setTablesError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [middleRunning, setMiddleRunning] = useState(false);
  const [lastRun, setLastRun] = useState<FlowRun | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<CollapsedState>(readCollapsed);
  const [fitSignal, setFitSignal] = useState(0);
  const firstCollapseRender = useRef(true);
  const pollTimer = useRef<number | null>(null);
  const pollToken = useRef(0);

  useEffect(() => {
    if (firstCollapseRender.current) {
      firstCollapseRender.current = false;
      return;
    }
    setFitSignal((v) => v + 1);
  }, [collapsed.ds, collapsed.tables]);

  const toggleColumn = (key: keyof CollapsedState) => {
    setCollapsed((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      try {
        localStorage.setItem(COLLAPSE_KEY, JSON.stringify(next));
      } catch {
        // 忽略存储失败
      }
      return next;
    });
  };

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
      const s = useFlowStore.getState();
      if (s.changeSeq > 0 || dirtyDraftIds(s.nodes, s.drafts, s.baselines).length > 0) {
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

  // 画布与面板展示「已保存配置 + 未保存草稿」，避免编辑中看不到变化；落库仍只用 store 的 nodes。
  const displayNodes = useMemo(
    () =>
      nodes.map((n) => {
        const draft = drafts[n.id];
        if (!draft) return n;
        return {
          ...n,
          data: {
            ...n.data,
            config: draft.config,
            label: draft.label,
            color: draft.color,
          },
        };
      }),
    [nodes, drafts],
  );

  const warnings = useMemo(() => dagWarnings(displayNodes, edges), [displayNodes, edges]);

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

  const stopPolling = useCallback(() => {
    if (pollTimer.current !== null) {
      window.clearTimeout(pollTimer.current);
      pollTimer.current = null;
    }
    pollToken.current += 1;
  }, []);

  const applyRunStatuses = useCallback(
    (run: FlowRun) => {
      const byNode = new Map(run.nodes.map((n) => [n.nodeId, n]));
      useFlowStore.getState().nodes.forEach((n) => {
        const nr = byNode.get(n.id);
        if (!nr) {
          // 单节点重试只返回目标节点，其他节点保留上一次的状态
          if (run.runType === 'NODE') return;
          setRunStatus(n.id, null);
          return;
        }
        const status =
          nr.status === 'PENDING' || nr.status === 'WAITING'
            ? 'RUNNING'
            : (nr.status as 'RUNNING' | 'SUCCESS' | 'FAILED' | 'SKIPPED');
        setRunStatus(n.id, status);
      });
    },
    [setRunStatus],
  );

  const pollRun = useCallback(
    (runId: string, token: number) => {
      getRun(runId)
        .then((run) => {
          if (token !== pollToken.current) return;
          setLastRun(run);
          applyRunStatuses(run);
          if (run.status === 'RUNNING' || run.status === 'PENDING') {
            pollTimer.current = window.setTimeout(() => pollRun(runId, token), 1500);
            return;
          }
          setRunning(false);
          setMiddleRunning(false);
          setFlowMeta({ lastRunStatus: run.status, lastRunTime: run.endTime || null });
          if (run.status === 'SUCCESS') {
            message.success({
              content: `执行成功：${run.nodes.length} 个节点，耗时 ${durationText(run.durationMs)}`,
              key: 'flow-run',
              duration: 3,
            });
          } else {
            const failed = run.nodes.find((n) => n.status === 'FAILED');
            const stage = failed?.failStage ? FAIL_STAGE_LABEL[failed.failStage] || failed.failStage : '执行';
            message.error({
              content: `执行失败：${failed?.nodeName || '未知节点'}（${stage}）${
                failed?.errorStack ? `：${failed.errorStack}` : ''
              }`,
              key: 'flow-run',
              duration: 6,
            });
          }
        })
        .catch((e) => {
          if (token !== pollToken.current) return;
          setRunning(false);
          setMiddleRunning(false);
          message.error({ content: `查询执行状态失败：${(e as Error).message}`, key: 'flow-run', duration: 5 });
        });
    },
    [applyRunStatuses, message, setFlowMeta],
  );

  /** 执行当前节点：reuseUpstream=false，后端先跑上游链再跑本节点。 */
  const runSingleNode = useCallback(
    async (nodeId: string): Promise<{ ok: boolean; message?: string }> => {
      if (!flow) return { ok: false, message: '任务尚未加载完成，请稍后重试' };
      if (running) return { ok: false, message: '当前已有任务在执行中，请稍后再试' };
      if (!(await whenDraftsResolved())) return { ok: false, message: '已取消执行' };
      setRunning(true);
      setMiddleRunning(false);
      stopPolling();
      const token = pollToken.current;
      message.loading({ content: '节点执行提交中…', key: 'flow-run', duration: 0 });
      try {
        const runId = await startNodeRun(flow.id, nodeId, false);
        setRunStatus(nodeId, 'RUNNING');
        setLastRun(null);
        message.loading({ content: `节点执行中（run #${runId}）…`, key: 'flow-run', duration: 0 });
        pollRun(runId, token);
        return { ok: true };
      } catch (e) {
        setRunning(false);
        setMiddleRunning(false);
        return { ok: false, message: (e as Error).message || '节点执行失败' };
      }
    },
    [flow, running, whenDraftsResolved, stopPolling, message, setRunStatus, pollRun],
  );

  const retryNode = useCallback(
    async (nodeId: string) => {
      if (!flow || running) return;
      if (!(await whenDraftsResolved())) return;
      setRunning(true);
      setMiddleRunning(false);
      stopPolling();
      const token = pollToken.current;
      message.loading({ content: '节点重试提交中…', key: 'flow-run', duration: 0 });
      try {
        const runId = await startNodeRun(flow.id, nodeId, true);
        setRunStatus(nodeId, 'RUNNING');
        message.loading({ content: `节点重试执行中（run #${runId}）…`, key: 'flow-run', duration: 0 });
        pollRun(runId, token);
      } catch (e) {
        setRunning(false);
        setMiddleRunning(false);
        message.error({ content: (e as Error).message || '节点重试失败', key: 'flow-run', duration: 5 });
      }
    },
    [flow, running, stopPolling, message, setRunStatus, pollRun, whenDraftsResolved],
  );

  useEffect(() => () => stopPolling(), [stopPolling]);

  // 刷新或重新进入时从运行记录恢复节点状态；未结束的运行继续轮询
  useEffect(() => {
    if (!flow?.id) return;
    let alive = true;
    stopPolling();
    listRuns(flow.id)
      .then((runs) => {
        if (!alive || !runs.length) return undefined;
        return getRun(runs[0].id).then((run) => {
          if (!alive) return;
          setLastRun(run);
          applyRunStatuses(run);
          if (run.status === 'RUNNING' || run.status === 'PENDING') {
            setRunning(true);
            setMiddleRunning(run.runType === 'MIDDLE');
            pollRun(run.id, pollToken.current);
          }
        });
      })
      .catch(() => {
        // 运行记录不可用时不影响画布
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flow?.id]);

  const runFlow = async () => {
    if (!flow || running) return;
    if (!(await whenDraftsResolved())) return;
    const currentNodes = useFlowStore.getState().nodes;
    if (!currentNodes.length) {
      message.warning('画布为空，请先拖入数据表或添加节点');
      return;
    }
    const currentWarnings = dagWarnings(currentNodes, useFlowStore.getState().edges);
    if (currentWarnings.length) {
      message.warning(`配置待检查：${currentWarnings[0]}${currentWarnings.length > 1 ? ` 等 ${currentWarnings.length} 项` : ''}`);
      return;
    }
    setRunning(true);
    setMiddleRunning(false);
    stopPolling();
    const token = pollToken.current;
    message.loading({ content: '任务提交中…', key: 'flow-run', duration: 0 });
    try {
      await save(true);
      if (useFlowStore.getState().saveStatus === 'error') {
        throw new Error(useFlowStore.getState().saveError || '画布保存失败，已取消执行');
      }
      const runId = await startRun(flow.id);
      useFlowStore.getState().nodes.forEach((n) => {
        setRunStatus(n.id, 'RUNNING');
      });
      setLastRun(null);
      message.loading({ content: `任务执行中（run #${runId}）…`, key: 'flow-run', duration: 0 });
      pollRun(runId, token);
    } catch (e) {
      setRunning(false);
      setMiddleRunning(false);
      message.error({ content: (e as Error).message || '任务提交失败', key: 'flow-run', duration: 4 });
    }
  };

  /** 中间任务：不重新同步 src 表，只重跑其余节点。 */
  const runMiddle = async () => {
    if (!flow || running) return;
    if (!(await whenDraftsResolved())) return;
    const currentNodes = useFlowStore.getState().nodes;
    if (!currentNodes.length) {
      message.warning('画布为空，请先拖入数据表或添加节点');
      return;
    }
    const currentWarnings = dagWarnings(currentNodes, useFlowStore.getState().edges);
    if (currentWarnings.length) {
      message.warning(`配置待检查：${currentWarnings[0]}${currentWarnings.length > 1 ? ` 等 ${currentWarnings.length} 项` : ''}`);
      return;
    }
    setRunning(true);
    setMiddleRunning(true);
    stopPolling();
    const token = pollToken.current;
    message.loading({ content: '中间任务提交中…', key: 'flow-run', duration: 0 });
    try {
      await save(true);
      if (useFlowStore.getState().saveStatus === 'error') {
        throw new Error(useFlowStore.getState().saveError || '画布保存失败，已取消执行');
      }
      const runId = await startMiddleRun(flow.id);
      useFlowStore.getState().nodes.forEach((n) => {
        setRunStatus(n.id, n.data.kind === 'source' ? 'SKIPPED' : 'RUNNING');
      });
      setLastRun(null);
      message.loading({ content: `中间任务执行中（run #${runId}）…`, key: 'flow-run', duration: 0 });
      pollRun(runId, token);
    } catch (e) {
      setRunning(false);
      setMiddleRunning(false);
      message.error({ content: (e as Error).message || '中间任务提交失败', key: 'flow-run', duration: 5 });
    }
  };

  const moreMenu = {
    items: [
      {
        key: 'save',
        icon: <SaveOutlined />,
        label: '手动保存',
        onClick: async () => {
          if (!(await whenDraftsResolved())) return;
          await save(true);
          message.success('已保存');
        },
      },
      {
        key: 'reload',
        icon: <ReloadOutlined />,
        label: '重新加载画布',
        onClick: async () => {
          if (!(await whenDraftsResolved())) return;
          if (flowId) load(flowId);
        },
      },
      {
        key: 'copy',
        icon: <CopyOutlined />,
        label: '复制任务',
        onClick: async () => {
          if (!flow) return;
          if (!(await whenDraftsResolved())) return;
          try {
            const copy = await duplicateFlow(flow.id);
            message.success('任务已复制');
            navigate(`/flow/${copy.id}/editor`);
          } catch (e) {
            message.error((e as Error).message || '复制失败');
          }
        },
      },
      { type: 'divider' as const },
      {
        key: 'delete',
        icon: <DeleteOutlined />,
        label: '删除任务',
        danger: true,
        onClick: () => setDeleteOpen(true),
      },
    ],
  };

  const onDeleted = (result: FlowDeleteResult) => {
    // 任务已不存在，丢弃本地待保存状态，避免卸载时再向已删除任务发保存请求
    useFlowStore.setState({ changeSeq: 0, saveStatus: 'saved', saveError: null });
    if (result.failedTables?.length) {
      message.warning(
        `任务已删除，但 ${result.failedTables.length} 张节点表删除失败：${result.failedTables
          .map((t) => t.dorisTable)
          .join('、')}`,
        6,
      );
    } else if (result.deletedTables?.length) {
      message.success(`Doris 表清理 ${result.deletedTables.length} 张`);
    }
    navigate('/flow');
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
          <Button
            type="text"
            icon={<ArrowLeftOutlined />}
            onClick={async () => {
              if (!(await whenDraftsResolved())) return;
              navigate('/flow');
            }}
          />
        </Tooltip>
        <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>任务管理 /</span>
        <Tooltip title={flow.description || '点击铅笔编辑任务名称与描述'}>
          <div className="editor-title">{flow.name}</div>
        </Tooltip>
        <Tooltip title="编辑任务名称与描述">
          <Button
            type="text"
            size="small"
            icon={<EditOutlined />}
            onClick={() => setEditOpen(true)}
            aria-label="编辑任务信息"
          />
        </Tooltip>
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
        {dirtyDraftCount ? (
          <Tooltip title="节点配置草稿尚未写入流程；点击节点后在面板底部保存">
            <span className="chip chip--warning">
              <EditOutlined /> {dirtyDraftCount} 个节点配置未保存
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
            <Tooltip title={saveError || '画布保存失败'}>
              <button
                onClick={() => save(true)}
                style={{ border: 0, background: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: 12 }}
              >
                保存失败，点击重试
              </button>
            </Tooltip>
          ) : (
            <>
              <span className="status-dot status-dot--success" /> 已保存 {lastSavedAt || ''}
            </>
          )}
        </span>

        <Tooltip title="提交到后端：源表先同步到 Doris，各节点用 Doris SQL 计算">
          <Button
            type="primary"
            icon={<PlayCircleFilled />}
            loading={running && !middleRunning}
            disabled={running && middleRunning}
            onClick={runFlow}
          >
            运行任务
          </Button>
        </Tooltip>
        <Tooltip title="不重新同步 src 表，只重跑其余节点">
          <Button
            className="btn-run-middle"
            icon={<ThunderboltOutlined />}
            loading={middleRunning}
            disabled={running && !middleRunning}
            onClick={runMiddle}
          >
            运行中间任务
          </Button>
        </Tooltip>
        <Button
          icon={<HistoryOutlined />}
          onClick={async () => {
            if (!(await whenDraftsResolved())) return;
            navigate(`/logs?flowId=${flow.id}`);
          }}
        >
          执行历史
        </Button>
        <Dropdown menu={moreMenu} trigger={['click']}>
          <Button icon={<CloudUploadOutlined />} />
        </Dropdown>
      </div>

      {lastRun && (lastRun.status === 'FAILED' || lastRun.status === 'RUNNING' || lastRun.status === 'PENDING') ? (
        <div
          className={lastRun.status === 'FAILED' ? 'warn-line' : 'form-hint'}
          style={{
            margin: 0,
            borderRadius: 0,
            borderLeft: 0,
            borderRight: 0,
            padding: '7px 18px',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 12,
          }}
        >
          <span>{lastRun.status === 'FAILED' ? '✕' : '⏳'}</span>
          <span>
            {lastRun.runType === 'MIDDLE' ? '中间任务 ' : ''}run #{lastRun.id}
            {lastRun.status === 'FAILED'
              ? (() => {
                  const failed = lastRun.nodes.find((n) => n.status === 'FAILED');
                  const stage = failed?.failStage ? FAIL_STAGE_LABEL[failed.failStage] || failed.failStage : '执行';
                  return ` 失败于「${failed?.nodeName || '未知节点'}」· ${stage}${
                    failed?.errorStack ? `：${failed.errorStack}` : ''
                  }`;
                })()
              : ' 正在执行…'}
          </span>
          <span style={{ marginLeft: 'auto', color: 'var(--text-tertiary)' }}>
            {lastRun.startTime}
            {lastRun.endTime ? ` → ${lastRun.endTime}` : ''}
          </span>
        </div>
      ) : null}

      <div className="editor-body">
        {collapsed.ds ? (
          <CollapsedRail label="数据源" onExpand={() => toggleColumn('ds')} />
        ) : (
          <DataSourceColumn
            dataSources={dataSources}
            loading={dsLoading}
            selectedId={dsId}
            onSelect={setDsId}
            onOpenCreate={() => window.open('/data-source', '_blank')}
            onCollapse={() => toggleColumn('ds')}
          />
        )}
        {collapsed.tables ? (
          <CollapsedRail label="表" onExpand={() => toggleColumn('tables')} />
        ) : (
          <TableColumn
            dataSource={selectedDs}
            tables={tables}
            loading={tablesLoading}
            error={tablesError}
            onRefresh={() => dsId && loadTables(dsId)}
            onAdd={addSource}
            onCollapse={() => toggleColumn('tables')}
          />
        )}
        <div className="canvas-area">
          <Canvas flowId={flow.id} nodes={displayNodes} edges={edges} fitSignal={fitSignal} />
          <ConfigDrawer
            nodes={nodes}
            edges={edges}
            flowId={flow.id}
            dataSources={dataSources}
            lastRun={lastRun}
            onRetryNode={retryNode}
            onRunNode={runSingleNode}
          />
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 18px', borderTop: '1px solid var(--border)', background: 'var(--bg-elevated)', fontSize: 11, color: 'var(--text-tertiary)' }}>
        <CheckCircleFilled style={{ color: 'var(--success)' }} />
        节点 {displayNodes.length} · 连线 {edges.length} · 画布改动自动保存；节点配置需手动保存
        {dirtyDraftCount ? ` · ${dirtyDraftCount} 个节点配置未保存` : ''}
        <span style={{ marginLeft: 'auto' }}>执行在 Doris 内完成 · Sink 按目标配置写入</span>
      </div>

      <EditFlowModal
        open={editOpen}
        flow={flow}
        onClose={() => setEditOpen(false)}
        onSaved={(result) => {
          setFlowMeta({
            name: result.name,
            description: result.description,
            updateTime: result.updateTime || flow.updateTime,
          });
          document.title = `${result.name} · 可视化数据集成平台`;
        }}
      />

      <DeleteFlowModal
        open={deleteOpen}
        flow={flow}
        onClose={() => setDeleteOpen(false)}
        onDeleted={onDeleted}
      />
    </div>
  );
}
