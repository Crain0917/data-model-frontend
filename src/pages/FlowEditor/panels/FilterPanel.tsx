import { useEffect } from 'react';
import { Button, Checkbox, Input, InputNumber, Select, Space, Switch } from 'antd';
import { CheckOutlined, MinusOutlined, TableOutlined } from '@ant-design/icons';
import type { FieldDef, FilterConfig } from '../../../types';
import { findUpstream, outputFields } from '../../../utils/dagUtils';
import { NodeCommon, SectionTitle, WarningLine, type PanelProps } from './common';
import ConditionEditor from './ConditionEditor';
import SqlPreview from './SqlPreview';

export default function FilterPanel({
  node,
  nodes,
  edges,
  flowId,
  onConfig,
  onConfigSilent,
  onMeta,
  onPreviewSql,
  onPreviewData,
}: PanelProps) {
  const cfg = node.data.config as FilterConfig;
  const upstream = findUpstream(node.id, nodes, edges);
  const upFields: FieldDef[] = upstream ? outputFields(upstream, nodes, edges) : [];
  const select = cfg.select || [];

  useEffect(() => {
    if (!upFields.length) return;
    const merged = upFields.map((f) => {
      const row = select.find((s) => s.field === f.name);
      return row
        ? { ...row, type: f.type }
        : { field: f.name, alias: f.name, keep: false, sort: '' as const, type: f.type };
    });
    const changed = merged.length !== select.length || merged.some((m, i) => select[i]?.field !== m.field);
    if (changed) (onConfigSilent || onConfig)({ ...cfg, select: merged });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node.id, upFields.length]);

  const patch = (p: Partial<FilterConfig>) => onConfig({ ...cfg, ...p });
  const updateSelect = (index: number, p: Partial<FilterConfig['select'][number]>) => {
    patch({ select: select.map((s, i) => (i === index ? { ...s, ...p } : s)) });
  };
  const kept = select.filter((s) => s.keep);

  if (!upstream) {
    return (
      <div>
        <NodeCommon node={node} onMeta={onMeta} />
        <WarningLine>请先连接上游节点，Filter 需要 1 条入线。</WarningLine>
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
            <div style={{ display: 'flex', gap: 6 }}>
              <span
                className="mini-tag"
                style={{ cursor: 'pointer' }}
                onClick={() => patch({ select: select.map((s) => ({ ...s, keep: true })) })}
              >
                全选
              </span>
              <span
                className="mini-tag"
                style={{ cursor: 'pointer' }}
                onClick={() => patch({ select: select.map((s) => ({ ...s, keep: false })) })}
              >
                清空
              </span>
            </div>
          }
        >
          输出字段
        </SectionTitle>
        <div className="field-table">
          <div className="field-row field-row--head" style={{ gridTemplateColumns: '24px 1fr 84px 50px' }}>
            <span />
            <span>来源字段</span>
            <span>输出别名</span>
            <span>排序</span>
          </div>
          {select.map((row, index) => (
            <div key={row.field} className="field-row" style={{ gridTemplateColumns: '24px 1fr 84px 50px' }}>
              <Checkbox
                checked={row.keep}
                onChange={(e) => updateSelect(index, { keep: e.target.checked })}
              />
              <div style={{ minWidth: 0 }}>
                <div className="f-name" title={row.field}>
                  {row.field}
                </div>
                <div className="f-type">{row.type || '—'}</div>
              </div>
              <Input
                size="small"
                value={row.alias}
                onChange={(e) => updateSelect(index, { alias: e.target.value })}
              />
              <Select
                size="small"
                value={row.sort || ''}
                onChange={(v: '' | 'ASC' | 'DESC') => updateSelect(index, { sort: v })}
                options={[
                  { value: '', label: '—' },
                  { value: 'ASC', label: '↑' },
                  { value: 'DESC', label: '↓' },
                ]}
              />
            </div>
          ))}
        </div>
        <div style={{ marginTop: 8 }}>
          <Checkbox checked={cfg.keepAll} onChange={(e) => patch({ keepAll: e.target.checked })}>
            保留全部字段（直通模式）
          </Checkbox>
        </div>
        {!cfg.keepAll && kept.length === 0 ? (
          <WarningLine>未保留任何字段，SELECT 将使用 *，建议至少保留一列。</WarningLine>
        ) : null}
      </div>

      <div className="form-section">
        <SectionTitle>Filter 条件</SectionTitle>
        <ConditionEditor
          conditions={cfg.conditions || []}
          fields={upFields}
          alias={cfg.alias || 'a'}
          onChange={(conditions) => patch({ conditions })}
        />
      </div>

      <div className="form-section">
        <SectionTitle>高级</SectionTitle>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <Switch size="small" checked={cfg.distinct} onChange={(v) => patch({ distinct: v })} />
          <span style={{ fontSize: 12 }}>SELECT DISTINCT</span>
        </div>
        <Space size={10}>
          <div>
            <div className="form-hint" style={{ marginBottom: 4 }}>Limit</div>
            <InputNumber
              size="small"
              min={0}
              value={cfg.limit ?? undefined}
              onChange={(v) => patch({ limit: (v as number) ?? null })}
              style={{ width: 104 }}
              placeholder="不限"
            />
          </div>
          <div>
            <div className="form-hint" style={{ marginBottom: 4 }}>Offset</div>
            <InputNumber
              size="small"
              min={0}
              value={cfg.offset ?? undefined}
              onChange={(v) => patch({ offset: (v as number) ?? null })}
              style={{ width: 104 }}
              placeholder="0"
            />
          </div>
        </Space>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Button icon={<TableOutlined />} onClick={() => onPreviewData(outputFields(node, nodes, edges))}>
          预览数据
        </Button>
      </div>

      <SqlPreview node={node} nodes={nodes} edges={edges} flowId={flowId} onPreviewSql={onPreviewSql} />
      <div className="form-hint" style={{ marginTop: 8 }}>
        <CheckOutlined style={{ color: 'var(--success)' }} /> 条件行按层级生成括号；STARTS_WITH / ENDS_WITH /
        CONTAINS 自动转换为 LIKE。
        <div style={{ marginTop: 4 }}>
          <MinusOutlined /> 全部取消勾选时将回退为 SELECT *。
        </div>
      </div>
    </div>
  );
}
