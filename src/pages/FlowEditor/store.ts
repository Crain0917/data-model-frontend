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
import { toDagJson } from '../../utils/dagJson';

export type SaveStatus = 'saved' | 'dirty' | 'saving' | 'error';

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

  load: async (id) => {
    set({ loading: true, error: null, selectedNodeId: null, changeSeq: 0 });
    try {
      const flow = await getFlow(id);
      set({
        flow,
        nodes: (flow.nodes || []).map((n) => ({
          ...n,
          selected: false,
          data: { ...n.data, runStatus: null },
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
    set({
      nodes: prev.nodes.filter((n) => !idSet.has(n.id)),
      edges: prev.edges.filter((e) => !idSet.has(e.source) && !idSet.has(e.target)),
      selectedNodeId: prev.selectedNodeId && idSet.has(prev.selectedNodeId) ? null : prev.selectedNodeId,
      changeSeq: prev.changeSeq + 1,
      saveStatus: 'dirty',
    });
  },

  updateNodeConfig: (id, config) => {
    const prev = get();
    set({
      nodes: prev.nodes.map((n) => (n.id === id ? { ...n, data: { ...n.data, config } } : n)),
      changeSeq: prev.changeSeq + 1,
      saveStatus: 'dirty',
    });
  },

  updateNodeConfigSilent: (id, config) => {
    const prev = get();
    set({
      nodes: prev.nodes.map((n) => (n.id === id ? { ...n, data: { ...n.data, config } } : n)),
    });
  },

  updateNodeData: (id, patch) => {
    const prev = get();
    set({
      nodes: prev.nodes.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...patch } } : n)),
      changeSeq: prev.changeSeq + 1,
      saveStatus: 'dirty',
    });
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
