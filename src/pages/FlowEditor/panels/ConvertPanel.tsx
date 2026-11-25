import { useEffect } from 'react';
import { Button, Checkbox, Input, InputNumber, Select, Switch } from 'antd';
import { ReloadOutlined, TableOutlined } from '@ant-design/icons';
import type {
  ConvertConfig,
  ConvertField,
  ConvertTargetType,
  ConvertTrim,
  FieldDef,
} from '../../../types';
import { findUpstream, outputFields, sourceDialectOf } from '../../../utils/dagUtils';
import { displayDorisType, typeTooltip } from '../../../utils/dorisType';
import { DangerLine, NodeCommon, SectionTitle, WarningLine, type PanelProps } from './common';
import SqlPreview from './SqlPreview';

const TARGET_TYPES: Array<{ value: ConvertTargetType; label: string }> = [
  { value: 'STRING', label: 'STRING' },
  { value: 'INT', label: 'INT' },
  { value: 'BIGINT', label: 'BIGINT' },
  { value: 'DOUBLE', label: 'DOUBLE' },
  { value: 'DECIMAL', label: 'DECIMAL(p,s)' },
  { value: 'DATE', label: 'DATE' },
  { value: 'DATETIME', label: 'DATETIME' },
  { value: 'BOOLEAN', label: 'BOOLEAN' },
];

const TRIM_OPTIONS: Array<{ value: ConvertTrim; label: string }> = [
  { value: 'NONE', label: '不处理' },
  { value: 'LEFT', label: '左' },
  { value: 'RIGHT', label: '右' },
  { value: 'BOTH', label: '两端' },
];

const GRID = '104px 82px 96px 58px 52px 108px 66px 52px 100px 30px';

function blankRow(field: string): ConvertField {
  return {
    field,
    targetType: '',
    length: null,
    precision: null,
    format: null,
    trim: 'NONE',
    emptyToNull: false,
    output: '',
    remove: false,
  };
}

function normalize(cfg: Partial<ConvertConfig>): ConvertConfig {
  return {
    alias: cfg.alias || 'a',
    passthrough: cfg.passthrough !== false,
    conversions: (cfg.conversions || [])
      .map((c) => ({
        field: String(c.field || ''),
        targetType: (c.targetType ? String(c.targetType).toUpperCase() : '') as ConvertField['targetType'],
        length: c.length ?? null,
        precision: c.precision ?? null,
        format: c.format || null,
        trim: (String(c.trim || 'NONE').toUpperCase() as ConvertTrim) || 'NONE',
        emptyToNull: Boolean(c.emptyToNull),
        output: c.output || '',
        remove: Boolean(c.remove),
      }))
      .filter((c) => c.field),
  };
}

function matchRow(rows: ConvertField[], name: string): ConvertField | undefined {
  return (
    rows.find((r) => r.field === name) ||
    rows.find((r) => r.field.toLowerCase() === name.toLowerCase())
  );
}

