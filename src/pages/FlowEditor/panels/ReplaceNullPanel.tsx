import { Button, Input, Select } from 'antd';
import { DeleteOutlined, PlusOutlined, TableOutlined } from '@ant-design/icons';
import type { FieldDef, NullStrategy, ReplaceNullConfig, ReplaceNullRule } from '../../../types';
import { findUpstream, isNumericType, outputFields, sourceDialectOf } from '../../../utils/dagUtils';
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

const STRATEGIES: Array<{ value: NullStrategy; label: string; hint: string }> = [
  { value: 'VALUE', label: '自定义值', hint: '用填写的值替换缺失' },
  { value: 'MAX', label: '最大值', hint: '上游该字段非空最大值' },
  { value: 'MIN', label: '最小值', hint: '上游该字段非空最小值' },
  { value: 'AVG', label: '平均值', hint: '输出 DOUBLE' },
  { value: 'MEDIAN', label: '中位数', hint: '输出 DOUBLE' },
  { value: 'MODE', label: '众数', hint: '并列取最小值' },
];

const GRID = '132px 90px 100px 100px 104px 30px';

function normalize(cfg: Partial<ReplaceNullConfig>): ReplaceNullConfig {
  return {
    alias: cfg.alias || 'a',
    rules: (cfg.rules || [])
      .map((r) => ({
        field: String(r.field || ''),
        strategy: (String(r.strategy || 'VALUE').toUpperCase() as NullStrategy) || 'VALUE',
        value: r.value == null ? '' : String(r.value),
        output: r.output == null ? '' : String(r.output),
      }))
      .filter((r) => r.field),
  };
}

function blankRule(field: string): ReplaceNullRule {
  return { field, strategy: 'VALUE', value: '', output: '' };
}

