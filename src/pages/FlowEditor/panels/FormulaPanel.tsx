import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { App, Button, Input, InputNumber, Select } from 'antd';
import { DeleteOutlined, PlusOutlined, TableOutlined } from '@ant-design/icons';
import type {
  FieldDef,
  FlowNode,
  FormulaConfig,
  FormulaReturnType,
  FormulaRow,
} from '../../../types';
import { findUpstream, outputFields } from '../../../utils/dagUtils';
import { toDagJson } from '../../../utils/dagJson';
import { previewNodeSql } from '../../../api/flow';
import { DangerLine, NodeCommon, SectionTitle, WarningLine, fieldOptions, type PanelProps } from './common';
import SqlPreview from './SqlPreview';

const RETURN_TYPES: Array<{ value: FormulaReturnType; label: string }> = [
  { value: 'DOUBLE', label: 'DOUBLE' },
  { value: 'DECIMAL', label: 'DECIMAL(p,s)' },
  { value: 'STRING', label: 'STRING' },
  { value: 'BIGINT', label: 'BIGINT' },
  { value: 'INT', label: 'INT' },
];

const GRID = '128px 260px 96px 58px 52px 96px 34px';
const AGGREGATES = /\b(COUNT|AVG|MIN|MAX|GROUP_CONCAT|STDDEV\w*|VARIANCE|VAR_\w+|APPROX_COUNT_DISTINCT|PERCENTILE\w*|MEDIAN)\s*\(/i;

interface Draft {
  output?: string;
  expression?: string;
  length?: number | null;
  precision?: number | null;
}

function blankRow(): FormulaRow {
  return {
    output: '',
    expression: '',
    returnType: 'DOUBLE',
    length: null,
    precision: null,
  };
}

function normalize(cfg: Partial<FormulaConfig>): FormulaConfig {
  return {
    alias: cfg.alias || 'a',
    formulas: ((cfg.formulas || []) as FormulaRow[]).map((row) => ({
      output: String(row.output || ''),
      expression: String(row.expression || ''),
      returnType: (String(row.returnType || 'DOUBLE').toUpperCase() as FormulaReturnType) || 'DOUBLE',
      length: row.length ?? null,
      precision: row.precision ?? null,
    })),
  };
}

function appendField(expression: string, field: string): string {
  const expr = expression.trimEnd();
  if (!expr) return `[${field}]`;
  if (/[+\-*/%(,\[]$/.test(expr)) return `${expr}[${field}]`;
  return `${expr} + [${field}]`;
}

export default function FormulaPanel({
  node,
  nodes,
  edges,
  flowId,
  onConfig,
  onMeta,
  onPreviewSql,
  onPreviewData,
}: PanelProps) {
  const { message } = App.useApp();
  const cfg = normalize(node.data.config as Partial<FormulaConfig>);
  const upstream = findUpstream(node.id, nodes, edges);
  const upFields: FieldDef[] = upstream ? outputFields(upstream, nodes, edges) : [];
  const rows = cfg.formulas;
  const options = fieldOptions(upFields);

  // 表达式/输出名先进本地草稿，失焦或 Ctrl+Enter 才提交，避免逐字触发 SQL 预览与红错。
  const [drafts, setDrafts] = useState<Record<number, Draft>>({});
  const draftsRef = useRef<Record<number, Draft>>({});
  const cfgRef = useRef(cfg);
  const onConfigRef = useRef(onConfig);
  draftsRef.current = drafts;
  cfgRef.current = cfg;
  onConfigRef.current = onConfig;

  const patch = (p: Partial<FormulaConfig>) => onConfig({ ...cfg, ...p });
  const addRow = () => {
    const current = flushDrafts();
    onConfig({ ...current, formulas: [...current.formulas, blankRow()] });
  };
  const removeRow = (index: number) => {
    const current = flushDrafts();
    onConfig({ ...current, formulas: current.formulas.filter((_, i) => i !== index) });
  };

  const changeReturnType = (index: number, value: FormulaReturnType) => {
    // 切换返回类型会重置长度/精度，丢弃该行尚未提交的旧数值草稿。
    const draft = draftsRef.current[index];
    if (draft && (draft.length !== undefined || draft.precision !== undefined)) {
      const next = { ...draftsRef.current, [index]: { ...draft, length: undefined, precision: undefined } };
      draftsRef.current = next;
      setDrafts(next);
    }
    const row = rows[index];
    let p: Partial<FormulaRow>;
    if (value === 'DECIMAL') {
      p = { returnType: value, length: row.length ?? 18, precision: row.precision ?? 2 };
    } else if (value === 'STRING') {
      p = { returnType: value, length: row.length ?? 255, precision: null };
    } else {
      p = { returnType: value, length: null, precision: null };
    }
    patch({ formulas: rows.map((r, i) => (i === index ? { ...r, ...p } : r)) });
  };

  /** 把草稿合并进配置；only 指定时只提交某一行。 */
  const flushDrafts = (only?: number): FormulaConfig => {
    const current = cfgRef.current;
    const pending = draftsRef.current;
    const keys = only == null ? Object.keys(pending).map(Number) : [only];
    if (!keys.length) return current;
    let changed = false;
    const formulas = current.formulas.map((row, i) => {
      if (!keys.includes(i) || !pending[i]) return row;
      const draft = pending[i];
      const next = { ...row };
      if (draft.output !== undefined && draft.output !== row.output) {
        next.output = draft.output;
        changed = true;
      }
      if (draft.expression !== undefined && draft.expression !== row.expression) {
        next.expression = draft.expression;
        changed = true;
      }
      if (draft.length !== undefined && draft.length !== row.length) {
        next.length = draft.length;
        changed = true;
      }
      if (draft.precision !== undefined && draft.precision !== row.precision) {
        next.precision = draft.precision;
        changed = true;
      }
      return next;
    });
    const nextDrafts = { ...pending };
    keys.forEach((k) => delete nextDrafts[k]);
    draftsRef.current = nextDrafts;
    if (mountedRef.current) setDrafts(nextDrafts);
    if (!changed) return current;
    const nextCfg = { ...current, formulas };
    cfgRef.current = nextCfg;
    onConfigRef.current(nextCfg);
    return nextCfg;
  };
  const flushRef = useRef(flushDrafts);
  flushRef.current = flushDrafts;
  const mountedRef = useRef(true);
  useEffect(
    () => () => {
      // 切换节点 / 关闭面板时把未提交的草稿落库
      mountedRef.current = false;
      flushRef.current();
    },
    [],
  );

  const setDraft = (index: number, p: Draft) => {
    setDrafts((prev) => ({ ...prev, [index]: { ...prev[index], ...p } }));
  };
  const commitRow = (index: number) => {
    flushDrafts(index);
  };
  const onCtrlEnter = (e: ReactKeyboardEvent, index: number) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      commitRow(index);
      (e.currentTarget as HTMLElement).blur();
    }
  };
  const insertField = (index: number, field: string) => {
    const row = rows[index];
    const draft = drafts[index];
    const expression = draft?.expression ?? row.expression;
    patch({
      formulas: rows.map((r, i) =>
        i === index ? { ...r, expression: appendField(expression, field) } : r,
      ),
    });
    if (draft?.expression !== undefined) {
      const next = { ...draftsRef.current };
      if (next[index]) {
        delete next[index].expression;
        if (next[index].output === undefined) delete next[index];
      }
      draftsRef.current = next;
      setDrafts(next);
    }
  };

  const handlePreviewClick = async (): Promise<string | null> => {
    try {
      const committed = flushDrafts();
      const updatedNodes = nodes.map((n) =>
        n.id === node.id ? ({ ...n, data: { ...n.data, config: committed } } as FlowNode) : n,
      );
      const res = await previewNodeSql(flowId, node.id, toDagJson(updatedNodes, edges));
      return res.displaySql || res.sql || null;
    } catch (e) {
      message.error((e as Error).message || 'SQL 预览失败');
      return null;
    }
  };

  const touched = rows.filter((r) => r.output.trim() || r.expression.trim());
  const emptyExpression = touched.filter((r) => r.output.trim() && !r.expression.trim());
  const complete = touched.filter((r) => r.output.trim() && r.expression.trim());
  const badDecimal = rows.filter((r) => {
    if (r.returnType !== 'DECIMAL') return false;
    const p = r.length ?? 18;
    const s = r.precision ?? 2;
    return p < 1 || p > 38 || s < 0 || s > p;
  });
  const badLength = rows.filter((r) => {
    if (r.returnType !== 'STRING') return false;
    const len = r.length ?? 255;
    return len < 1 || len > 65535;
  });
  const outs = complete.map((r) => r.output.trim().toLowerCase());
  const upNames = upFields.map((f) => f.name.toLowerCase());
  const duplicateOuts = [
    ...new Set(outs.filter((name, i) => outs.indexOf(name) !== i || upNames.includes(name))),
  ];
  const refs = new Set<string>();
  complete.forEach((row) => {
    const re = /\[([^\]]+)\]/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(row.expression))) {
      const name = m[1].trim();
      if (name) refs.add(name);
    }
  });
  const unknownRefs = [...refs].filter((name) => !upNames.includes(name.toLowerCase()));
  const aggregate = complete.map((row) => row.expression.match(AGGREGATES)).find(Boolean);

  if (!upstream) {
    return (
      <div>
        <NodeCommon node={node} onMeta={onMeta} />
        <WarningLine>请先连接上游节点，公式需要 1 条入线。</WarningLine>
      </div>
    );
  }

  return (
    <div>
      <NodeCommon node={node} onMeta={onMeta} />

      <div className="form-section">
        <SectionTitle>输入流</SectionTitle>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span className="form-hint">别名</span>
          <Input
            size="small"
            value={cfg.alias}
            style={{ width: 72 }}
            onChange={(e) => patch({ alias: e.target.value || 'a' })}
          />
          <span className="form-hint" style={{ marginLeft: 4 }}>
            上游：{upstream.data.label} · {upFields.length} 字段
          </span>
        </div>
      </div>

      <div className="form-section">
        <SectionTitle
          extra={
            <Button size="small" type="text" icon={<PlusOutlined />} onClick={addRow}>
              添加公式
            </Button>
          }
        >
          公式
        </SectionTitle>

        <div className="field-table" style={{ overflowX: 'auto' }}>
          <div style={{ minWidth: 760 }}>
            <div className="field-row field-row--head" style={{ gridTemplateColumns: GRID }}>
              <span>输出字段名</span>
              <span>表达式</span>
              <span>返回类型</span>
              <span>长度</span>
              <span>精度</span>
              <span>插入字段</span>
              <span />
            </div>
            {rows.map((row, index) => {
              const decimal = row.returnType === 'DECIMAL';
              const isString = row.returnType === 'STRING';
              const draft = drafts[index];
              return (
                <div key={index} className="field-row" style={{ gridTemplateColumns: GRID, alignItems: 'start' }}>
                  <Input
                    size="small"
                    value={draft?.output ?? row.output}
                    placeholder="新字段名"
                    onChange={(e) => setDraft(index, { output: e.target.value })}
                    onBlur={() => commitRow(index)}
                    onKeyDown={(e) => onCtrlEnter(e, index)}
                  />
                  <Input.TextArea
                    size="small"
                    value={draft?.expression ?? row.expression}
                    placeholder="[a]+[b]+[c]+[d]"
                    autoSize={{ minRows: 1, maxRows: 4 }}
                    onChange={(e) => setDraft(index, { expression: e.target.value })}
                    onBlur={() => commitRow(index)}
                    onKeyDown={(e) => onCtrlEnter(e, index)}
                  />
                  <Select
                    size="small"
                    value={row.returnType}
                    style={{ width: '100%' }}
                    options={RETURN_TYPES}
                    onChange={(v) => changeReturnType(index, v)}
                  />
                  <InputNumber
                    size="small"
                    controls={false}
                    min={1}
                    max={isString ? 65535 : 38}
                    value={(draft?.length !== undefined ? draft.length : row.length) ?? undefined}
                    placeholder={isString ? '255' : decimal ? '18' : '—'}
                    style={{ width: '100%' }}
                    disabled={!decimal && !isString}
                    onChange={(v) => setDraft(index, { length: (v as number) ?? null })}
                    onBlur={() => commitRow(index)}
                  />
                  <InputNumber
                    size="small"
                    controls={false}
                    min={0}
                    max={decimal ? Number(row.length ?? 18) : 0}
                    value={(draft?.precision !== undefined ? draft.precision : row.precision) ?? undefined}
                    placeholder={decimal ? '2' : '—'}
                    style={{ width: '100%' }}
                    disabled={!decimal}
                    onChange={(v) => setDraft(index, { precision: (v as number) ?? null })}
                    onBlur={() => commitRow(index)}
                  />
                  <Select
                    size="small"
                    showSearch
                    value={undefined}
                    placeholder="插入字段"
                    style={{ width: '100%' }}
                    options={options}
                    onChange={(v) => insertField(index, String(v))}
                  />
                  <Button
                    size="small"
                    type="text"
                    danger
                    icon={<DeleteOutlined />}
                    aria-label="删除公式行"
                    onClick={() => removeRow(index)}
                  />
                </div>
              );
            })}
          </div>
        </div>

        <div className="form-hint" style={{ marginTop: 6, lineHeight: 1.7 }}>
          用 <span className="mono">[字段名]</span> 引用上游字段；支持 + - * / %、括号、数字/字符串常量；
          SUM(a,b,...) 为行内求和，不是分组聚合；不支持 COUNT/AVG/MIN/MAX 等聚合函数。
          每个公式行在上游字段之后追加一个新字段，行数不变。
        </div>
        {!rows.length ? <WarningLine>尚未配置任何公式，节点将原样透传上游字段。</WarningLine> : null}
        {emptyExpression.length ? (
          <WarningLine>
            存在空表达式：{emptyExpression.map((r) => r.output.trim()).join('、')}
          </WarningLine>
        ) : null}
        {badDecimal.length ? (
          <DangerLine>
            DECIMAL 精度非法：{badDecimal.map((r) => r.output || '未命名').join('、')}（总位数 1–38，小数位 0–总位数）
          </DangerLine>
        ) : null}
        {badLength.length ? (
          <DangerLine>
            STRING 长度非法：{badLength.map((r) => r.output || '未命名').join('、')}（1–65535）
          </DangerLine>
        ) : null}
        {duplicateOuts.length ? (
          <DangerLine>输出字段重名：{duplicateOuts.join('、')}，请修改输出字段名。</DangerLine>
        ) : null}
        {unknownRefs.length ? (
          <DangerLine>公式引用了不存在的字段：{unknownRefs.join('、')}</DangerLine>
        ) : null}
        {aggregate ? (
          <DangerLine>公式不支持聚合函数：{String(aggregate[1]).toUpperCase()}（公式为行级变换）</DangerLine>
        ) : null}
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Button icon={<TableOutlined />} onClick={() => onPreviewData(outputFields(node, nodes, edges))}>
          预览数据
        </Button>
      </div>

      <SqlPreview
        node={node}
        nodes={nodes}
        edges={edges}
        flowId={flowId}
        onPreviewSql={onPreviewSql}
        onPreviewClick={handlePreviewClick}
      />
    </div>
  );
}
