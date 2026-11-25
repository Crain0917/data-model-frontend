import { useState, type DragEvent, type ReactNode } from 'react';
import { Input } from 'antd';
import type {
  AnyNodeConfig,
  DataSource,
  FieldDef,
  FlowEdge,
  FlowNode,
  FlowRun,
} from '../../../types';
import { NODE_COLORS } from '../../../utils/nodeMeta';
import { displayDorisType } from '../../../utils/dorisType';

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
  lastRun?: FlowRun | null;
  onRetryNode?: (nodeId: string) => void;
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
  return fields.map((f) => ({ value: f.name, label: `${f.name}  ·  ${displayDorisType(f.type)}` }));
}

/**
 * 原生 HTML5 拖动排序：抓手可拖动，整行作为落点。
 * 放下后把新数组交给 onReorder，由面板写回 config。
 */
export function useDragSort<T>(list: T[], onReorder: (next: T[]) => void) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  const handleProps = (index: number) => ({
    draggable: true,
    onDragStart: (e: DragEvent<HTMLElement>) => {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(index));
      setDragIndex(index);
    },
    onDragEnd: () => {
      setDragIndex(null);
      setOverIndex(null);
    },
  });

  const rowProps = (index: number) => ({
    onDragOver: (e: DragEvent<HTMLElement>) => {
      if (dragIndex == null) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (overIndex !== index) setOverIndex(index);
    },
    onDrop: (e: DragEvent<HTMLElement>) => {
      e.preventDefault();
      if (dragIndex != null && dragIndex !== index) {
        const next = [...list];
        const [moved] = next.splice(dragIndex, 1);
        next.splice(index, 0, moved);
        onReorder(next);
      }
      setDragIndex(null);
      setOverIndex(null);
    },
  });

  const rowClass = (index: number) =>
    `${dragIndex === index ? ' field-row--dragging' : ''}${overIndex === index ? ' field-row--over' : ''}`;

  return { dragIndex, overIndex, handleProps, rowProps, rowClass };
}
