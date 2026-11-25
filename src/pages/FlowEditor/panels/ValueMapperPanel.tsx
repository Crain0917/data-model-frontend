import { Button, Input, Select, Tag } from 'antd';
import { DeleteOutlined, PlusOutlined, TableOutlined } from '@ant-design/icons';
import type {
  FieldDef,
  ValueMapperConfig,
  ValueMapperRule,
  ValueMapping,
  ValueUnmatched,
} from '../../../types';
import { findUpstream, isNumericType, outputFields } from '../../../utils/dagUtils';
import {
  DangerLine,
  NodeCommon,
  SectionTitle,
  WarningLine,
  fieldOptions,
  type PanelProps,
} from './common';
import SqlPreview from './SqlPreview';

const UNMATCHED_OPTIONS: Array<{ value: ValueUnmatched; label: string }> = [
  { value: 'KEEP', label: '保留原值' },
  { value: 'VALUE', label: '替换为指定值' },
  { value: 'NULL', label: '置为 NULL' },
];

function normalize(cfg: Partial<ValueMapperConfig>): ValueMapperConfig {
  return {
    alias: cfg.alias || 'a',
    rules: (cfg.rules || [])
      .map((r) => ({
        field: String(r.field || ''),
        output: r.output == null ? '' : String(r.output),
        mappings: (r.mappings || []).map((m) => ({
          from: m.from == null ? '' : String(m.from),
          to: m.to == null ? '' : String(m.to),
        })),
        unmatched: (['KEEP', 'VALUE', 'NULL'].includes(String(r.unmatched || '').toUpperCase())
          ? String(r.unmatched).toUpperCase()
          : 'KEEP') as ValueUnmatched,
        unmatchedValue: r.unmatchedValue == null ? '' : String(r.unmatchedValue),
      }))
      .filter((r) => r.field),
  };
}

function blankRule(field: string): ValueMapperRule {
  return {
    field,
    output: '',
    mappings: [{ from: '', to: '' }],
    unmatched: 'KEEP',
    unmatchedValue: '',
  };
}

function inPlace(rule: ValueMapperRule): boolean {
  const out = String(rule.output || '').trim();
  return !out || out.toLowerCase() === String(rule.field || '').trim().toLowerCase();
}

