import { useEffect } from 'react';
import { Button, Checkbox, Input, InputNumber, Select, Space, Switch } from 'antd';
import {
  CheckOutlined,
  DeleteOutlined,
  FormOutlined,
  MinusOutlined,
  PlusOutlined,
  RightOutlined,
  TableOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import type { ConditionRow, FieldDef, FilterConfig } from '../../../types';
import {
  buildNodeSql,
  conditionsSql,
  findUpstream,
  outputFields,
  OPERATOR_OPTIONS,
} from '../../../utils/dagUtils';
import { NodeCommon, SectionTitle, WarningLine, fieldOptions, type PanelProps } from './common';

const EMPTY_COND: ConditionRow = {
  logic: 'AND',
  indent: 0,
  left: '',
  op: 'EQ',
  rightType: 'CONST',
  right: '',
};

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
  const updateCond = (index: number, p: Partial<ConditionRow>) => {
    patch({ conditions: (cfg.conditions || []).map((c, i) => (i === index ? { ...c, ...p } : c)) });
  };
  const kept = select.filter((s) => s.keep);
  const sql = buildNodeSql(node, nodes, edges, flowId);

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
        <SectionTitle
          extra={
            <Button
              size="small"
              type="text"
              icon={<PlusOutlined />}
              onClick={() => patch({ conditions: [...(cfg.conditions || []), { ...EMPTY_COND }] })}
            >
              加条件
            </Button>
          }
        >
          Filter 条件
        </SectionTitle>
        {(cfg.conditions || []).length === 0 ? (
          <div className="form-hint">暂无过滤条件，将扫描全部行。</div>
        ) : (
          (cfg.conditions || []).map((cond, index) => (
            <div
              key={index}
              style={{
                border: '1px solid var(--border)',
                borderRadius: 8,
                padding: 8,
                marginBottom: 8,
                background: 'var(--bg-subtle)',
              }}
            >
              <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                {index > 0 ? (
                  <Select
                    size="small"
                    value={cond.logic}
                    style={{ width: 58 }}
                    onChange={(v) => updateCond(index, { logic: v })}
                    options={[
                      { value: 'AND', label: 'AND' },
                      { value: 'OR', label: 'OR' },
                    ]}
                  />
                ) : (
                  <span style={{ width: 58, fontSize: 11, color: 'var(--text-tertiary)' }}>WHERE</span>
                )}
                <Select
                  size="small"
                  showSearch
                  value={cond.left || undefined}
                  placeholder="字段"
                  style={{ flex: 1, minWidth: 0 }}
                  options={fieldOptions(upFields)}
                  onChange={(v) => updateCond(index, { left: v })}
                />
                <Select
                  size="small"
                  value={cond.op}
                  style={{ width: 104 }}
                  options={OPERATOR_OPTIONS}
                  onChange={(v) =>
                    updateCond(index, {
                      op: v,
                      rightType: v === 'IS_NULL' || v === 'IS_NOT_NULL' ? 'CONST' : cond.rightType,
                    })
                  }
                />
                <Button
                  size="small"
                  type="text"
                  danger
                  icon={<DeleteOutlined />}
                  onClick={() => patch({ conditions: (cfg.conditions || []).filter((_, i) => i !== index) })}
                />
              </div>
              <div style={{ display: 'flex', gap: 5, alignItems: 'center', marginTop: 6 }}>
                <span style={{ width: 58 }} />
                <Select
                  size="small"
                  value={cond.rightType}
                  style={{ width: 76 }}
                  onChange={(v) => updateCond(index, { rightType: v, right: '' })}
                  disabled={cond.op === 'IS_NULL' || cond.op === 'IS_NOT_NULL'}
                  options={[
                    { value: 'CONST', label: '常量' },
                    { value: 'FIELD', label: '字段' },
                  ]}
                />
                {cond.rightType === 'FIELD' ? (
                  <Select
                    size="small"
                    showSearch
                    value={cond.right || undefined}
                    placeholder="右字段"
                    style={{ flex: 1, minWidth: 0 }}
                    options={fieldOptions(upFields)}
                    onChange={(v) => updateCond(index, { right: v })}
                  />
                ) : (
                  <>
                    <Input
                      size="small"
                      value={cond.right}
                      placeholder={
                        cond.op === 'IN' || cond.op === 'NOT_IN'
                          ? '1,2,3'
                          : cond.op === 'BETWEEN' || cond.op === 'NOT_BETWEEN'
                            ? '起始值'
                            : '值'
                      }
                      disabled={cond.op === 'IS_NULL' || cond.op === 'IS_NOT_NULL'}
                      onChange={(e) => updateCond(index, { right: e.target.value })}
                      style={{ flex: 1, minWidth: 0 }}
                    />
                    {cond.op === 'BETWEEN' || cond.op === 'NOT_BETWEEN' ? (
                      <Input
                        size="small"
                        value={cond.right2 || ''}
                        placeholder="结束值"
                        onChange={(e) => updateCond(index, { right2: e.target.value })}
                        style={{ flex: 1, minWidth: 0 }}
                      />
                    ) : null}
                  </>
                )}
                <div style={{ display: 'flex' }}>
                  <Button
                    size="small"
                    type="text"
                    icon={<RightOutlined rotate={90} />}
                    title="缩进（升组）"
                    onClick={() => updateCond(index, { indent: Math.min(3, (cond.indent || 0) + 1) })}
                  />
                  <Button
                    size="small"
                    type="text"
                    icon={<RightOutlined rotate={-90} />}
                    title="反缩进（降组）"
                    onClick={() => updateCond(index, { indent: Math.max(0, (cond.indent || 0) - 1) })}
                  />
                </div>
              </div>
              {cond.indent > 0 ? (
                <div className="form-hint" style={{ marginTop: 4 }}>
                  层级 {cond.indent}，按层级加括号
                </div>
              ) : null}
            </div>
          ))
        )}
        {(cfg.conditions || []).length > 0 ? (
          <div className="form-hint mono" style={{ whiteSpace: 'pre-wrap', marginTop: 6 }}>
            {conditionsSql(cfg.conditions, cfg.alias || 'a')}
          </div>
        ) : null}
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
        <Button icon={<FormOutlined />} onClick={() => onPreviewSql(sql)}>
          预览 SQL
        </Button>
        <Button icon={<TableOutlined />} onClick={() => onPreviewData(outputFields(node, nodes, edges))}>
          预览数据
        </Button>
      </div>

      <div style={{ marginTop: 12 }}>
        <div className="form-hint" style={{ marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
          <ThunderboltOutlined /> 生成 SQL 预览
        </div>
        <pre className="sql-preview" style={{ maxHeight: 220 }}>{sql}</pre>
      </div>
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
