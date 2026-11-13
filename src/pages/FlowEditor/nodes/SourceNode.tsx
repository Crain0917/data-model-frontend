import { Handle, Position, type NodeProps } from '@xyflow/react';
import { DatabaseOutlined, WarningFilled } from '@ant-design/icons';
import type { FlowNode } from '../../../types';
import RunBadge from './RunBadge';

export default function SourceNode({ data, selected }: NodeProps<FlowNode>) {
  const cfg = data.config as { tableName?: string; dataSourceName?: string };
  return (
    <div className={`flow-node${selected ? ' is-selected' : ''}`}>
      <div className={`source-node${selected ? ' selected' : ''}`} style={{ background: data.color }}>
        <div className="node-icon">
          <DatabaseOutlined />
        </div>
        <div className="n-name">{cfg.tableName || data.label}</div>
        <div className="n-sub">{cfg.dataSourceName || '数据表'}</div>
      </div>
      {data.warning ? (
        <span className="node-badge" title={data.warning}>
          <WarningFilled />
        </span>
      ) : null}
      <RunBadge status={data.runStatus} />
      <Handle id="out" type="source" position={Position.Right} className="flow-handle" />
    </div>
  );
}
