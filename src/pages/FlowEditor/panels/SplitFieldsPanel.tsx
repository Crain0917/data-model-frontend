import { Button, Input, InputNumber, Select, Switch } from 'antd';
import { DeleteOutlined, PlusOutlined, TableOutlined } from '@ant-design/icons';
import type { FieldDef, SplitFieldPart, SplitFieldsConfig } from '../../../types';
import { findUpstream, outputFields } from '../../../utils/dagUtils';
import {
  DangerLine,
  NodeCommon,
  SectionTitle,
  WarningLine,
  fieldOptions,
  type PanelProps,
} from './common';
import SqlPreview from './SqlPreview';

function normalize(cfg: Partial<SplitFieldsConfig>): SplitFieldsConfig {
  return {
    alias: cfg.alias || 'a',
    field: String(cfg.field || ''),
    delimiter: cfg.delimiter == null ? '' : String(cfg.delimiter),
    keepOriginal: cfg.keepOriginal !== false,
    trim: cfg.trim !== false,
    emptyAsNull: Boolean(cfg.emptyAsNull),
    parts: (cfg.parts || []).map((p) => ({
      index: Number(p.index) || 0,
      output: String(p.output || ''),
    })),
  };
}

function nextPart(parts: SplitFieldPart[], field: string): SplitFieldPart {
  const used = new Set(parts.map((p) => p.index));
  const max = parts.reduce((m, p) => Math.max(m, Number(p.index) || 0), 0);
  let index = max + 1;
  while (used.has(index)) index += 1;
  const prefix = field || 'p';
  return { index, output: `${prefix}_${index}` };
}

export default function SplitFieldsPanel({
  node,
  nodes,
  edges,
  flowId,
  onConfig,
  onMeta,
  onPreviewSql,
  onPreviewData,
}: PanelProps) {
  const cfg = normalize(node.data.config as Partial<SplitFieldsConfig>);
  const upstream = findUpstream(node.id, nodes, edges);
  const upFields: FieldDef[] = upstream ? outputFields(upstream, nodes, edges) : [];
  const parts = cfg.parts;

  const patch = (p: Partial<SplitFieldsConfig>) => onConfig({ ...cfg, ...p });
  const updatePart = (index: number, p: Partial<SplitFieldPart>) => {
    patch({ parts: parts.map((part, i) => (i === index ? { ...part, ...p } : part)) });
  };

  const outputNames = parts.map((p) => p.output.trim()).filter(Boolean);
  const duplicateOutputs = (() => {
    const counts = new Map<string, number>();
    outputNames.forEach((n) => counts.set(n.toLowerCase(), (counts.get(n.toLowerCase()) || 0) + 1));
    return [...counts.entries()].filter(([, n]) => n > 1).map(([n]) => n);
  })();
  const duplicateIndices = (() => {
    const counts = new Map<number, number>();
    parts.forEach((p) => counts.set(Number(p.index), (counts.get(Number(p.index)) || 0) + 1));
    return [...counts.entries()].filter(([, n]) => n > 1).map(([n]) => String(n));
  })();
  const badIndex = parts.filter((p) => !Number.isInteger(Number(p.index)) || Number(p.index) < 1);

  if (!upstream) {
    return (
      <div>
        <NodeCommon node={node} onMeta={onMeta} />
        <WarningLine>请先连接上游节点，拆分字段需要 1 条入线。</WarningLine>
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
        <SectionTitle>拆分设置</SectionTitle>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
          <span className="form-hint" style={{ flex: '0 0 72px' }}>拆分字段</span>
          <Select
            size="small"
            showSearch
            value={cfg.field || undefined}
            placeholder="选择字段"
            style={{ flex: 1, minWidth: 0 }}
            options={fieldOptions(upFields)}
            onChange={(v) => patch({ field: v })}
          />
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
          <span className="form-hint" style={{ flex: '0 0 72px' }}>分隔符</span>
          <Input
            size="small"
            value={cfg.delimiter}
            placeholder="例如 / 或 ,"
            style={{ width: 180 }}
            onChange={(e) => patch({ delimiter: e.target.value })}
          />
          <span className="mini-tag">支持多字符</span>
        </div>
        <div style={{ display: 'flex', gap: 18, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
            <Switch
              size="small"
              checked={cfg.keepOriginal}
              onChange={(v) => patch({ keepOriginal: v })}
            />
            保留原字段
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
            <Switch size="small" checked={cfg.trim} onChange={(v) => patch({ trim: v })} />
            每段去空格
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
            <Switch size="small" checked={cfg.emptyAsNull} onChange={(v) => patch({ emptyAsNull: v })} />
            空段转 NULL
          </span>
        </div>
        <div className="form-hint" style={{ marginTop: 8, lineHeight: 1.7 }}>
          横向拆分，行数不变；使用 Doris SPLIT_PART，段数不足时返回空串，源字段为 NULL 时所有拆出列为 NULL。
          新增列类型统一为 STRING。
        </div>
      </div>

      <div className="form-section">
        <SectionTitle
          extra={
            <Button
              size="small"
              type="text"
              icon={<PlusOutlined />}
              onClick={() => patch({ parts: [...parts, nextPart(parts, cfg.field)] })}
            >
              添加片段
            </Button>
          }
        >
          输出片段
        </SectionTitle>
        <div className="field-table">
          <div className="field-row field-row--head" style={{ gridTemplateColumns: '20px 74px 1fr 30px' }}>
            <span />
            <span>序号</span>
            <span>输出列名</span>
            <span />
          </div>
          {parts.length === 0 ? (
            <div className="field-row" style={{ gridTemplateColumns: '1fr' }}>
              <span className="form-hint">尚未配置输出片段，点击右上角「添加片段」开始。</span>
            </div>
          ) : null}
          {parts.map((part, index) => (
            <div key={index} className="field-row" style={{ gridTemplateColumns: '20px 74px 1fr 30px' }}>
              <span className="form-hint">{index + 1}</span>
              <InputNumber
                size="small"
                min={1}
                precision={0}
                controls={false}
                value={part.index || undefined}
                placeholder="1"
                style={{ width: '100%' }}
                onChange={(v) => updatePart(index, { index: Number(v) || 0 })}
              />
              <Input
                size="small"
                value={part.output}
                placeholder={`p${part.index || index + 1}`}
                onChange={(e) => updatePart(index, { output: e.target.value })}
              />
              <Button
                size="small"
                type="text"
                danger
                icon={<DeleteOutlined />}
                onClick={() => patch({ parts: parts.filter((_, i) => i !== index) })}
              />
            </div>
          ))}
        </div>

        {!cfg.field ? <WarningLine>未选择拆分字段。</WarningLine> : null}
        {!cfg.delimiter ? <WarningLine>分隔符不能为空。</WarningLine> : null}
        {!parts.length ? <WarningLine>至少配置 1 个输出片段。</WarningLine> : null}
        {badIndex.length ? <DangerLine>片段序号必须是从 1 开始的整数。</DangerLine> : null}
        {duplicateIndices.length ? (
          <DangerLine>片段序号重复：{duplicateIndices.join('、')}。</DangerLine>
        ) : null}
        {duplicateOutputs.length ? (
          <DangerLine>片段输出列名重复：{duplicateOutputs.join('、')}。</DangerLine>
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
