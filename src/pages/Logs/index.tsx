import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Alert, App, Button, Modal, Select, Skeleton, Spin, Tooltip } from 'antd';
import {
  CalendarOutlined,
  CheckCircleFilled,
  CloseCircleFilled,
  ClockCircleOutlined,
  CopyOutlined,
  LeftOutlined,
  MinusCircleFilled,
  PlayCircleOutlined,
  ReloadOutlined,
  RightOutlined,
  SyncOutlined,
} from '@ant-design/icons';
import dayjs, { type Dayjs } from 'dayjs';
import type {
  FlowRun,
  FlowSummary,
  NodeErrorDetail,
  NodeLogs,
  NodeRun,
  RunStatus,
} from '../../types';
import {
  getNodeErrorDetail,
  getNodeLogs,
  getRun,
  listFlows,
  listRuns,
  startNodeRun,
} from '../../api/flow';
import { StatusTag } from '../../components/StatusTag';
import EmptyState from '../../components/EmptyState';

const WEEK_LABELS = ['一', '二', '三', '四', '五', '六', '日'];

const FAIL_STAGE_LABEL: Record<string, string> = {
  SOURCE_READ: '源库读取',
  TYPE_MAPPING: '类型映射',
  STREAM_LOAD: 'Stream Load 写入',
  SINK_WRITE: 'Sink 写入',
  DORIS_EXEC: 'Doris 计算',
  VALIDATE: '行数校验',
  OTHER: '执行',
};

function runTypeLabel(run: FlowRun): string | null {
  if (run.runType === 'MIDDLE') return '中间任务';
  if (run.runType === 'NODE') return '单节点';
  return null;
}

function statusIcon(status: RunStatus, size = 13) {
  if (status === 'SUCCESS') return <CheckCircleFilled style={{ color: 'var(--success)', fontSize: size }} />;
  if (status === 'FAILED') return <CloseCircleFilled style={{ color: 'var(--danger)', fontSize: size }} />;
  if (status === 'RUNNING') return <SyncOutlined spin style={{ color: 'var(--info)', fontSize: size }} />;
  if (status === 'SKIPPED') return <MinusCircleFilled style={{ color: 'var(--text-tertiary)', fontSize: size }} />;
  if (status === 'PENDING') return <ClockCircleOutlined style={{ color: 'var(--text-tertiary)', fontSize: size }} />;
  return <ClockCircleOutlined style={{ color: 'var(--text-tertiary)', fontSize: size }} />;
}

function durationText(ms?: number | null) {
  if (ms == null) return '—';
  if (ms < 1000) return `${ms} ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)} s`;
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
}

function monthCells(month: Dayjs): Array<{ date: Dayjs; inMonth: boolean }> {
  const first = month.startOf('month');
  const offset = (first.day() + 6) % 7;
  const start = first.subtract(offset, 'day');
  return Array.from({ length: 42 }, (_, i) => {
    const date = start.add(i, 'day');
    return { date, inMonth: date.month() === month.month() };
  });
}

