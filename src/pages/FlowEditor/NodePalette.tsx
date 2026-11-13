import { Tooltip } from 'antd';
import type { FlowNodeKind } from '../../types';
import { NODE_META, NODE_PALETTE } from '../../utils/nodeMeta';

export default function NodePalette({ onAdd }: { onAdd: (kind: FlowNodeKind) => void }) {
  return (
    <div className="node-palette">
      <div className="node-palette-title">节点库</div>
      {NODE_PALETTE.map((kind) => {
        const meta = NODE_META[kind];
        const disabled = kind === 'sink';
        return (
          <Tooltip
            key={kind}
            title={disabled ? 'Sink 在 v1 仅占位，可拖入与连线，配置只读' : meta.desc}
            placement="right"
          >
            <div
              className={`palette-item${disabled ? ' disabled' : ''}`}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData('application/x-flow-node', kind);
                e.dataTransfer.effectAllowed = 'copy';
              }}
              onClick={() => onAdd(kind)}
            >
              <span className="palette-icon" style={{ background: `${meta.tint}1f`, color: meta.tint }}>
                {meta.icon}
              </span>
              <span>{meta.label}</span>
              {disabled ? <span className="palette-tag">未启用</span> : null}
            </div>
          </Tooltip>
        );
      })}
      <div className="palette-hint">拖入或点击添加到画布中心</div>
    </div>
  );
}
