import type {
  FlowDeleteResult,
  FlowDetail,
  FlowRun,
  FlowSummary,
  NodeDataPreview,
  NodeLogs,
  NodeRun,
  PageResult,
  RunStatus,
  SinkPreviewMeta,
} from '../types';
import type { DagJson } from '../utils/dagJson';
import { fromDagJson, toDagJson } from '../utils/dagJson';
import { http } from './http';
import { flowMock } from './mock/flowMock';

export const USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true';

export interface NodeSqlPreview {
  sql: string;
  params?: unknown[];
  displaySql?: string;
  dialect?: string;
  upstreamMissing?: string[];
  sink?: SinkPreviewMeta;
}

export interface SaveDagPayload {
  nodes: FlowDetail['nodes'];
  edges: FlowDetail['edges'];
  viewport?: FlowDetail['viewport'];
  dagJson?: DagJson | unknown;
}

interface RawFlow {
  id: number | string;
  name?: string;
  description?: string;
  nodeCount?: number;
  lastRunStatus?: string | null;
  lastRunTime?: string | null;
  createTime?: string;
  updateTime?: string;
  dagJson?: unknown;
}

interface RawWatermark {
  column?: string | null;
  value?: string | null;
  lastRowid?: number | null;
  committedRows?: number | null;
  lastBatchNo?: number | null;
}

interface RawNodeRun {
  nodeId: string;
  nodeType?: string;
  nodeName?: string;
  status?: string;
  rowCount?: number | null;
  costMs?: number | null;
  targetTable?: string | null;
  writeMode?: string | null;
  errMsg?: string | null;
  failStage?: string | null;
  errorCode?: number | null;
  sqlText?: string | null;
  params?: string | null;
  watermark?: RawWatermark | null;
  startTime?: string;
  endTime?: string | null;
}

interface RawFlowRun {
  runId: number | string;
  flowId: number | string;
  flowName?: string;
  runType?: string;
  targetNodeId?: string | null;
  status?: string;
  startTime?: string;
  endTime?: string | null;
  costMs?: number | null;
  errMsg?: string | null;
  nodes?: RawNodeRun[];
}

function normalizeStatus(status?: string | null): RunStatus | null {
  const value = (status || '').toUpperCase();
  if (value === 'SUCCESS' || value === 'FAILED' || value === 'RUNNING' || value === 'SKIPPED' || value === 'WAITING') {
    return value;
  }
  if (value === 'PENDING') return 'PENDING';
  return null;
}

function mapSummary(raw: RawFlow): FlowSummary {
  const status = normalizeStatus(raw.lastRunStatus);
  return {
    id: String(raw.id),
    name: raw.name || `任务 ${raw.id}`,
    description: raw.description || '',
    nodeCount: raw.nodeCount ?? 0,
    lastRunStatus: status === 'PENDING' || status === 'WAITING' ? 'RUNNING' : status,
    lastRunTime: raw.lastRunTime || null,
    updateTime: raw.updateTime || '',
    createTime: raw.createTime || '',
  };
}

function mapDetail(raw: RawFlow): FlowDetail {
  const { nodes, edges, viewport } = fromDagJson(raw.dagJson);
  const sources = nodes
    .filter((n) => n.data.kind === 'source')
    .map((n) => (n.data.config as { dataSourceId?: number | null }).dataSourceId)
    .filter((id): id is number => typeof id === 'number');
  return {
    ...mapSummary(raw),
    nodes,
    edges,
    viewport,
    dataSourceId: sources.length ? sources[0] : null,
    dagJson: raw.dagJson,
  };
}