export default function LogsPage() {
  const navigate = useNavigate();
  const { message } = App.useApp();
  const [searchParams, setSearchParams] = useSearchParams();
  const flowFilter = searchParams.get('flowId') || 'all';

  const [flows, setFlows] = useState<FlowSummary[]>([]);
  const [runs, setRuns] = useState<FlowRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [month, setMonth] = useState<Dayjs>(dayjs());
  const [selectedDate, setSelectedDate] = useState(dayjs().format('YYYY-MM-DD'));
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [runDetail, setRunDetail] = useState<FlowRun | null>(null);
  const [nodeLog, setNodeLog] = useState<NodeLogs | null>(null);
  const [nodeLogLoading, setNodeLogLoading] = useState(false);
  const [errorDetail, setErrorDetail] = useState<NodeErrorDetail | null>(null);
  const [errorDetailOpen, setErrorDetailOpen] = useState(false);
  const [errorDetailLoading, setErrorDetailLoading] = useState(false);
  const [errorDetailError, setErrorDetailError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    Promise.all([listFlows(), listRuns()])
      .then(([f, r]) => {
        if (!alive) return;
        setFlows(f);
        setRuns(r);
        if (r.length) {
          const scoped = flowFilter === 'all' ? r : r.filter((x) => x.flowId === flowFilter);
          const latest = scoped[0] || r[0];
          setSelectedDate(latest.startTime.slice(0, 10));
          setMonth(dayjs(latest.startTime));
          setSelectedRunId(latest.id);
        }
      })
      .catch((e) => message.error((e as Error).message || '日志加载失败'))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const scopedRuns = useMemo(
    () => (flowFilter === 'all' ? runs : runs.filter((r) => r.flowId === flowFilter)),
    [runs, flowFilter],
  );

  const runsByDate = useMemo(() => {
    const map = new Map<string, FlowRun[]>();
    scopedRuns.forEach((r) => {
      const key = r.startTime.slice(0, 10);
      const arr = map.get(key) || [];
      arr.push(r);
      map.set(key, arr);
    });
    return map;
  }, [scopedRuns]);

  const dayRuns = runsByDate.get(selectedDate) || [];
  const selectedRun =
    (runDetail && runDetail.id === selectedRunId ? runDetail : null) ||
    runs.find((r) => r.id === selectedRunId) ||
    dayRuns[0] ||
    null;
  const selectedNode: NodeRun | null =
    selectedRun?.nodes.find((n) => n.nodeId === selectedNodeId) ||
    selectedRun?.nodes.find((n) => n.status === 'FAILED') ||
    selectedRun?.nodes[0] ||
    null;

  useEffect(() => {
    if (!selectedRunId) {
      setRunDetail(null);
      return;
    }
    let alive = true;
    setRunDetail((prev) => (prev?.id === selectedRunId ? prev : null));
    getRun(selectedRunId)
      .then((detail) => {
        if (alive) setRunDetail(detail);
      })
      .catch((e) => {
        if (alive) message.error((e as Error).message || '执行详情加载失败');
      });
    return () => {
      alive = false;
    };
  }, [selectedRunId, message]);

  // 运行中的记录持续刷新，直到终态
  useEffect(() => {
    if (!runDetail || (runDetail.status !== 'RUNNING' && runDetail.status !== 'PENDING')) return;
    const timer = window.setTimeout(() => {
      getRun(runDetail.id)
        .then(setRunDetail)
        .catch(() => {
          // 单次轮询失败不打断页面，下一次继续
        });
    }, 1500);
    return () => window.clearTimeout(timer);
  }, [runDetail]);

  useEffect(() => {
    if (selectedRun) {
      const first = selectedRun.nodes.find((n) => n.status === 'FAILED') || selectedRun.nodes[0];
      setSelectedNodeId(first?.nodeId || null);
    }
  }, [selectedRunId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!selectedRun?.id || !selectedNodeId) {
      setNodeLog(null);
      return;
    }
    let alive = true;
    setNodeLogLoading(true);
    getNodeLogs(selectedRun.id, selectedNodeId)
      .then((logs) => {
        if (alive) setNodeLog(logs);
      })
      .catch(() => {
        if (alive) setNodeLog(null);
      })
      .finally(() => {
        if (alive) setNodeLogLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [selectedRun?.id, selectedNodeId]);

  // 切换运行/节点后关闭详情，下一次点击才重新请求。
  useEffect(() => {
    setErrorDetailOpen(false);
    setErrorDetail(null);
    setErrorDetailError(null);
    setErrorDetailLoading(false);
  }, [selectedRun?.id, selectedNodeId]);

  const openErrorDetail = async () => {
    if (!selectedRun || !selectedNode) return;
    setErrorDetailOpen(true);
    if (
      errorDetail &&
      String(errorDetail.runId) === selectedRun.id &&
      errorDetail.nodeId === selectedNode.nodeId
    ) {
      return;
    }
    setErrorDetailLoading(true);
    setErrorDetail(null);
    setErrorDetailError(null);
    try {
      setErrorDetail(await getNodeErrorDetail(selectedRun.id, selectedNode.nodeId));
    } catch (e) {
      setErrorDetailError((e as Error).message || '错误详情加载失败');
    } finally {
      setErrorDetailLoading(false);
    }
  };

  const copyText = async (text: string | null | undefined, label: string) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      message.success(`${label}已复制`);
    } catch {
      message.error('复制失败，请手动选择文本');
    }
  };

  const cells = useMemo(() => monthCells(month), [month]);

  const setFlowFilter = (value: string) => {
    if (value === 'all') {
      searchParams.delete('flowId');
      setSearchParams(searchParams, { replace: true });
    } else {
      searchParams.set('flowId', value);
      setSearchParams(searchParams, { replace: true });
    }
    const next = value === 'all' ? runs : runs.filter((r) => r.flowId === value);
    if (next.length) {
      setSelectedDate(next[0].startTime.slice(0, 10));
      setMonth(dayjs(next[0].startTime));
      setSelectedRunId(next[0].id);
    } else {
      setSelectedRunId(null);
    }
  };

  const pickDate = (date: Dayjs) => {
    setSelectedDate(date.format('YYYY-MM-DD'));
    const list = runsByDate.get(date.format('YYYY-MM-DD'));
    setSelectedRunId(list?.[0]?.id || null);
  };

  const refreshRuns = async () => {
    setLoading(true);
    try {
      setRuns(await listRuns());
    } catch (e) {
      message.error((e as Error).message || '日志加载失败');
    } finally {
      setLoading(false);
    }
  };

  const nodeSql = nodeLog?.sqlText || selectedNode?.sql || '';

  const copySql = async () => {
    if (!nodeSql) return;
    try {
      await navigator.clipboard.writeText(nodeSql);
      message.success('SQL 已复制');
    } catch {
      message.error('复制失败，请手动选择文本');
    }
  };

  const rerunNode = async () => {
    if (!selectedRun || !selectedNode) return;
    const isSink = selectedNode.nodeType === 'sink';
    try {
      const runId = await startNodeRun(selectedRun.flowId, selectedNode.nodeId, isSink);
      message.success(
        isSink
          ? `已提交 Sink 续写（不重算上游）：run #${runId}`
          : `已提交节点重跑：run #${runId}`,
      );
      setSelectedDate(dayjs().format('YYYY-MM-DD'));
      setMonth(dayjs());
      setSelectedRunId(runId);
      setRunDetail(null);
      void refreshRuns();
    } catch (e) {
      message.error((e as Error).message || '节点重跑失败');
    }
  };

  const today = dayjs().format('YYYY-MM-DD');
  const monthSuccess = scopedRuns.filter(
    (r) => r.status === 'SUCCESS' && dayjs(r.startTime).isSame(month, 'month'),
  ).length;
  const monthFailed = scopedRuns.filter(
    (r) => r.status === 'FAILED' && dayjs(r.startTime).isSame(month, 'month'),
  ).length;

  return (
    <div className="page-stack">
      <div className="page-head">
        <div>
          <h1 className="page-title">任务日志</h1>
          <p className="page-desc">按日期查看每次执行的状态、节点耗时与错误堆栈，快速定位失败节点。</p>
        </div>
        <div className="toolbar">
          <Select
            value={flowFilter}
            style={{ width: 220 }}
            onChange={setFlowFilter}
            options={[{ value: 'all', label: '全部任务' }, ...flows.map((f) => ({ value: f.id, label: f.name }))]}
          />
          <Button icon={<ReloadOutlined />} onClick={refreshRuns}>
            刷新
          </Button>
        </div>
      </div>

      <div className="logs-layout">
        <section className="card logs-calendar">
          <div className="logs-calendar-head">
            <div>
              <div className="logs-calendar-month">{month.format('YYYY 年 M 月')}</div>
              <div className="logs-calendar-sub">
                成功 {monthSuccess} · 失败 {monthFailed}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 2 }}>
              <Button type="text" size="small" icon={<LeftOutlined />} onClick={() => setMonth(month.subtract(1, 'month'))} />
              <Button type="text" size="small" onClick={() => { setMonth(dayjs()); pickDate(dayjs()); }}>
                今天
              </Button>
              <Button type="text" size="small" icon={<RightOutlined />} onClick={() => setMonth(month.add(1, 'month'))} />
            </div>
          </div>
          <div className="logs-week">
            {WEEK_LABELS.map((w) => (
              <span key={w}>{w}</span>
            ))}
          </div>
          <div className="logs-grid">
            {cells.map(({ date, inMonth }) => {
              const key = date.format('YYYY-MM-DD');
              const list = runsByDate.get(key) || [];
              const hasFailed = list.some((r) => r.status === 'FAILED');
              const hasSuccess = list.some((r) => r.status === 'SUCCESS');
              const hasRunning = list.some((r) => r.status === 'RUNNING');
              return (
                <button
                  key={key}
                  type="button"
                  className={[
                    'logs-day',
                    inMonth ? '' : 'is-out',
                    key === selectedDate ? 'is-selected' : '',
                    key === today ? 'is-today' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => pickDate(date)}
                >
                  <span className="logs-day-num">{date.date()}</span>
                  <span className="logs-day-dots">
                    {hasFailed ? <i className="dot dot--danger" /> : null}
                    {hasRunning ? <i className="dot dot--info" /> : null}
                    {hasSuccess ? <i className="dot dot--success" /> : null}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="logs-legend">
            <span><i className="dot dot--success" /> 成功</span>
            <span><i className="dot dot--danger" /> 失败</span>
            <span><i className="dot dot--info" /> 运行中</span>
          </div>
        </section>

        <section className="card logs-runs">
          <div className="logs-section-head">
            <div>
              <div className="logs-section-title">{dayjs(selectedDate).format('M 月 D 日')} 执行记录</div>
              <div className="logs-section-sub">{dayRuns.length ? `共 ${dayRuns.length} 次执行` : '当天没有执行记录'}</div>
            </div>
            <CalendarOutlined style={{ color: 'var(--text-tertiary)' }} />
          </div>
          <div className="logs-run-scroll">
            {loading ? (
              <Skeleton active paragraph={{ rows: 8 }} title={false} />
            ) : dayRuns.length === 0 ? (
              <div className="col-empty">当天暂无执行记录</div>
            ) : (
              dayRuns.map((run) => (
                <button
                  key={run.id}
                  type="button"
                  className={`log-run-card${selectedRun?.id === run.id ? ' is-active' : ''}`}
                  onClick={() => {
                    setSelectedRunId(run.id);
                    setSelectedNodeId(null);
                  }}
                >
                  <div className="log-run-top">
                    <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                      {statusIcon(run.status)}
                      <b>{run.flowName}</b>
                    </span>
                    <StatusTag status={run.status} />
                  </div>
                  <div className="log-run-meta">
                    <span>{run.startTime.slice(11, 19)}</span>
                    <span>{durationText(run.durationMs)}</span>
                    {run.nodes.length ? <span>{run.nodes.length} 个节点</span> : null}
                    {runTypeLabel(run) ? <span className="mini-tag">{runTypeLabel(run)}</span> : null}
                    <span className="mini-tag">{run.trigger === 'MANUAL' ? '手动' : run.trigger === 'RETRY' ? '重试' : '调度'}</span>
                  </div>
                </button>
              ))
            )}
          </div>
        </section>

        <section className="card logs-detail">
          {!selectedRun ? (
            <EmptyState
              icon={<CalendarOutlined />}
              title="选择一条执行记录"
              text="在左侧选择日期与执行批次，这里会展示节点级日志、SQL 与错误堆栈。"
            />
          ) : (
            <>
              <div className="logs-section-head">
                <div>
                  <div className="logs-section-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {statusIcon(selectedRun.status, 15)}
                    {selectedRun.flowName}
                    <StatusTag status={selectedRun.status} />
                    {runTypeLabel(selectedRun) ? (
                      <span className="chip">{runTypeLabel(selectedRun)}</span>
                    ) : null}
                  </div>
                  <div className="logs-section-sub mono">{selectedRun.id}</div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <Button size="small" icon={<PlayCircleOutlined />} onClick={() => navigate(`/flow/${selectedRun.flowId}/editor`)}>
                    打开编排
                  </Button>
                </div>
              </div>

              <div className="logs-meta-grid">
                <div><span>开始时间</span><b>{selectedRun.startTime}</b></div>
                <div><span>结束时间</span><b>{selectedRun.endTime || '—'}</b></div>
                <div><span>总耗时</span><b>{durationText(selectedRun.durationMs)}</b></div>
                <div><span>触发方式</span><b>{selectedRun.trigger === 'MANUAL' ? '手动触发' : selectedRun.trigger === 'RETRY' ? '失败重试' : '定时调度'}</b></div>
                <div><span>运行类型</span><b>{runTypeLabel(selectedRun) || '全量任务'}</b></div>
              </div>

              <div className="logs-detail-body">
                <div className="logs-node-list">
                  {selectedRun.nodes.length === 0 ? (
                    <div className="col-empty">该次执行没有节点明细</div>
                  ) : (
                    selectedRun.nodes.map((node) => (
                      <button
                        key={node.nodeId}
                        type="button"
                        className={`log-node-row${selectedNode?.nodeId === node.nodeId ? ' is-active' : ''}`}
                        onClick={() => setSelectedNodeId(node.nodeId)}
                      >
                        <span className="log-node-line" />
                        {statusIcon(node.status, 14)}
                        <span className="log-node-name" title={node.nodeName}>{node.nodeName}</span>
                        <span className="log-node-num">{node.rows == null ? '—' : `${node.rows.toLocaleString()} 行`}</span>
                        <span className="log-node-num">{durationText(node.durationMs)}</span>
                      </button>
                    ))
                  )}
                </div>

                <div className="logs-node-detail">
                  {!selectedNode ? (
                    <div className="col-empty">选择左侧节点查看明细</div>
                  ) : (
                    <>
                      <div className="logs-node-head">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          {statusIcon(selectedNode.status)}
                          <b>{selectedNode.nodeName}</b>
                          <span className="mini-tag">{selectedNode.nodeId}</span>
                          {selectedNode.status === 'FAILED' && selectedNode.failStage ? (
                            <span className="chip chip--danger">
                              失败环节：{FAIL_STAGE_LABEL[selectedNode.failStage] || selectedNode.failStage}
                            </span>
                          ) : null}
                          {selectedNode.targetTable ? (
                            <span className="mini-tag">目标表 {selectedNode.targetTable}</span>
                          ) : null}
                          {selectedNode.rows != null ? (
                            <span className="mini-tag">{selectedNode.rows.toLocaleString()} 行</span>
                          ) : null}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <Button
                            size="small"
                            icon={<PlayCircleOutlined />}
                            disabled={selectedNode.status === 'SKIPPED' || runDetail?.status === 'RUNNING'}
                            onClick={rerunNode}
                          >
                            重跑该节点
                          </Button>
                        </div>
                      </div>

                      <div className="logs-block-title">
                        <span>执行 SQL</span>
                        <Tooltip title="复制 SQL">
                          <Button type="text" size="small" icon={<CopyOutlined />} onClick={copySql} disabled={!nodeSql} />
                        </Tooltip>
                      </div>
                      <pre className="sql-block">
                        {nodeLogLoading ? '-- 正在加载节点 SQL…' : nodeSql || '-- 该节点没有生成 SQL'}
                      </pre>

                      {selectedNode.errorStack ? (
                        <>
                          <div
                            className="logs-block-title"
                            style={{
                              color: 'var(--danger)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                            }}
                          >
                            <span>错误信息</span>
                            <Button size="small" type="link" danger onClick={openErrorDetail}>
                              展示详情
                            </Button>
                          </div>
                          <pre className="sql-block error-block">{selectedNode.errorStack}</pre>
                        </>
                      ) : null}

                      <div className="logs-block-title">
                        <span>运行日志</span>
                      </div>
                      <div className="log-lines">
                        {nodeLog?.list?.length
                          ? nodeLog.list.map((line, i) => (
                              <div key={`${line.message}-${i}`} className="log-line">
                                {line.time ? `${line.time} ` : ''}
                                {line.level ? `[${line.level}] ` : ''}
                                {line.message}
                              </div>
                            ))
                          : selectedNode.logs.map((line, i) => (
                              <div key={`${line}-${i}`} className="log-line">
                                {line}
                              </div>
                            ))}
                      </div>
                    </>
                  )}
                </div>
              </div>
            </>
          )}
        </section>
      </div>

      <Modal
        open={errorDetailOpen}
        onCancel={() => setErrorDetailOpen(false)}
        title={`错误详情 · ${selectedNode?.nodeName || ''}`}
        width={880}
        footer={<Button onClick={() => setErrorDetailOpen(false)}>关闭</Button>}
      >
        {errorDetailLoading ? (
          <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--text-secondary)' }}>
            <Spin /> <span style={{ marginLeft: 8 }}>正在加载错误详情…</span>
          </div>
        ) : errorDetailError ? (
          <Alert type="error" showIcon message="错误详情加载失败" description={errorDetailError} />
        ) : errorDetail ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="logs-meta-grid">
              <div>
                <span>节点</span>
                <b>{errorDetail.nodeName || selectedNode?.nodeName || '—'}</b>
              </div>
              <div>
                <span>状态</span>
                <b>{errorDetail.status || selectedNode?.status || '—'}</b>
              </div>
              <div>
                <span>错误码</span>
                <b>{errorDetail.errorCode != null ? String(errorDetail.errorCode) : '—'}</b>
              </div>
              <div>
                <span>失败环节</span>
                <b>
                  {errorDetail.failStage
                    ? FAIL_STAGE_LABEL[errorDetail.failStage] || errorDetail.failStage
                    : '—'}
                </b>
              </div>
            </div>

            <div>
              <div className="logs-block-title">
                <span>错误信息</span>
                <Tooltip title="复制错误信息">
                  <Button
                    type="text"
                    size="small"
                    icon={<CopyOutlined />}
                    onClick={() => copyText(errorDetail.errMsg, '错误信息')}
                    disabled={!errorDetail.errMsg}
                  />
                </Tooltip>
              </div>
              <pre className="sql-block error-block">
                {errorDetail.errMsg || selectedNode?.errorStack || '—'}
              </pre>
            </div>

            <div>
              <div className="logs-block-title">
                <span>执行 SQL</span>
                <Tooltip title="复制 SQL">
                  <Button
                    type="text"
                    size="small"
                    icon={<CopyOutlined />}
                    onClick={() => copyText(errorDetail.sqlText, 'SQL')}
                    disabled={!errorDetail.sqlText}
                  />
                </Tooltip>
              </div>
              <pre className="sql-block" style={{ maxHeight: 240 }}>
                {errorDetail.sqlText || '-- 该节点没有生成 SQL'}
              </pre>
            </div>

            {errorDetail.sqlParams ? (
              <div>
                <div className="logs-block-title">
                  <span>SQL 参数</span>
                  <Tooltip title="复制参数">
                    <Button
                      type="text"
                      size="small"
                      icon={<CopyOutlined />}
                      onClick={() => copyText(errorDetail.sqlParams, 'SQL 参数')}
                    />
                  </Tooltip>
                </div>
                <pre className="sql-block" style={{ maxHeight: 160 }}>
                  {errorDetail.sqlParams}
                </pre>
              </div>
            ) : null}

            <div>
              <div className="logs-block-title">
                <span>Doris Stream Load 日志</span>
                <Tooltip title="复制日志">
                  <Button
                    type="text"
                    size="small"
                    icon={<CopyOutlined />}
                    onClick={() => copyText(errorDetail.streamLoadLog, 'Stream Load 日志')}
                    disabled={!errorDetail.streamLoadLog}
                  />
                </Tooltip>
              </div>
              {!errorDetail.errorUrl ? (
                <div className="form-hint">该错误没有可提取的 Stream Load 日志链接</div>
              ) : errorDetail.fetchError ? (
                <Alert
                  type="warning"
                  showIcon
                  message="Stream Load 日志提取失败"
                  description={
                    <div>
                      <div>{errorDetail.fetchError}</div>
                      <div style={{ marginTop: 6 }}>
                        <a href={errorDetail.errorUrl} target="_blank" rel="noreferrer">
                          打开原始错误链接
                        </a>
                      </div>
                    </div>
                  }
                />
              ) : errorDetail.streamLoadLog ? (
                <>
                  <pre className="sql-block" style={{ maxHeight: 320 }}>
                    {errorDetail.streamLoadLog}
                  </pre>
                  {errorDetail.streamLoadLogTruncated ? (
                    <div className="form-hint">日志较长，已截断展示。</div>
                  ) : null}
                  <div className="form-hint" style={{ marginTop: 4 }}>
                    <a href={errorDetail.errorUrl} target="_blank" rel="noreferrer">
                      查看原始错误链接
                    </a>
                  </div>
                </>
              ) : (
                <div className="form-hint">已获取错误链接，但未提取到日志内容。</div>
              )}
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
