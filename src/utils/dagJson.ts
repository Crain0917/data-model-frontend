import type {
  ConditionRow,
  FieldDef,
  FlowEdge,
  FlowNode,
  FlowNodeKind,
} from '../types';
import { NODE_META } from './nodeMeta';
import { calcOp } from './calcOps';

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
  replaceNull: 'replace_null',
  sortRows: 'sort_rows',
  splitFields: 'split_fields',
  splitFieldsToRows: 'split_fields_to_rows',
  valueMapper: 'value_mapper',
  uniqueRows: 'unique_rows',
  columnsToRows: 'columns_to_rows',
  rowsToColumns: 'rows_to_columns',
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
          .map((c) => {
            const op = calcOp(String(c.operation ?? 'ADD'));
            // DATE_FORMAT/DATE_PARSE 的格式掩码、SUBSTRING 的起始位等只能传常量，序列化时强制 LITERAL。
            const argBType =
              op.bLiteralOnly || String(c.argBType ?? 'FIELD').toUpperCase() === 'LITERAL'
                ? 'LITERAL'
                : 'FIELD';
            const argCType =
              op.cMode === 'LITERAL' || String(c.argCType ?? 'FIELD').toUpperCase() === 'LITERAL'
                ? 'LITERAL'
                : 'FIELD';
            return {
              output: String(c.output ?? '').trim(),
              operation: String(c.operation ?? 'ADD').toUpperCase(),
              fieldA: String(c.fieldA ?? ''),
              fieldB: String(c.fieldB ?? ''),
              fieldC: c.fieldC == null || String(c.fieldC) === '' ? null : String(c.fieldC),
              // 契约：缺省按 FIELD；LITERAL 行必须显式写 argBType/argCType。
              ...(argBType === 'LITERAL'
                ? { argBType, literalB: c.literalB == null ? '' : String(c.literalB) }
                : {}),
              ...(argCType === 'LITERAL'
                ? { argCType, literalC: c.literalC == null ? '' : String(c.literalC) }
                : {}),
              returnType: String(c.returnType ?? 'DOUBLE').toUpperCase(),
              length: c.length == null ? null : Number(c.length),
              precision: c.precision == null ? null : Number(c.precision),
            };
          })
          .filter(
            (c) =>
              c.output ||
              c.fieldA ||
              c.fieldB ||
              c.fieldC ||
              (c as Json).literalB ||
              (c as Json).literalC,
          ),
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
    case 'replaceNull':
      return {
        alias: cfg.alias ?? 'a',
        rules: ((cfg.rules as Json[]) || [])
          .map((r) => ({
            field: String(r.field ?? '').trim(),
            strategy: String(r.strategy ?? 'VALUE').toUpperCase(),
            value: r.value == null ? '' : String(r.value),
            output: r.output == null ? '' : String(r.output).trim(),
          }))
          .filter((r) => r.field),
      };
    case 'sortRows':
      return {
        alias: cfg.alias ?? 'a',
        sequenceEnabled: Boolean(cfg.sequenceEnabled),
        sequenceOutput: String(cfg.sequenceOutput ?? '').trim(),
        simpleEnabled: Boolean(cfg.simpleEnabled),
        keys: ((cfg.keys as Json[]) || [])
          .map((k) => {
            const direction = String(k.direction || 'ASC').toUpperCase();
            const key: Json = { field: String(k.field ?? ''), direction };
            if (direction === 'CUSTOM') {
              key.values = (Array.isArray(k.values) ? (k.values as unknown[]) : [])
                .map((v) => String(v ?? ''))
                .filter((v) => v !== '');
            }
            return key;
          })
          .filter((k) => k.field),
        groupEnabled: Boolean(cfg.groupEnabled),
        partitionBy: ((cfg.partitionBy as unknown[]) || []).map((v) => String(v ?? '')).filter(Boolean),
        groupOrderBy: ((cfg.groupOrderBy as Json[]) || [])
          .map((k) => ({
            field: String(k.field ?? ''),
            direction: String(k.direction || 'ASC').toUpperCase() === 'DESC' ? 'DESC' : 'ASC',
          }))
          .filter((k) => k.field),
        groupFunction: ['ROW_NUMBER', 'RANK', 'DENSE_RANK'].includes(
          String(cfg.groupFunction ?? 'ROW_NUMBER').toUpperCase(),
        )
          ? String(cfg.groupFunction ?? 'ROW_NUMBER').toUpperCase()
          : 'ROW_NUMBER',
        groupOutput: String(cfg.groupOutput ?? '').trim(),
      };
    case 'splitFields':
      return {
        alias: cfg.alias ?? 'a',
        field: String(cfg.field ?? ''),
        delimiter: cfg.delimiter == null ? '' : String(cfg.delimiter),
        keepOriginal: cfg.keepOriginal !== false,
        trim: cfg.trim !== false,
        emptyAsNull: Boolean(cfg.emptyAsNull),
        parts: ((cfg.parts as Json[]) || [])
          .map((p) => ({ index: Number(p.index) || 0, output: String(p.output ?? '').trim() }))
          .filter((p) => p.index > 0),
      };
    case 'splitFieldsToRows':
      return {
        alias: cfg.alias ?? 'a',
        field: String(cfg.field ?? ''),
        delimiter: cfg.delimiter == null ? '' : String(cfg.delimiter),
        output: String(cfg.output ?? '').trim(),
        keepOriginal: cfg.keepOriginal !== false,
        trim: cfg.trim !== false,
        dropEmpty: Boolean(cfg.dropEmpty),
        positionOutput: String(cfg.positionOutput ?? '').trim(),
      };
    case 'valueMapper': {
      return {
        alias: cfg.alias ?? 'a',
        rules: ((cfg.rules as Json[]) || [])
          .map((r) => ({
            field: String(r.field ?? '').trim(),
            output: r.output == null ? '' : String(r.output).trim(),
            mappings: ((r.mappings as Json[]) || []).map((m) => ({
              from: m.from == null ? '' : String(m.from),
              to: m.to == null ? '' : String(m.to),
            })),
            unmatched: ['KEEP', 'VALUE', 'NULL'].includes(
              String(r.unmatched ?? '').toUpperCase(),
            )
              ? String(r.unmatched).toUpperCase()
              : 'KEEP',
            unmatchedValue: r.unmatchedValue == null ? '' : String(r.unmatchedValue),
          }))
          .filter((r) => r.field),
      };
    }
    case 'uniqueRows': {
      const mode = String(cfg.mode ?? 'SIMPLE').toUpperCase() === 'RULE' ? 'RULE' : 'SIMPLE';
      const duplicateOutput =
        String(cfg.duplicateOutput ?? 'DISCARD').toUpperCase() === 'TABLE' ? 'TABLE' : 'DISCARD';
      const target = (cfg.duplicateTarget as Json | undefined) || {};
      return {
        alias: cfg.alias ?? 'a',
        mode,
        keyFields: ((cfg.keyFields as unknown[]) || [])
          .map((v) => String(v ?? '').trim())
          .filter(Boolean),
        ignoreCase: Boolean(cfg.ignoreCase),
        orderBy: ((cfg.orderBy as Json[]) || [])
          .map((k) => ({
            field: String(k.field ?? '').trim(),
            direction: String(k.direction ?? 'ASC').toUpperCase() === 'DESC' ? 'DESC' : 'ASC',
          }))
          .filter((k) => k.field),
        duplicateOutput,
        duplicateTarget: {
          dataSourceId: target.dataSourceId ?? null,
          tableName: String(target.tableName ?? '').trim(),
          writeMode: String(target.writeMode ?? 'APPEND').toUpperCase() === 'OVERWRITE' ? 'OVERWRITE' : 'APPEND',
          autoCreate: target.autoCreate !== false,
        },
      };
    }
    case 'columnsToRows': {
      const valueType = ['STRING', 'DOUBLE', 'BIGINT'].includes(
        String(cfg.valueType ?? '').toUpperCase(),
      )
        ? String(cfg.valueType).toUpperCase()
        : 'STRING';
      return {
        alias: cfg.alias ?? 'a',
        keepFields: ((cfg.keepFields as unknown[]) || [])
          .map((v) => String(v ?? '').trim())
          .filter(Boolean),
        valueFields: ((cfg.valueFields as Json[]) || [])
          .map((v) => ({
            field: String(v.field ?? '').trim(),
            label: v.label == null ? '' : String(v.label),
          }))
          .filter((v) => v.field),
        nameOutput: String(cfg.nameOutput ?? '').trim() || 'field_name',
        valueOutput: String(cfg.valueOutput ?? '').trim() || 'field_value',
        valueType,
        skipNull: Boolean(cfg.skipNull),
      };
    }
    case 'rowsToColumns': {
      const aggregate = ['SUM', 'MAX', 'MIN', 'AVG', 'COUNT'].includes(
        String(cfg.aggregate ?? '').toUpperCase(),
      )
        ? String(cfg.aggregate).toUpperCase()
        : 'SUM';
      return {
        alias: cfg.alias ?? 'a',
        groupFields: ((cfg.groupFields as unknown[]) || [])
          .map((v) => String(v ?? '').trim())
          .filter(Boolean),
        pivotField: String(cfg.pivotField ?? '').trim(),
        valueField: String(cfg.valueField ?? '').trim(),
        aggregate,
        pivotValues: ((cfg.pivotValues as Json[]) || [])
          .map((p) => ({
            value: p.value == null ? '' : String(p.value),
            output: String(p.output ?? '').trim(),
          }))
          .filter((p) => p.output || p.value),
      };
    }
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
  replace_null: 'replaceNull',
  sort_rows: 'sortRows',
  split_fields: 'splitFields',
  split_fields_to_rows: 'splitFieldsToRows',
  value_mapper: 'valueMapper',
  unique_rows: 'uniqueRows',
  columns_to_rows: 'columnsToRows',
  rows_to_columns: 'rowsToColumns',
  groupby: 'groupBy',
  groupBy: 'groupBy',
  join: 'join',
  union: 'union',
  sink: 'sink',
};

