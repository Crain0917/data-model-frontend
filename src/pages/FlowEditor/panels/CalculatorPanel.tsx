import { Button, Input, InputNumber, Select } from 'antd';
import { DeleteOutlined, PlusOutlined, TableOutlined } from '@ant-design/icons';
import type {
  CalculatorConfig,
  CalculatorRow,
  CalcOperation,
  CalcReturnType,
  FieldDef,
} from '../../../types';
import { findUpstream, outputFields } from '../../../utils/dagUtils';
import { DangerLine, NodeCommon, SectionTitle, WarningLine, fieldOptions, type PanelProps } from './common';
import SqlPreview from './SqlPreview';

const OPERATIONS: Array<{ value: CalcOperation; label: string }> = [
  { value: 'ADD', label: 'A + B' },
  { value: 'SUBTRACT', label: 'A - B' },
  { value: 'MULTIPLY', label: 'A × B' },
  { value: 'DIVIDE', label: 'A ÷ B' },
  { value: 'MOD', label: 'A % B' },
  { value: 'ADD3', label: 'A + B + C' },
  { value: 'MULTIPLY3', label: 'A × B × C' },
];

const RETURN_TYPES: Array<{ value: CalcReturnType; label: string }> = [
  { value: 'DOUBLE', label: 'DOUBLE' },
  { value: 'DECIMAL', label: 'DECIMAL(p,s)' },
  { value: 'BIGINT', label: 'BIGINT' },
  { value: 'INT', label: 'INT' },
];

const GRID = '128px 92px 104px 104px 104px 96px 58px 52px 34px';

function blankRow(): CalculatorRow {
  return {
    output: '',
    operation: 'ADD',
    fieldA: '',
    fieldB: '',
    fieldC: null,
    returnType: 'DOUBLE',
    length: null,
    precision: null,
  };
}

function normalize(cfg: Partial<CalculatorConfig>): CalculatorConfig {
  const calculations = ((cfg.calculations || []) as CalculatorRow[]).map((row) => ({
    output: String(row.output || ''),
    operation: (String(row.operation || 'ADD').toUpperCase() as CalcOperation) || 'ADD',
    fieldA: String(row.fieldA || ''),
    fieldB: String(row.fieldB || ''),
    fieldC: row.fieldC == null || row.fieldC === '' ? null : String(row.fieldC),
    returnType: (String(row.returnType || 'DOUBLE').toUpperCase() as CalcReturnType) || 'DOUBLE',
    length: row.length ?? null,
    precision: row.precision ?? null,
  }));
  return { alias: cfg.alias || 'a', calculations };
}

function isTernary(operation: string): boolean {
  return operation === 'ADD3' || operation === 'MULTIPLY3';
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
    if (value === 'DECIMAL') {
      updateRow(index, { returnType: value, length: rows[index].length ?? 18, precision: rows[index].precision ?? 2 });
    } else {
      updateRow(index, { returnType: value, length: null, precision: null });
    }
  };

  const changeOperation = (index: number, value: CalcOperation) => {
    updateRow(index, {
      operation: value,
      ...(isTernary(value) ? {} : { fieldC: null }),
    });
  };

  const complete = rows.filter(
    (r) =>
      r.output.trim() &&
      r.fieldA &&
      r.fieldB &&
      (!isTernary(r.operation) || r.fieldC),
  );
  const incomplete = rows.filter(
    (r) =>
      r.output.trim() ||
      r.fieldA ||
      r.fieldB ||
      r.fieldC,
  ).length > complete.length;
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
        <WarningLine>请先连接上游节点，计算器需要 1 条入线。</WarningLine>
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
              添加计算
            </Button>
          }
        >
          计算表达式
        </SectionTitle>

        <div className="field-table" style={{ overflowX: 'auto' }}>
          <div style={{ minWidth: 790 }}>
            <div className="field-row field-row--head" style={{ gridTemplateColumns: GRID }}>
              <span>输出字段名</span>
              <span>运算</span>
              <span>字段 A</span>
              <span>字段 B</span>
              <span>字段 C</span>
              <span>返回类型</span>
              <span>长度</span>
              <span>精度</span>
              <span />
            </div>
            {rows.map((row, index) => {
              const decimal = row.returnType === 'DECIMAL';
              const ternary = isTernary(row.operation);
              return (
                <div key={index} className="field-row" style={{ gridTemplateColumns: GRID }}>
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
                    options={OPERATIONS}
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
                  <Select
                    size="small"
                    showSearch
                    value={row.fieldB || undefined}
                    placeholder="字段 B"
                    style={{ width: '100%' }}
                    options={options}
                    onChange={(v) => updateRow(index, { fieldB: v || '' })}
                  />
                  <Select
                    size="small"
                    showSearch
                    allowClear
                    value={row.fieldC || undefined}
                    placeholder={ternary ? '字段 C' : '—'}
                    style={{ width: '100%' }}
                    disabled={!ternary}
                    options={options}
                    onChange={(v) => updateRow(index, { fieldC: v || null })}
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
                    max={38}
                    value={row.length ?? undefined}
                    placeholder={decimal ? '18' : '—'}
                    style={{ width: '100%' }}
                    disabled={!decimal}
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
              );
            })}
          </div>
        </div>

        <div className="form-hint" style={{ marginTop: 6, lineHeight: 1.7 }}>
          每个计算行在上游字段之后追加一个新字段，行数不变。DECIMAL 默认 18,2，可修改总位数与小数位；
          需要 4 个及以上字段运算时，请串联多个计算器或改用「公式」节点。
        </div>
        {!rows.length ? <WarningLine>尚未配置任何计算，节点将原样透传上游字段。</WarningLine> : null}
        {incomplete ? <WarningLine>存在未完成的计算行，请补齐输出字段名与输入字段。</WarningLine> : null}
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
