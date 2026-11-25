import { Button, Input, Select, Switch } from 'antd';
import { DeleteOutlined, PlusOutlined, TableOutlined } from '@ant-design/icons';
import type {
  ColumnsToRowsConfig,
  ColumnsToRowsValueField,
  ColumnsToRowsValueType,
  FieldDef,
} from '../../../types';
import { findUpstream, isNumericType, outputFields } from '../../../utils/dagUtils';
import { displayDorisType, typeTooltip } from '../../../utils/dorisType';
import {
  DangerLine,
  NodeCommon,
  SectionTitle,
  WarningLine,
  fieldOptions,
  type PanelProps,
} from './common';
import SqlPreview from './SqlPreview';

const VALUE_TYPES: Array<{ value: ColumnsToRowsValueType; label: string }> = [
  { value: 'STRING', label: 'STRING 文本' },
  { value: 'DOUBLE', label: 'DOUBLE 小数' },
  { value: 'BIGINT', label: 'BIGINT 整数' },
];

function normalize(cfg: Partial<ColumnsToRowsConfig>): ColumnsToRowsConfig {
  const raw = String(cfg.valueType || 'STRING').toUpperCase();
  return {
    alias: cfg.alias || 'a',
    keepFields: Array.isArray(cfg.keepFields) ? cfg.keepFields.filter(Boolean) : [],
    valueFields: (cfg.valueFields || []).filter((v) => String(v.field || '').trim()),
    nameOutput: String(cfg.nameOutput || '').trim() || 'field_name',
    valueOutput: String(cfg.valueOutput || '').trim() || 'field_value',
    valueType: (raw === 'DOUBLE' || raw === 'BIGINT' ? raw : 'STRING') as ColumnsToRowsValueType,
    skipNull: Boolean(cfg.skipNull),
  };
}