/** 节点改名前的默认显示名：仅当 label 仍是旧默认名时映射为新名，用户自定义名不覆盖。 */
const LEGACY_NODE_LABELS: Partial<Record<FlowNodeKind, string[]>> = {
  calculator: ['calculator', 'CALCULATOR', '计算器'],
  formula: ['formula', 'FORMULA', '公式'],
};

export function displayLabel(kind: FlowNodeKind, raw: unknown): string {
  const label = raw == null ? '' : String(raw);
  if (!label.trim()) return NODE_META[kind].label;
  return LEGACY_NODE_LABELS[kind]?.includes(label.trim()) ? NODE_META[kind].label : label;
}

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
        fields: ((raw.fields as FieldDef[] | undefined) || []).map((f) => ({
          name: f.name,
          type: f.type,
          ...(f.sourceType ? { sourceType: f.sourceType } : {}),
        })),
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
          argBType: String(c.argBType ?? 'FIELD').toUpperCase() === 'LITERAL' ? 'LITERAL' : 'FIELD',
          argCType: String(c.argCType ?? 'FIELD').toUpperCase() === 'LITERAL' ? 'LITERAL' : 'FIELD',
          literalB: c.literalB == null ? null : String(c.literalB),
          literalC: c.literalC == null ? null : String(c.literalC),
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
    case 'replaceNull':
      return {
        alias: raw.alias ?? 'a',
        rules: ((raw.rules as Json[] | undefined) || [])
          .map((r) => ({
            field: String(r.field ?? '').trim(),
            strategy: String(r.strategy ?? 'VALUE').toUpperCase(),
            value: r.value == null ? '' : String(r.value),
            output: r.output == null ? '' : String(r.output),
          }))
          .filter((r) => r.field),
      };
    case 'sortRows':
      return {
        alias: raw.alias ?? 'a',
        sequenceEnabled: Boolean(raw.sequenceEnabled),
        sequenceOutput: String(raw.sequenceOutput ?? ''),
        simpleEnabled: Boolean(raw.simpleEnabled),
        keys: ((raw.keys as Json[] | undefined) || [])
          .map((k) => ({
            field: String(k.field ?? ''),
            direction: (String(k.direction || 'ASC').toUpperCase() as 'ASC' | 'DESC' | 'CUSTOM'),
            values: Array.isArray(k.values) ? (k.values as unknown[]).map((v) => String(v ?? '')) : undefined,
          }))
          .filter((k) => k.field),
        groupEnabled: Boolean(raw.groupEnabled),
        partitionBy: Array.isArray(raw.partitionBy)
          ? (raw.partitionBy as unknown[]).map((v) => String(v ?? '')).filter(Boolean)
          : [],
        groupOrderBy: ((raw.groupOrderBy as Json[] | undefined) || [])
          .map((k) => ({
            field: String(k.field ?? ''),
            direction: (String(k.direction || 'ASC').toUpperCase() === 'DESC' ? 'DESC' : 'ASC') as 'ASC' | 'DESC',
          }))
          .filter((k) => k.field),
        groupFunction: (() => {
          const fn = String(raw.groupFunction ?? 'ROW_NUMBER').toUpperCase();
          return (['ROW_NUMBER', 'RANK', 'DENSE_RANK'].includes(fn) ? fn : 'ROW_NUMBER') as
            | 'ROW_NUMBER'
            | 'RANK'
            | 'DENSE_RANK';
        })(),
        groupOutput: String(raw.groupOutput ?? ''),
      };
    case 'splitFields':
      return {
        alias: raw.alias ?? 'a',
        field: String(raw.field ?? ''),
        delimiter: raw.delimiter == null ? '' : String(raw.delimiter),
        keepOriginal: raw.keepOriginal !== false,
        trim: raw.trim !== false,
        emptyAsNull: Boolean(raw.emptyAsNull),
        parts: ((raw.parts as Json[] | undefined) || []).map((p) => ({
          index: Number(p.index) || 0,
          output: String(p.output ?? ''),
        })),
      };
    case 'splitFieldsToRows':
      return {
        alias: raw.alias ?? 'a',
        field: String(raw.field ?? ''),
        delimiter: raw.delimiter == null ? '' : String(raw.delimiter),
        output: String(raw.output ?? ''),
        keepOriginal: raw.keepOriginal !== false,
        trim: raw.trim !== false,
        dropEmpty: Boolean(raw.dropEmpty),
        positionOutput: String(raw.positionOutput ?? ''),
      };
    case 'valueMapper':
      return {
        alias: raw.alias ?? 'a',
        rules: ((raw.rules as Json[] | undefined) || [])
          .map((r) => ({
            field: String(r.field ?? '').trim(),
            output: String(r.output ?? ''),
            mappings: ((r.mappings as Json[] | undefined) || []).map((m) => ({
              from: String(m.from ?? ''),
              to: String(m.to ?? ''),
            })),
            unmatched: (() => {
              const value = String(r.unmatched ?? 'KEEP').toUpperCase();
              return (['KEEP', 'VALUE', 'NULL'].includes(value) ? value : 'KEEP') as
                | 'KEEP'
                | 'VALUE'
                | 'NULL';
            })(),
            unmatchedValue: r.unmatchedValue == null ? '' : String(r.unmatchedValue),
          }))
          .filter((r) => r.field),
      };
    case 'uniqueRows': {
      const target = (raw.duplicateTarget as Json | undefined) || {};
      return {
        alias: raw.alias ?? 'a',
        mode: String(raw.mode ?? 'SIMPLE').toUpperCase() === 'RULE' ? 'RULE' : 'SIMPLE',
        keyFields: ((raw.keyFields as unknown[] | undefined) || [])
          .map((v) => String(v ?? '').trim())
          .filter(Boolean),
        ignoreCase: Boolean(raw.ignoreCase),
        orderBy: ((raw.orderBy as Json[] | undefined) || [])
          .map((k) => ({
            field: String(k.field ?? '').trim(),
            direction: (String(k.direction ?? 'ASC').toUpperCase() === 'DESC' ? 'DESC' : 'ASC') as
              | 'ASC'
              | 'DESC',
          }))
          .filter((k) => k.field),
        duplicateOutput:
          String(raw.duplicateOutput ?? 'DISCARD').toUpperCase() === 'TABLE' ? 'TABLE' : 'DISCARD',
        duplicateTarget: {
          dataSourceId: (target.dataSourceId as number | null) ?? null,
          tableName: String(target.tableName ?? ''),
          writeMode: String(target.writeMode ?? 'APPEND').toUpperCase() === 'OVERWRITE' ? 'OVERWRITE' : 'APPEND',
          autoCreate: target.autoCreate !== false,
        },
      };
    }
    case 'columnsToRows': {
      const valueType = ['STRING', 'DOUBLE', 'BIGINT'].includes(
        String(raw.valueType ?? '').toUpperCase(),
      )
        ? (String(raw.valueType).toUpperCase() as 'STRING' | 'DOUBLE' | 'BIGINT')
        : 'STRING';
      return {
        alias: raw.alias ?? 'a',
        keepFields: ((raw.keepFields as unknown[] | undefined) || [])
          .map((v) => String(v ?? '').trim())
          .filter(Boolean),
        valueFields: ((raw.valueFields as Json[] | undefined) || [])
          .map((v) => ({
            field: String(v.field ?? ''),
            label: v.label == null ? '' : String(v.label),
          }))
          .filter((v) => v.field),
        nameOutput: String(raw.nameOutput ?? '').trim() || 'field_name',
        valueOutput: String(raw.valueOutput ?? '').trim() || 'field_value',
        valueType,
        skipNull: Boolean(raw.skipNull),
      };
    }
    case 'rowsToColumns': {
      const aggregate = String(raw.aggregate ?? '').toUpperCase();
      return {
        alias: raw.alias ?? 'a',
        groupFields: ((raw.groupFields as unknown[] | undefined) || [])
          .map((v) => String(v ?? '').trim())
          .filter(Boolean),
        pivotField: String(raw.pivotField ?? ''),
        valueField: String(raw.valueField ?? ''),
        aggregate: (['SUM', 'MAX', 'MIN', 'AVG', 'COUNT'].includes(aggregate) ? aggregate : 'SUM') as
          | 'SUM'
          | 'MAX'
          | 'MIN'
          | 'AVG'
          | 'COUNT',
        pivotValues: ((raw.pivotValues as Json[] | undefined) || []).map((p) => ({
          value: p.value == null ? '' : String(p.value),
          output: String(p.output ?? ''),
        })),
      };
    }
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
        label: displayLabel(kind, data.label),
        kind,
        color: String(data.color ?? NODE_META[kind].color),
        config: reverseConfig(kind, (data.config || {}) as Json, id, edges),
      },
    } as unknown as FlowNode;
  });
  const viewport = dag.viewport;
  return { nodes, edges, viewport };
}