export default function ReplaceNullPanel({
  node,
  nodes,
  edges,
  flowId,
  onConfig,
  onMeta,
  onPreviewSql,
  onPreviewData,
  dataSources,
}: PanelProps) {
  const cfg = normalize(node.data.config as Partial<ReplaceNullConfig>);
  const upstream = findUpstream(node.id, nodes, edges);
  const upFields: FieldDef[] = upstream ? outputFields(upstream, nodes, edges) : [];
  const rules = cfg.rules;
  const dialect = sourceDialectOf(node.id, nodes, edges, dataSources);

  const patch = (p: Partial<ReplaceNullConfig>) => onConfig({ ...cfg, ...p });
  const updateRule = (index: number, p: Partial<ReplaceNullRule>) => {
    patch({ rules: rules.map((row, i) => (i === index ? { ...row, ...p } : row)) });
  };

  const fieldOf = (field: string) =>
    upFields.find((f) => f.name === field) ||
    upFields.find((f) => f.name.toLowerCase() === field.toLowerCase());

  const typeOf = (field: string) => fieldOf(field)?.type;

  const addRule = () => {
    const used = new Set(rules.map((r) => r.field.toLowerCase()));
    const next = upFields.find((f) => !used.has(f.name.toLowerCase())) || upFields[0];
    if (!next) return;
    patch({ rules: [...rules, blankRule(next.name)] });
  };

  const changeField = (index: number, field: string) => {
    const type = typeOf(field);
    const numeric = isNumericType(type);
    const row = rules[index];
    updateRule(index, { field, strategy: numeric ? row.strategy : 'VALUE' });
  };

  const duplicateFields = (() => {
    const counts = new Map<string, number>();
    rules.forEach((r) => counts.set(r.field.toLowerCase(), (counts.get(r.field.toLowerCase()) || 0) + 1));
    return [...counts.entries()].filter(([, n]) => n > 1).map(([n]) => n);
  })();
  const nonNumericStrategy = rules.filter(
    (r) => r.strategy !== 'VALUE' && typeOf(r.field) && !isNumericType(typeOf(r.field)),
  );

  if (!upstream) {
    return (
      <div>
        <NodeCommon node={node} onMeta={onMeta} />
        <WarningLine>请先连接上游节点，替换缺失值需要 1 条入线。</WarningLine>
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
        <SectionTitle extra={<Button size="small" type="text" icon={<PlusOutlined />} onClick={addRule}>添加字段</Button>}>
          替换规则
        </SectionTitle>
        <div className="form-hint" style={{ marginBottom: 6 }}>
          只替换 NULL；NULL 即缺失值。输出名留空或等于源字段表示原地替换，填其他名字则保留原字段并在末尾追加新列。类型列为 Doris 归一化类型。
        </div>

        <div className="field-table" style={{ overflowX: 'auto' }}>
          <div style={{ minWidth: 560 }}>
            <div className="field-row field-row--head" style={{ gridTemplateColumns: GRID }}>
              <span>字段</span>
              <span>类型</span>
              <span>策略</span>
              <span>替换值</span>
              <span>输出列名</span>
              <span />
            </div>
            {rules.length === 0 ? (
              <div className="field-row" style={{ gridTemplateColumns: '1fr' }}>
                <span className="form-hint">尚未添加字段，点击右上角「添加字段」开始配置。</span>
              </div>
            ) : null}
            {rules.map((row, index) => {
              const type = typeOf(row.field);
              const field = fieldOf(row.field);
              const shownType = displayDorisType(type, dialect);
              const rawType = field?.sourceType || field?.type;
              const numeric = isNumericType(type);
              const strategies = numeric ? STRATEGIES : STRATEGIES.filter((s) => s.value === 'VALUE');
              return (
                <div
                  key={`${row.field}-${index}`}
                  className="field-row"
                  style={{ gridTemplateColumns: GRID }}
                >
                  <Select
                    size="small"
                    showSearch
                    value={row.field || undefined}
                    placeholder="选择字段"
                    style={{ width: '100%' }}
                    options={fieldOptions(upFields)}
                    onChange={(v) => changeField(index, v)}
                  />
                  <span className="f-type" title={typeTooltip(rawType, shownType)}>
                    {shownType || '—'}
                  </span>
                  <Select
                    size="small"
                    value={row.strategy}
                    style={{ width: '100%' }}
                    options={strategies.map((s) => ({ value: s.value, label: s.label }))}
                    onChange={(v) => updateRule(index, { strategy: v })}
                  />
                  <Input
                    size="small"
                    value={row.value}
                    placeholder={row.strategy === 'VALUE' ? (numeric ? '数字' : '文本') : '由统计值填充'}
                    disabled={row.strategy !== 'VALUE'}
                    onChange={(e) => updateRule(index, { value: e.target.value })}
                  />
                  <Input
                    size="small"
                    value={row.output}
                    placeholder={row.field || '原地替换'}
                    onChange={(e) => updateRule(index, { output: e.target.value })}
                  />
                  <Button
                    size="small"
                    type="text"
                    danger
                    icon={<DeleteOutlined />}
                    onClick={() => patch({ rules: rules.filter((_, i) => i !== index) })}
                  />
                </div>
              );
            })}
          </div>
        </div>

        <div className="form-hint" style={{ marginTop: 6, lineHeight: 1.7 }}>
          只替换 NULL；NULL 即缺失值。统计值由后端 CTE 预计算（一次扫描上游非空数据，聚合基准是替换前的数据），
          空表统计值为 NULL。AVG / MEDIAN 输出 DOUBLE；MAX / MIN / MODE 保持字段归一化类型。非数字字段只支持「自定义值」。
        </div>

        {!rules.length ? <WarningLine>尚未配置任何替换规则。</WarningLine> : null}
        {duplicateFields.length ? (
          <DangerLine>同一字段重复配置：{duplicateFields.join('、')}，每个字段只能出现一次。</DangerLine>
        ) : null}
        {nonNumericStrategy.length ? (
          <DangerLine>
            非数字字段只能选择「自定义值」：{nonNumericStrategy.map((r) => r.field).join('、')}
          </DangerLine>
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
