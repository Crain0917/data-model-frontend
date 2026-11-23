import { Button, Input, InputNumber, Select } from 'antd';
import { DeleteOutlined, PlusOutlined, TableOutlined } from '@ant-design/icons';
import type {
  CalculatorConfig,
  CalculatorRow,
  CalcArgMode,
  CalcOperation,
  CalcReturnType,
  FieldDef,
} from '../../../types';
import {
  argBMode,
  argCMode,
  calcOp,
  calcOpGroups,
  calcRowIssue,
  type CalcOpMeta,
} from '../../../utils/calcOps';
import { findUpstream, outputFields } from '../../../utils/dagUtils';
import { DangerLine, NodeCommon, SectionTitle, WarningLine, fieldOptions, type PanelProps } from './common';
import SqlPreview from './SqlPreview';

const OP_GROUPS = calcOpGroups();
const GRID = '118px 168px 116px 168px 168px 100px 58px 52px 32px';

function blankRow(): CalculatorRow {
  return {
    output: '',
    operation: 'ADD',
    fieldA: '',
    fieldB: '',
    fieldC: null,
    argBType: 'FIELD',
    argCType: 'FIELD',
    literalB: null,
    literalC: null,
    returnType: 'DOUBLE',
    length: null,
    precision: null,
  };
}

function normalizeRow(row: Partial<CalculatorRow>): CalculatorRow {
  const op = calcOp(row.operation as string);
  const returnType = String(row.returnType || op.defaultReturn).toUpperCase() as CalcReturnType;
  return {
    output: String(row.output || ''),
    operation: op.value,
    fieldA: String(row.fieldA || ''),
    fieldB: String(row.fieldB || ''),
    fieldC: row.fieldC == null || row.fieldC === '' ? null : String(row.fieldC),
    argBType: (op.bLiteralOnly || row.argBType === 'LITERAL' ? 'LITERAL' : 'FIELD') as CalcArgMode,
    argCType: (op.cMode === 'LITERAL' || row.argCType === 'LITERAL' ? 'LITERAL' : 'FIELD') as CalcArgMode,
    literalB: row.literalB == null ? (op.bMode === 'LITERAL' && op.bDefaultLiteral ? op.bDefaultLiteral : null) : String(row.literalB),
    literalC: row.literalC == null ? null : String(row.literalC),
    returnType: op.returnTypes.includes(returnType) ? returnType : op.defaultReturn,
    length: row.length ?? null,
    precision: row.precision ?? null,
  };
}

function normalize(cfg: Partial<CalculatorConfig>): CalculatorConfig {
  return {
    alias: cfg.alias || 'a',
    calculations: ((cfg.calculations || []) as Partial<CalculatorRow>[]).map(normalizeRow),
  };
}

function typeDefaults(type: CalcReturnType): Pick<CalculatorRow, 'length' | 'precision'> {
  if (type === 'DECIMAL') return { length: 18, precision: 2 };
  if (type === 'STRING') return { length: 255, precision: null };
  return { length: null, precision: null };
}

function opDefaults(row: CalculatorRow, value: CalcOperation): Partial<CalculatorRow> {
  const op: CalcOpMeta = calcOp(value);
  const next: Partial<CalculatorRow> = {
    operation: op.value,
    returnType: op.defaultReturn,
    ...typeDefaults(op.defaultReturn),
  };
  if (op.arity < 2) {
    next.fieldB = '';
    next.argBType = 'FIELD';
    next.literalB = null;
  } else {
    const literalB = op.bLiteralOnly || op.bMode === 'LITERAL';
    next.argBType = literalB ? 'LITERAL' : 'FIELD';
    if (literalB) {
      next.literalB = row.argBType === 'LITERAL' && row.literalB != null
        ? row.literalB
        : op.bDefaultLiteral ?? '';
    } else {
      next.literalB = null;
    }
  }
  if (op.arity < 3) {
    next.fieldC = null;
    next.argCType = 'FIELD';
    next.literalC = null;
  } else {
    const literalC = op.cMode === 'LITERAL';
    next.argCType = literalC ? 'LITERAL' : 'FIELD';
    if (literalC) next.literalC = row.literalC ?? '';
  }
  return next;
}

function isTouched(row: CalculatorRow): boolean {
  return Boolean(
    String(row.output || '').trim() ||
      String(row.fieldA || '').trim() ||
      String(row.fieldB || '').trim() ||
      String(row.fieldC || '').trim() ||
      String(row.literalB ?? '').trim() ||
      String(row.literalC ?? '').trim(),
  );
}

