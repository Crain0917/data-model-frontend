import { Handle, Position, type NodeProps } from '@xyflow/react';
import { ExportOutlined, WarningFilled } from '@ant-design/icons';
import type { FlowNode } from '../../../types';
import RunBadge from './RunBadge';

export default function SinkNode({ data, selected }: NodeProps<FlowNode>) {
  return (
    <div className={`flow-node${selected ? ' is-selected' : ''}`}>
      <div className="sink-node" style={{ background: data.color }}>
        <div className="node-icon" style={{ background: 'rgba(255,255,255,.55)', color: '#166534' }}>
          <ExportOutlined />
        </div>
        <div style={{ minWidth: 0 }}>
          <div className="s-name">{data.label}</div>
          <div className="s-sub">Sink · v1 未启用</div>
        </div>
      </div>
      {data.warning ? (
        <span className="node-badge" title={data.warning}>
          <WarningFilled />
        </span>
      ) : null}
      <RunBadge status={data.runStatus} />
      <Handle id="in-0" type="target" position={Position.Left} className="flow-handle" />
    </div>
  );
}
