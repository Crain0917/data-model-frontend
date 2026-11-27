import type { CalculatorRow, FieldDef, FlowEdge, FlowNode, FlowNodeKind } from '../types';
import { isCalcRowComplete } from './calcOps';
import { findUpstream, isNumericType, isStringType, outputFields } from './dagUtils';

const SINGLE_INPUT: FlowNodeKind[] = [
  'filter',
  'convert',
  'calculator',
  'formula',
  'replaceNull',
  'sortRows',
  'splitFields',
  'splitFieldsToRows',
  'valueMapper',
  'uniqueRows',
  'columnsToRows',
  'rowsToColumns',
  'replaceInString',
  'llm',
  'groupBy',
  'sink',
];

const FORMULA_AGGREGATES =
  /\b(COUNT|AVG|MIN|MAX|GROUP_CONCAT|STDDEV\w*|VARIANCE|VAR_\w+|APPROX_COUNT_DISTINCT|PERCENTILE\w*|MEDIAN)\s*\(/i;

const KIND_LABEL: Partial<Record<FlowNodeKind, string>> = {
  source: 'Source',
  filter: 'Filter',
  convert: '类型转换',
  calculator: '简单公式计算列',
  formula: '自由公式计算列',
  replaceNull: '替换缺失值',
  sortRows: '排序',
  splitFields: '拆分字段为多列',
  splitFieldsToRows: '拆分字段为多行',
  valueMapper: '值映射',
  uniqueRows: '行去重',
  columnsToRows: '列转行',
  rowsToColumns: '行转列',
  replaceInString: '替换字符串',
  llm: '大模型',
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

function upstreamFieldsOf(node: FlowNode, nodes: FlowNode[], edges: FlowEdge[]): FieldDef[] {
  const upstream = findUpstream(node.id, nodes, edges);
  return upstream ? outputFields(upstream, nodes, edges) : [];
}

function duplicateNames(names: string[]): string[] {
  const counts = new Map<string, number>();
  names.filter(Boolean).forEach((n) => counts.set(n.toLowerCase(), (counts.get(n.toLowerCase()) || 0) + 1));
  return [...counts.entries()].filter(([, n]) => n > 1).map(([n]) => n);
}

function replaceNullIssues(
  cfg: Record<string, any>,
  node: FlowNode,
  nodes: FlowNode[],
  edges: FlowEdge[],
): string[] {
  const issues: string[] = [];
  const rules = ((cfg.rules || []) as Array<Record<string, any>>).filter((r) =>
    String(r.field || '').trim(),
  );
  if (!rules.length) return ['尚未配置任何替换规则'];
  const upFields = upstreamFieldsOf(node, nodes, edges);
  const typeOf = (name: string) =>
    upFields.find((f) => f.name === name)?.type ||
    upFields.find((f) => f.name.toLowerCase() === name.toLowerCase())?.type;
  const missing = [...new Set(rules.filter((r) => !typeOf(String(r.field))).map((r) => String(r.field)))];
  if (missing.length) issues.push(`字段不存在：${missing.join('、')}`);
  const dups = duplicateNames(rules.map((r) => String(r.field)));
  if (dups.length) issues.push(`同一字段重复配置：${dups.join('、')}`);
  const nonNumeric = rules
    .filter((r) => {
      const strategy = String(r.strategy || 'VALUE').toUpperCase();
      if (strategy === 'VALUE') return false;
      const type = typeOf(String(r.field));
      return Boolean(type) && !isNumericType(type);
    })
    .map((r) => String(r.field));
  if (nonNumeric.length) issues.push(`非数字字段只能选择「自定义值」：${nonNumeric.join('、')}`);
  const upNames = new Set(upFields.map((f) => f.name.toLowerCase()));
  const added = rules
    .map((r) => String(r.output || '').trim())
    .filter((out, i) => out && out.toLowerCase() !== String(rules[i].field).toLowerCase());
  const conflict = [...new Set(added.filter((o) => upNames.has(o.toLowerCase())))];
  if (conflict.length) issues.push(`新增输出字段与上游重名：${conflict.join('、')}`);
  const outDups = duplicateNames(added);
  if (outDups.length) issues.push(`替换输出字段重名：${outDups.join('、')}`);
  return issues;
}

function sortRowsIssues(
  cfg: Record<string, any>,
  node: FlowNode,
  nodes: FlowNode[],
  edges: FlowEdge[],
): string[] {
  const issues: string[] = [];
  const upFields = upstreamFieldsOf(node, nodes, edges);
  const has = (name: string) =>
    upFields.some((f) => f.name === name || f.name.toLowerCase() === name.toLowerCase());
  const seq = Boolean(cfg.sequenceEnabled);
  const simple = Boolean(cfg.simpleEnabled);
  const group = Boolean(cfg.groupEnabled);
  const seqOut = String(cfg.sequenceOutput || '').trim();
  const groupOut = String(cfg.groupOutput || '').trim();
  const keys = ((cfg.keys || []) as Array<Record<string, any>>).filter((k) => String(k.field || '').trim());
  const partitionBy = ((cfg.partitionBy || []) as string[]).filter(Boolean);
  const groupOrderBy = ((cfg.groupOrderBy || []) as Array<Record<string, any>>).filter((k) =>
    String(k.field || '').trim(),
  );

  if (seq) {
    if (!seqOut) issues.push('顺序列名不能为空');
    if (!simple && !group) issues.push('未启用简单排序或组内排序，顺序列不会生成');
  }
  if (simple) {
    if (!keys.length) issues.push('简单排序至少需要 1 个排序字段');
    const missing = [...new Set(keys.filter((k) => !has(String(k.field))).map((k) => String(k.field)))];
    if (missing.length) issues.push(`排序字段不存在：${missing.join('、')}`);
    const customEmpty = keys
      .filter((k) => String(k.direction || 'ASC').toUpperCase() === 'CUSTOM')
      .filter((k) => !((k.values || []) as unknown[]).some((v) => String(v ?? '').trim()))
      .map((k) => String(k.field));
    if (customEmpty.length) issues.push(`自定义排序缺少有序值：${customEmpty.join('、')}`);
  }
  if (group) {
    if (!partitionBy.length) issues.push('组内排序至少需要 1 个分区字段');
    const missingPart = [...new Set(partitionBy.filter((f) => !has(f)))];
    if (missingPart.length) issues.push(`分区字段不存在：${missingPart.join('、')}`);
    if (!groupOrderBy.length) issues.push('组内排序至少需要 1 个排序字段');
    const missingOrder = [...new Set(groupOrderBy.filter((k) => !has(String(k.field))).map((k) => String(k.field)))];
    if (missingOrder.length) issues.push(`组内排序字段不存在：${missingOrder.join('、')}`);
    if (!groupOut) issues.push('组内名次列名不能为空');
  }
  const upNames = new Set(upFields.map((f) => f.name.toLowerCase()));
  if (seqOut && upNames.has(seqOut.toLowerCase())) issues.push(`顺序列名与上游列重名：${seqOut}`);
  if (groupOut && upNames.has(groupOut.toLowerCase())) issues.push(`组内名次列名与上游列重名：${groupOut}`);
  if (seqOut && groupOut && seqOut.toLowerCase() === groupOut.toLowerCase()) {
    issues.push('顺序列与组内名次列不能同名');
  }
  return issues;
}

function splitFieldsIssues(
  cfg: Record<string, any>,
  node: FlowNode,
  nodes: FlowNode[],
  edges: FlowEdge[],
): string[] {
  const issues: string[] = [];
  const upFields = upstreamFieldsOf(node, nodes, edges);
  const field = String(cfg.field || '').trim();
  const delimiter = cfg.delimiter == null ? '' : String(cfg.delimiter);
  const parts = ((cfg.parts || []) as Array<Record<string, any>>);
  if (!field) issues.push('未选择拆分字段');
  else if (!upFields.some((f) => f.name.toLowerCase() === field.toLowerCase())) {
    issues.push(`字段不存在：${field}`);
  }
  if (!delimiter) issues.push('分隔符不能为空');
  if (!parts.length) issues.push('至少配置 1 个输出片段');
  const indices = parts.map((p) => Number(p.index));
  if (indices.some((i) => !Number.isInteger(i) || i < 1)) issues.push('片段序号必须是从 1 开始的整数');
  const dupIdx = duplicateNames(indices.map((i) => String(i)));
  if (dupIdx.length) issues.push(`片段序号重复：${dupIdx.join('、')}`);
  const outs = parts.map((p) => String(p.output || '').trim());
  if (outs.some((o) => !o)) issues.push('片段输出列名不能为空');
  const dupOut = duplicateNames(outs);
  if (dupOut.length) issues.push(`片段输出列名重复：${dupOut.join('、')}`);
  const remaining = cfg.keepOriginal === false
    ? upFields.filter((f) => f.name.toLowerCase() !== field.toLowerCase())
    : upFields;
  const remainingNames = new Set(remaining.map((f) => f.name.toLowerCase()));
  const conflict = [...new Set(outs.filter((o) => o && remainingNames.has(o.toLowerCase())))];
  if (conflict.length) issues.push(`输出列与已有列重名：${conflict.join('、')}`);
  return issues;
}

function splitToRowsIssues(
  cfg: Record<string, any>,
  node: FlowNode,
  nodes: FlowNode[],
  edges: FlowEdge[],
): string[] {
  const issues: string[] = [];
  const upFields = upstreamFieldsOf(node, nodes, edges);
  const field = String(cfg.field || '').trim();
  const delimiter = cfg.delimiter == null ? '' : String(cfg.delimiter);
  const output = String(cfg.output || '').trim();
  const position = String(cfg.positionOutput || '').trim();
  if (!field) issues.push('未选择拆分字段');
  else if (!upFields.some((f) => f.name.toLowerCase() === field.toLowerCase())) {
    issues.push(`字段不存在：${field}`);
  }
  if (!delimiter) issues.push('分隔符不能为空');
  if (!output) issues.push('拆分值输出列名不能为空');
  const inPlace = Boolean(field) && output.toLowerCase() === field.toLowerCase();
  let resultNames: string[];
  if (inPlace) {
    resultNames = upFields.map((f) => f.name);
  } else {
    const remaining = cfg.keepOriginal === false
      ? upFields.filter((f) => f.name.toLowerCase() !== field.toLowerCase())
      : upFields;
    const remainingNames = new Set(remaining.map((f) => f.name.toLowerCase()));
    if (output && remainingNames.has(output.toLowerCase())) {
      issues.push(`输出列与已有列重名：${output}`);
    }
    resultNames = [...remaining.map((f) => f.name), output];
  }
  if (position) {
    if (resultNames.some((n) => n.toLowerCase() === position.toLowerCase())) {
      issues.push(`序号列与已有列重名：${position}`);
    }
  }
  return issues;
}

function isNumericLiteral(value: string): boolean {
  const v = String(value ?? '').trim();
  if (!v) return false;
  return /^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/.test(v);
}

function fieldOf(upFields: FieldDef[], name: string): FieldDef | undefined {
  const target = String(name || '').trim().toLowerCase();
  return upFields.find((f) => f.name.toLowerCase() === target);
}

function valueMapperIssues(
  cfg: Record<string, any>,
  node: FlowNode,
  nodes: FlowNode[],
  edges: FlowEdge[],
): string[] {
  const issues: string[] = [];
  const rules = ((cfg.rules || []) as Array<Record<string, any>>).filter((r) =>
    String(r.field || '').trim(),
  );
  if (!rules.length) return ['尚未配置任何值映射规则'];
  const upFields = upstreamFieldsOf(node, nodes, edges);
  const upNames = new Set(upFields.map((f) => f.name.toLowerCase()));
  const added: string[] = [];

  for (const rule of rules) {
    const field = String(rule.field).trim();
    const column = fieldOf(upFields, field);
    if (!column) {
      issues.push(`字段不存在：${field}`);
      continue;
    }
    const numeric = isNumericType(column.type);
    const mappings = ((rule.mappings || []) as Array<Record<string, any>>);
    if (!mappings.length) issues.push(`字段 ${field} 至少需要 1 条映射`);
    const seen = new Set<string>();
    mappings.forEach((m) => {
      const from = String(m.from ?? '').trim();
      const to = String(m.to ?? '').trim();
      if (!from) {
        issues.push(`字段 ${field} 的映射原值不能为空`);
      } else if (numeric && !isNumericLiteral(from)) {
        issues.push(`数字字段 ${field} 的映射原值必须是数字：${from}`);
      } else {
        const key = numeric ? String(Number(from)) : from;
        if (seen.has(key)) issues.push(`字段 ${field} 的映射原值重复：${from}`);
        seen.add(key);
      }
      if (numeric && to && !isNumericLiteral(to)) {
        issues.push(`数字字段 ${field} 的映射新值必须是数字：${to}`);
      }
    });
    const unmatched = String(rule.unmatched || 'KEEP').toUpperCase();
    if (unmatched === 'VALUE') {
      const value = String(rule.unmatchedValue ?? '');
      if (!value.trim()) issues.push(`字段 ${field} 选择「替换为指定值」时需填写值`);
      else if (numeric && !isNumericLiteral(value)) {
        issues.push(`数字字段 ${field} 的未匹配替换值必须是数字：${value}`);
      }
    }
    const output = String(rule.output || '').trim();
    if (output && output.toLowerCase() !== field.toLowerCase()) added.push(output);
  }

  const dupOut = duplicateNames(added);
  if (dupOut.length) issues.push(`值映射输出字段重名：${dupOut.join('、')}`);
  const conflict = [...new Set(added.filter((o) => upNames.has(o.toLowerCase())))];
  if (conflict.length) issues.push(`新增输出字段与上游重名：${conflict.join('、')}`);
  return issues;
}

function uniqueRowsIssues(
  cfg: Record<string, any>,
  node: FlowNode,
  nodes: FlowNode[],
  edges: FlowEdge[],
): string[] {
  const issues: string[] = [];
  const upFields = upstreamFieldsOf(node, nodes, edges);
  const keyFields = ((cfg.keyFields || []) as string[]).filter(Boolean);
  if (!keyFields.length) issues.push('行去重至少需要 1 个关键字段');
  const missingKeys = [...new Set(keyFields.filter((k) => !fieldOf(upFields, k)))];
  if (missingKeys.length) issues.push(`关键字段不存在：${missingKeys.join('、')}`);
  const mode = String(cfg.mode || 'SIMPLE').toUpperCase();
  if (mode === 'RULE') {
    const rows = ((cfg.orderBy || []) as Array<Record<string, any>>);
    const orderBy = rows.filter((k) => String(k.field || '').trim());
    if (!orderBy.length) issues.push('按规则去重至少需要 1 个排序字段');
    const emptyRows = rows.length - orderBy.length;
    if (emptyRows > 0) issues.push(`有 ${emptyRows} 个排序字段未选择，请选择字段后再保存/预览`);
    const missingOrder = [...new Set(
      orderBy.filter((k) => !fieldOf(upFields, String(k.field))).map((k) => String(k.field)),
    )];
    if (missingOrder.length) issues.push(`排序字段不存在：${missingOrder.join('、')}`);
  }
  if (String(cfg.duplicateOutput || 'DISCARD').toUpperCase() === 'TABLE') {
    const target = (cfg.duplicateTarget || {}) as Record<string, any>;
    if (!target.dataSourceId) issues.push('重复行分流需选择 Doris 目标数据源');
    if (!String(target.tableName || '').trim()) issues.push('重复行分流需填写目标表名');
  }
  return issues;
}

function columnsToRowsIssues(
  cfg: Record<string, any>,
  node: FlowNode,
  nodes: FlowNode[],
  edges: FlowEdge[],
): string[] {
  const issues: string[] = [];
  const upFields = upstreamFieldsOf(node, nodes, edges);
  const keepFields = ((cfg.keepFields || []) as string[]).filter(Boolean);
  const missingKeep = [...new Set(keepFields.filter((k) => !fieldOf(upFields, k)))];
  if (missingKeep.length) issues.push(`保留字段不存在：${missingKeep.join('、')}`);

  const valueFields = ((cfg.valueFields || []) as Array<Record<string, any>>).filter((v) =>
    String(v.field || '').trim(),
  );
  if (!valueFields.length) issues.push('列转行至少需要 1 个值字段');
  const missingValues = [...new Set(
    valueFields.filter((v) => !fieldOf(upFields, String(v.field))).map((v) => String(v.field)),
  )];
  if (missingValues.length) issues.push(`值字段不存在：${missingValues.join('、')}`);

  const nameOutput = String(cfg.nameOutput ?? '').trim();
  const valueOutput = String(cfg.valueOutput ?? '').trim();
  if (!nameOutput) issues.push('名称列名不能为空');
  if (!valueOutput) issues.push('值列名不能为空');
  if (nameOutput && valueOutput && nameOutput.toLowerCase() === valueOutput.toLowerCase()) {
    issues.push('名称列与值列不能同名');
  }
  const keepNames = new Set(keepFields.map((k) => k.toLowerCase()));
  if (nameOutput && keepNames.has(nameOutput.toLowerCase())) issues.push(`名称列与保留字段重名：${nameOutput}`);
  if (valueOutput && keepNames.has(valueOutput.toLowerCase())) issues.push(`值列与保留字段重名：${valueOutput}`);

  const valueType = String(cfg.valueType || 'STRING').toUpperCase();
  if (!['STRING', 'DOUBLE', 'BIGINT'].includes(valueType)) {
    issues.push(`值类型仅支持 STRING / DOUBLE / BIGINT：${valueType}`);
  } else if (valueType !== 'STRING') {
    const nonNumeric = valueFields
      .filter((v) => {
        const column = fieldOf(upFields, String(v.field));
        return column && !isNumericType(column.type);
      })
      .map((v) => String(v.field));
    if (nonNumeric.length) {
      issues.push(`值类型为 ${valueType} 时值字段必须都是数字类型：${nonNumeric.join('、')}`);
    }
  }
  return issues;
}

function rowsToColumnsIssues(
  cfg: Record<string, any>,
  node: FlowNode,
  nodes: FlowNode[],
  edges: FlowEdge[],
): string[] {
  const issues: string[] = [];
  const upFields = upstreamFieldsOf(node, nodes, edges);
  const groupFields = ((cfg.groupFields || []) as string[]).filter(Boolean);
  if (!groupFields.length) issues.push('行转列至少需要 1 个分组字段');
  const missingGroups = [...new Set(groupFields.filter((g) => !fieldOf(upFields, g)))];
  if (missingGroups.length) issues.push(`分组字段不存在：${missingGroups.join('、')}`);

  const pivotField = String(cfg.pivotField || '').trim();
  const valueField = String(cfg.valueField || '').trim();
  if (!pivotField) issues.push('未选择透视字段');
  else if (!fieldOf(upFields, pivotField)) issues.push(`透视字段不存在：${pivotField}`);
  if (!valueField) issues.push('未选择值字段');
  else if (!fieldOf(upFields, valueField)) issues.push(`值字段不存在：${valueField}`);
  if (pivotField && valueField && pivotField.toLowerCase() === valueField.toLowerCase()) {
    issues.push('透视字段与值字段不能相同');
  }
  const groupSet = new Set(groupFields.map((g) => g.toLowerCase()));
  if (pivotField && groupSet.has(pivotField.toLowerCase())) issues.push('透视字段不能是分组字段');
  if (valueField && groupSet.has(valueField.toLowerCase())) issues.push('值字段不能是分组字段');

  const aggregate = String(cfg.aggregate || 'SUM').toUpperCase();
  if (!['SUM', 'MAX', 'MIN', 'AVG', 'COUNT'].includes(aggregate)) {
    issues.push(`不支持的聚合方式：${aggregate}`);
  }

  const pivots = ((cfg.pivotValues || []) as Array<Record<string, any>>);
  if (!pivots.length) issues.push('行转列至少需要 1 个透视取值');
  const outputs = pivots.map((p) => String(p.output || '').trim());
  if (outputs.some((o) => !o)) issues.push('透视取值的输出列名不能为空');
  const dupOut = duplicateNames(outputs);
  if (dupOut.length) issues.push(`透视输出列重名：${dupOut.join('、')}`);
  const groupConflict = [...new Set(outputs.filter((o) => o && groupSet.has(o.toLowerCase())))];
  if (groupConflict.length) issues.push(`透视输出列与分组字段重名：${groupConflict.join('、')}`);
  const pivotColumn = fieldOf(upFields, pivotField);
  if (pivotColumn && isNumericType(pivotColumn.type)) {
    const badValues = pivots
      .filter((p) => {
        const value = String(p.value ?? '').trim();
        return value && !isNumericLiteral(value);
      })
      .map((p) => String(p.value));
    if (badValues.length) issues.push(`数字透视字段的取值必须是数字：${badValues.join('、')}`);
  }
  return issues;
}

function replaceInStringIssues(
  cfg: Record<string, any>,
  node: FlowNode,
  nodes: FlowNode[],
  edges: FlowEdge[],
): string[] {
  const issues: string[] = [];
  const upFields = upstreamFieldsOf(node, nodes, edges);
  const field = String(cfg.field || '').trim();
  const column = fieldOf(upFields, field);
  if (!field) issues.push('未选择输入字段');
  else if (!column) issues.push(`字段不存在：${field}`);
  else if (!isStringType(column.type)) issues.push(`输入字段必须是字符串类型：${field}`);
  if (!String(cfg.search ?? '').length) issues.push('查找内容不能为空');
  if (cfg.useRegex && String(cfg.search ?? '').length) {
    try {
      new RegExp(String(cfg.search));
    } catch (e) {
      issues.push(`正则表达式无效：${(e as Error).message}`);
    }
  }
  const output = String(cfg.output || '').trim();
  if (output && field && output.toLowerCase() !== field.toLowerCase()) {
    const upNames = new Set(upFields.map((f) => f.name.toLowerCase()));
    if (upNames.has(output.toLowerCase())) issues.push(`输出字段与上游重名：${output}`);
  }
  return issues;
}

function llmIssues(
  cfg: Record<string, any>,
  node: FlowNode,
  nodes: FlowNode[],
  edges: FlowEdge[],
): string[] {
  const issues: string[] = [];
  const upFields = upstreamFieldsOf(node, nodes, edges);
  const inputFields = ((cfg.inputFields || []) as unknown[])
    .map((v) => String(v ?? '').trim())
    .filter(Boolean);
  if (!inputFields.length) issues.push('至少选择 1 个输入字段');
  const missingInputs = [...new Set(inputFields.filter((f) => !fieldOf(upFields, f)))];
  if (missingInputs.length) issues.push(`输入字段不存在：${missingInputs.join('、')}`);

  // 字段 → 变量名映射；旧配置没有 inputVariables 时变量名默认取字段名。
  const rawVars = ((cfg.inputVariables || []) as Array<Record<string, any>>).map((v) => ({
    field: String(v?.field ?? '').trim(),
    variable: String(v?.variable ?? '').trim(),
  }));
  const variableByField = new Map<string, string>();
  for (const field of inputFields) {
    const hit = rawVars.find((v) => v.field === field);
    variableByField.set(field, hit?.variable || field);
  }
  const usedVars = new Map<string, string>();
  const invalidVars: string[] = [];
  const dupVars: string[] = [];
  const reservedVars: string[] = [];
  for (const field of inputFields) {
    const variable = variableByField.get(field) || '';
    if (!variable) {
      invalidVars.push(`${field}（变量名为空）`);
      continue;
    }
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(variable)) {
      invalidVars.push(`${field}（${variable}）`);
      continue;
    }
    if (['enum_list', 'fallback', 'input_text'].includes(variable)) {
      reservedVars.push(variable);
      continue;
    }
    const key = variable.toLowerCase();
    if (usedVars.has(key)) dupVars.push(variable);
    else usedVars.set(key, field);
  }
  if (invalidVars.length) {
    issues.push(`变量名需以字母/下划线开头且只含字母、数字、下划线：${invalidVars.join('、')}`);
  }
  if (dupVars.length) issues.push(`变量名重复：${[...new Set(dupVars)].join('、')}`);
  if (reservedVars.length) {
    issues.push(`变量名不能使用保留名：${[...new Set(reservedVars)].join('、')}`);
  }

  const enumValues = ((cfg.enumValues || []) as unknown[])
    .map((v) => String(v ?? '').trim())
    .filter(Boolean);
  if (!enumValues.length) issues.push('至少填写 1 个标准输出枚举值');

  if (!String(cfg.unknownValue || '').trim()) {
    issues.push('未知/兜底值（unknownValue）不能为空');
  }

  const outputField = String(cfg.outputField || '').trim();
  if (!outputField) issues.push('输出字段名不能为空');
  else if (upFields.some((f) => f.name.toLowerCase() === outputField.toLowerCase())) {
    issues.push(`输出字段与上游已有列重名：${outputField}`);
  }

  if (!String(cfg.endpoint || '').trim()) issues.push('模型 endpoint 不能为空');
  if (!String(cfg.model || '').trim()) issues.push('模型 model 不能为空');

  const batchRows = Number(cfg.batchRows);
  if (!Number.isInteger(batchRows) || batchRows < 1 || batchRows > 200) {
    issues.push('批大小必须是 1~200 的整数');
  }

  const template = String(cfg.promptTemplate || '');
  const hasBatchToken = template.includes('${input_text}');
  const hasFieldVar = [...usedVars.keys()].some((v) =>
    template.toLowerCase().includes(`\${${v}}`),
  );
  if (!hasBatchToken && !hasFieldVar) {
    issues.push('Prompt 模板必须包含 ${input_text}（批量）或至少一个字段变量（逐行）');
  }
  return issues;
}

/** 硬性阻断：不满足时禁用「保存配置」与预览。 */
export function blockingIssues(node: FlowNode, nodes: FlowNode[], edges: FlowEdge[]): string[] {
  const cfg = node.data.config as Record<string, any>;
  switch (node.data.kind) {
    case 'columnsToRows':
      return columnsToRowsIssues(cfg, node, nodes, edges).filter(
        (i) => i === '名称列名不能为空' || i === '值列名不能为空',
      );
    case 'uniqueRows': {
      if (String(cfg.mode || 'SIMPLE').toUpperCase() !== 'RULE') return [];
      const rows = ((cfg.orderBy || []) as Array<Record<string, any>>);
      return rows.some((r) => !String(r.field || '').trim())
        ? ['有排序字段未选择，请选择字段后再保存/预览']
        : [];
    }
    case 'replaceInString':
      return replaceInStringIssues(cfg, node, nodes, edges);
    case 'llm':
      return llmIssues(cfg, node, nodes, edges);
    default:
      return [];
  }
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
    if (node.data.kind === 'replaceNull') {
      for (const issue of replaceNullIssues(cfg, node, nodes, edges)) {
        warnings.push(`节点「${node.data.label}」${issue}`);
      }
    }
    if (node.data.kind === 'sortRows') {
      for (const issue of sortRowsIssues(cfg, node, nodes, edges)) {
        warnings.push(`节点「${node.data.label}」${issue}`);
      }
    }
    if (node.data.kind === 'splitFields') {
      for (const issue of splitFieldsIssues(cfg, node, nodes, edges)) {
        warnings.push(`节点「${node.data.label}」${issue}`);
      }
    }
    if (node.data.kind === 'splitFieldsToRows') {
      for (const issue of splitToRowsIssues(cfg, node, nodes, edges)) {
        warnings.push(`节点「${node.data.label}」${issue}`);
      }
    }
    if (node.data.kind === 'valueMapper') {
      for (const issue of valueMapperIssues(cfg, node, nodes, edges)) {
        warnings.push(`节点「${node.data.label}」${issue}`);
      }
    }
    if (node.data.kind === 'uniqueRows') {
      for (const issue of uniqueRowsIssues(cfg, node, nodes, edges)) {
        warnings.push(`节点「${node.data.label}」${issue}`);
      }
    }
    if (node.data.kind === 'columnsToRows') {
      for (const issue of columnsToRowsIssues(cfg, node, nodes, edges)) {
        warnings.push(`节点「${node.data.label}」${issue}`);
      }
    }
    if (node.data.kind === 'rowsToColumns') {
      for (const issue of rowsToColumnsIssues(cfg, node, nodes, edges)) {
        warnings.push(`节点「${node.data.label}」${issue}`);
      }
    }
    if (node.data.kind === 'replaceInString') {
      for (const issue of replaceInStringIssues(cfg, node, nodes, edges)) {
        warnings.push(`节点「${node.data.label}」${issue}`);
      }
    }
    if (node.data.kind === 'llm') {
      for (const issue of llmIssues(cfg, node, nodes, edges)) {
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
    case 'replaceNull': {
      const issues = replaceNullIssues(cfg, node, nodes, edges);
      return issues.length ? issues[0] : null;
    }
    case 'sortRows': {
      const issues = sortRowsIssues(cfg, node, nodes, edges);
      return issues.length ? issues[0] : null;
    }
    case 'splitFields': {
      const issues = splitFieldsIssues(cfg, node, nodes, edges);
      return issues.length ? issues[0] : null;
    }
    case 'splitFieldsToRows': {
      const issues = splitToRowsIssues(cfg, node, nodes, edges);
      return issues.length ? issues[0] : null;
    }
    case 'valueMapper': {
      const issues = valueMapperIssues(cfg, node, nodes, edges);
      return issues.length ? issues[0] : null;
    }
    case 'uniqueRows': {
      const issues = uniqueRowsIssues(cfg, node, nodes, edges);
      return issues.length ? issues[0] : null;
    }
    case 'columnsToRows': {
      const issues = columnsToRowsIssues(cfg, node, nodes, edges);
      return issues.length ? issues[0] : null;
    }
    case 'rowsToColumns': {
      const issues = rowsToColumnsIssues(cfg, node, nodes, edges);
      return issues.length ? issues[0] : null;
    }
    case 'replaceInString': {
      const issues = replaceInStringIssues(cfg, node, nodes, edges);
      return issues.length ? issues[0] : null;
    }
    case 'llm': {
      const issues = llmIssues(cfg, node, nodes, edges);
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
