import { useEffect } from 'react';
import { Button, Input, InputNumber, Select, Switch } from 'antd';
import {
  DeleteOutlined,
  PlusOutlined,
  TableOutlined,
} from '@ant-design/icons';
import type { ConditionRow, FieldDef, GroupByConfig } from '../../../types';
import {
  conditionsSql,
  findUpstream,
  outputFields,
  OPERATOR_OPTIONS,
} from '../../../utils/dagUtils';
import { DangerLine, NodeCommon, SectionTitle, WarningLine, fieldOptions, type PanelProps } from './common';
import SqlPreview from './SqlPreview';

const FUNCS = [
  { value: 'SUM', label: 'SUM' },
  { value: 'AVG', label: 'AVG' },
  { value: 'MIN', label: 'MIN' },
  { value: 'MAX', label: 'MAX' },
  { value: 'COUNT', label: 'COUNT' },
  { value: 'COUNT_DISTINCT', label: 'COUNT DISTINCT' },
];

function aggType(func: string, sourceType?: string): string {
  if (func === 'COUNT' || func === 'COUNT_DISTINCT') return 'BIGINT';
  if (func === 'SUM' || func === 'AVG') return sourceType === 'DECIMAL' ? 'DECIMAL' : 'DOUBLE';
  return sourceType || 'VARCHAR';
}

const EMPTY_COND: ConditionRow = { logic: 'AND', indent: 0, left: '', op: 'GT', rightType: 'CONST', right: '' };

