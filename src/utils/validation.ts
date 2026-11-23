import type { CalculatorRow, FlowEdge, FlowNode, FlowNodeKind } from '../types';
import { isCalcRowComplete } from './calcOps';
import { findUpstream, outputFields } from './dagUtils';

const SINGLE_INPUT: FlowNodeKind[] = ['filter', 'convert', 'calculator', 'formula', 'groupBy', 'sink'];

const FORMULA_AGGREGATES =
  /\b(COUNT|AVG|MIN|MAX|GROUP_CONCAT|STDDEV\w*|VARIANCE|VAR_\w+|APPROX_COUNT_DISTINCT|PERCENTILE\w*|MEDIAN)\s*\(/i;

const KIND_LABEL: Partial<Record<FlowNodeKind, string>> = {
  source: 'Source',
  filter: 'Filter',
  convert: '类型转换',
  calculator: '计算器',
  formula: '公式',
  groupBy: 'Group By',
  join: 'Join',
  union: 'Union',
  sink: 'Sink',
};

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
    const label = KIND_LABEL[target.data.kind] || '该节点';
    return { ok: false, reason: `${label} 只允许 1 条入线` };
  }
  if (wouldCreateCycle(sourceId, targetId, edges)) {
    return { ok: false, reason: '该连线会形成环路，已阻止' };
  }
  return { ok: true };
}

function upstreamNameSet(node: FlowNode, nodes: FlowNode[], edges: FlowEdge[]): Set<string> {
  const upstream = findUpstream(node.id, nodes, edges);
  const fields = upstream ? outputFields(upstream, nodes, edges) : [];
  return new Set(fields.map((f) => f.name.toLowerCase()));
}

function calculatorIssues(
  cfg: Record<string, any>,
  node: FlowNode,
  nodes: FlowNode[],
  edges: FlowEdge[],
): string[] {
  const rows = ((cfg.calculations || []) as CalculatorRow[]).filter(
    (r) =>
      String(r.output || '').trim() ||
      String(r.fieldA || '').trim() ||
      String(r.fieldB || '').trim() ||
      String(r.fieldC || '').trim() ||
      String(r.literalB || '').trim() ||
      String(r.literalC || '').trim(),
  );
  const complete = rows.filter((r) => isCalcRowComplete(r));
  const issues: string[] = [];
  if (!complete.length) issues.push('尚未配置任何计算');
  else if (complete.length < rows.length) issues.push('存在未完成的计算行');
  const upNames = upstreamNameSet(node, nodes, edges);
  const outs = complete.map((r) => String(r.output).trim());
  const dup = [
    ...new Set(
      outs.filter(
        (o, i) =>
          outs.findIndex((x) => x.toLowerCase() === o.toLowerCase()) !== i ||
          upNames.has(o.toLowerCase()),
      ),
    ),
  ];
  if (dup.length) issues.push(`计算输出字段重名：${dup.join('、')}`);
  return issues;
}

function formulaIssues(
  cfg: Record<string, any>,
  node: FlowNode,
  nodes: FlowNode[],
  edges: FlowEdge[],
): string[] {
  const rows = ((cfg.formulas || []) as Array<Record<string, any>>).filter(
    (r) => String(r.output || '').trim() || String(r.expression || '').trim(),
  );
  const complete = rows.filter(
    (r) => String(r.output || '').trim() && String(r.expression || '').trim(),
  );
  const issues: string[] = [];
  if (!complete.length) issues.push('尚未配置任何公式');
  else if (rows.some((r) => String(r.output || '').trim() && !String(r.expression || '').trim())) {
    issues.push('存在空表达式');
  }
  const upNames = upstreamNameSet(node, nodes, edges);
  const outs = complete.map((r) => String(r.output).trim());
  const dup = [
    ...new Set(
      outs.filter(
        (o, i) =>
          outs.findIndex((x) => x.toLowerCase() === o.toLowerCase()) !== i ||
          upNames.has(o.toLowerCase()),
      ),
    ),
  ];
  if (dup.length) issues.push(`公式输出字段重名：${dup.join('、')}`);
  const refs = new Set<string>();
  complete.forEach((r) => {
    const re = /\[([^\]]+)\]/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(String(r.expression)))) {
      const name = m[1].trim();
      if (name) refs.add(name);
    }
  });
  const unknown = [...refs].filter((name) => !upNames.has(name.toLowerCase()));
  if (unknown.length) issues.push(`公式引用了不存在的字段：${unknown.join('、')}`);
  for (const row of complete) {
    const m = String(row.expression).match(FORMULA_AGGREGATES);
    if (m) {
      issues.push(`公式不支持聚合函数：${m[1].toUpperCase()}`);
      break;
    }
  }
  return issues;
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
    if (node.data.kind === 'convert') {
      const rows = ((cfg.conversions || []) as Array<{ field?: string; targetType?: string; remove?: boolean }>)
        .filter((r) => r.field);
      const configured = rows.filter((r) => r.remove || String(r.targetType || '').trim());
      if (!configured.length) {
        warnings.push(`节点「${node.data.label}」尚未配置任何类型转换`);
      } else if (rows.some((r) => !r.remove && !String(r.targetType || '').trim())) {
        warnings.push(`节点「${node.data.label}」存在未选择目标类型的字段`);
      }
    }
    if (node.data.kind === 'calculator') {
      for (const issue of calculatorIssues(cfg, node, nodes, edges)) {
        warnings.push(`节点「${node.data.label}」${issue}`);
      }
    }
    if (node.data.kind === 'formula') {
      for (const issue of formulaIssues(cfg, node, nodes, edges)) {
        warnings.push(`节点「${node.data.label}」${issue}`);
      }
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
    case 'convert': {
      const rows = ((cfg.conversions || []) as Array<{ field?: string; targetType?: string; remove?: boolean }>)
        .filter((r) => r.field);
      const configured = rows.filter((r) => r.remove || String(r.targetType || '').trim());
      if (!configured.length) return '尚未配置任何类型转换';
      if (rows.some((r) => !r.remove && !String(r.targetType || '').trim())) return '存在未选择目标类型的字段';
      return null;
    }
    case 'calculator': {
      const issues = calculatorIssues(cfg, node, nodes, edges);
      return issues.length ? issues[0] : null;
    }
    case 'formula': {
      const issues = formulaIssues(cfg, node, nodes, edges);
      return issues.length ? issues[0] : null;
    }
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
