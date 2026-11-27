import { create } from 'zustand';
import {
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type EdgeChange,
  type NodeChange,
} from '@xyflow/react';
import type { AnyNodeConfig, FlowDetail, FlowEdge, FlowNode, FlowViewport } from '../../types';
import { getFlow, saveDag } from '../../api/flow';
import { displayLabel, toDagJson } from '../../utils/dagJson';

export type SaveStatus = 'saved' | 'dirty' | 'saving' | 'error';

export interface NodeDraft {
  config: AnyNodeConfig;
  label: string;
  color: string;
}

/** 面板首次归一化写入的基线；与草稿全等时不算修改。 */
export type NodeBaseline = NodeDraft;

export function savedDraftOf(node: FlowNode): NodeDraft {
  return { config: node.data.config, label: node.data.label, color: node.data.color };
}

export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((item, index) => deepEqual(item, b[index]));
  }
  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  const keys = Object.keys(left);
  if (keys.length !== Object.keys(right).length) return false;
  return keys.every((key) => deepEqual(left[key], right[key]));
}

/** 草稿与基线（缺省为节点已保存值）逐字段深比较，只有真实差异才算脏。 */
export function draftDirty(
  node: FlowNode | undefined,
  draft: NodeDraft | undefined,
  baseline: NodeBaseline | undefined,
): boolean {
  if (!draft) return false;
  const base = baseline || (node ? savedDraftOf(node) : undefined);
  return !base || !deepEqual(draft, base);
}

export function dirtyDraftIds(
  nodes: FlowNode[],
  drafts: Record<string, NodeDraft>,
  baselines: Record<string, NodeBaseline>,
): string[] {
  return Object.keys(drafts).filter((id) =>
    draftDirty(
      nodes.find((n) => n.id === id),
      drafts[id],
      baselines[id],
    ),
  );
}

function persistNodes(nodes: FlowNode[]): FlowNode[] {
  return nodes.map(({ selected, data, ...rest }) => {
    const { runStatus, ...persistedData } = data;
    return { ...rest, selected: false, data: persistedData };
  }) as FlowNode[];
}

export interface DraftPrompt {
  /** 选择的目标节点；null = 关闭抽屉。 */
  nextId: string | null;
  /** select：切换/关闭节点；action：运行等操作前处理草稿。 */
  mode: 'select' | 'action';
}

let draftActionResolve: ((ok: boolean) => void) | null = null;

interface FlowState {
  flow: FlowDetail | null;
  nodes: FlowNode[];
  edges: FlowEdge[];
  selectedNodeId: string | null;
  loading: boolean;
  error: string | null;
  saveStatus: SaveStatus;
  saveError: string | null;
  lastSavedAt: string | null;
  changeSeq: number;
  viewport: FlowViewport;
  /** 节点配置草稿：只在前端内存，画布保存不会写入。 */
  drafts: Record<string, NodeDraft>;
  /** 首次归一化形成的比较基线；草稿与基线全等即视为未修改。 */
  baselines: Record<string, NodeBaseline>;
  pendingDraft: DraftPrompt | null;
  /** 顶部导航离开编辑器时待确认的目标路径。 */
  pendingLeavePath: string | null;
  load: (id: string) => Promise<void>;
  setNodes: (nodes: FlowNode[]) => void;
  onNodesChange: (changes: NodeChange<FlowNode>[]) => void;
  onEdgesChange: (changes: EdgeChange<FlowEdge>[]) => void;
  connect: (conn: Connection) => void;
  addNode: (node: FlowNode) => void;
  removeNodes: (ids: string[]) => void;
  updateNodeConfig: (id: string, config: AnyNodeConfig) => void;
  updateNodeConfigSilent: (id: string, config: AnyNodeConfig) => void;
  updateNodeData: (id: string, patch: Partial<FlowNode['data']>) => void;
  discardDraft: (id: string) => void;
  /** 返回 null 表示保存成功；否则返回后端中文原因（草稿已回滚保留）。 */
  saveNodeDraft: (id: string) => Promise<string | null>;
  requestSelect: (nextId: string | null) => void;
  resolveDraftPrompt: (action: 'save' | 'discard' | 'cancel') => Promise<string | null>;
  whenDraftsResolved: () => Promise<boolean>;
  /** 路由离开前请求确认；无脏草稿时返回 true 表示可直接跳转。 */
  requestLeave: (path: string) => boolean;
  resolveLeave: (action: 'save' | 'discard' | 'cancel') => Promise<{ go: boolean; error?: string }>;
  setRunStatus: (id: string, status: FlowNode['data']['runStatus']) => void;
  setSelected: (id: string | null) => void;
  setViewport: (viewport: FlowViewport) => void;
  swapJoinInputs: (nodeId: string) => void;
  setFlowMeta: (patch: Partial<FlowDetail>) => void;
  save: (force?: boolean) => Promise<void>;
}