export default function ConvertPanel({
  node,
  nodes,
  edges,
  flowId,
  onConfig,
  onConfigSilent,
  onMeta,
  onPreviewSql,
  onPreviewData,
  dataSources,
}: PanelProps) {
  const cfg = normalize(node.data.config as Partial<ConvertConfig>);
  const upstream = findUpstream(node.id, nodes, edges);
  const upFields: FieldDef[] = upstream ? outputFields(upstream, nodes, edges) : [];
  const dialect = sourceDialectOf(node.id, nodes, edges, dataSources);
  const rows = cfg.conversions;
  const upKey = upFields.map((f) => f.name).join('|');

  // 上游字段变化时按 field 合并：保留已配置行，新增补空行，消失剔除。
  useEffect(() => {
    if (!upFields.length) return;
    const merged = upFields.map((f) => matchRow(rows, f.name) || blankRow(f.name));
    const same =
      merged.length === rows.length && merged.every((row, i) => row.field === rows[i].field);
    if (!same) (onConfigSilent || onConfig)({ ...cfg, conversions: merged });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node.id, upKey]);

  const patch = (p: Partial<ConvertConfig>) => onConfig({ ...cfg, ...p });
  const updateRow = (index: number, p: Partial<ConvertField>) => {
    patch({ conversions: rows.map((row, i) => (i === index ? { ...row, ...p } : row)) });
  };

  const fillFields = () => {
    const merged = upFields.map((f) => matchRow(rows, f.name) || blankRow(f.name));
    patch({ conversions: merged });
  };

  const sourceField = (field: string) =>
    upFields.find((f) => f.name === field) ||
    upFields.find((f) => f.name.toLowerCase() === field.toLowerCase());

  const sourceType = (field: string) => sourceField(field)?.type || '';

  const changeTargetType = (index: number, value: ConvertTargetType | undefined) => {
    const row = rows[index];
    const next: Partial<ConvertField> = {
      targetType: value || '',
      precision: value === 'DECIMAL' ? row.precision ?? 2 : null,
      format: value === 'DATE' || value === 'DATETIME' ? row.format ?? null : null,
    };
    if (value === 'STRING') {
      next.length = row.length && row.length > 0 && row.length <= 65535 ? row.length : 255;
    } else if (value === 'DECIMAL') {
      next.length = row.length && row.length > 0 && row.length <= 38 ? row.length : 18;
      next.precision = row.precision != null && row.precision <= (next.length as number) ? row.precision : 2;
    } else {
      next.length = null;
    }
    updateRow(index, next);
  };

  const configured = rows.filter((r) => r.remove || String(r.targetType || '').trim());
  const hasEmptyTarget = rows.some((r) => !r.remove && !String(r.targetType || '').trim());
  const badDecimal = rows.filter((r) => {
    if (r.remove || r.targetType !== 'DECIMAL') return false;
    const p = r.length ?? 18;
    const s = r.precision ?? 0;
    return p < 1 || p > 38 || s < 0 || s > p;
  });
  const outputNames = new Map<string, number>();
  rows
    .filter((r) => !r.remove)
    .forEach((r) => {
      const name = (r.output || r.field).toLowerCase();
      outputNames.set(name, (outputNames.get(name) || 0) + 1);
    });
  const duplicates = [...outputNames.entries()].filter(([, n]) => n > 1).map(([name]) => name);

  if (!upstream) {
    return (
      <div>
        <NodeCommon node={node} onMeta={onMeta} />
        <WarningLine>请先连接上游节点，类型转换需要 1 条入线。</WarningLine>
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
        <SectionTitle
          extra={
            <Button size="small" type="text" icon={<ReloadOutlined />} onClick={fillFields}>
              获取字段
            </Button>
          }
        >
          字段转换
        </SectionTitle>

        <div className="field-table" style={{ overflowX: 'auto' }}>
          <div style={{ minWidth: 812 }}>
            <div className="field-row field-row--head" style={{ gridTemplateColumns: GRID }}>
              <span>字段</span>
              <span>源类型</span>
              <span>目标类型</span>
              <span>长度</span>
              <span>精度</span>
              <span>格式</span>
              <span>去空格</span>
              <span>空→NULL</span>
              <span>输出字段名</span>
              <span>移除</span>
            </div>
            {rows.map((row, index) => {
              const type = String(row.targetType || '');
              const isDecimal = type === 'DECIMAL';
              const isString = type === 'STRING';
              const isDate = type === 'DATE' || type === 'DATETIME';
              const disabled = Boolean(row.remove);
              return (
                <div
                  key={`${row.field}-${index}`}
                  className="field-row"
                  style={{ gridTemplateColumns: GRID, opacity: row.remove ? 0.55 : 1 }}
                >
                  <span className="f-name" title={row.field}>
                    {row.field}
                  </span>
                  <span
                    className="f-type"
                    title={typeTooltip(
                      sourceField(row.field)?.sourceType || sourceType(row.field),
                      displayDorisType(sourceType(row.field), dialect),
                    )}
                  >
                    {displayDorisType(sourceType(row.field), dialect) || '—'}
                  </span>
                  <Select
                    size="small"
                    allowClear
                    value={(row.targetType || undefined) as ConvertTargetType | undefined}
                    placeholder="不转换"
                    style={{ width: '100%' }}
                    disabled={disabled}
                    options={TARGET_TYPES}
                    onChange={(v) => changeTargetType(index, v)}
                  />
                  <InputNumber
                    size="small"
                    controls={false}
                    min={1}
                    max={isDecimal ? 38 : 65535}
                    value={row.length ?? undefined}
                    placeholder={isString ? '255' : isDecimal ? '18' : '—'}
                    style={{ width: '100%' }}
                    disabled={disabled || (!isString && !isDecimal)}
                    onChange={(v) => updateRow(index, { length: (v as number) ?? null })}
                  />
                  <InputNumber
                    size="small"
                    controls={false}
                    min={0}
                    max={isDecimal ? Number(row.length ?? 18) : 0}
                    value={row.precision ?? undefined}
                    placeholder={isDecimal ? '0' : '—'}
                    style={{ width: '100%' }}
                    disabled={disabled || !isDecimal}
                    onChange={(v) => updateRow(index, { precision: (v as number) ?? null })}
                  />
                  <Input
                    size="small"
                    value={row.format ?? ''}
                    placeholder="%Y-%m-%d %H:%i:%s"
                    style={{ width: '100%' }}
                    disabled={disabled || !isDate}
                    onChange={(e) => updateRow(index, { format: e.target.value })}
                  />
                  <Select
                    size="small"
                    value={row.trim || 'NONE'}
                    style={{ width: '100%' }}
                    disabled={disabled || !type}
                    options={TRIM_OPTIONS}
                    onChange={(v) => updateRow(index, { trim: v })}
                  />
                  <div style={{ textAlign: 'center' }}>
                    <Switch
                      size="small"
                      checked={Boolean(row.emptyToNull)}
                      disabled={disabled || !type}
                      onChange={(v) => updateRow(index, { emptyToNull: v })}
                    />
                  </div>
                  <Input
                    size="small"
                    value={row.output ?? ''}
                    placeholder={row.field}
                    style={{ width: '100%' }}
                    disabled={disabled}
                    onChange={(e) => updateRow(index, { output: e.target.value })}
                  />
                  <div style={{ textAlign: 'center' }}>
                    <Checkbox
                      checked={Boolean(row.remove)}
                      onChange={(e) => updateRow(index, { remove: e.target.checked })}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="form-hint" style={{ marginTop: 6, lineHeight: 1.7 }}>
          未配置目标类型的字段原样透传；勾选「移除」后该列不输出。长度用于 STRING（默认 255）与 DECIMAL
          总位数（默认 18），精度仅 DECIMAL 使用（默认 0）。日期格式留空时直接 CAST，填写后走
          STR_TO_DATE，例如 <span className="mono">%Y-%m-%d %H:%i:%s</span>。
        </div>
        {!configured.length ? <WarningLine>尚未配置任何类型转换。</WarningLine> : null}
        {hasEmptyTarget ? <WarningLine>存在未选择目标类型的字段，将原样输出。</WarningLine> : null}
        {badDecimal.length ? (
          <DangerLine>
            DECIMAL 精度非法：{badDecimal.map((r) => r.field).join('、')}（总位数 1–38，小数位 0–总位数）
          </DangerLine>
        ) : null}
        {duplicates.length ? (
          <DangerLine>输出字段重名：{duplicates.join('、')}，请修改输出字段名或勾选移除。</DangerLine>
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
