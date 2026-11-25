import { Button, Input, Select } from 'antd';
import { DeleteOutlined, PlusOutlined, TableOutlined } from '@ant-design/icons';
import type {
  FieldDef,
  PivotAggregate,
  PivotValue,
  RowsToColumnsConfig,
} from '../../../types';
import { findUpstream, isNumericType, outputFields } from '../../../utils/dagUtils';
import { displayDorisType } from '../../../utils/dorisType';
import {
  DangerLine,
  NodeCommon,
  SectionTitle,
  WarningLine,
  fieldOptions,
  type PanelProps,
} from './common';
import SqlPreview from './SqlPreview';

const AGGREGATES: Array<{ value: PivotAggregate; label: string }> = [
  { value: 'SUM', label: 'SUM 求和' },
  { value: 'MAX', label: 'MAX 最大值' },
  { value: 'MIN', label: 'MIN 最小值' },
  { value: 'AVG', label: 'AVG 平均值' },
  { value: 'COUNT', label: 'COUNT 非空计数' },
];

function normalize(cfg: Partial<RowsToColumnsConfig>): RowsToColumnsConfig {
  const aggregate = String(cfg.aggregate || 'SUM').toUpperCase();
  return {
    alias: cfg.alias || 'a',
    groupFields: Array.isArray(cfg.groupFields) ? cfg.groupFields.filter(Boolean) : [],
    pivotField: String(cfg.pivotField || ''),
    valueField: String(cfg.valueField || ''),
    aggregate: (['SUM', 'MAX', 'MIN', 'AVG', 'COUNT'].includes(aggregate)
      ? aggregate
      : 'SUM') as PivotAggregate,
    pivotValues: (cfg.pivotValues || []).map((p) => ({
      value: p.value == null ? '' : String(p.value),
      output: String(p.output || ''),
    })),
  };
}

function pivotOutputType(aggregate: PivotAggregate, sourceType: string): string {
  switch (aggregate) {
    case 'COUNT':
      return 'BIGINT';
    case 'AVG':
      return 'DOUBLE';
    case 'SUM':
      return isNumericType(sourceType) ? sourceType || 'DOUBLE' : 'DOUBLE';
    default:
      return sourceType || 'STRING';
  }
}

