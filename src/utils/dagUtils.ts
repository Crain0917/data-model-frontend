import type {
  CalculatorConfig,
  CalculatorRow,
  ColumnsToRowsConfig,
  ConditionRow,
  ConvertConfig,
  ConvertField,
  DataSource,
  FieldDef,
  FilterConfig,
  FlowEdge,
  FlowNode,
  FlowNodeKind,
  FormulaConfig,
  FormulaRow,
  GroupByConfig,
  JoinConfig,
  ReplaceNullConfig,
  ReplaceNullRule,
  RowsToColumnsConfig,
  SortRowsConfig,
  SplitFieldsConfig,
  SplitFieldsToRowsConfig,
  UniqueRowsConfig,
  UnionConfig,
  ValueMapperConfig,
} from '../types';
import { DEFAULT_NODE_NAME, NODE_META } from './nodeMeta';

export function newNodeId(kind: FlowNodeKind): string {
  return `node_${kind}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
}

export function defaultConfig(kind: FlowNodeKind): Record<string, unknown> {
  switch (kind) {
    case 'source':
      return { dataSourceId: null, tableName: '', fields: [], filter: { conditions: [] } };
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
    case 'convert':
      return { alias: 'a', passthrough: true, conversions: [] };
    case 'calculator':
      return { alias: 'a', calculations: [] };
    case 'formula':
      return { alias: 'a', formulas: [] };
    case 'replaceNull':
      return { alias: 'a', rules: [] };
    case 'sortRows':
      return {
        alias: 'a',
        sequenceEnabled: false,
        sequenceOutput: '',
        simpleEnabled: false,
        keys: [],
        groupEnabled: false,
        partitionBy: [],
        groupOrderBy: [],
        groupFunction: 'ROW_NUMBER',
        groupOutput: '',
      };
    case 'splitFields':
      return {
        alias: 'a',
        field: '',
        delimiter: '',
        keepOriginal: true,
        trim: true,
        emptyAsNull: false,
        parts: [],
      };
    case 'splitFieldsToRows':
      return {
        alias: 'a',
        field: '',
        delimiter: '',
        output: '',
        keepOriginal: true,
        trim: true,
        dropEmpty: false,
        positionOutput: '',
      };
    case 'valueMapper':
      return { alias: 'a', rules: [] };
    case 'uniqueRows':
      return {
        alias: 'a',
        mode: 'SIMPLE',
        keyFields: [],
        ignoreCase: false,
        orderBy: [],
        duplicateOutput: 'DISCARD',
        duplicateTarget: {
          dataSourceId: null,
          tableName: '',
          writeMode: 'APPEND',
          autoCreate: true,
        },
      };
    case 'columnsToRows':
      return {
        alias: 'a',
        keepFields: [],
        valueFields: [],
        nameOutput: 'field_name',
        valueOutput: 'field_value',
        valueType: 'STRING',
        skipNull: false,
      };
    case 'rowsToColumns':
      return {
        alias: 'a',
        groupFields: [],
        pivotField: '',
        valueField: '',
        aggregate: 'SUM',
        pivotValues: [],
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
      return {
        targetType: 'DORIS',
        dataSourceId: null,
        tableName: '',
        writeMode: 'APPEND',
        batchSize: 10000,
        autoCreateTable: true,
        watermarkColumn: null,
        fieldMapping: [],
        tableModel: null,
        keyColumns: [],
      };
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
  } as unknown as FlowNode;
}

export function incomingEdges(nodeId: string, edges: FlowEdge[]): FlowEdge[] {
  return edges
    .filter((e) => e.target === nodeId)
    .sort((a, b) => (a.targetHandle || 'in-0').localeCompare(b.targetHandle || 'in-0'));
}

export function findUpstream(nodeId: string, nodes: FlowNode[], edges: FlowEdge[]): FlowNode | undefined {
  const edge = incomingEdges(nodeId, edges)[0];
  if (!edge) return undefined;
  return nodes.find((n) => n.id === edge.source);
}

/** 沿单输入链路向上找 Source 的数据源方言；多输入节点（join/union）不猜测。 */
export function sourceDialectOf(
  nodeId: string,
  nodes: FlowNode[],
  edges: FlowEdge[],
  dataSources: DataSource[],
): string | undefined {
  let current = findUpstream(nodeId, nodes, edges);
  for (let depth = 0; current && depth < 12; depth += 1) {
    const kind = current.data.kind;
    if (kind === 'source') {
      const dataSourceId = (current.data.config as { dataSourceId?: number | null }).dataSourceId;
      return dataSources.find((d) => d.id === dataSourceId)?.type;
    }
    if (kind === 'join' || kind === 'union') return undefined;
    current = findUpstream(current.id, nodes, edges);
  }
  return undefined;
}

/** 与后端 convertOutputType 保持一致，供面板与下游节点展示字段类型。 */
function convertOutputType(row: ConvertField | undefined, fallback: string): string {
  const type = row?.targetType ? String(row.targetType).toUpperCase() : '';
  switch (type) {
    case 'STRING':
      return `VARCHAR(${row?.length && row.length > 0 ? row.length : 255})`;
    case 'DECIMAL': {
      const p = row?.length && row.length > 0 ? row.length : 18;
      const s = row?.precision != null && row.precision >= 0 ? row.precision : 0;
      return `DECIMAL(${p},${s})`;
    }
    case 'INT':
    case 'BIGINT':
    case 'DOUBLE':
    case 'DATE':
    case 'DATETIME':
    case 'BOOLEAN':
      return type;
    default:
      return fallback;
  }
}

function decimalType(length?: number | null, precision?: number | null): string {
  const p = length && length > 0 ? length : 18;
  const s = precision != null && precision >= 0 ? precision : 2;
  return `DECIMAL(${p},${s})`;
}

function calcOutputType(row: CalculatorRow): string {
  const type = String(row.returnType || 'DOUBLE').toUpperCase();
  switch (type) {
    case 'DECIMAL':
      return decimalType(row.length, row.precision);
    case 'STRING':
      return `VARCHAR(${row.length && row.length > 0 ? row.length : 255})`;
    default:
      return type;
  }
}

function formulaOutputType(row: FormulaRow): string {
  const type = String(row.returnType || 'DOUBLE').toUpperCase();
  switch (type) {
    case 'STRING':
      return `VARCHAR(${row.length && row.length > 0 ? row.length : 255})`;
    case 'DECIMAL':
      return decimalType(row.length, row.precision);
    default:
      return type;
  }
}

const NUMERIC_TYPE_RE =
  /^(TINYINT|SMALLINT|INT|INTEGER|BIGINT|LARGEINT|FLOAT|DOUBLE|DECIMAL|NUMERIC|NUMBER|REAL)/i;

/** 与后端数字类型判断覆盖范围一致（INT/BIGINT/LARGEINT/SMALLINT/TINYINT/DOUBLE/FLOAT/DECIMAL 等）。 */
export function isNumericType(type?: string | null): boolean {
  if (!type) return false;
  return NUMERIC_TYPE_RE.test(String(type).trim());
}

/** 与后端 isStringType 保持一致（CHAR/VARCHAR/STRING/TEXT）。 */
export function isStringType(type?: string | null): boolean {
  return /^(CHAR|VARCHAR|STRING|TEXT)/i.test(String(type || '').trim());
}

function ruleReplacesInPlace(rule: { field: string; output: string }): boolean {
  const out = String(rule.output || '').trim();
  return !out || out === String(rule.field || '').trim();
}

function replaceNullOutputType(rule: ReplaceNullRule, sourceType: string): string {
  const strategy = String(rule.strategy || 'VALUE').toUpperCase();
  return strategy === 'AVG' || strategy === 'MEDIAN' ? 'DOUBLE' : sourceType;
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
    case 'convert': {
      const c = cfg as ConvertConfig;
      const upstream = findUpstream(node.id, nodes, edges);
      const upFields = upstream ? outputFields(upstream, nodes, edges, depth + 1) : [];
      const conversions = (c.conversions || []).filter((row) => row.field);
      const match = (name: string): ConvertField | undefined =>
        conversions.find((row) => row.field === name) ||
        conversions.find((row) => row.field.toLowerCase() === name.toLowerCase());
      return upFields
        .map((field) => {
          const row = match(field.name);
          if (row?.remove) return null;
          return { name: row?.output || field.name, type: convertOutputType(row, field.type) };
        })
        .filter((f): f is FieldDef => Boolean(f));
    }
    case 'calculator': {
      const c = cfg as CalculatorConfig;
      const upstream = findUpstream(node.id, nodes, edges);
      const upFields = upstream ? outputFields(upstream, nodes, edges, depth + 1) : [];
      const added = (c.calculations || [])
        .filter((row) => String(row.output || '').trim())
        .map((row) => ({ name: row.output.trim(), type: calcOutputType(row) }));
      return [...upFields, ...added];
    }
    case 'formula': {
      const f = cfg as FormulaConfig;
      const upstream = findUpstream(node.id, nodes, edges);
      const upFields = upstream ? outputFields(upstream, nodes, edges, depth + 1) : [];
      const added = (f.formulas || [])
        .filter((row) => String(row.output || '').trim())
        .map((row) => ({ name: row.output.trim(), type: formulaOutputType(row) }));
      return [...upFields, ...added];
    }
    case 'replaceNull': {
      const r = cfg as ReplaceNullConfig;
      const upstream = findUpstream(node.id, nodes, edges);
      const upFields = upstream ? outputFields(upstream, nodes, edges, depth + 1) : [];
      const rules = (r.rules || []).filter((row) => String(row.field || '').trim());
      const findRule = (name: string): ReplaceNullRule | undefined =>
        rules.find((row) => row.field === name) ||
        rules.find((row) => row.field.toLowerCase() === name.toLowerCase());
      const inPlace = upFields.map((field) => {
        const rule = findRule(field.name);
        if (!rule || !ruleReplacesInPlace(rule)) return field;
        return { name: field.name, type: replaceNullOutputType(rule, field.type) };
      });
      const added = rules
        .filter((rule) => !ruleReplacesInPlace(rule))
        .map((rule) => {
          const src = upFields.find((f) => f.name === rule.field);
          return {
            name: String(rule.output).trim(),
            type: replaceNullOutputType(rule, src?.type || 'STRING'),
          };
        });
      return [...inPlace, ...added];
    }
    case 'sortRows': {
      const s = cfg as SortRowsConfig;
      const upstream = findUpstream(node.id, nodes, edges);
      const upFields = upstream ? outputFields(upstream, nodes, edges, depth + 1) : [];
      const result = [...upFields];
      const simpleKeys = (s.keys || []).filter((key) => String(key.field || '').trim());
      const hasFinalOrder = (s.simpleEnabled && simpleKeys.length > 0) || s.groupEnabled;
      if (s.sequenceEnabled && hasFinalOrder && String(s.sequenceOutput || '').trim()) {
        result.push({ name: String(s.sequenceOutput).trim(), type: 'BIGINT' });
      }
      if (s.groupEnabled && String(s.groupOutput || '').trim()) {
        result.push({ name: String(s.groupOutput).trim(), type: 'BIGINT' });
      }
      return result;
    }
    case 'splitFields': {
      const s = cfg as SplitFieldsConfig;
      const upstream = findUpstream(node.id, nodes, edges);
      const upFields = upstream ? outputFields(upstream, nodes, edges, depth + 1) : [];
      const base = s.keepOriginal === false
        ? upFields.filter((f) => f.name.toLowerCase() !== String(s.field || '').toLowerCase())
        : upFields;
      const added = (s.parts || [])
        .filter((p) => String(p.output || '').trim())
        .map((p) => ({ name: String(p.output).trim(), type: 'STRING' }));
      return [...base, ...added];
    }
    case 'splitFieldsToRows': {
      const s = cfg as SplitFieldsToRowsConfig;
      const upstream = findUpstream(node.id, nodes, edges);
      const upFields = upstream ? outputFields(upstream, nodes, edges, depth + 1) : [];
      const field = String(s.field || '').trim();
      const out = String(s.output || '').trim() || field;
      const inPlace = Boolean(field) && out.toLowerCase() === field.toLowerCase();
      let result: FieldDef[];
      if (inPlace) {
        result = upFields.map((f) =>
          f.name.toLowerCase() === field.toLowerCase() ? { name: f.name, type: 'STRING' } : f,
        );
      } else {
        const base = s.keepOriginal === false
          ? upFields.filter((f) => f.name.toLowerCase() !== field.toLowerCase())
          : upFields;
        result = [...base, { name: out, type: 'STRING' }];
      }
      const position = String(s.positionOutput || '').trim();
      if (position) result = [...result, { name: position, type: 'BIGINT' }];
      return result;
    }
    case 'valueMapper': {
      const v = cfg as ValueMapperConfig;
      const upstream = findUpstream(node.id, nodes, edges);
      const upFields = upstream ? outputFields(upstream, nodes, edges, depth + 1) : [];
      const rules = (v.rules || []).filter((row) => String(row.field || '').trim());
      const findRule = (name: string) =>
        rules.find((row) => row.field === name) ||
        rules.find((row) => row.field.toLowerCase() === name.toLowerCase());
      const inPlace = upFields.map((field) => {
        const rule = findRule(field.name);
        if (!rule || !ruleReplacesInPlace(rule)) return field;
        return { name: field.name, type: field.type };
      });
      const added = rules
        .filter((rule) => !ruleReplacesInPlace(rule))
        .map((rule) => {
          const src = upFields.find(
            (f) => f.name === rule.field || f.name.toLowerCase() === rule.field.toLowerCase(),
          );
          return { name: String(rule.output).trim(), type: src?.type || 'STRING' };
        });
      return [...inPlace, ...added];
    }
    case 'uniqueRows': {
      const upstream = findUpstream(node.id, nodes, edges);
      const upFields = upstream ? outputFields(upstream, nodes, edges, depth + 1) : [];
      return upFields.filter((f) => f.name.toLowerCase() !== '__dm_rowid');
    }
    case 'columnsToRows': {
      const c = cfg as ColumnsToRowsConfig;
      const upstream = findUpstream(node.id, nodes, edges);
      const upFields = upstream ? outputFields(upstream, nodes, edges, depth + 1) : [];
      const keep = upFields.filter((f) =>
        (c.keepFields || []).some((k) => String(k).toLowerCase() === f.name.toLowerCase()),
      );
      const rawType = String(c.valueType || 'STRING').toUpperCase();
      const valueType = rawType === 'DOUBLE' || rawType === 'BIGINT' ? rawType : 'STRING';
      const nameOut = String(c.nameOutput || '').trim() || 'field_name';
      const valueOut = String(c.valueOutput || '').trim() || 'field_value';
      return [...keep, { name: nameOut, type: 'STRING' }, { name: valueOut, type: valueType }];
    }
    case 'rowsToColumns': {
      const r = cfg as RowsToColumnsConfig;
      const upstream = findUpstream(node.id, nodes, edges);
      const upFields = upstream ? outputFields(upstream, nodes, edges, depth + 1) : [];
      const groups = (r.groupFields || [])
        .map((g) => upFields.find((f) => f.name.toLowerCase() === String(g).toLowerCase()))
        .filter((f): f is FieldDef => Boolean(f));
      const sourceType =
        upFields.find(
          (f) => r.valueField && f.name.toLowerCase() === String(r.valueField).toLowerCase(),
        )?.type || 'STRING';
      const aggregate = String(r.aggregate || 'SUM').toUpperCase();
      const pivotType =
        aggregate === 'COUNT'
          ? 'BIGINT'
          : aggregate === 'AVG'
            ? 'DOUBLE'
            : aggregate === 'SUM'
              ? isNumericType(sourceType) ? sourceType : 'DOUBLE'
              : sourceType;
      const pivots = (r.pivotValues || [])
        .filter((p) => String(p.output || '').trim())
        .map((p) => ({ name: String(p.output).trim(), type: pivotType }));
      return [...groups, ...pivots];
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

