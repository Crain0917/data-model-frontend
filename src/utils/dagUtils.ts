import type {
  ConditionRow,
  FieldDef,
  FilterConfig,
  FlowEdge,
  FlowNode,
  FlowNodeKind,
  GroupByConfig,
  JoinConfig,
  SourceConfig,
  UnionConfig,
} from '../types';
import { DEFAULT_NODE_NAME, NODE_META } from './nodeMeta';

export function newNodeId(kind: FlowNodeKind): string {
  return `node_${kind}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
}

export function defaultConfig(kind: FlowNodeKind): Record<string, unknown> {
  switch (kind) {
    case 'source':
      return { dataSourceId: null, tableName: '', fields: [] };
    case 'filter':
      return {
        alias: 'a',
        keepAll: false,
        distinct: false,
        limit: null,
        offset: null,
        select: [],
        conditions: [],
      };
    case 'groupBy':
      return {
        alias: 'a',
        globalAgg: false,
        groups: [],
        aggregates: [],
        having: [],
        limit: null,
        offset: null,
      };
    case 'join':
      return {
        aliasLeft: 'a',
        aliasRight: 'b',
        joinType: 'INNER',
        keys: [],
        extraOn: '',
        autoPrefix: true,
        projection: [],
      };
    case 'union':
      return { unionAll: true, alignBy: 'NAME', targets: [] };
    case 'sink':
      return {};
    default:
      return {};
  }
}

export function createNode(
  kind: FlowNodeKind,
  position: { x: number; y: number },
  config?: Record<string, unknown>,
  label?: string,
): FlowNode {
  return {
    id: newNodeId(kind),
    type: kind,
    position,
    data: {
      label: label || DEFAULT_NODE_NAME[kind],
      kind,
      color: NODE_META[kind].color,
      config: config || defaultConfig(kind),
    },
  } as FlowNode;
}

export function incomingEdges(nodeId: string, edges: FlowEdge[]): FlowEdge[] {
  return edges
    .filter((e) => e.target === nodeId)
    .sort((a, b) => (a.targetHandle || 'in-0').localeCompare(b.targetHandle || 'in-0'));
}

export function incomingNodes(nodeId: string, nodes: FlowNode[], edges: FlowEdge[]): FlowNode[] {
  return incomingEdges(nodeId, edges)
    .map((e) => nodes.find((n) => n.id === e.source))
    .filter((n): n is FlowNode => Boolean(n));
}

export function findUpstream(nodeId: string, nodes: FlowNode[], edges: FlowEdge[]): FlowNode | undefined {
  const edge = incomingEdges(nodeId, edges)[0];
  if (!edge) return undefined;
  return nodes.find((n) => n.id === edge.source);
}

export function outputFields(node: FlowNode, nodes: FlowNode[], edges: FlowEdge[], depth = 0): FieldDef[] {
  if (depth > 12) return [];
  const cfg = node.data.config as Record<string, any>;
  switch (node.data.kind) {
    case 'source':
      return (cfg.fields || []) as FieldDef[];
    case 'filter': {
      const f = cfg as FilterConfig;
      const upstream = findUpstream(node.id, nodes, edges);
      const upFields = upstream ? outputFields(upstream, nodes, edges, depth + 1) : [];
      if (f.keepAll) {
        return upFields.map((field) => {
          const row = (f.select || []).find((s) => s.field === field.name);
          return { name: row?.alias || field.name, type: field.type };
        });
      }
      return (f.select || [])
        .filter((s) => s.keep)
        .map((s) => ({ name: s.alias || s.field, type: s.type || upFields.find((u) => u.name === s.field)?.type || 'VARCHAR' }));
    }
    case 'groupBy': {
      const g = cfg as GroupByConfig;
      return [
        ...(g.groups || []).map((x) => ({ name: x.alias || x.field, type: x.type || 'VARCHAR' })),
        ...(g.aggregates || []).map((x) => ({ name: x.alias || `${x.func.toLowerCase()}_${x.field}`, type: x.type || 'DOUBLE' })),
      ];
    }
    case 'join': {
      const j = cfg as JoinConfig;
      return (j.projection || [])
        .filter((p) => p.keep)
        .map((p) => ({ name: p.alias || p.field, type: p.type || 'VARCHAR' }));
    }
    case 'union': {
      const u = cfg as UnionConfig;
      return (u.targets || []).map((t) => ({ name: t.name, type: t.type || 'VARCHAR' }));
    }
    default:
      return [];
  }
}

export function upstreamFieldsForHandle(
  nodeId: string,
  handle: string,
  nodes: FlowNode[],
  edges: FlowEdge[],
): FieldDef[] {
  const edge = edges.find((e) => e.target === nodeId && (e.targetHandle || 'in-0') === handle);
  if (!edge) return [];
  const up = nodes.find((n) => n.id === edge.source);
  return up ? outputFields(up, nodes, edges) : [];
}

const ARITH_OPS: Record<string, string> = {
  EQ: '=',
  NE: '<>',
  GT: '>',
  GTE: '>=',
  LT: '<',
  LTE: '<=',
  LIKE: 'LIKE',
  NOT_LIKE: 'NOT LIKE',
  IS_NULL: 'IS NULL',
  IS_NOT_NULL: 'IS NOT NULL',
  IN: 'IN',
  NOT_IN: 'NOT IN',
  BETWEEN: 'BETWEEN',
  NOT_BETWEEN: 'NOT BETWEEN',
  REGEXP: 'REGEXP',
  STARTS_WITH: 'LIKE',
  ENDS_WITH: 'LIKE',
  CONTAINS: 'LIKE',
};

export const OPERATOR_OPTIONS = [
  { value: 'EQ', label: '=  等于' },
  { value: 'NE', label: '<> 不等于' },
  { value: 'GT', label: '>  大于' },
  { value: 'GTE', label: '>= 大于等于' },
  { value: 'LT', label: '<  小于' },
  { value: 'LTE', label: '<= 小于等于' },
  { value: 'LIKE', label: 'LIKE' },
  { value: 'NOT_LIKE', label: 'NOT LIKE' },
  { value: 'IN', label: 'IN' },
  { value: 'NOT_IN', label: 'NOT IN' },
  { value: 'BETWEEN', label: 'BETWEEN' },
  { value: 'NOT_BETWEEN', label: 'NOT BETWEEN' },
  { value: 'IS_NULL', label: 'IS NULL' },
  { value: 'IS_NOT_NULL', label: 'IS NOT NULL' },
  { value: 'REGEXP', label: 'REGEXP' },
  { value: 'STARTS_WITH', label: 'STARTS WITH' },
  { value: 'ENDS_WITH', label: 'ENDS WITH' },
  { value: 'CONTAINS', label: 'CONTAINS' },
];

function literal(value: string): string {
  const v = (value || '').trim();
  if (v === '') return "''";
  if (/^-?\d+(\.\d+)?$/.test(v)) return v;
  return `'${v.replace(/'/g, "''")}'`;
}