export default function ColumnsToRowsPanel({
  node,
  nodes,
  edges,
  flowId,
  onConfig,
  onMeta,
  onPreviewSql,
  onPreviewData,
}: PanelProps) {
  const cfg = normalize(node.data.config as Partial<ColumnsToRowsConfig>);
  const upstream = findUpstream(node.id, nodes, edges);
  const upFields: FieldDef[] = upstream ? outputFields(upstream, nodes, edges) : [];
  const valueFields = cfg.valueFields;

  const patch = (p: Partial<ColumnsToRowsConfig>) => onConfig({ ...cfg, ...p });
  const updateValueField = (index: number, p: Partial<ColumnsToRowsValueField>) => {
    patch({ valueFields: valueFields.map((row, i) => (i === index ? { ...row, ...p } : row)) });
  };

  const typeOf = (field: string) =>
    upFields.find((f) => f.name === field)?.type ||
    upFields.find((f) => f.name.toLowerCase() === field.toLowerCase())?.type;

  const addValueField = () => {
    const used = new Set(valueFields.map((v) => v.field.toLowerCase()));
    const next = upFields.find((f) => !used.has(f.name.toLowerCase())) || upFields[0];
    if (!next) return;
    patch({ valueFields: [...valueFields, { field: next.name, label: '' }] });
  };

  const nonNumeric = valueFields.filter(
    (v) => typeOf(v.field) && !isNumericType(typeOf(v.field)),
  );

  if (!upstream) {
    return (
      <div>
        <NodeCommon node={node} onMeta={onMeta} />
        <WarningLine>请先连接上游节点，列转行需要 1 条入线。</WarningLine>
      </div>
    );
  }

  if (!upFields.length) {
    return (
      <div>
        <NodeCommon node={node} onMeta={onMeta} />
        <WarningLine>上游尚未提供字段，请先配置上游节点后再获取字段。</WarningLine>
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
        <SectionTitle>列转行设置</SectionTitle>

        <div className="form-hint" style={{ marginBottom: 4 }}>保留字段（原样输出，可为空）</div>
        <Select
          mode="multiple"
          allowClear
          value={cfg.keepFields}
          placeholder="选择原样保留的字段"
          style={{ width: '100%', marginBottom: 12 }}
          options={fieldOptions(upFields)}
          onChange={(keys) => patch({ keepFields: keys })}
        />

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div className="form-hint">值字段（每个字段对应一组展开行）</div>
          <Button size="small" type="text" icon={<PlusOutlined />} onClick={addValueField}>
            添加值字段
          </Button>
        </div>
        <div className="field-table" style={{ marginBottom: 10 }}>
          <div className="field-row field-row--head" style={{ gridTemplateColumns: '1fr 90px 1fr 30px' }}>
            <span>字段</span>
            <span>类型</span>
            <span>名称列取值（label）</span>
            <span />
          </div>
          {valueFields.length === 0 ? (
            <div className="field-row" style={{ gridTemplateColumns: '1fr' }}>
              <span className="form-hint">至少添加 1 个值字段。</span>
            </div>
          ) : null}
          {valueFields.map((row, index) => (
            <div key={index} className="field-row" style={{ gridTemplateColumns: '1fr 90px 1fr 30px' }}>
              <Select
                size="small"
                showSearch
                value={row.field || undefined}
                placeholder="选择字段"
                style={{ width: '100%' }}
                options={fieldOptions(upFields)}
                onChange={(v) => updateValueField(index, { field: v })}
              />
              <span
                className="f-type"
                title={typeTooltip(typeOf(row.field), displayDorisType(typeOf(row.field)))}
              >
                {displayDorisType(typeOf(row.field)) || '—'}
              </span>
              <Input
                size="small"
                value={row.label}
                placeholder={row.field || '缺省用字段名'}
                onChange={(e) => updateValueField(index, { label: e.target.value })}
              />
              <Button
                size="small"
                type="text"
                danger
                icon={<DeleteOutlined />}
                onClick={() => patch({ valueFields: valueFields.filter((_, i) => i !== index) })}
              />
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
          <span className="form-hint" style={{ flex: '0 0 86px' }}>名称列名</span>
          <Input
            size="small"
            value={cfg.nameOutput}
            placeholder="field_name"
            style={{ width: 160 }}
            onChange={(e) => patch({ nameOutput: e.target.value })}
          />
          <span className="form-hint" style={{ flex: '0 0 66px' }}>值列名</span>
          <Input
            size="small"
            value={cfg.valueOutput}
            placeholder="field_value"
            style={{ width: 160 }}
            onChange={(e) => patch({ valueOutput: e.target.value })}
          />
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
          <span className="form-hint" style={{ flex: '0 0 86px' }}>值类型</span>
          <Select
            size="small"
            value={cfg.valueType}
            style={{ width: 160 }}
            options={VALUE_TYPES}
            onChange={(v: ColumnsToRowsValueType) => patch({ valueType: v })}
          />
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
            <Switch
              size="small"
              checked={cfg.skipNull}
              onChange={(v) => patch({ skipNull: v })}
            />
            跳过 NULL 值
          </span>
        </div>

        <div className="form-hint" style={{ lineHeight: 1.7 }}>
          输出行数为「上游行数 × 值字段数」（开启跳过 NULL 时可能更少）。输出列顺序：保留字段 → 名称列 → 值列。
          名称列取值为各值字段的 label，缺省用字段名。值类型为 DOUBLE / BIGINT 时，所有值字段必须是数字类型。
        </div>
      </div>

      {!valueFields.length ? <WarningLine>至少需要 1 个值字段。</WarningLine> : null}
      {cfg.valueType !== 'STRING' && nonNumeric.length ? (
        <DangerLine>
          值类型为 {cfg.valueType} 时值字段必须都是数字类型：{nonNumeric.map((v) => v.field).join('、')}
        </DangerLine>
      ) : null}
      {cfg.nameOutput.trim().toLowerCase() === cfg.valueOutput.trim().toLowerCase() ? (
        <DangerLine>名称列与值列不能同名。</DangerLine>
      ) : null}
      {cfg.keepFields.some(
        (k) =>
          k.toLowerCase() === cfg.nameOutput.trim().toLowerCase() ||
          k.toLowerCase() === cfg.valueOutput.trim().toLowerCase(),
      ) ? (
        <DangerLine>名称列或值列与保留字段重名。</DangerLine>
      ) : null}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Button icon={<TableOutlined />} onClick={() => onPreviewData(outputFields(node, nodes, edges))}>
          预览数据
        </Button>
      </div>

      <SqlPreview node={node} nodes={nodes} edges={edges} flowId={flowId} onPreviewSql={onPreviewSql} />
    </div>
  );
}
