import { Input, Select, Switch } from 'antd';
import { TableOutlined } from '@ant-design/icons';
import { Button } from 'antd';
import type { FieldDef, ReplaceInStringConfig } from '../../../types';
import { findUpstream, isStringType, outputFields } from '../../../utils/dagUtils';
import { blockingIssues } from '../../../utils/validation';
import {
  DangerLine,
  NodeCommon,
  SectionTitle,
  WarningLine,
  fieldOptions,
  type PanelProps,
} from './common';
import SqlPreview from './SqlPreview';

function normalize(cfg: Partial<ReplaceInStringConfig>): ReplaceInStringConfig {
  return {
    alias: cfg.alias || 'a',
    field: String(cfg.field ?? '').trim(),
    output: String(cfg.output ?? ''),
    search: String(cfg.search ?? ''),
    replacement: String(cfg.replacement ?? ''),
    useRegex: Boolean(cfg.useRegex),
  };
}

export default function ReplaceInStringPanel({
  node,
  nodes,
  edges,
  flowId,
  onConfig,
  onMeta,
  onPreviewSql,
  onPreviewData,
}: PanelProps) {
  const cfg = normalize(node.data.config as Partial<ReplaceInStringConfig>);
  const upstream = findUpstream(node.id, nodes, edges);
  const upFields: FieldDef[] = upstream ? outputFields(upstream, nodes, edges) : [];
  const stringFields = upFields.filter((f) => isStringType(f.type));
  const selected = upFields.find((f) => f.name.toLowerCase() === cfg.field.toLowerCase());
  const inPlace = !cfg.output.trim() || cfg.output.trim().toLowerCase() === cfg.field.toLowerCase();
  const issues = blockingIssues(node, nodes, edges);

  const patch = (p: Partial<ReplaceInStringConfig>) => onConfig({ ...cfg, ...p });

  if (!upstream) {
    return (
      <div>
        <NodeCommon node={node} onMeta={onMeta} />
        <WarningLine>请先连接上游节点，替换字符串需要 1 条入线。</WarningLine>
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
        <SectionTitle>替换规则</SectionTitle>

        <div className="form-hint" style={{ marginBottom: 4 }}>
          输入字段 <span style={{ color: 'var(--danger)' }}>*</span>
        </div>
        <Select
          size="small"
          showSearch
          value={cfg.field || undefined}
          placeholder="选择字符串字段"
          style={{ width: '100%', marginBottom: 6 }}
          options={fieldOptions(stringFields)}
          notFoundContent="上游没有字符串字段"
          onChange={(v) => patch({ field: v })}
        />
        <div className="form-hint" style={{ marginBottom: 12 }}>
          仅字符串字段可选
          {stringFields.length < upFields.length
            ? `（已隐藏 ${upFields.length - stringFields.length} 个非字符串字段，可先用「类型转换」转为 STRING）`
            : ''}
          。
        </div>

        <div className="form-hint" style={{ marginBottom: 4 }}>输出字段名</div>
        <Input
          size="small"
          value={cfg.output}
          placeholder={cfg.field ? `${cfg.field}（原地替换）` : '留空 = 原地替换'}
          style={{ marginBottom: 6 }}
          onChange={(e) => patch({ output: e.target.value })}
        />
        <div className="form-hint" style={{ marginBottom: 12 }}>
          {inPlace
            ? '留空或与输入字段同名时，直接修改原列。'
            : `新增列 ${cfg.output.trim()}，原列（${cfg.field || '未选择'}）保留。`}
        </div>

        <div className="form-hint" style={{ marginBottom: 4 }}>
          查找内容 <span style={{ color: 'var(--danger)' }}>*</span>
        </div>
        <Input
          size="small"
          value={cfg.search}
          placeholder={cfg.useRegex ? '例如 \\d{4}-\\d{2}' : '例如 旧字符串'}
          style={{ marginBottom: 10 }}
          onChange={(e) => patch({ search: e.target.value })}
        />

        <div className="form-hint" style={{ marginBottom: 4 }}>替换为（可留空）</div>
        <Input
          size="small"
          value={cfg.replacement}
          placeholder="留空表示删除匹配内容"
          style={{ marginBottom: 10 }}
          onChange={(e) => patch({ replacement: e.target.value })}
        />

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <Switch size="small" checked={cfg.useRegex} onChange={(v) => patch({ useRegex: v })} />
          <span style={{ fontSize: 12.5 }}>使用正则表达式</span>
        </div>
        <div className="form-hint" style={{ lineHeight: 1.7 }}>
          {cfg.useRegex
            ? '查找内容按正则解析，可保存前先校验语法；替换内容是否支持捕获组以执行 SQL 为准。'
            : '按纯文本字面量匹配；特殊字符（如 . * ?）不会被当作正则。'}
          {selected ? ` 当前字段类型：${selected.type}。` : ''}
        </div>
      </div>

      {issues.map((issue) => (
        <DangerLine key={issue}>{issue}</DangerLine>
      ))}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
        <Button icon={<TableOutlined />} onClick={() => onPreviewData(outputFields(node, nodes, edges))}>
          预览数据
        </Button>
      </div>

      <SqlPreview node={node} nodes={nodes} edges={edges} flowId={flowId} onPreviewSql={onPreviewSql} />
    </div>
  );
}