function rightSide(row: ConditionRow, alias: string): string {
  if (row.op === 'IS_NULL' || row.op === 'IS_NOT_NULL') return '';
  if (row.rightType === 'FIELD') return alias ? `${alias}.${row.right}` : row.right;
  const op = row.op;
  if (op === 'IN' || op === 'NOT_IN') {
    const parts = (row.right || '').split(',').map((x) => literal(x)).filter(Boolean);
    return `(${parts.join(', ')})`;
  }
  if (op === 'BETWEEN' || op === 'NOT_BETWEEN') return `${literal(row.right)} AND ${literal(row.right2 || '')}`;
  if (op === 'STARTS_WITH') return `'${(row.right || '').replace(/'/g, "''")}%'`;
  if (op === 'ENDS_WITH') return `'%${(row.right || '').replace(/'/g, "''")}'`;
  if (op === 'CONTAINS') return `'%${(row.right || '').replace(/'/g, "''")}%'`;
  return literal(row.right);
}

export function conditionExpr(row: ConditionRow, alias = 'a'): string {
  const op = ARITH_OPS[row.op] || row.op;
  const left = row.left ? (alias ? `${alias}.${row.left}` : row.left) : '<field>';
  const right = rightSide(row, alias);
  return `${left} ${op}${right ? ` ${right}` : ''}`;
}

export function conditionsSql(rows: ConditionRow[], alias = 'a'): string {
  const valid = (rows || []).filter((r) => r.left);
  if (!valid.length) return '';
  return valid
    .map((row, idx) => {
      const indent = Math.max(0, row.indent || 0);
      const pad = '  '.repeat(indent);
      const prefix = idx === 0 ? '' : `${pad}${row.logic} `;
      return `${prefix}(${conditionExpr(row, alias)})`;
    })
    .join('\n');
}

export function upstreamTable(flowId: string, nodeId: string): string {
  return `flow_${flowId}_node_${nodeId.replace(/^node_/, '')}`;
}

