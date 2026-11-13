import type { FlowDetail, FlowRun, FlowSummary } from '../types';
import type { DagJson } from '../utils/dagJson';
import { flowMock } from './mock/flowMock';

// v1 后端 DAG / flow 接口在 M3 交付，前端先走本地持久化，
// 接口路径与契约保持一致，接入时替换为 http 调用即可。
export function listFlows(keyword?: string): Promise<FlowSummary[]> {
  return flowMock.list(keyword);
}

export function getFlow(id: string): Promise<FlowDetail> {
  return flowMock.get(id);
}

export function createFlow(name: string, description: string): Promise<FlowDetail> {
  return flowMock.create(name, description);
}

export function updateFlowMeta(id: string, patch: { name?: string; description?: string }): Promise<void> {
  return flowMock.updateMeta(id, patch);
}

export function deleteFlow(id: string): Promise<void> {
  return flowMock.remove(id);
}

export function duplicateFlow(id: string): Promise<FlowDetail> {
  return flowMock.duplicate(id);
}

export function saveDag(
  id: string,
  payload: {
    nodes: FlowDetail['nodes'];
    edges: FlowDetail['edges'];
    viewport?: FlowDetail['viewport'];
    dagJson?: DagJson;
  },
): Promise<void> {
  return flowMock.saveDag(id, payload);
}

export function listRuns(flowId?: string): Promise<FlowRun[]> {
  return flowMock.runs(flowId);
}

export function appendRun(run: FlowRun): void {
  flowMock.appendRun(run);
}

export function markFlowRun(id: string, status: FlowSummary['lastRunStatus']): void {
  flowMock.markRun(id, status);
}