function mapNodeRun(raw: RawNodeRun): NodeRun {
  const status = normalizeStatus(raw.status) || 'WAITING';
  const wm = raw.watermark;
  return {
    nodeId: raw.nodeId,
    nodeType: raw.nodeType,
    nodeName: raw.nodeName || raw.nodeId,
    status,
    rows: raw.rowCount ?? null,
    durationMs: raw.costMs ?? null,
    sql: raw.targetTable ? `-- 物化表 ${raw.targetTable}` : undefined,
    logs: [],
    errorStack: raw.errMsg || undefined,
    failStage: raw.failStage || undefined,
    targetTable: raw.targetTable || undefined,
    writeMode: raw.writeMode ?? null,
    errorCode: raw.errorCode ?? null,
    sqlText: raw.sqlText ?? null,
    params: raw.params ?? null,
    watermark: wm
      ? {
          column: wm.column ?? null,
          value: wm.value ?? null,
          lastRowid: wm.lastRowid ?? null,
          committedRows: wm.committedRows ?? null,
          lastBatchNo: wm.lastBatchNo ?? null,
        }
      : null,
  };
}

function mapRun(raw: RawFlowRun): FlowRun {
  return {
    id: String(raw.runId),
    flowId: String(raw.flowId),
    flowName: raw.flowName || `任务 ${raw.flowId}`,
    status: normalizeStatus(raw.status) || 'RUNNING',
    startTime: raw.startTime || '',
    endTime: raw.endTime || null,
    durationMs: raw.costMs ?? null,
    trigger: 'MANUAL',
    runType: raw.runType === 'NODE' ? 'NODE' : 'FULL',
    targetNodeId: raw.targetNodeId || null,
    errMsg: raw.errMsg || null,
    nodes: (raw.nodes || []).map(mapNodeRun),
  };
}

async function fetchFlow(id: string): Promise<RawFlow> {
  return (await http.get(`/flow/${id}`)) as unknown as RawFlow;
}

export async function listFlows(keyword?: string, page = 1, size = 200): Promise<FlowSummary[]> {
  if (USE_MOCK) return flowMock.list(keyword);
  const res = (await http.get('/flow', {
    params: { keyword: keyword || undefined, page, size },
  })) as unknown as PageResult<RawFlow>;
  return (res.list || []).map(mapSummary);
}

export async function getFlow(id: string): Promise<FlowDetail> {
  if (USE_MOCK) return flowMock.get(id);
  return mapDetail(await fetchFlow(id));
}

export async function createFlow(name: string, description: string): Promise<FlowDetail> {
  if (USE_MOCK) return flowMock.create(name, description);
  const res = (await http.post('/flow', { name, description })) as unknown as { id: number | string };
  const id = String(res.id);
  return {
    id,
    name,
    description,
    nodeCount: 0,
    lastRunStatus: null,
    lastRunTime: null,
    updateTime: '',
    createTime: '',
    nodes: [],
    edges: [],
    dagJson: { nodes: [], edges: [] },
  };
}

export interface FlowMetaUpdate {
  name?: string;
  description?: string;
}

export interface FlowMetaResult {
  id: string;
  name: string;
  description: string;
  updateTime?: string;
}

/** 契约 §3.14：只改名称与描述，不动画布。 */
export async function updateFlow(id: string, payload: FlowMetaUpdate): Promise<FlowMetaResult> {
  if (USE_MOCK) {
    await flowMock.updateMeta(id, payload);
    const flow = await flowMock.get(id);
    return { id, name: flow.name, description: flow.description, updateTime: flow.updateTime };
  }
  const res = (await http.put(`/flow/${id}`, payload)) as unknown as {
    id: number | string;
    name: string;
    description?: string;
    updateTime?: string;
  };
  return {
    id: String(res.id),
    name: res.name,
    description: res.description || '',
    updateTime: res.updateTime,
  };
}

/** 契约 §3.5：confirmName 必填，服务端 trim 后精确匹配，否则 4010。 */
export async function deleteFlow(id: string, confirmName: string): Promise<FlowDeleteResult> {
  if (USE_MOCK) {
    await flowMock.remove(id);
    return { deletedTables: [], failedTables: [] };
  }
  return (await http.delete(`/flow/${id}`, {
    params: { confirmName },
  })) as unknown as FlowDeleteResult;
}