export function buildNodeSql(node: FlowNode, nodes: FlowNode[], edges: FlowEdge[], flowId: string): string {
  const cfg = node.data.config as Record<string, any>;
  const kind = node.data.kind;
  if (kind === 'source') {
    const schema = cfg.dbName || cfg.dataSourceName;
    return `-- Source 节点不生成 SQL\n-- 直接引用 ${schema ? `${schema}.` : ''}${cfg.tableName || '<table>'}`;
  }
  if (kind === 'sink') {
    return '-- Sink 节点 v1 未启用，执行时 SKIPPED，不生成写入 SQL';
  }
  const ins = incomingNodes(node.id, nodes, edges);
  const table = (n?: FlowNode) => {
    if (!n) return '<missing_upstream>';
    if (n.data.kind === 'source') {
      const src = n.data.config as SourceConfig;
      const schema = src.dbName || src.dataSourceName;
      return schema ? `${schema}.${src.tableName}` : src.tableName || '<missing_table>';
    }
    return upstreamTable(flowId, n.id);
  };

  if (kind === 'filter') {
    const f = cfg as FilterConfig;
    const up = ins[0];
    const fields = up ? outputFields(up, nodes, edges) : [];
    const keep = (f.select || []).filter((s) => s.keep);
    const projection = f.keepAll || !keep.length
      ? `${f.alias || 'a'}.*`
      : keep.map((s) => `${f.alias || 'a'}.${s.field} AS ${s.alias || s.field}`).join(',\n  ');
    const where = conditionsSql(f.conditions, f.alias || 'a');
    const order = keep
      .filter((s) => s.sort)
      .map((s) => `${s.alias || s.field} ${s.sort}`)
      .join(', ');
    return [
      `CREATE TABLE ${upstreamTable(flowId, node.id)} AS`,
      'SELECT',
      f.distinct ? '  DISTINCT' : '',
      `  ${projection}`,
      `FROM ${table(up)} AS ${f.alias || 'a'}`,
      where ? `WHERE ${where}` : '',
      order ? `ORDER BY ${order}` : '',
      f.limit ? `LIMIT ${f.limit}` : '',
      f.offset ? `OFFSET ${f.offset}` : '',
      `-- 上游可用字段：${fields.map((x) => x.name).join(', ') || '—'}`,
    ]
      .filter(Boolean)
      .join('\n');
  }

  if (kind === 'groupBy') {
    const g = cfg as GroupByConfig;
    const up = ins[0];
    const alias = g.alias || 'a';
    const groupCols = (g.groups || []).map((x) => `${alias}.${x.field}${x.alias && x.alias !== x.field ? ` AS ${x.alias}` : ''}`);
    const aggCols = (g.aggregates || []).map((x) => {
      const fn = x.func === 'COUNT_DISTINCT' ? `COUNT(DISTINCT ${alias}.${x.field})` : `${x.func}(${x.field ? `${alias}.${x.field}` : '*'})`;
      return `${fn} AS ${x.alias || `${x.func.toLowerCase()}_${x.field}`}`;
    });
    const selects = [...groupCols, ...aggCols];
    const having = conditionsSql(g.having, '');
    return [
      `CREATE TABLE ${upstreamTable(flowId, node.id)} AS`,
      'SELECT',
      `  ${selects.join(',\n  ') || '*'}`,
      `FROM ${table(up)} AS ${alias}`,
      g.globalAgg || !groupCols.length ? '' : `GROUP BY ${(g.groups || []).map((x) => `${alias}.${x.field}`).join(', ')}`,
      having ? `HAVING ${having}` : '',
      g.limit ? `LIMIT ${g.limit}` : '',
      g.offset ? `OFFSET ${g.offset}` : '',
    ]
      .filter(Boolean)
      .join('\n');
  }

  if (kind === 'join') {
    const j = cfg as JoinConfig;
    const left = ins.find((n) => edges.find((e) => e.source === n.id && e.target === node.id && (e.targetHandle || 'in-0') === 'in-0'));
    const right = ins.find((n) => edges.find((e) => e.source === n.id && e.target === node.id && e.targetHandle === 'in-1'));
    const ll = j.aliasLeft || 'a';
    const rr = j.aliasRight || 'b';
    const joinKw = j.joinType === 'FULL' ? 'FULL OUTER JOIN' : `${j.joinType} JOIN`;
    const keys = (j.keys || []).map((k) => `${ll}.${k.left} = ${rr}.${k.right}`);
    if (j.extraOn?.trim()) keys.push(j.extraOn.trim());
    const proj = (j.projection || [])
      .filter((p) => p.keep)
      .map((p) => `${p.side === 'a' ? ll : rr}.${p.field} AS ${p.alias || p.field}`)
      .join(',\n  ');
    return [
      `CREATE TABLE ${upstreamTable(flowId, node.id)} AS`,
      'SELECT',
      `  ${proj || '*'}`,
      `FROM ${table(left)} AS ${ll}`,
      `${joinKw} ${table(right)} AS ${rr}`,
      keys.length ? `  ON ${keys.join('\n  AND ')}` : '  ON <至少一个等值 Key>',
    ].join('\n');
  }

  if (kind === 'union') {
    const u = cfg as UnionConfig;
    const aliases = ['a', 'b', 'c', 'd', 'e', 'f'];
    const branches = ins.map((up, idx) => {
      if (u.alignBy === 'POSITION') {
        return `SELECT * FROM ${table(up)}`;
      }
      const cols = (u.targets || []).map((t) => {
        const src = t.sources?.[up.id] || t.sources?.[String(idx)] || t.sources?.[aliases[idx]];
        return src ? `${src} AS ${t.name}` : `NULL AS ${t.name}`;
      });
      return `SELECT\n  ${cols.join(',\n  ') || '*'}\nFROM ${table(up)}`;
    });
    return [
      `CREATE TABLE ${upstreamTable(flowId, node.id)} AS`,
      u.unionAll ? '' : 'SELECT DISTINCT * FROM (',
      branches.join('\nUNION ALL\n'),
      u.unionAll ? '' : ') union_distinct',
    ]
      .filter(Boolean)
      .join('\n');
  }

  return '-- 暂不支持该节点类型';
}

export function edgeAlias(index: number): string {
  return String.fromCharCode(97 + index);
}
