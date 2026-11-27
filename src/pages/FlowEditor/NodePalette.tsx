import { Tooltip } from 'antd';
import type { FlowNodeKind } from '../../types';
import { NODE_GROUPS, NODE_META, PALETTE_ROWS, type PaletteGroup } from '../../utils/nodeMeta';

export default function NodePalette({ onAdd }: { onAdd: (kind: FlowNodeKind) => void }) {
  const renderGroup = (group: PaletteGroup) => (
    <div className="palette-group" key={group.key}>
      <div className="palette-group-head">
        <span>{group.label}</span>
        <span className="palette-group-count">{group.kinds.length}</span>
      </div>
      <div className="palette-group-items">
        {group.kinds.map((kind) => {
          const meta = NODE_META[kind];
          return (
            <Tooltip key={kind} title={meta.desc} placement="bottom">
              <div
                className="palette-item"
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
              </div>
            </Tooltip>
          );
        })}
      </div>
    </div>
  );

  const byKey = new Map(NODE_GROUPS.map((g) => [g.key, g]));

  return (
    <div className="node-palette">
      <div className="palette-groups">
        {PALETTE_ROWS.map((row, index) => (
          <div className="palette-row" key={index}>
            {row.map((key) => {
              const group = byKey.get(key);
              return group ? renderGroup(group) : null;
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