export default function CalculatorPanel({
  node,
  nodes,
  edges,
  flowId,
  onConfig,
  onMeta,
  onPreviewSql,
  onPreviewData,
}: PanelProps) {
  const cfg = normalize(node.data.config as Partial<CalculatorConfig>);
  const upstream = findUpstream(node.id, nodes, edges);
  const upFields: FieldDef[] = upstream ? outputFields(upstream, nodes, edges) : [];
  const rows = cfg.calculations;
  const options = fieldOptions(upFields);

  const patch = (p: Partial<CalculatorConfig>) => onConfig({ ...cfg, ...p });
  const updateRow = (index: number, p: Partial<CalculatorRow>) => {
    patch({ calculations: rows.map((row, i) => (i === index ? { ...row, ...p } : row)) });
  };
  const addRow = () => patch({ calculations: [...rows, blankRow()] });
  const removeRow = (index: number) =>
    patch({ calculations: rows.filter((_, i) => i !== index) });

  const changeReturnType = (index: number, value: CalcReturnType) => {
    updateRow(index, { returnType: value, ...typeDefaults(value) });
  };

  const changeOperation = (index: number, value: CalcOperation) => {
    updateRow(index, opDefaults(rows[index], value));
  };

  const rowIssue = (row: CalculatorRow): string | null => {
    const issue = calcRowIssue(row);
    if (issue) return issue;
    if (row.returnType === 'DECIMAL') {
      const p = row.length ?? 18;
      const s = row.precision ?? 2;
      if (p < 1 || p > 38 || s < 0 || s > p) {
        return 'DECIMAL 精度非法：总位数 1–38，小数位 0–总位数';
      }
    }
    if (row.returnType === 'STRING') {
      const len = row.length ?? 255;
      if (len < 1 || len > 65535) return '字符串长度需为 1–65535';
    }
    return null;
  };

  const touchedRows = rows.filter(isTouched);
  const badRows = touchedRows
    .map((row, i) => ({ row, index: rows.indexOf(row), issue: rowIssue(row), i }))
    .filter((x) => x.issue);
  const badDecimal = rows.filter((r) => {
    if (r.returnType !== 'DECIMAL') return false;
    const p = r.length ?? 18;
    const s = r.precision ?? 2;
    return p < 1 || p > 38 || s < 0 || s > p;
  });
  const outs = rows.map((r) => r.output.trim().toLowerCase()).filter(Boolean);
  const upNames = upFields.map((f) => f.name.toLowerCase());
  const duplicateOuts = [
    ...new Set(outs.filter((name, i) => outs.indexOf(name) !== i || upNames.includes(name))),
  ];

  if (!upstream) {
    return (
      <div>
        <NodeCommon node={node} onMeta={onMeta} />
        <WarningLine>请先连接上游节点，简单公式计算列需要 1 条入线。</WarningLine>
      </div>
    );
  }

  const argCell = (
    index: number,
    row: CalculatorRow,
    slot: 'B' | 'C',
    op: CalcOpMeta,
  ) => {
    const arityOk = slot === 'B' ? op.arity >= 2 : op.arity >= 3;
    if (!arityOk) {
      return <span className="form-hint" style={{ paddingLeft: 6 }}>—</span>;
    }
    const literalOnly = slot === 'B' ? op.bLiteralOnly : op.cMode === 'LITERAL';
    const mode = slot === 'B' ? argBMode(row) : argCMode(row);
    const fieldValue = slot === 'B' ? row.fieldB : row.fieldC || '';
    const literalValue = (slot === 'B' ? row.literalB : row.literalC) ?? '';
    const setMode = (next: CalcArgMode) => {
      if (slot === 'B') {
        updateRow(index, {
          argBType: next,
          ...(next === 'LITERAL'
            ? { literalB: row.literalB ?? op.bDefaultLiteral ?? '' }
            : { literalB: null }),
        });
      } else {
        updateRow(index, {
          argCType: next,
          ...(next === 'LITERAL' ? { literalC: row.literalC ?? '' } : { literalC: null }),
        });
      }
    };
    const setField = (value: string) => {
      if (slot === 'B') updateRow(index, { fieldB: value || '' });
      else updateRow(index, { fieldC: value || null });
    };
    const setLiteral = (value: string) => {
      if (slot === 'B') updateRow(index, { literalB: value });
      else updateRow(index, { literalC: value });
    };

    return (
      <div style={{ display: 'flex', gap: 3, minWidth: 0 }}>
        {literalOnly ? null : (
          <Select
            size="small"
            value={mode}
            style={{ width: 54, flex: '0 0 54px' }}
            options={[
              { value: 'FIELD', label: '字段' },
              { value: 'LITERAL', label: '常量' },
            ]}
            onChange={(v) => setMode(v as CalcArgMode)}
          />
        )}
        {mode === 'LITERAL' || literalOnly ? (
          <Input
            size="small"
            value={literalValue}
            placeholder={slot === 'B' ? op.bPlaceholder || '常量 B' : '常量 C'}
            onChange={(e) => setLiteral(e.target.value)}
          />
        ) : (
          <Select
            size="small"
            showSearch
            value={fieldValue || undefined}
            placeholder={`字段 ${slot}`}
            style={{ width: '100%', minWidth: 0 }}
            options={options}
            onChange={setField}
          />
        )}
      </div>
    );
  };

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
              添加计算
            </Button>
          }
        >
          计算表达式
        </SectionTitle>

        <div className="field-table" style={{ overflowX: 'auto' }}>
          <div style={{ minWidth: 1010 }}>
            <div className="field-row field-row--head" style={{ gridTemplateColumns: GRID }}>
              <span>输出字段名</span>
              <span>运算</span>
              <span>字段 A</span>
              <span>字段 B / 常量</span>
              <span>字段 C / 常量</span>
              <span>返回类型</span>
              <span>长度</span>
              <span>精度</span>
              <span />
            </div>
            {rows.map((row, index) => {
              const op = calcOp(row.operation);
              const decimal = row.returnType === 'DECIMAL';
              const isString = row.returnType === 'STRING';
              const issue = isTouched(row) ? rowIssue(row) : null;
              return (
                <div key={index}>
                  <div className="field-row" style={{ gridTemplateColumns: GRID, alignItems: 'start' }}>
                    <Input
                      size="small"
                      value={row.output}
                      placeholder="新字段名"
                      onChange={(e) => updateRow(index, { output: e.target.value })}
                    />
                    <Select
                      size="small"
                      value={row.operation}
                      style={{ width: '100%' }}
                      options={OP_GROUPS}
                      listHeight={420}
                      onChange={(v) => changeOperation(index, v)}
                    />
                    <Select
                      size="small"
                      showSearch
                      value={row.fieldA || undefined}
                      placeholder="字段 A"
                      style={{ width: '100%' }}
                      options={options}
                      onChange={(v) => updateRow(index, { fieldA: v || '' })}
                    />
                    {argCell(index, row, 'B', op)}
                    {argCell(index, row, 'C', op)}
                    <Select
                      size="small"
                      value={row.returnType}
                      style={{ width: '100%' }}
                      options={op.returnTypes.map((t) => ({
                        value: t,
                        label: t === 'DECIMAL' ? 'DECIMAL(p,s)' : t,
                      }))}
                      onChange={(v) => changeReturnType(index, v)}
                    />
                    <InputNumber
                      size="small"
                      controls={false}
                      min={1}
                      max={isString ? 65535 : 38}
                      value={row.length ?? undefined}
                      placeholder={isString ? '255' : decimal ? '18' : '—'}
                      style={{ width: '100%' }}
                      disabled={!decimal && !isString}
                      onChange={(v) => updateRow(index, { length: (v as number) ?? null })}
                    />
                    <InputNumber
                      size="small"
                      controls={false}
                      min={0}
                      max={decimal ? Number(row.length ?? 18) : 0}
                      value={row.precision ?? undefined}
                      placeholder={decimal ? '2' : '—'}
                      style={{ width: '100%' }}
                      disabled={!decimal}
                      onChange={(v) => updateRow(index, { precision: (v as number) ?? null })}
                    />
                    <Button
                      size="small"
                      type="text"
                      danger
                      icon={<DeleteOutlined />}
                      aria-label="删除计算行"
                      onClick={() => removeRow(index)}
                    />
                  </div>
                  <div
                    className="calc-op-doc"
                    style={{
                      margin: '2px 8px 8px',
                      padding: '6px 10px',
                      borderLeft: '2px solid var(--info)',
                      background: 'var(--bg-elevated)',
                      borderRadius: 4,
                      fontSize: 12,
                      lineHeight: 1.7,
                      color: 'var(--text-secondary)',
                    }}
                  >
                    <div>
                      <span style={{ color: 'var(--text-primary)' }}>{op.label}</span>
                      {' · '}
                      {op.description}
                    </div>
                    <div className="mono" style={{ marginTop: 2 }}>
                      输入 {op.exampleInput} → 输出 {op.exampleOutput}
                    </div>
                  </div>
                  {issue ? (
                    <div
                      className="form-hint"
                      style={{ color: 'var(--danger)', padding: '2px 8px 4px' }}
                    >
                      {issue}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>

        <div className="form-hint" style={{ marginTop: 6, lineHeight: 1.7 }}>
          每个计算行在上游字段之后追加一个新字段，行数不变。B/C 可切换「字段 / 常量」，
          具体含义见每行下方的公式说明。
        </div>
        {!rows.length ? <WarningLine>尚未配置任何计算，节点将原样透传上游字段。</WarningLine> : null}
        {badRows.length ? (
          <WarningLine>存在未完成的计算行，请按行内提示补齐字段或常量。</WarningLine>
        ) : null}
        {badDecimal.length ? (
          <DangerLine>
            DECIMAL 精度非法：{badDecimal.map((r) => r.output || '未命名').join('、')}（总位数 1–38，小数位 0–总位数）
          </DangerLine>
        ) : null}
        {duplicateOuts.length ? (
          <DangerLine>输出字段重名：{duplicateOuts.join('、')}，请修改输出字段名。</DangerLine>
        ) : null}
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Button icon={<TableOutlined />} onClick={() => onPreviewData(outputFields(node, nodes, edges))}>
          预览数据
        </Button>
      </div>

      <SqlPreview node={node} nodes={nodes} edges={edges} flowId={flowId} onPreviewSql={onPreviewSql} />
    </div>
  );
}
