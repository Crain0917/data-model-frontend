import type { ReactNode } from 'react';
import { Input } from 'antd';
import type { AnyNodeConfig, DataSource, FieldDef, FlowEdge, FlowNode } from '../../../types';
import { NODE_COLORS } from '../../../utils/nodeMeta';

export interface PanelProps {
  node: FlowNode;
  nodes: FlowNode[];
  edges: FlowEdge[];
  flowId: string;
  onConfig: (config: AnyNodeConfig) => void;
  onConfigSilent?: (config: AnyNodeConfig) => void;
  onMeta: (patch: Partial<FlowNode['data']>) => void;
  onPreviewSql: (sql: string) => void;
  onPreviewData: (fields: FieldDef[]) => void;
  onSwapInputs?: () => void;
  dataSources: DataSource[];
}

export function SectionTitle({ children, extra }: { children: ReactNode; extra?: ReactNode }) {
  return (
    <div className="form-section-title">
      <span>{children}</span>
      {extra}
    </div>
  );
}

export function NodeCommon({ node, onMeta }: { node: FlowNode; onMeta: PanelProps['onMeta'] }) {
  return (
    <div className="form-section">
      <SectionTitle>节点信息</SectionTitle>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <Input
          value={node.data.label}
          maxLength={50}
          onChange={(e) => onMeta({ label: e.target.value })}
          placeholder="节点名称"
        />
      </div>
      <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
        <span className="form-hint">节点颜色</span>
        <div className="color-dots">
          {NODE_COLORS.map((color) => (
            <button
              key={color}
              className={`color-dot${node.data.color === color ? ' active' : ''}`}
              style={{ background: color }}
              onClick={() => onMeta({ color })}
              aria-label="选择节点颜色"
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export function WarningLine({ children }: { children: ReactNode }) {
  return (
    <div className="warn-line">
      <span>⚠️</span>
      <span>{children}</span>
    </div>
  );
}

export function DangerLine({ children }: { children: ReactNode }) {
  return (
    <div className="danger-line">
      <span>✕</span>
      <span>{children}</span>
    </div>
  );
}

export function fieldOptions(fields: FieldDef[]) {
  return fields.map((f) => ({ value: f.name, label: `${f.name}  ·  ${f.type}` }));
}
