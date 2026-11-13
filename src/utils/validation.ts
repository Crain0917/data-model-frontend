import type { FlowEdge, FlowNode, FlowNodeKind } from '../types';

const SINGLE_INPUT: FlowNodeKind[] = ['filter', 'groupBy', 'sink'];

export function wouldCreateCycle(source: string, target: string, edges: FlowEdge[]): boolean {
  if (source === target) return true;
  const adj = new Map<string, string[]>();
  for (const e of edges) {
    if (!adj.has(e.source)) adj.set(e.source, []);
    adj.get(e.source)!.push(e.target);
  }
  const seen = new Set<string>();
  const stack = [target];
  while (stack.length) {
    const cur = stack.pop()!;
    if (cur === source) return true;
    if (seen.has(cur)) continue;
    seen.add(cur);
    for (const next of adj.get(cur) || []) stack.push(next);
  }
  return false;
}

export function findCycleNode(nodes: FlowNode[], edges: FlowEdge[]): string | null {
  const adj = new Map<string, string[]>();
  for (const e of edges) {
    if (!adj.has(e.source)) adj.set(e.source, []);
    adj.get(e.source)!.push(e.target);
  }
  const state = new Map<string, number>();
  let cycleNode: string | null = null;
  const dfs = (n: string): boolean => {
    state.set(n, 1);
    for (const next of adj.get(n) || []) {
      const s = state.get(next) || 0;
      if (s === 1) {
        cycleNode = next;
        return true;
      }
      if (s === 0 && dfs(next)) return true;
    }
    state.set(n, 2);
    return false;
  };
  for (const node of nodes) {
    if (!state.get(node.id) && dfs(node.id)) break;
  }
  return cycleNode;
}

export function edgeCountByHandle(target: string, handle: string, edges: FlowEdge[]): number {
  return edges.filter((e) => e.target === target && (e.targetHandle || 'in-0') === handle).length;
}

export interface ConnCheck {
  ok: boolean;
  reason?: string;
}

export function validateConnection(
  sourceId: string | null | undefined,
  targetId: string | null | undefined,
  targetHandle: string | null | undefined,
  nodes: FlowNode[],
  edges: FlowEdge[],
): ConnCheck {
  if (!sourceId || !targetId) return { ok: false };
  const source = nodes.find((n) => n.id === sourceId);
  const target = nodes.find((n) => n.id === targetId);
  if (!source || !target) return { ok: false };
  if (sourceId === targetId) return { ok: false, reason: '不能连接到自身' };
  if (target.data.kind === 'source') return { ok: false, reason: 'Source 节点不能有入线' };

  const handle = targetHandle || 'in-0';
  const incoming = edges.filter((e) => e.target === targetId);

  if (edges.some((e) => e.source === sourceId && e.target === targetId && (e.targetHandle || 'in-0') === handle)) {
    return { ok: false, reason: '这两个节点之间已存在连线' };
  }
  if (target.data.kind === 'join') {
    if (incoming.length >= 2) {
      return { ok: false, reason: 'Join 最多只允许 2 条入线，更多入线请使用 Union' };
    }
    if (edgeCountByHandle(targetId, handle, edges) > 0) {
      return { ok: false, reason: '该输入口已存在连线，请使用另一个输入口' };
    }
  }
  if (SINGLE_INPUT.includes(target.data.kind) && incoming.length >= 1) {
    const label = target.data.kind === 'groupBy' ? 'Group By' : target.data.kind === 'filter' ? 'Filter' : 'Sink';
    return { ok: false, reason: `${label} 只允许 1 条入线` };
  }
  if (wouldCreateCycle(sourceId, targetId, edges)) {
    return { ok: false, reason: '该连线会形成环路，已阻止' };
  }
  return { ok: true };
}

export function dagWarnings(nodes: FlowNode[], edges: FlowEdge[]): string[] {
  const warnings: string[] = [];
  for (const node of nodes) {
    const incoming = edges.filter((e) => e.target === node.id);
    const cfg = node.data.config as Record<string, any>;
    if (node.data.kind === 'source' && !cfg.tableName) warnings.push(`节点「${node.data.label}」未选择数据表`);
    if (node.data.kind === 'join') {
      if (incoming.length !== 2) warnings.push(`节点「${node.data.label}」需要恰好 2 条入线（当前 ${incoming.length} 条）`);
      if (!(cfg.keys || []).length) warnings.push(`节点「${node.data.label}」Join 至少需要 1 个等值 Key`);
    }
    if (node.data.kind === 'groupBy' && !cfg.globalAgg && !(cfg.groups || []).length) {
      warnings.push(`节点「${node.data.label}」未配置分组字段，且未开启全局聚合`);
    }
    if (node.data.kind === 'union' && incoming.length === 0) {
      warnings.push(`节点「${node.data.label}」尚未连接上游`);
    }
    if (node.data.kind === 'filter') {
      const keep = (cfg.select || []).filter((s: any) => s.keep);
      if (!cfg.keepAll && (cfg.select || []).length > 0 && keep.length === 0) {
        warnings.push(`节点「${node.data.label}」未保留任何字段，将使用 SELECT *`);
      }
    }
  }
  return warnings;
}

export function nodeWarning(node: FlowNode, nodes: FlowNode[], edges: FlowEdge[]): string | null {
  const incoming = edges.filter((e) => e.target === node.id);
  const cfg = node.data.config as Record<string, any>;
  switch (node.data.kind) {
    case 'source':
      return cfg.tableName ? null : '未选择数据表';
    case 'join':
      if (incoming.length !== 2) return `需要恰好 2 条入线（当前 ${incoming.length} 条）`;
      if (!(cfg.keys || []).length) return 'Join 至少需要 1 个等值 Key';
      return null;
    case 'groupBy':
      if (!cfg.globalAgg && !(cfg.groups || []).length) return '未配置分组字段';
      return null;
    case 'union':
      return incoming.length === 0 ? '尚未连接上游' : null;
    case 'filter': {
      const keep = (cfg.select || []).filter((s: any) => s.keep);
      if (!cfg.keepAll && (cfg.select || []).length > 0 && keep.length === 0) return '未保留任何字段，将使用 SELECT *';
      return null;
    }
    default:
      return null;
  }
}
