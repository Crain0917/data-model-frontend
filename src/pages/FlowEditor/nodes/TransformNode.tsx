import { Handle, Position, type NodeProps } from '@xyflow/react';
import { WarningFilled } from '@ant-design/icons';
import type { FlowNode } from '../../../types';
import { NODE_META } from '../../../utils/nodeMeta';
import RunBadge from './RunBadge';

export default function TransformNode({ data, selected }: NodeProps<FlowNode>) {
  const meta = NODE_META[data.kind];
  const isJoin = data.kind === 'join';
  return (
    <div className={`flow-node${selected ? ' is-selected' : ''}`}>
      <div className="transform-wrap">
        <div
          className="diamond"
          style={{
            background: data.color,
            borderColor: `${meta.tint}66`,
          }}
        />
        <div className="transform-inner">
          <div className="ti-icon" style={{ background: `${meta.tint}1f`, color: meta.tint }}>
            {meta.icon}
          </div>
          <div className="ti-name">{data.label}</div>
          <div className="ti-kind">{meta.enLabel}</div>
        </div>

        {isJoin ? (
          <>
            <Handle id="in-0" type="target" position={Position.Top} className="flow-handle flow-handle--l" />
            <span className="handle-label" style={{ top: -18, left: '50%', transform: 'translateX(-50%)' }}>
              L
            </span>
            <Handle id="in-1" type="target" position={Position.Bottom} className="flow-handle flow-handle--r" />
            <span className="handle-label" style={{ bottom: -18, left: '50%', transform: 'translateX(-50%)' }}>
              R
            </span>
          </>
        ) : (
          <Handle id="in-0" type="target" position={Position.Left} className="flow-handle" />
        )}
        <Handle id="out" type="source" position={Position.Right} className="flow-handle" />
      </div>
      {data.warning ? (
        <span className="node-badge" title={data.warning}>
          <WarningFilled />
        </span>
      ) : null}
      <RunBadge status={data.runStatus} />
    </div>
  );
}
