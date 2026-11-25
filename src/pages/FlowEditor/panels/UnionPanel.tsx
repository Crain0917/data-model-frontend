import { useEffect } from 'react';
import { Button, Input, Radio, Select, Switch } from 'antd';
import {
  DeleteOutlined,
  PlusOutlined,
  TableOutlined,
} from '@ant-design/icons';
import type { FieldDef, UnionConfig } from '../../../types';
import { outputFields } from '../../../utils/dagUtils';
import { displayDorisType, typeTooltip } from '../../../utils/dorisType';
import { DangerLine, NodeCommon, SectionTitle, WarningLine, fieldOptions, type PanelProps } from './common';
import SqlPreview from './SqlPreview';

const WIDE: Record<string, number> = { VARCHAR: 5, DECIMAL: 4, DOUBLE: 3, BIGINT: 2, INT: 1 };

function widerType(types: string[]): string {
  const base = types.map((t) => t.replace(/\(.*\)/, '').toUpperCase());
  return base.sort((a, b) => (WIDE[b] || 0) - (WIDE[a] || 0))[0] || 'VARCHAR';
}

export default function UnionPanel({
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
  const cfg = node.data.config as UnionConfig;
  const ins = edges
    .filter((e) => e.target === node.id)
    .map((e) => nodes.find((n) => n.id === e.source))
    .filter((n): n is NonNullable<typeof n> => Boolean(n));
  const streams = ins.map((n, i) => ({
    node: n,
    alias: String.fromCharCode(97 + i),
    fields: outputFields(n, nodes, edges),
  }));
  const targets = cfg.targets || [];

  const streamKey = streams.map((s) => `${s.node.id}:${s.fields.length}`).join('|');
  useEffect(() => {
    if (!streams.length) return;
    if (targets.length) {
      const missing = streams.some((s) => !Object.prototype.hasOwnProperty.call(targets[0]?.sources || {}, s.node.id));
      if (!missing) return;
    }
    const first = streams[0].fields;
    const next = first.map((f) => {
      const sources: Record<string, string | null> = {};
      streams.forEach((s) => {
        sources[s.node.id] = s.fields.some((x) => x.name === f.name) ? f.name : null;
      });
      return { name: f.name, type: f.type, sources };
    });
    (onConfigSilent || onConfig)({ ...cfg, targets: next });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node.id, streamKey]);

  const patch = (p: Partial<UnionConfig>) => onConfig({ ...cfg, ...p });

  if (!streams.length) {
    return (
      <div>
        <NodeCommon node={node} onMeta={onMeta} />
        <WarningLine>Union 需要至少 1 条入线，请从上游节点连入。</WarningLine>
      </div>
    );
  }

  const conflicts = targets
    .map((t) => {
      const mapped = streams
        .map((s) => {
          const src = t.sources?.[s.node.id];
          return src ? s.fields.find((f) => f.name === src)?.type : null;
        })
        .filter((x): x is string => Boolean(x));
      const distinct = Array.from(new Set(mapped.map((x) => x.replace(/\(.*\)/, '').toUpperCase())));
      return distinct.length > 1 ? { name: t.name, types: mapped, wide: widerType(mapped) } : null;
    })
    .filter((x): x is { name: string; types: string[]; wide: string } => Boolean(x));

  const posIssues = streams
    .map((s) => ({
      alias: s.alias,
      count: s.fields.length,
      diff: s.fields.length - targets.length,
    }))
    .filter((x) => x.diff !== 0);

  return (
    <div>
      <NodeCommon node={node} onMeta={onMeta} />

      <div className="form-section">
        <SectionTitle>合并方式</SectionTitle>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <Switch
            size="small"
            checked={cfg.unionAll}
            onChange={(v) => patch({ unionAll: v })}
            checkedChildren="UNION ALL"
            unCheckedChildren="UNION"
          />
          <span style={{ fontSize: 12 }}>{cfg.unionAll ? '不去重（推荐）' : '去重'}</span>
        </div>
        {!cfg.unionAll ? <WarningLine>UNION 会触发全局去重，性能明显下降。</WarningLine> : null}
        <div className="form-hint" style={{ marginBottom: 4 }}>字段对齐</div>
        <Radio.Group
          size="small"
          value={cfg.alignBy}
          onChange={(e) => patch({ alignBy: e.target.value, targets: [] })}
          optionType="button"
          buttonStyle="solid"
        >
          <Radio.Button value="NAME">按字段名</Radio.Button>
          <Radio.Button value="POSITION">按位置</Radio.Button>
        </Radio.Group>
      </div>

      <div className="form-section">
        <SectionTitle>输入流</SectionTitle>
        {streams.map((s) => (
          <div key={s.node.id} className="form-hint" style={{ marginBottom: 4 }}>
            <b style={{ color: 'var(--text-primary)' }}>{s.alias}</b> ← {s.node.data.label} · {s.fields.length} 字段
          </div>
        ))}
        {streams.length === 1 ? (
          <WarningLine>仅剩 1 个流，Union 无意义（等价于直通）。</WarningLine>
        ) : null}
      </div>

      {cfg.alignBy === 'POSITION' ? (
        <div className="form-section">
          <SectionTitle>按位置对齐</SectionTitle>
          <div className="form-hint" style={{ marginBottom: 8 }}>
            目标列数取 a 流字段数（{targets.length} 列），各流按字段顺序一一对应。
          </div>
          {posIssues.map((x) => (
            <div key={x.alias}>
              {x.diff < 0 ? (
                <DangerLine>
                  流 {x.alias} 只有 {x.count} 列，目标 {targets.length} 列，无法按位置对齐。
                </DangerLine>
              ) : (
                <WarningLine>
                  流 {x.alias} 有 {x.count} 列，超出目标列数，多余列将被忽略。
                </WarningLine>
              )}
            </div>
          ))}
          <div className="field-table">
            <div className="field-row field-row--head" style={{ gridTemplateColumns: '36px 1fr 70px' }}>
              <span>#</span>
              <span>目标字段</span>
              <span>类型</span>
            </div>
            {targets.map((t, i) => (
              <div key={`${t.name}-${i}`} className="field-row" style={{ gridTemplateColumns: '36px 1fr 70px' }}>
                <span className="form-hint">{i + 1}</span>
                <span className="f-name">{t.name}</span>
                <span className="f-type" title={typeTooltip(t.type, displayDorisType(t.type))}>
                  {displayDorisType(t.type) || '—'}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="form-section">
          <SectionTitle
            extra={
              <div style={{ display: 'flex', gap: 6 }}>
                <span
                  className="mini-tag"
                  style={{ cursor: 'pointer' }}
                  onClick={() => {
                    const first = streams[0].fields;
                    patch({
                      targets: first.map((f) => {
                        const sources: Record<string, string | null> = {};
                        streams.forEach((s) => {
                          sources[s.node.id] = s.fields.some((x) => x.name === f.name) ? f.name : null;
                        });
                        return { name: f.name, type: f.type, sources };
                      }),
                    });
                  }}
                >
                  按 a 流生成
                </span>
                <span
                  className="mini-tag"
                  style={{ cursor: 'pointer' }}
                  onClick={() =>
                    patch({ targets: [...targets, { name: '', type: 'VARCHAR', sources: {} }] })
                  }
                >
                  + 加列
                </span>
              </div>
            }
          >
            目标输出字段
          </SectionTitle>

          {targets.map((target, index) => (
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
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6 }}>
                <Input
                  size="small"
                  value={target.name}
                  placeholder="目标字段名"
                  onChange={(e) =>
                    patch({
                      targets: targets.map((t, i) => (i === index ? { ...t, name: e.target.value } : t)),
                    })
                  }
                />
                <span className="mini-tag">{target.type || 'VARCHAR'}</span>
                <Button
                  size="small"
                  type="text"
                  danger
                  icon={<DeleteOutlined />}
                  onClick={() => patch({ targets: targets.filter((_, i) => i !== index) })}
                />
              </div>
              {streams.map((s) => (
                <div key={s.node.id} style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 4 }}>
                  <span className="mini-tag" style={{ width: 20, textAlign: 'center' }}>{s.alias}</span>
                  <Select
                    size="small"
                    allowClear
                    showSearch
                    value={target.sources?.[s.node.id] || undefined}
                    placeholder="—（NULL）"
                    style={{ flex: 1, minWidth: 0 }}
                    options={fieldOptions(s.fields)}
                    onChange={(v) =>
                      patch({
                        targets: targets.map((t, i) =>
                          i === index
                            ? { ...t, sources: { ...t.sources, [s.node.id]: v || null } }
                            : t,
                        ),
                      })
                    }
                  />
                </div>
              ))}
            </div>
          ))}

          <Button
            size="small"
            type="dashed"
            block
            icon={<PlusOutlined />}
            onClick={() => patch({ targets: [...targets, { name: '', type: 'VARCHAR', sources: {} }] })}
          >
            添加输出列
          </Button>

          {conflicts.map((c) => (
            <WarningLine key={c.name}>
              列 {c.name} 类型不一致（{Array.from(new Set(c.types)).join(' / ')}），已自动 CAST 为 {c.wide}。
            </WarningLine>
          ))}
          {targets.some((t) => !t.name) ? <DangerLine>存在未命名的目标字段。</DangerLine> : null}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Button icon={<TableOutlined />} onClick={() => onPreviewData(outputFields(node, nodes, edges))}>
          预览数据
        </Button>
      </div>

      <SqlPreview node={node} nodes={nodes} edges={edges} flowId={flowId} onPreviewSql={onPreviewSql} />
    </div>
  );
}