export default function ValueMapperPanel({
  node,
  nodes,
  edges,
  flowId,
  onConfig,
  onMeta,
  onPreviewSql,
  onPreviewData,
}: PanelProps) {
  const cfg = normalize(node.data.config as Partial<ValueMapperConfig>);
  const upstream = findUpstream(node.id, nodes, edges);
  const upFields: FieldDef[] = upstream ? outputFields(upstream, nodes, edges) : [];
  const rules = cfg.rules;

  const patch = (p: Partial<ValueMapperConfig>) => onConfig({ ...cfg, ...p });
  const updateRule = (index: number, p: Partial<ValueMapperRule>) => {
    patch({ rules: rules.map((row, i) => (i === index ? { ...row, ...p } : row)) });
  };
  const updateMapping = (ruleIndex: number, mapIndex: number, p: Partial<ValueMapping>) => {
    patch({
      rules: rules.map((row, i) =>
        i === ruleIndex
          ? { ...row, mappings: row.mappings.map((m, j) => (j === mapIndex ? { ...m, ...p } : m)) }
          : row,
      ),
    });
  };

  const typeOf = (field: string) =>
    upFields.find((f) => f.name === field)?.type ||
    upFields.find((f) => f.name.toLowerCase() === field.toLowerCase())?.type;

  const addRule = () => {
    const used = new Set(rules.map((r) => r.field.toLowerCase()));
    const next = upFields.find((f) => !used.has(f.name.toLowerCase())) || upFields[0];
    if (!next) return;
    patch({ rules: [...rules, blankRule(next.name)] });
  };

  const duplicateFields = (() => {
    const counts = new Map<string, number>();
    rules.forEach((r) => counts.set(r.field.toLowerCase(), (counts.get(r.field.toLowerCase()) || 0) + 1));
    return [...counts.entries()].filter(([, n]) => n > 1).map(([n]) => n);
  })();

  if (!upstream) {
    return (
      <div>
        <NodeCommon node={node} onMeta={onMeta} />
        <WarningLine>请先连接上游节点，值映射需要 1 条入线。</WarningLine>
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
          extra={<Button size="small" type="text" icon={<PlusOutlined />} onClick={addRule}>添加字段</Button>}
        >
          映射规则
        </SectionTitle>
        <div className="form-hint" style={{ marginBottom: 8, lineHeight: 1.7 }}>
          按字段配置「原值 → 新值」。字符串按区分大小写精确匹配，数字字段按数值比较且只接受数字；
          NULL 不参与匹配，KEEP 与 NULL 策略下均保持 NULL。输出名留空或等于源字段表示原地替换，
          填其他名字则保留原字段并在末尾追加新列。
        </div>

        {rules.length === 0 ? (
          <div className="form-hint">尚未添加字段，点击右上角「添加字段」开始配置。</div>
        ) : null}

        {rules.map((rule, ruleIndex) => {
          const type = typeOf(rule.field);
          const numeric = isNumericType(type);
          return (
            <div
              key={`${rule.field}-${ruleIndex}`}
              style={{
                border: '1px solid var(--border)',
                borderRadius: 10,
                padding: '10px 12px',
                marginBottom: 10,
                background: 'var(--bg-elevated)',
              }}
            >
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <Select
                  size="small"
                  showSearch
                  value={rule.field || undefined}
                  placeholder="选择字段"
                  style={{ width: 200 }}
                  options={fieldOptions(upFields)}
                  onChange={(v) => updateRule(ruleIndex, { field: v })}
                />
                <Tag style={{ margin: 0, fontSize: 10 }}>{type || '未知'}</Tag>
                <span className="form-hint">输出列名</span>
                <Input
                  size="small"
                  value={rule.output}
                  placeholder={rule.field || '原地替换'}
                  style={{ width: 150 }}
                  onChange={(e) => updateRule(ruleIndex, { output: e.target.value })}
                />
                {inPlace(rule) ? <span className="mini-tag">原地替换</span> : <span className="mini-tag">新增列</span>}
                <span className="form-hint" style={{ marginLeft: 8 }}>未匹配</span>
                <Select
                  size="small"
                  value={rule.unmatched}
                  style={{ width: 132 }}
                  options={UNMATCHED_OPTIONS}
                  onChange={(v: ValueUnmatched) => updateRule(ruleIndex, { unmatched: v })}
                />
                {rule.unmatched === 'VALUE' ? (
                  <Input
                    size="small"
                    value={rule.unmatchedValue}
                    placeholder={numeric ? '数字' : '文本'}
                    style={{ width: 130 }}
                    onChange={(e) => updateRule(ruleIndex, { unmatchedValue: e.target.value })}
                  />
                ) : null}
                <Button
                  size="small"
                  type="text"
                  danger
                  icon={<DeleteOutlined />}
                  style={{ marginLeft: 'auto' }}
                  onClick={() => patch({ rules: rules.filter((_, i) => i !== ruleIndex) })}
                />
              </div>

              <div style={{ marginTop: 8 }}>
                <div className="field-row field-row--head" style={{ gridTemplateColumns: '1fr 22px 1fr 30px' }}>
                  <span>原值</span>
                  <span />
                  <span>新值</span>
                  <span />
                </div>
                {rule.mappings.map((mapping, mapIndex) => (
                  <div
                    key={mapIndex}
                    className="field-row"
                    style={{ gridTemplateColumns: '1fr 22px 1fr 30px', alignItems: 'center' }}
                  >
                    <Input
                      size="small"
                      value={mapping.from}
                      placeholder={numeric ? '数字，例如 1' : '文本，例如 N'}
                      onChange={(e) => updateMapping(ruleIndex, mapIndex, { from: e.target.value })}
                    />
                    <span style={{ textAlign: 'center', color: 'var(--text-tertiary)' }}>→</span>
                    <Input
                      size="small"
                      value={mapping.to}
                      placeholder={numeric ? '数字，例如 2' : '文本，例如 NEW'}
                      onChange={(e) => updateMapping(ruleIndex, mapIndex, { to: e.target.value })}
                    />
                    <Button
                      size="small"
                      type="text"
                      danger
                      icon={<DeleteOutlined />}
                      onClick={() =>
                        updateRule(ruleIndex, {
                          mappings: rule.mappings.filter((_, j) => j !== mapIndex),
                        })
                      }
                    />
                  </div>
                ))}
                <Button
                  size="small"
                  type="text"
                  icon={<PlusOutlined />}
                  onClick={() =>
                    updateRule(ruleIndex, { mappings: [...rule.mappings, { from: '', to: '' }] })
                  }
                >
                  添加映射
                </Button>
              </div>
            </div>
          );
        })}

        {!rules.length ? <WarningLine>尚未配置任何值映射规则。</WarningLine> : null}
        {duplicateFields.length ? (
          <DangerLine>同一字段重复配置：{duplicateFields.join('、')}，每个字段只能出现一次。</DangerLine>
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