export default function GroupByPanel({
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
  const cfg = node.data.config as GroupByConfig;
  const upstream = findUpstream(node.id, nodes, edges);
  const upFields: FieldDef[] = upstream ? outputFields(upstream, nodes, edges) : [];
  const groups = cfg.groups || [];
  const aggregates = cfg.aggregates || [];
  const having = cfg.having || [];

  useEffect(() => {
    if (!upFields.length) return;
    if (!groups.length && !aggregates.length) {
      (onConfigSilent || onConfig)({
        ...cfg,
        groups: [{ field: upFields[0].name, alias: upFields[0].name, type: upFields[0].type }],
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node.id, upFields.length]);

  const patch = (p: Partial<GroupByConfig>) => onConfig({ ...cfg, ...p });
  const havingFields: FieldDef[] = [
    ...groups.map((g) => ({ name: g.alias || g.field, type: g.type || 'VARCHAR' })),
    ...aggregates.map((a) => ({ name: a.alias || `${a.func.toLowerCase()}_${a.field}`, type: a.type || 'DOUBLE' })),
  ];
  const badHaving = having.filter((h) => h.left && !havingFields.some((f) => f.name === h.left));

  if (!upstream) {
    return (
      <div>
        <NodeCommon node={node} onMeta={onMeta} />
        <WarningLine>请先连接上游节点，Group By 需要 1 条入线。</WarningLine>
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
          <span className="form-hint">上游：{upstream.data.label} · {upFields.length} 字段</span>
        </div>
      </div>

      <div className="form-section">
        <SectionTitle
          extra={
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Switch
                size="small"
                checked={cfg.globalAgg}
                onChange={(v) => patch({ globalAgg: v })}
              />
              <span style={{ fontSize: 11 }}>无分组全局聚合</span>
            </div>
          }
        >
          分组字段
        </SectionTitle>
        {cfg.globalAgg ? (
          <div className="form-hint">已开启全局聚合，不生成 GROUP BY。</div>
        ) : (
          <>
            {groups.map((group, index) => (
              <div key={index} style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                <Select
                  size="small"
                  showSearch
                  value={group.field || undefined}
                  placeholder="分组字段"
                  style={{ flex: 1, minWidth: 0 }}
                  options={fieldOptions(upFields)}
                  onChange={(v) => {
                    const src = upFields.find((f) => f.name === v);
                    patch({
                      groups: groups.map((g, i) =>
                        i === index ? { field: v, alias: g.alias === g.field ? v : g.alias, type: src?.type } : g,
                      ),
                    });
                  }}
                />
                <Input
                  size="small"
                  value={group.alias}
                  placeholder="别名"
                  style={{ width: 96 }}
                  onChange={(e) =>
                    patch({ groups: groups.map((g, i) => (i === index ? { ...g, alias: e.target.value } : g)) })
                  }
                />
                <Button
                  size="small"
                  type="text"
                  danger
                  icon={<DeleteOutlined />}
                  onClick={() => patch({ groups: groups.filter((_, i) => i !== index) })}
                />
              </div>
            ))}
            <Button
              size="small"
              type="dashed"
              icon={<PlusOutlined />}
              block
              onClick={() =>
                patch({
                  groups: [...groups, { field: '', alias: '' }],
                })
              }
            >
              添加分组字段
            </Button>
            {!groups.length ? <WarningLine>分组字段必填至少 1 个，或开启全局聚合。</WarningLine> : null}
          </>
        )}
      </div>

      <div className="form-section">
        <SectionTitle
          extra={
            <Button
              size="small"
              type="text"
              icon={<PlusOutlined />}
              onClick={() =>
                patch({
                  aggregates: [
                    ...aggregates,
                    { field: upFields[0]?.name || '', func: 'SUM', alias: '' },
                  ],
                })
              }
            >
              加聚合
            </Button>
          }
        >
          聚合字段
        </SectionTitle>
        {aggregates.length === 0 ? <div className="form-hint">暂无聚合字段。</div> : null}
        {aggregates.map((agg, index) => (
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
            <div style={{ display: 'flex', gap: 5 }}>
              <Select
                size="small"
                showSearch
                value={agg.field || undefined}
                placeholder="源字段"
                style={{ flex: 1, minWidth: 0 }}
                options={fieldOptions(upFields)}
                onChange={(v) => {
                  const src = upFields.find((f) => f.name === v);
                  patch({
                    aggregates: aggregates.map((a, i) =>
                      i === index ? { ...a, field: v, type: aggType(a.func, src?.type) } : a,
                    ),
                  });
                }}
              />
              <Select
                size="small"
                value={agg.func}
                style={{ width: 120 }}
                options={FUNCS}
                onChange={(v) => {
                  const src = upFields.find((f) => f.name === agg.field);
                  patch({
                    aggregates: aggregates.map((a, i) =>
                      i === index ? { ...a, func: v, type: aggType(v, src?.type) } : a,
                    ),
                  });
                }}
              />
              <Button
                size="small"
                type="text"
                danger
                icon={<DeleteOutlined />}
                onClick={() => patch({ aggregates: aggregates.filter((_, i) => i !== index) })}
              />
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 6, alignItems: 'center' }}>
              <Input
                size="small"
                value={agg.alias}
                placeholder={`${agg.func.toLowerCase()}_${agg.field || 'field'}`}
                onChange={(e) =>
                  patch({
                    aggregates: aggregates.map((a, i) => (i === index ? { ...a, alias: e.target.value } : a)),
                  })
                }
              />
              <span className="mini-tag">{agg.type || aggType(agg.func)}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="form-section">
        <SectionTitle
          extra={
            <Button
              size="small"
              type="text"
              icon={<PlusOutlined />}
              onClick={() => patch({ having: [...having, { ...EMPTY_COND }] })}
            >
              加 HAVING
            </Button>
          }
        >
          HAVING
        </SectionTitle>
        {having.length === 0 ? <div className="form-hint">暂无 HAVING 条件。</div> : null}
        {having.map((cond, index) => (
          <div key={index} style={{ display: 'flex', gap: 5, marginBottom: 6, alignItems: 'center' }}>
            <Select
              size="small"
              value={cond.logic}
              style={{ width: 58 }}
              onChange={(v) =>
                patch({ having: having.map((c, i) => (i === index ? { ...c, logic: v } : c)) })
              }
              options={[
                { value: 'AND', label: 'AND' },
                { value: 'OR', label: 'OR' },
              ]}
            />
            <Select
              size="small"
              value={cond.left || undefined}
              placeholder="字段"
              style={{ flex: 1, minWidth: 0 }}
              options={fieldOptions(havingFields)}
              onChange={(v) =>
                patch({ having: having.map((c, i) => (i === index ? { ...c, left: v } : c)) })
              }
            />
            <Select
              size="small"
              value={cond.op}
              style={{ width: 92 }}
              options={OPERATOR_OPTIONS}
              onChange={(v) =>
                patch({ having: having.map((c, i) => (i === index ? { ...c, op: v } : c)) })
              }
            />
            <Input
              size="small"
              value={cond.right}
              style={{ width: 76 }}
              onChange={(e) =>
                patch({ having: having.map((c, i) => (i === index ? { ...c, right: e.target.value } : c)) })
              }
            />
            <Button
              size="small"
              type="text"
              danger
              icon={<DeleteOutlined />}
              onClick={() => patch({ having: having.filter((_, i) => i !== index) })}
            />
          </div>
        ))}
        {badHaving.length ? (
          <DangerLine>HAVING 引用了非法字段：{badHaving.map((h) => h.left).join('、')}（必须是分组字段或聚合别名）</DangerLine>
        ) : null}
        {having.length ? (
          <div className="form-hint mono" style={{ whiteSpace: 'pre-wrap' }}>
            {conditionsSql(having, '')}
          </div>
        ) : null}
      </div>

      <div className="form-section">
        <SectionTitle>高级</SectionTitle>
        <div style={{ display: 'flex', gap: 10 }}>
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
        </div>
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
