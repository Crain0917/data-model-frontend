import { Button, Input, Select, Switch } from 'antd';
import { TableOutlined } from '@ant-design/icons';
import type { FieldDef, SplitFieldsToRowsConfig } from '../../../types';
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

function normalize(cfg: Partial<SplitFieldsToRowsConfig>): SplitFieldsToRowsConfig {
  return {
    alias: cfg.alias || 'a',
    field: String(cfg.field || ''),
    delimiter: cfg.delimiter == null ? '' : String(cfg.delimiter),
    output: String(cfg.output || ''),
    keepOriginal: cfg.keepOriginal !== false,
    trim: cfg.trim !== false,
    dropEmpty: Boolean(cfg.dropEmpty),
    positionOutput: String(cfg.positionOutput || ''),
  };
}

export default function SplitToRowsPanel({
  node,
  nodes,
  edges,
  flowId,
  onConfig,
  onMeta,
  onPreviewSql,
  onPreviewData,
}: PanelProps) {
  const cfg = normalize(node.data.config as Partial<SplitFieldsToRowsConfig>);
  const upstream = findUpstream(node.id, nodes, edges);
  const upFields: FieldDef[] = upstream ? outputFields(upstream, nodes, edges) : [];

  const patch = (p: Partial<SplitFieldsToRowsConfig>) => onConfig({ ...cfg, ...p });
  const inPlace = Boolean(cfg.field) && cfg.output.trim().toLowerCase() === cfg.field.toLowerCase();

  if (!upstream) {
    return (
      <div>
        <NodeCommon node={node} onMeta={onMeta} />
        <WarningLine>请先连接上游节点，拆分字段为多行需要 1 条入线。</WarningLine>
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
          <span className="form-hint" style={{ flex: '0 0 86px' }}>拆分字段</span>
          <Select
            size="small"
            showSearch
            value={cfg.field || undefined}
            placeholder="选择字段"
            style={{ flex: 1, minWidth: 0 }}
            options={fieldOptions(upFields)}
            onChange={(v) => patch({ field: v, output: cfg.output || v })}
          />
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
          <span className="form-hint" style={{ flex: '0 0 86px' }}>分隔符</span>
          <Input
            size="small"
            value={cfg.delimiter}
            placeholder="例如 , 或 |"
            style={{ width: 180 }}
            onChange={(e) => patch({ delimiter: e.target.value })}
          />
          <span className="mini-tag">支持多字符</span>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
          <span className="form-hint" style={{ flex: '0 0 86px' }}>输出列名</span>
          <Input
            size="small"
            value={cfg.output}
            placeholder={cfg.field || '例如 tag'}
            style={{ width: 180 }}
            onChange={(e) => patch({ output: e.target.value })}
          />
          {inPlace ? <span className="mini-tag">原地炸裂</span> : null}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
          <span className="form-hint" style={{ flex: '0 0 86px' }}>序号列名</span>
          <Input
            size="small"
            value={cfg.positionOutput}
            placeholder="可选，例如 tag_index"
            style={{ width: 180 }}
            onChange={(e) => patch({ positionOutput: e.target.value })}
          />
          <span className="mini-tag">可选 · BIGINT</span>
        </div>

        <div style={{ display: 'flex', gap: 18, alignItems: 'center', flexWrap: 'wrap', marginTop: 10 }}>
          <span
            style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, opacity: inPlace ? 0.55 : 1 }}
            title={inPlace ? '原地炸裂时列名不变，无需保留原字段' : undefined}
          >
            <Switch
              size="small"
              checked={cfg.keepOriginal}
              disabled={inPlace}
              onChange={(v) => patch({ keepOriginal: v })}
            />
            保留原字段
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
            <Switch size="small" checked={cfg.trim} onChange={(v) => patch({ trim: v })} />
            每段去空格
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
            <Switch size="small" checked={cfg.dropEmpty} onChange={(v) => patch({ dropEmpty: v })} />
            过滤空段
          </span>
        </div>

        <div className="form-hint" style={{ marginTop: 8, lineHeight: 1.7 }}>
          纵向炸裂，行数变多：一行 3 段会变成 3 行，其余列值复制。输出名等于源字段时为原地炸裂（列名不变）；
          填其他名字时保留原字段（可关闭）并在末尾追加新列。源字段为 NULL 或空串时默认保留一行、拆分值为 NULL；
          开启「过滤空段」后该行不产生输出。
        </div>
      </div>

      {!cfg.field ? <WarningLine>未选择拆分字段。</WarningLine> : null}
      {!cfg.delimiter ? <WarningLine>分隔符不能为空。</WarningLine> : null}
      {!cfg.output.trim() ? <WarningLine>拆分值输出列名不能为空。</WarningLine> : null}
      {cfg.positionOutput.trim() &&
      cfg.positionOutput.trim().toLowerCase() === cfg.output.trim().toLowerCase() ? (
        <DangerLine>序号列不能与输出列同名。</DangerLine>
      ) : null}
      {cfg.positionOutput.trim() &&
      upFields.some((f) => f.name.toLowerCase() === cfg.positionOutput.trim().toLowerCase()) ? (
        <DangerLine>序号列与上游已有列重名。</DangerLine>
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
