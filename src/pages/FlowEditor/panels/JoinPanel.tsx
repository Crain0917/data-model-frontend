import { useEffect } from 'react';
import { Button, Checkbox, Input, Radio, Select } from 'antd';
import {
  DeleteOutlined,
  FormOutlined,
  PlusOutlined,
  SwapOutlined,
  TableOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import type { FieldDef, JoinConfig } from '../../../types';
import { outputFields } from '../../../utils/dagUtils';
import { buildNodeSql } from '../../../utils/dagUtils';
import { DangerLine, NodeCommon, SectionTitle, WarningLine, fieldOptions, type PanelProps } from './common';

export default function JoinPanel({
  node,
  nodes,
  edges,
  flowId,
  onConfig,
  onConfigSilent,
  onMeta,
  onPreviewSql,
  onPreviewData,
  onSwapInputs,
}: PanelProps) {
  const cfg = node.data.config as JoinConfig;
  const ins = edges.filter((e) => e.target === node.id);
  const leftEdge = ins.find((e) => (e.targetHandle || 'in-0') === 'in-0');
  const rightEdge = ins.find((e) => e.targetHandle === 'in-1');
  const leftNode = nodes.find((n) => n.id === leftEdge?.source);
  const rightNode = nodes.find((n) => n.id === rightEdge?.source);
  const leftFields: FieldDef[] = leftNode ? outputFields(leftNode, nodes, edges) : [];
  const rightFields: FieldDef[] = rightNode ? outputFields(rightNode, nodes, edges) : [];
  const keys = cfg.keys || [];
  const projection = cfg.projection || [];
  const sql = buildNodeSql(node, nodes, edges, flowId);

  useEffect(() => {
    if (!leftFields.length || !rightFields.length) return;
    if (keys.length || projection.length) return;
    const same = leftFields.find((l) => rightFields.some((r) => r.name === l.name));
    const conflictNames = new Set(leftFields.map((f) => f.name));
    (onConfigSilent || onConfig)({
      ...cfg,
      keys: same ? [{ left: same.name, right: same.name }] : [],
      projection: [
        ...leftFields.map((f) => ({ side: 'a' as const, field: f.name, alias: f.name, keep: true, type: f.type })),
        ...rightFields.map((f) => ({
          side: 'b' as const,
          field: f.name,
          alias: conflictNames.has(f.name) ? `b_${f.name}` : f.name,
          keep: true,
          type: f.type,
        })),
      ],
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node.id, leftFields.length, rightFields.length]);

  const patch = (p: Partial<JoinConfig>) => onConfig({ ...cfg, ...p });
  const keptProjection = projection.filter((p) => p.keep);
  const aliasCount = keptProjection.reduce<Record<string, number>>((acc, p) => {
    acc[p.alias] = (acc[p.alias] || 0) + 1;
    return acc;
  }, {});
  const dupAliases = Object.entries(aliasCount).filter(([, c]) => c > 1).map(([a]) => a);
  const output = outputFields(node, nodes, edges);

  if (ins.length !== 2) {
    return (
      <div>
        <NodeCommon node={node} onMeta={onMeta} />
        <WarningLine>
          需要恰好 2 条入线（当前 {ins.length} 条），Join 面板暂时只读。请把两条上游流分别连到「L」「R」输入口。
        </WarningLine>
        <div className="form-hint">
          {leftNode ? `L（左流）：${leftNode.data.label} · ${leftFields.length} 字段` : 'L（左流）：未连接'}
          <br />
          {rightNode ? `R（右流）：${rightNode.data.label} · ${rightFields.length} 字段` : 'R（右流）：未连接'}
        </div>
      </div>
    );
  }

  return (
    <div>
      <NodeCommon node={node} onMeta={onMeta} />

      <div className="form-section">
        <SectionTitle
          extra={
            <Button size="small" type="text" icon={<SwapOutlined />} onClick={onSwapInputs}>
              交换左右流
            </Button>
          }
        >
          输入流
        </SectionTitle>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
          <span className="chip chip--info">L 左流</span>
          <span className="form-hint">{leftNode?.data.label || '—'} · {leftFields.length} 字段 · 别名</span>
          <Input
            size="small"
            value={cfg.aliasLeft}
            style={{ width: 56 }}
            onChange={(e) => patch({ aliasLeft: e.target.value || 'a' })}
          />
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span className="chip chip--warning">R 右流</span>
          <span className="form-hint">{rightNode?.data.label || '—'} · {rightFields.length} 字段 · 别名</span>
          <Input
            size="small"
            value={cfg.aliasRight}
            style={{ width: 56 }}
            onChange={(e) => patch({ aliasRight: e.target.value || 'b' })}
          />
        </div>
      </div>

      <div className="form-section">
        <SectionTitle>Join 类型</SectionTitle>
        <Radio.Group
          size="small"
          value={cfg.joinType}
          onChange={(e) => patch({ joinType: e.target.value })}
          optionType="button"
          buttonStyle="solid"
        >
          <Radio.Button value="INNER">Inner</Radio.Button>
          <Radio.Button value="LEFT">Left</Radio.Button>
          <Radio.Button value="RIGHT">Right</Radio.Button>
          <Radio.Button value="FULL">Full</Radio.Button>
        </Radio.Group>
      </div>

      <div className="form-section">
        <SectionTitle
          extra={
            <Button
              size="small"
              type="text"
              icon={<PlusOutlined />}
              onClick={() => patch({ keys: [...keys, { left: '', right: '' }] })}
            >
              添加条件
            </Button>
          }
        >
          Join Key（等值 · AND）
        </SectionTitle>
        {keys.length === 0 ? <DangerLine>Join 必须至少一个等值 Key</DangerLine> : null}
        {keys.map((key, index) => (
          <div key={index} style={{ display: 'flex', gap: 5, marginBottom: 6, alignItems: 'center' }}>
            <Select
              size="small"
              showSearch
              value={key.left || undefined}
              placeholder="左流字段"
              style={{ flex: 1, minWidth: 0 }}
              options={fieldOptions(leftFields)}
              onChange={(v) => patch({ keys: keys.map((k, i) => (i === index ? { ...k, left: v } : k)) })}
            />
            <span className="form-hint">=</span>
            <Select
              size="small"
              showSearch
              value={key.right || undefined}
              placeholder="右流字段"
              style={{ flex: 1, minWidth: 0 }}
              options={fieldOptions(rightFields)}
              onChange={(v) => patch({ keys: keys.map((k, i) => (i === index ? { ...k, right: v } : k)) })}
            />
            <Button
              size="small"
              type="text"
              danger
              icon={<DeleteOutlined />}
              onClick={() => patch({ keys: keys.filter((_, i) => i !== index) })}
            />
          </div>
        ))}
        <div style={{ marginTop: 8 }}>
          <div className="form-hint" style={{ marginBottom: 4 }}>额外非等值条件（并入 ON）</div>
          <Input.TextArea
            rows={2}
            value={cfg.extraOn}
            placeholder="a.amt > b.min_amt"
            onChange={(e) => patch({ extraOn: e.target.value })}
            style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5 }}
          />
          <div className="form-hint" style={{ marginTop: 4 }}>
            <WarningOutlined /> 非等值条件放进 ON，保证 Left / Full Join 语义正确。
          </div>
        </div>
      </div>

      <div className="form-section">
        <SectionTitle
          extra={
            <div style={{ display: 'flex', gap: 6 }}>
              <span
                className="mini-tag"
                style={{ cursor: 'pointer' }}
                onClick={() => patch({ projection: projection.map((p) => ({ ...p, keep: true })) })}
              >
                全选
              </span>
              <span
                className="mini-tag"
                style={{ cursor: 'pointer' }}
                onClick={() => patch({ projection: projection.map((p) => ({ ...p, keep: false })) })}
              >
                清空
              </span>
            </div>
          }
        >
          输出字段投影
        </SectionTitle>
        <div className="field-table">
          <div className="field-row field-row--head" style={{ gridTemplateColumns: '22px 34px 1fr 88px' }}>
            <span />
            <span>流</span>
            <span>源字段</span>
            <span>输出别名</span>
          </div>
          {projection.map((proj, index) => (
            <div key={`${proj.side}-${proj.field}`} className="field-row" style={{ gridTemplateColumns: '22px 34px 1fr 88px' }}>
              <Checkbox
                checked={proj.keep}
                onChange={(e) =>
                  patch({
                    projection: projection.map((p, i) => (i === index ? { ...p, keep: e.target.checked } : p)),
                  })
                }
              />
              <span className={`chip ${proj.side === 'a' ? 'chip--info' : 'chip--warning'}`} style={{ height: 18, padding: '0 5px', fontSize: 10 }}>
                {proj.side}
              </span>
              <div className="f-name" title={proj.field}>
                {proj.field}
                <span className="f-type" style={{ marginLeft: 4 }}>{proj.type}</span>
              </div>
              <Input
                size="small"
                value={proj.alias}
                onChange={(e) =>
                  patch({
                    projection: projection.map((p, i) => (i === index ? { ...p, alias: e.target.value } : p)),
                  })
                }
              />
            </div>
          ))}
        </div>
        <div style={{ marginTop: 8 }}>
          <Checkbox checked={cfg.autoPrefix} onChange={(e) => patch({ autoPrefix: e.target.checked })}>
            同名冲突自动加前缀（b_）
          </Checkbox>
        </div>
        {dupAliases.length ? <DangerLine>输出别名重复：{dupAliases.join('、')}，请调整后再保存。</DangerLine> : null}
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Button icon={<FormOutlined />} onClick={() => onPreviewSql(sql)}>
          预览 SQL
        </Button>
        <Button icon={<TableOutlined />} onClick={() => onPreviewData(output)}>
          预览数据
        </Button>
      </div>

      <div style={{ marginTop: 12 }}>
        <div className="form-hint" style={{ marginBottom: 6 }}>生成 SQL 预览</div>
        <pre className="sql-preview" style={{ maxHeight: 220 }}>{sql}</pre>
      </div>
    </div>
  );
}