export async function duplicateFlow(id: string): Promise<FlowDetail> {
  if (USE_MOCK) return flowMock.duplicate(id);
  const source = await getFlow(id);
  const copy = await createFlow(`${source.name} 副本`.slice(0, 128), source.description || '');
  if (source.dagJson) {
    try {
      await saveDag(copy.id, {
        nodes: source.nodes,
        edges: source.edges,
        dagJson: source.dagJson as DagJson,
      });
    } catch (e) {
      // 画布保存失败时不留下空任务副本
      try {
        await deleteFlow(copy.id, copy.name);
      } catch {
        // 回滚失败时保留后端错误作为主因
      }
      throw e;
    }
  }
  return getFlow(copy.id);
}

export async function saveDag(id: string, payload: SaveDagPayload): Promise<void> {
  if (USE_MOCK) return flowMock.saveDag(id, payload);
  const dagJson = payload.dagJson || toDagJson(payload.nodes, payload.edges);
  await http.put(`/flow/${id}/dag`, { dagJson });
}

export async function previewNodeSql(
  flowId: string,
  nodeId: string,
  dagJson?: unknown,
): Promise<NodeSqlPreview> {
  if (USE_MOCK) {
    return {
      sql: '',
      params: [],
      displaySql: '-- Mock 模式未连接后端，SQL 预览不可用',
      dialect: 'DORIS',
      upstreamMissing: [],
    };
  }
  return http.post(`/flow/${flowId}/node/${nodeId}/sql`, { dagJson: dagJson ?? null, dialect: 'DORIS' });
}

export async function previewNodeData(
  flowId: string,
  nodeId: string,
  dagJson?: unknown,
  limit = 100,
): Promise<NodeDataPreview> {
  if (USE_MOCK) {
    return flowMock.previewData(flowId, nodeId, limit);
  }
  return http.post(`/flow/${flowId}/node/${nodeId}/data`, { dagJson: dagJson ?? null, limit });
}

export async function startRun(flowId: string): Promise<string> {
  if (USE_MOCK) return flowMock.startRun(flowId);
  const res = (await http.post(`/flow/${flowId}/run`)) as unknown as { runId: number | string };
  return String(res.runId);
}

export async function startNodeRun(
  flowId: string,
  nodeId: string,
  reuseUpstream = false,
): Promise<string> {
  if (USE_MOCK) return flowMock.startNodeRun(flowId, nodeId);
  const res = (await http.post(`/flow/${flowId}/node/${nodeId}/run`, null, {
    params: { reuseUpstream },
  })) as unknown as { runId: number | string };
  return String(res.runId);
}

export async function getRun(runId: string): Promise<FlowRun> {
  if (USE_MOCK) return flowMock.getRun(runId);
  return mapRun((await http.get(`/flow-run/${runId}`)) as unknown as RawFlowRun);
}

export async function listRuns(flowId?: string): Promise<FlowRun[]> {
  if (USE_MOCK) return flowMock.runs(flowId);
  if (flowId) {
    const res = (await http.get(`/flow/${flowId}/runs`, {
      params: { page: 1, size: 200 },
    })) as unknown as PageResult<RawFlowRun>;
    return (res.list || []).map(mapRun);
  }
  const flows = await listFlows(undefined, 1, 200);
  const settled = await Promise.allSettled(
    flows.map((f) =>
      http.get(`/flow/${f.id}/runs`, { params: { page: 1, size: 200 } }) as unknown as Promise<
        PageResult<RawFlowRun>
      >,
    ),
  );
  const all: FlowRun[] = [];
  for (const item of settled) {
    if (item.status === 'fulfilled') {
      all.push(...(item.value.list || []).map(mapRun));
    }
  }
  return all.sort((a, b) => b.startTime.localeCompare(a.startTime));
}

export async function getNodeLogs(runId: string, nodeId: string): Promise<NodeLogs> {
  if (USE_MOCK) return flowMock.nodeLogs(runId, nodeId);
  return (await http.get(
    `/flow-run/${runId}/node/${nodeId}/logs`,
  )) as unknown as NodeLogs;
}