export default function RowsToColumnsPanel({
  node,
  nodes,
  edges,
  flowId,
  onConfig,
  onMeta,
  onPreviewSql,
  onPreviewData,
}: PanelProps) {
  const cfg = normalize(node.data.config as Partial<RowsToColumnsConfig>);
  const upstream = findUpstream(node.id, nodes, edges);
  const upFields: FieldDef[] = upstream ? outputFields(upstream, nodes, edges) : [];
  const pivots = cfg.pivotValues;

  const patch = (p: Partial<RowsToColumnsConfig>) => onConfig({ ...cfg, ...p });
  const updatePivot = (index: number, p: Partial<PivotValue>) => {
    patch({ pivotValues: pivots.map((row, i) => (i === index ? { ...row, ...p } : row)) });
  };

  const typeOf = (field: string) =>
    upFields.find((f) => f.name === field)?.type ||
    upFields.find((f) => f.name.toLowerCase() === field.toLowerCase())?.type;

  const valueType = typeOf(cfg.valueField);
  const outType = pivotOutputType(cfg.aggregate, valueType || 'STRING');
  const pivotNumeric = isNumericType(typeOf(cfg.pivotField));
  const groupSet = new Set(cfg.groupFields.map((g) => g.toLowerCase()));
  const dupOutputs = (() => {
    const counts = new Map<string, number>();
    pivots.forEach((p) => {
      const out = p.output.trim().toLowerCase();
      if (out) counts.set(out, (counts.get(out) || 0) + 1);
    });
    return [...counts.entries()].filter(([, n]) => n > 1).map(([n]) => n);
  })();

  if (!upstream) {
    return (
      <div>
        <NodeCommon node={node} onMeta={onMeta} />
        <WarningLine>请先连接上游节点，行转列需要 1 条入线。</WarningLine>
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
        <SectionTitle>行转列设置</SectionTitle>

        <div className="form-hint" style={{ marginBottom: 4 }}>分组字段</div>
        <Select
          mode="multiple"
          allowClear
          value={cfg.groupFields}
          placeholder="选择一个或多个分组字段"
          style={{ width: '100%', marginBottom: 12 }}
          options={fieldOptions(upFields)}
          onChange={(keys) => patch({ groupFields: keys })}
        />

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
          <span className="form-hint" style={{ flex: '0 0 76px' }}>透视字段</span>
          <Select
            size="small"
            showSearch
            value={cfg.pivotField || undefined}
            placeholder="选择取值字段"
            style={{ width: 190 }}
            options={fieldOptions(upFields)}
            onChange={(v) => patch({ pivotField: v })}
          />
          <span className="form-hint" style={{ flex: '0 0 76px' }}>值字段</span>
          <Select
            size="small"
            showSearch
            value={cfg.valueField || undefined}
            placeholder="选择聚合字段"
            style={{ width: 190 }}
            options={fieldOptions(upFields)}
            onChange={(v) => patch({ valueField: v })}
          />
          <span className="form-hint" style={{ flex: '0 0 66px' }}>聚合方式</span>
          <Select
            size="small"
            value={cfg.aggregate}
            style={{ width: 150 }}
            options={AGGREGATES}
            onChange={(v: PivotAggregate) => patch({ aggregate: v })}
          />
        </div>
        <div className="form-hint" style={{ marginBottom: 12 }}>
          输出类型：COUNT → BIGINT；AVG → DOUBLE；SUM → 数值类型（值为非数值时 DOUBLE）；
          MAX / MIN → 值字段类型。当前预计输出列类型：{displayDorisType(outType)}。
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div className="form-hint">透视取值（新取值需手动添加）</div>
          <Button
            size="small"
            type="text"
            icon={<PlusOutlined />}
            onClick={() => patch({ pivotValues: [...pivots, { value: '', output: '' }] })}
          >
            添加取值
          </Button>
        </div>
        <div className="field-table">
          <div className="field-row field-row--head" style={{ gridTemplateColumns: '1fr 1fr 30px' }}>
            <span>透视值</span>
            <span>输出列名</span>
            <span />
          </div>
          {pivots.length === 0 ? (
            <div className="field-row" style={{ gridTemplateColumns: '1fr' }}>
              <span className="form-hint">至少添加 1 个透视取值。</span>
            </div>
          ) : null}
          {pivots.map((row, index) => (
            <div key={index} className="field-row" style={{ gridTemplateColumns: '1fr 1fr 30px' }}>
              <Input
                size="small"
                value={row.value}
                placeholder={pivotNumeric ? '数字，例如 1' : '文本，例如 Q1'}
                onChange={(e) => updatePivot(index, { value: e.target.value })}
              />
              <Input
                size="small"
                value={row.output}
                placeholder="输出列名，例如 q1"
                onChange={(e) => updatePivot(index, { output: e.target.value })}
              />
              <Button
                size="small"
                type="text"
                danger
                icon={<DeleteOutlined />}
                onClick={() => patch({ pivotValues: pivots.filter((_, i) => i !== index) })}
              />
            </div>
          ))}
        </div>

        <div className="form-hint" style={{ marginTop: 8, lineHeight: 1.7 }}>
          v1 透视列为手工填写，运行期不会按 DISTINCT 动态生成；源数据出现新取值时需在此手动添加。
          透视值按透视字段类型校验，数字字段只接受数字；输出列不得与分组字段重名。
        </div>
      </div>

      {!cfg.groupFields.length ? <WarningLine>至少需要 1 个分组字段。</WarningLine> : null}
      {!cfg.pivotField ? <WarningLine>未选择透视字段。</WarningLine> : null}
      {!cfg.valueField ? <WarningLine>未选择值字段。</WarningLine> : null}
      {cfg.pivotField && groupSet.has(cfg.pivotField.toLowerCase()) ? (
        <DangerLine>透视字段不能是分组字段。</DangerLine>
      ) : null}
      {cfg.valueField && groupSet.has(cfg.valueField.toLowerCase()) ? (
        <DangerLine>值字段不能是分组字段。</DangerLine>
      ) : null}
      {cfg.pivotField &&
      cfg.valueField &&
      cfg.pivotField.toLowerCase() === cfg.valueField.toLowerCase() ? (
        <DangerLine>透视字段与值字段不能相同。</DangerLine>
      ) : null}
      {!pivots.length ? <WarningLine>至少需要 1 个透视取值。</WarningLine> : null}
      {pivots.some((p) => !p.output.trim()) ? <WarningLine>透视取值的输出列名不能为空。</WarningLine> : null}
      {dupOutputs.length ? <DangerLine>透视输出列重名：{dupOutputs.join('、')}</DangerLine> : null}
      {pivots.some(
        (p) => p.output.trim() && groupSet.has(p.output.trim().toLowerCase()),
      ) ? (
        <DangerLine>透视输出列与分组字段重名。</DangerLine>
      ) : null}
      {pivotNumeric &&
      pivots.some((p) => p.value.trim() && !/^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/.test(p.value.trim())) ? (
        <DangerLine>透视字段是数字类型，透视取值必须是数字。</DangerLine>
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
