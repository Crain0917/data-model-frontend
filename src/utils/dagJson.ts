import type { FlowEdge, FlowNode } from '../types';

type Json = Record<string, unknown>;

export interface DagJsonNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: { label: string; color: string; config: Json };
}

export interface DagJsonEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle: 'out';
  targetHandle: string;
}

export interface DagJson {
  nodes: DagJsonNode[];
  edges: DagJsonEdge[];
}

const NODE_TYPE: Record<string, string> = {
  source: 'source',
  filter: 'filter',
  groupBy: 'groupby',
  join: 'join',
  union: 'union',
  sink: 'sink',
};

function conditions(rows: Array<Record<string, unknown>>): Json[] {
  return (rows || []).map((c) => ({
    logic: c.logic,
    indent: c.indent,
    left: c.left,
    op: c.op,
    rightType: c.rightType,
    right: c.right ?? '',
    right2: c.right2 ?? null,
  }));
}

function unionInputs(nodeId: string, edges: FlowEdge[]): Json[] {
  return edges
    .filter((e) => e.target === nodeId)
    .sort((a, b) => (a.targetHandle || '').localeCompare(b.targetHandle || ''))
    .map((e, i) => ({ alias: String.fromCharCode(97 + i), nodeId: e.source }));
}

function toConfig(node: FlowNode, edges: FlowEdge[]): Json {
  const cfg = node.data.config as unknown as Json;
  switch (node.data.kind) {
    case 'source':
      return {
        dataSourceId: cfg.dataSourceId ?? null,
        tableName: cfg.tableName ?? '',
        fields: cfg.fields ?? [],
      };
    case 'filter':
      return {
        alias: cfg.alias ?? 'a',
        passthrough: Boolean(cfg.keepAll),
        select: ((cfg.select as Json[]) || []).map((s) => ({
          field: s.field,
          alias: s.alias,
          keep: Boolean(s.keep),
          sort: s.sort || null,
        })),
        conditions: conditions((cfg.conditions as Json[]) || []),
        distinct: Boolean(cfg.distinct),
        limit: cfg.limit ?? null,
        offset: cfg.offset ?? null,
      };
    case 'groupBy':
      return {
        alias: cfg.alias ?? 'a',
        globalAgg: Boolean(cfg.globalAgg),
        groupBy: ((cfg.groups as Json[]) || []).map((g) => ({ field: g.field, alias: g.alias })),
        aggregates: ((cfg.aggregates as Json[]) || []).map((a) => ({
          field: a.field,
          fn: a.func,
          alias: a.alias,
        })),
        having: conditions((cfg.having as Json[]) || []),
        limit: cfg.limit ?? null,
        offset: cfg.offset ?? null,
      };
    case 'join': {
      const extra = String(cfg.extraOn || '')
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean);
      return {
        leftAlias: cfg.aliasLeft ?? 'a',
        rightAlias: cfg.aliasRight ?? 'b',
        joinType: cfg.joinType ?? 'INNER',
        keys: cfg.keys ?? [],
        extraOn: extra,
        projection: ((cfg.projection as Json[]) || []).map((p) => ({
          side: p.side,
          field: p.field,
          alias: p.alias,
          keep: Boolean(p.keep),
        })),
        autoPrefix: Boolean(cfg.autoPrefix),
      };
    }
    case 'union': {
      const align = cfg.alignBy === 'POSITION' ? 'POSITION' : 'NAME';
      return {
        mode: cfg.unionAll ? 'ALL' : 'DISTINCT',
        align,
        inputs: unionInputs(node.id, edges),
        outputs: ((cfg.targets as Json[]) || []).map((t) => {
          const out: Json = { name: t.name };
          if (align === 'NAME') out.mapping = t.sources ?? {};
          return out;
        }),
      };
    }
    case 'sink':
    default:
      return { targetType: null, dataSourceId: null, writeMode: null, fieldMapping: [] };
  }
}

export function toDagJson(nodes: FlowNode[], edges: FlowEdge[]): DagJson {
  return {
    nodes: nodes.map((n) => ({
      id: n.id,
      type: NODE_TYPE[n.data.kind] || n.data.kind,
      position: { x: Math.round(n.position.x), y: Math.round(n.position.y) },
      data: {
        label: n.data.label,
        color: n.data.color,
        config: toConfig(n, edges),
      },
    })),
    edges: edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: 'out',
      targetHandle: e.targetHandle || 'in-0',
    })),
  };
}