function nowTime() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

let edgeSeq = 0;

export const useFlowStore = create<FlowState>((set, get) => ({
  flow: null,
  nodes: [],
  edges: [],
  selectedNodeId: null,
  loading: true,
  error: null,
  saveStatus: 'saved',
  saveError: null,
  lastSavedAt: null,
  changeSeq: 0,
  viewport: { x: 0, y: 0, zoom: 1 },
  drafts: {},
  baselines: {},
  pendingDraft: null,
  pendingLeavePath: null,

  load: async (id) => {
    draftActionResolve = null;
    set({
      loading: true,
      error: null,
      selectedNodeId: null,
      changeSeq: 0,
      drafts: {},
      baselines: {},
      pendingDraft: null,
      pendingLeavePath: null,
    });
    try {
      const flow = await getFlow(id);
      set({
        flow,
        nodes: (flow.nodes || []).map((n) => ({
          ...n,
          selected: false,
          data: { ...n.data, label: displayLabel(n.data.kind, n.data.label), runStatus: null },
        })),
        edges: flow.edges || [],
        viewport: flow.viewport || { x: 0, y: 0, zoom: 1 },
        loading: false,
        saveStatus: 'saved',
        saveError: null,
        lastSavedAt: flow.updateTime?.slice(11, 19) || null,
      });
    } catch (e) {
      set({ loading: false, error: (e as Error).message || '任务加载失败' });
    }
  },

  setNodes: (nodes) => set({ nodes }),

  onNodesChange: (changes) => {
    const prev = get();
    const nodes = applyNodeChanges(changes, prev.nodes) as FlowNode[];
    const removed = changes.filter((c) => c.type === 'remove').map((c) => (c as { id: string }).id);
    let edges = prev.edges;
    if (removed.length) {
      const ids = new Set(nodes.map((n) => n.id));
      edges = edges.filter((e) => ids.has(e.source) && ids.has(e.target));
    }
    const structural = changes.some(
      (c) => c.type !== 'select' && c.type !== 'dimensions',
    );
    set({
      nodes,
      edges,
      changeSeq: structural ? prev.changeSeq + 1 : prev.changeSeq,
      saveStatus: structural ? 'dirty' : prev.saveStatus,
    });
  },

  onEdgesChange: (changes) => {
    const prev = get();
    const edges = applyEdgeChanges(changes, prev.edges) as FlowEdge[];
    const structural = changes.some((c) => c.type !== 'select');
    set({
      edges,
      changeSeq: structural ? prev.changeSeq + 1 : prev.changeSeq,
      saveStatus: structural ? 'dirty' : prev.saveStatus,
    });
  },

  connect: (conn) => {
    if (!conn.source || !conn.target) return;
    const prev = get();
    const edge: FlowEdge = {
      id: `edge_${Date.now().toString(36)}_${edgeSeq++}`,
      source: conn.source,
      target: conn.target,
      sourceHandle: conn.sourceHandle || 'out',
      targetHandle: conn.targetHandle || 'in-0',
      type: 'smoothstep',
    };
    set({
      edges: [...prev.edges, edge],
      changeSeq: prev.changeSeq + 1,
      saveStatus: 'dirty',
    });
  },

  addNode: (node) => {
    const prev = get();
    set({
      nodes: [...prev.nodes.map((n) => ({ ...n, selected: false })), { ...node, selected: true }],
      selectedNodeId: node.id,
      changeSeq: prev.changeSeq + 1,
      saveStatus: 'dirty',
    });
  },

  removeNodes: (ids) => {
    const prev = get();
    const idSet = new Set(ids);
    const drafts = { ...prev.drafts };
    const baselines = { ...prev.baselines };
    ids.forEach((id) => {
      delete drafts[id];
      delete baselines[id];
    });
    set({
      nodes: prev.nodes.filter((n) => !idSet.has(n.id)),
      edges: prev.edges.filter((e) => !idSet.has(e.source) && !idSet.has(e.target)),
      selectedNodeId: prev.selectedNodeId && idSet.has(prev.selectedNodeId) ? null : prev.selectedNodeId,
      changeSeq: prev.changeSeq + 1,
      saveStatus: 'dirty',
      drafts,
      baselines,
    });
  },

  updateNodeConfig: (id, config) => {
    const prev = get();
    const node = prev.nodes.find((n) => n.id === id);
    if (!node) return;
    const baseline = prev.baselines[id] || savedDraftOf(node);
    const current = prev.drafts[id] || baseline;
    const next: NodeDraft = { ...current, config };
    const drafts = { ...prev.drafts };
    // 和基线一致时视为回到原值：删掉草稿，脏标记随之消失。
    if (deepEqual(next, baseline)) delete drafts[id];
    else drafts[id] = next;
    set({
      drafts,
      baselines: prev.baselines[id] ? prev.baselines : { ...prev.baselines, [id]: baseline },
    });
  },

  updateNodeConfigSilent: (id, config) => {
    const prev = get();
    const node = prev.nodes.find((n) => n.id === id);
    if (!node) return;
    if (!prev.baselines[id]) {
      // 首次归一化只建立基线：归一化结果作为基线，不产生脏标记。
      const baseline: NodeDraft = { config, label: node.data.label, color: node.data.color };
      set({
        drafts: { ...prev.drafts, [id]: baseline },
        baselines: { ...prev.baselines, [id]: baseline },
      });
      return;
    }
    get().updateNodeConfig(id, config);
  },

  updateNodeData: (id, patch) => {
    const prev = get();
    const node = prev.nodes.find((n) => n.id === id);
    if (!node) return;
    const baseline = prev.baselines[id] || savedDraftOf(node);
    const current = prev.drafts[id] || baseline;
    const next: NodeDraft = {
      ...current,
      ...(typeof patch.label === 'string' ? { label: patch.label } : {}),
      ...(typeof patch.color === 'string' ? { color: patch.color } : {}),
    };
    const drafts = { ...prev.drafts };
    if (deepEqual(next, baseline)) delete drafts[id];
    else drafts[id] = next;
    set({
      drafts,
      baselines: prev.baselines[id] ? prev.baselines : { ...prev.baselines, [id]: baseline },
    });
  },

  discardDraft: (id) => {
    const prev = get();
    if (!prev.drafts[id]) return;
    const drafts = { ...prev.drafts };
    delete drafts[id];
    set({ drafts });
  },

  saveNodeDraft: async (id) => {
    const prev = get();
    const draft = prev.drafts[id];
    const node = prev.nodes.find((n) => n.id === id);
    if (!draft || !node) return null;
    if (!draftDirty(node, draft, prev.baselines[id])) {
      get().discardDraft(id);
      return null;
    }
    const flow = prev.flow;
    if (!flow) return '任务尚未加载完成，请稍后重试';
    const prevNodes = prev.nodes;
    const prevDrafts = prev.drafts;
    const prevBaselines = prev.baselines;
    const mergedNodes = prevNodes.map((n) =>
      n.id === id
        ? { ...n, data: { ...n.data, config: draft.config, label: draft.label, color: draft.color } }
        : n,
    );
    const drafts = { ...prevDrafts };
    delete drafts[id];
    set({ nodes: mergedNodes, drafts, saveStatus: 'saving', saveError: null });
    try {
      await saveDag(flow.id, {
        nodes: persistNodes(mergedNodes),
        edges: prev.edges,
        viewport: prev.viewport,
        dagJson: toDagJson(mergedNodes, prev.edges),
      });
      set({
        saveStatus: 'saved',
        saveError: null,
        lastSavedAt: nowTime(),
        baselines: { ...prevBaselines, [id]: draft },
      });
      return null;
    } catch (e) {
      // 保存失败：画布回滚到保存前，草稿恢复，保持脏状态。
      set({
        nodes: prevNodes,
        drafts: prevDrafts,
        baselines: prevBaselines,
        saveStatus: prev.saveStatus,
        saveError: null,
      });
      return (e as Error).message || '节点配置保存失败';
    }
  },

  requestSelect: (nextId) => {
    const prev = get();
    const current = prev.selectedNodeId;
    if (current === nextId) return;
    const currentDirty = Boolean(
      current &&
        draftDirty(
          prev.nodes.find((n) => n.id === current),
          prev.drafts[current],
          prev.baselines[current],
        ),
    );
    if (current && currentDirty) {
      set({ pendingDraft: { nextId, mode: 'select' } });
      return;
    }
    if (current && prev.drafts[current]) get().discardDraft(current);
    get().setSelected(nextId);
  },

  resolveDraftPrompt: async (action) => {
    const prev = get();
    const pending = prev.pendingDraft;
    if (!pending) return null;
    const current = prev.selectedNodeId;
    const currentDirty = Boolean(
      current &&
        draftDirty(
          prev.nodes.find((n) => n.id === current),
          prev.drafts[current],
          prev.baselines[current],
        ),
    );
    if (pending.mode === 'action') {
      set({ pendingDraft: null });
      const resolve = draftActionResolve;
      draftActionResolve = null;
      if (action === 'cancel' || !current || !currentDirty) {
        resolve?.(false);
        return null;
      }
      if (action === 'save') {
        const err = await get().saveNodeDraft(current);
        if (err) {
          resolve?.(false);
          return err;
        }
      } else {
        get().discardDraft(current);
      }
      resolve?.(true);
      return null;
    }
    set({ pendingDraft: null });
    if (action === 'cancel' || !current || !currentDirty) {
      if (action !== 'cancel' && pending.nextId !== current) get().setSelected(pending.nextId);
      return null;
    }
    if (action === 'save') {
      const err = await get().saveNodeDraft(current);
      if (err) return err;
    } else {
      get().discardDraft(current);
    }
    get().setSelected(pending.nextId);
    return null;
  },

  whenDraftsResolved: () => {
    const prev = get();
    const current = prev.selectedNodeId;
    const currentDirty = Boolean(
      current &&
        draftDirty(
          prev.nodes.find((n) => n.id === current),
          prev.drafts[current],
          prev.baselines[current],
        ),
    );
    if (!current || !currentDirty) return Promise.resolve(true);
    return new Promise<boolean>((resolve) => {
      draftActionResolve = resolve;
      set({ pendingDraft: { nextId: current, mode: 'action' } });
    });
  },

  requestLeave: (path) => {
    const prev = get();
    if (!dirtyDraftIds(prev.nodes, prev.drafts, prev.baselines).length) return true;
    set({ pendingLeavePath: path });
    return false;
  },

  resolveLeave: async (action) => {
    const prev = get();
    if (!prev.pendingLeavePath) return { go: false };
    if (action === 'cancel') {
      set({ pendingLeavePath: null });
      return { go: false };
    }
    if (action === 'discard') {
      set({ drafts: {}, baselines: {}, pendingLeavePath: null });
      return { go: true };
    }
    const ids = dirtyDraftIds(prev.nodes, prev.drafts, prev.baselines);
    for (const id of ids) {
      const err = await get().saveNodeDraft(id);
      if (err) return { go: false, error: err };
    }
    set({ pendingLeavePath: null });
    return { go: true };
  },

  setRunStatus: (id, status) => {
    const prev = get();
    set({
      nodes: prev.nodes.map((n) => (n.id === id ? { ...n, data: { ...n.data, runStatus: status } } : n)),
    });
  },

  setSelected: (id) => {
    const prev = get();
    set({
      selectedNodeId: id,
      nodes: prev.nodes.map((n) => ({ ...n, selected: n.id === id })),
    });
  },

  setViewport: (viewport) => set({ viewport }),

  setFlowMeta: (patch) => {
    const flow = get().flow;
    if (flow) set({ flow: { ...flow, ...patch } });
  },

  swapJoinInputs: (nodeId) => {
    const prev = get();
    const ins = prev.edges.filter((e) => e.target === nodeId);
    if (ins.length !== 2) return;
    const [a, b] = ins;
    const next = prev.edges.map((e) => {
      if (e.id === a.id) return { ...e, targetHandle: b.targetHandle || 'in-1' };
      if (e.id === b.id) return { ...e, targetHandle: a.targetHandle || 'in-0' };
      return e;
    });
    set({ edges: next, changeSeq: prev.changeSeq + 1, saveStatus: 'dirty' });
  },

  save: async (force = false) => {
    const { flow, nodes, edges, viewport, changeSeq, saveStatus } = get();
    if (!flow) return;
    if (!force && saveStatus === 'saving') return;
    if (!force && changeSeq === 0) return;
    set({ saveStatus: 'saving' });
    try {
      await saveDag(flow.id, {
        nodes: nodes.map(({ selected, data, ...rest }) => {
          const { runStatus, ...persistedData } = data;
          return { ...rest, selected: false, data: persistedData };
        }) as FlowNode[],
        edges,
        viewport,
        dagJson: toDagJson(nodes, edges),
      });
      set({
        saveStatus: 'saved',
        saveError: null,
        lastSavedAt: nowTime(),
        changeSeq: get().changeSeq,
      });
    } catch (e) {
      set({ saveStatus: 'error', saveError: (e as Error).message || '画布保存失败' });
    }
  },
}));
