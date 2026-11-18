import type {
  ConditionRow,
  FieldDef,
  FlowEdge,
  FlowNode,
  FlowNodeKind,
} from '../types';
import { NODE_META } from './nodeMeta';

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
  convert: 'convert',
  calculator: 'calculator',
  formula: 'formula',
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
    case 'source': {
      const sourceConfig: Json = {
        dataSourceId: cfg.dataSourceId ?? null,
        tableName: cfg.tableName ?? '',
        fields: cfg.fields ?? [],
      };
      const filterConds = ((cfg.filter as Json | undefined)?.conditions as Json[] | undefined) || [];
      if (filterConds.length) {
        sourceConfig.filter = { conditions: conditions(filterConds) };
      }
      return sourceConfig;
    }
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
    case 'convert':
      return {
        alias: cfg.alias ?? 'a',
        passthrough: cfg.passthrough !== false,
        conversions: ((cfg.conversions as Json[]) || [])
          .map((c) => ({
            field: String(c.field ?? ''),
            targetType: c.targetType ? String(c.targetType).toUpperCase() : '',
            length: c.length == null ? null : Number(c.length),
            precision: c.precision == null ? null : Number(c.precision),
            format: c.format == null || String(c.format) === '' ? null : String(c.format),
            trim: String(c.trim || 'NONE').toUpperCase(),
            emptyToNull: Boolean(c.emptyToNull),
            output: c.output == null ? '' : String(c.output),
            remove: Boolean(c.remove),
          }))
          .filter((c) => c.field),
      };
    case 'calculator':
      return {
        alias: cfg.alias ?? 'a',
        calculations: ((cfg.calculations as Json[]) || [])
          .map((c) => ({
            output: String(c.output ?? '').trim(),
            operation: String(c.operation ?? 'ADD').toUpperCase(),
            fieldA: String(c.fieldA ?? ''),
            fieldB: String(c.fieldB ?? ''),
            fieldC: c.fieldC == null || String(c.fieldC) === '' ? null : String(c.fieldC),
            returnType: String(c.returnType ?? 'DOUBLE').toUpperCase(),
            length: c.length == null ? null : Number(c.length),
            precision: c.precision == null ? null : Number(c.precision),
          }))
          .filter((c) => c.output || c.fieldA || c.fieldB || c.fieldC),
      };
    case 'formula':
      return {
        alias: cfg.alias ?? 'a',
        formulas: ((cfg.formulas as Json[]) || [])
          .map((f) => ({
            output: String(f.output ?? '').trim(),
            expression: String(f.expression ?? '').trim(),
            returnType: String(f.returnType ?? 'DOUBLE').toUpperCase(),
            length: f.length == null ? null : Number(f.length),
            precision: f.precision == null ? null : Number(f.precision),
          }))
          .filter((f) => f.output || f.expression),
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
    case 'sink': {
      const targetType = String(cfg.targetType || 'DORIS').toUpperCase();
      const mapping = ((cfg.fieldMapping as Json[]) || [])
        .map((m) => ({
          source: String(m.source ?? ''),
          target: String(m.target ?? m.source ?? ''),
          type: m.type == null ? undefined : String(m.type),
        }))
        .filter((m) => m.source && m.source !== '__dm_rowid');
      const model = String(cfg.tableModel || '').toUpperCase();
      const tableModel =
        targetType === 'DORIS' && (model === 'UNIQUE' || model === 'DUPLICATE') ? model : null;
      const targets = new Set(mapping.map((m) => m.target).filter(Boolean));
      const keyColumns =
        tableModel === 'UNIQUE'
          ? Array.from(
              new Set(
                ((cfg.keyColumns as unknown[]) || [])
                  .map((k) => String(k ?? ''))
                  .filter((k) => k && !['__dm_rowid', '__dm_sink_seq'].includes(k.toLowerCase()) && targets.has(k)),
              ),
            )
          : [];
      const writeMode =
        tableModel === 'DUPLICATE'
          ? 'APPEND'
          : String(cfg.writeMode || 'APPEND').toUpperCase();
      return {
        targetType,
        dataSourceId: cfg.dataSourceId ?? null,
        tableName: String(cfg.tableName ?? ''),
        writeMode,
        batchSize: Number(cfg.batchSize) || 10000,
        autoCreateTable: cfg.autoCreateTable !== false,
        watermarkColumn: cfg.watermarkColumn || null,
        fieldMapping: mapping,
        tableModel,
        keyColumns,
      };
    }
    default:
      return {};
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

const KIND_BY_TYPE: Record<string, FlowNodeKind> = {
  source: 'source',
  filter: 'filter',
  convert: 'convert',
  calculator: 'calculator',
  formula: 'formula',
  groupby: 'groupBy',
  groupBy: 'groupBy',
  join: 'join',
  union: 'union',
  sink: 'sink',
};

function conditionRows(raw: unknown): ConditionRow[] {
  return ((raw as Json[] | undefined) || []).map((c) => ({
    logic: (c.logic as 'AND' | 'OR') || 'AND',
    indent: Number(c.indent) || 0,
    left: String(c.left ?? ''),
    op: String(c.op ?? 'EQ'),
    rightType: (c.rightType as 'CONST' | 'FIELD') || 'CONST',
    right: String(c.right ?? ''),
    right2: c.right2 == null ? undefined : String(c.right2),
  }));
}

function reverseConfig(kind: FlowNodeKind, raw: Json, nodeId: string, edges: FlowEdge[]): Json {
  switch (kind) {
    case 'source':
      return {
        dataSourceId: raw.dataSourceId ?? null,
        dataSourceName: raw.dataSourceName,
        dbName: raw.dbName,
        tableName: raw.tableName ?? '',
        fields: ((raw.fields as FieldDef[] | undefined) || []).map((f) => ({ name: f.name, type: f.type })),
        filter: { conditions: conditionRows((raw.filter as Json | undefined)?.conditions) },
      };
    case 'filter':
      return {
        alias: raw.alias ?? 'a',
        keepAll: Boolean(raw.keepAll ?? raw.passthrough),
        select: ((raw.select as Json[] | undefined) || []).map((s) => ({
          field: String(s.field ?? ''),
          alias: String(s.alias ?? s.field ?? ''),
          keep: s.keep !== false,
          sort: (s.sort as '' | 'ASC' | 'DESC') || '',
          type: s.type as string | undefined,
        })),
        conditions: conditionRows(raw.conditions),
        distinct: Boolean(raw.distinct),
        limit: (raw.limit as number | null) ?? null,
        offset: (raw.offset as number | null) ?? null,
      };
    case 'convert':
      return {
        alias: raw.alias ?? 'a',
        passthrough: raw.passthrough !== false,
        conversions: ((raw.conversions as Json[] | undefined) || [])
          .map((c) => ({
            field: String(c.field ?? ''),
            targetType: c.targetType ? String(c.targetType).toUpperCase() : '',
            length: c.length == null ? null : Number(c.length),
            precision: c.precision == null ? null : Number(c.precision),
            format: c.format == null || String(c.format) === '' ? null : String(c.format),
            trim: String(c.trim || 'NONE').toUpperCase(),
            emptyToNull: Boolean(c.emptyToNull),
            output: c.output == null ? '' : String(c.output),
            remove: Boolean(c.remove),
          }))
          .filter((c) => c.field),
      };
    case 'calculator':
      return {
        alias: raw.alias ?? 'a',
        calculations: ((raw.calculations as Json[] | undefined) || []).map((c) => ({
          output: String(c.output ?? ''),
          operation: String(c.operation ?? 'ADD').toUpperCase(),
          fieldA: String(c.fieldA ?? ''),
          fieldB: String(c.fieldB ?? ''),
          fieldC: c.fieldC == null ? null : String(c.fieldC),
          returnType: String(c.returnType ?? 'DOUBLE').toUpperCase(),
          length: (c.length as number | null) ?? null,
          precision: (c.precision as number | null) ?? null,
        })),
      };
    case 'formula':
      return {
        alias: raw.alias ?? 'a',
        formulas: ((raw.formulas as Json[] | undefined) || []).map((f) => ({
          output: String(f.output ?? ''),
          expression: String(f.expression ?? ''),
          returnType: String(f.returnType ?? 'DOUBLE').toUpperCase(),
          length: (f.length as number | null) ?? null,
          precision: (f.precision as number | null) ?? null,
        })),
      };
    case 'groupBy':
      return {
        alias: raw.alias ?? 'a',
        globalAgg: Boolean(raw.globalAgg),
        groups: ((raw.groupBy as Json[] | undefined) || []).map((g) => ({
          field: String(g.field ?? ''),
          alias: String(g.alias ?? g.field ?? ''),
          type: g.type as string | undefined,
        })),
        aggregates: ((raw.aggregates as Json[] | undefined) || []).map((a) => ({
          field: String(a.field ?? ''),
          func: String(a.fn ?? a.func ?? 'SUM'),
          alias: String(a.alias ?? ''),
          type: a.type as string | undefined,
        })),
        having: conditionRows(raw.having),
        limit: (raw.limit as number | null) ?? null,
        offset: (raw.offset as number | null) ?? null,
      };
    case 'join': {
      const extra = raw.extraOn;
      const projection = ((raw.projection as Json[] | undefined) || []).map((p) => {
        const side = (p.side as 'a' | 'b') || 'a';
        return {
          side,
          field: String(p.field ?? ''),
          alias: String(p.alias ?? p.field ?? ''),
          keep: p.keep !== false,
          type: p.type as string | undefined,
        };
      });
      return {
        aliasLeft: raw.leftAlias ?? 'a',
        aliasRight: raw.rightAlias ?? 'b',
        joinType: (raw.joinType as 'INNER' | 'LEFT' | 'RIGHT' | 'FULL') || 'INNER',
        keys: ((raw.keys as Array<{ left: string; right: string }> | undefined) || []).map((k) => ({
          left: k.left,
          right: k.right,
        })),
        extraOn: Array.isArray(extra) ? extra.join('\n') : String(extra ?? ''),
        projection,
        autoPrefix: raw.autoPrefix !== false,
      };
    }
    case 'union': {
      const mode = (raw.mode ?? raw.unionType) as string | undefined;
      const align = (raw.align ?? raw.alignBy) as string | undefined;
      return {
        unionAll: mode !== 'DISTINCT',
        alignBy: align === 'POSITION' ? 'POSITION' : 'NAME',
        targets: (((raw.outputs ?? raw.targets) as Json[] | undefined) || []).map((t) => ({
          // 兼容旧 dag：旧格式用 target/sources 存输出名与来源字段
          name: String(t.name ?? t.target ?? ''),
          type: t.type as string | undefined,
          sources:
            (t.mapping as Record<string, string | null> | undefined) ??
            (t.sources as Record<string, string | null> | undefined) ??
            {},
        })),
      };
    }
    case 'sink': {
      const targetType = String(raw.targetType ?? 'DORIS').toUpperCase();
      const model = String(raw.tableModel ?? '').toUpperCase();
      return {
        targetType: ['DORIS', 'MYSQL', 'DM8', 'ORACLE'].includes(targetType) ? targetType : 'DORIS',
        dataSourceId: (raw.dataSourceId as number | null) ?? null,
        tableName: String(raw.tableName ?? ''),
        writeMode: String(raw.writeMode ?? 'APPEND').toUpperCase() === 'OVERWRITE' ? 'OVERWRITE' : 'APPEND',
        batchSize: Number(raw.batchSize) || 10000,
        autoCreateTable: raw.autoCreateTable !== false,
        watermarkColumn: raw.watermarkColumn == null || raw.watermarkColumn === ''
          ? null
          : String(raw.watermarkColumn),
        fieldMapping: ((raw.fieldMapping as Json[] | undefined) || [])
          .map((m) => ({
            source: String(m.source ?? ''),
            target: String(m.target ?? m.source ?? ''),
            type: m.type == null ? undefined : String(m.type),
          }))
          .filter((m) => m.source),
        tableModel: model === 'UNIQUE' || model === 'DUPLICATE' ? model : null,
        keyColumns: Array.isArray(raw.keyColumns)
          ? (raw.keyColumns as unknown[]).map((k) => String(k ?? '')).filter(Boolean)
          : [],
      };
    }
    default:
      return {};
  }
}

interface DagLike {
  nodes?: Array<Json>;
  edges?: Array<Json>;
  viewport?: { x: number; y: number; zoom: number };
}

function autoLayout(nodes: DagJsonNode[], edges: DagJsonEdge[]): Map<string, { x: number; y: number }> {
  const depth = new Map<string, number>();
  const ids = new Set(nodes.map((n) => n.id));
  const incoming = new Map<string, string[]>();
  for (const e of edges) {
    if (!ids.has(e.source) || !ids.has(e.target)) continue;
    const list = incoming.get(e.target) || [];
    list.push(e.source);
    incoming.set(e.target, list);
  }
  const visit = (id: string, stack: Set<string>): number => {
    if (depth.has(id)) return depth.get(id)!;
    if (stack.has(id)) return 0;
    stack.add(id);
    const parents = incoming.get(id) || [];
    const value = parents.length ? Math.max(...parents.map((p) => visit(p, stack) + 1)) : 0;
    stack.delete(id);
    depth.set(id, value);
    return value;
  };
  nodes.forEach((n) => visit(n.id, new Set()));
  const rows = new Map<number, number>();
  const positions = new Map<string, { x: number; y: number }>();
  const ordered = [...nodes].sort((a, b) => (depth.get(a.id) || 0) - (depth.get(b.id) || 0));
  for (const node of ordered) {
    const d = depth.get(node.id) || 0;
    const index = rows.get(d) || 0;
    rows.set(d, index + 1);
    positions.set(node.id, { x: 80 + d * 300, y: 80 + index * 150 });
  }
  return positions;
}

/** 后端只持久化 dagJson，这里还原成 React Flow 的节点/连线与面板配置。 */
export function fromDagJson(rawDag: unknown): {
  nodes: FlowNode[];
  edges: FlowEdge[];
  viewport?: { x: number; y: number; zoom: number };
} {
  const dag = (rawDag && typeof rawDag === 'object' ? rawDag : {}) as DagLike;
  const rawNodes = ((dag.nodes || []) as Json[]).map((n) => {
    const data = (n.data || {}) as Json;
    const kind = KIND_BY_TYPE[String(n.type ?? '')] || 'filter';
    return { raw: n, data, kind, id: String(n.id ?? '') };
  });
  const edges: FlowEdge[] = ((dag.edges || []) as Json[]).map((e, index) => ({
    id: String(e.id ?? `edge_${index}`),
    source: String(e.source ?? ''),
    target: String(e.target ?? ''),
    sourceHandle: 'out',
    targetHandle: String(e.targetHandle ?? 'in-0'),
    type: 'smoothstep',
  }));
  const needLayout = rawNodes.some(
    (n) => !(n.raw.position as { x?: number; y?: number } | undefined)
      || typeof (n.raw.position as { x?: number }).x !== 'number',
  );
  const positions = autoLayout(
    rawNodes.map((n) => ({
      id: n.id,
      type: String(n.raw.type ?? ''),
      position: { x: 0, y: 0 },
      data: { label: '', color: '', config: {} },
    })),
    edges.map((e) => ({ id: e.id, source: e.source, target: e.target, sourceHandle: 'out', targetHandle: e.targetHandle || 'in-0' })),
  );
  const nodes: FlowNode[] = rawNodes.map(({ raw, data, kind, id }) => {
    const pos = raw.position as { x?: number; y?: number } | undefined;
    const fallback = positions.get(id) || { x: 80, y: 80 };
    return {
      id,
      type: kind,
      position: {
        x: needLayout || typeof pos?.x !== 'number' ? fallback.x : Number(pos?.x),
        y: needLayout || typeof pos?.y !== 'number' ? fallback.y : Number(pos?.y),
      },
      data: {
        label: String(data.label ?? NODE_META[kind].label),
        kind,
        color: String(data.color ?? NODE_META[kind].color),
        config: reverseConfig(kind, (data.config || {}) as Json, id, edges),
      },
    } as unknown as FlowNode;
  });
  const viewport = dag.viewport;
  return { nodes, edges, viewport };
}
