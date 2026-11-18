import type { Node, NodeChange, NodePositionChange } from '@xyflow/react';

export interface HelperLinesResult {
  horizontal?: number;
  vertical?: number;
  snapPosition: { x?: number; y?: number };
}

export type PositionChange = Extract<NodeChange, { type: 'position' }>;

function size(node: Node) {
  return {
    width: node.measured?.width ?? node.width ?? 0,
    height: node.measured?.height ?? node.height ?? 0,
  };
}

/**
 * 拖动节点时与其它节点做左/中/右、上/中/下对齐，返回吸附位置与辅助线坐标。
 * 坐标均为 flow 坐标（画布坐标系）。
 */
export function getHelperLines(
  change: PositionChange,
  nodes: Node[],
  distance = 6,
): HelperLinesResult {
  const result: HelperLinesResult = { snapPosition: {} };
  const dragged = nodes.find((n) => n.id === change.id);
  if (!dragged || !change.position || !('dragging' in change) || !(change as NodePositionChange).dragging) {
    return result;
  }

  const { width, height } = size(dragged);
  const a = {
    left: change.position.x,
    right: change.position.x + width,
    centerX: change.position.x + width / 2,
    top: change.position.y,
    bottom: change.position.y + height,
    centerY: change.position.y + height / 2,
  };

  let bestV = distance + 1;
  let bestH = distance + 1;
  let lineX: number | undefined;
  let lineY: number | undefined;
  let snapX: number | undefined;
  let snapY: number | undefined;

  for (const other of nodes) {
    if (other.id === dragged.id) continue;
    const dim = size(other);
    const b = {
      left: other.position.x,
      right: other.position.x + dim.width,
      centerX: other.position.x + dim.width / 2,
      top: other.position.y,
      bottom: other.position.y + dim.height,
      centerY: other.position.y + dim.height / 2,
    };

    const verticalPairs: Array<[number, number]> = [
      [a.left, b.left],
      [a.left, b.centerX],
      [a.left, b.right],
      [a.centerX, b.left],
      [a.centerX, b.centerX],
      [a.centerX, b.right],
      [a.right, b.left],
      [a.right, b.centerX],
      [a.right, b.right],
    ];
    for (const [from, to] of verticalPairs) {
      const delta = to - from;
      if (Math.abs(delta) <= distance && Math.abs(delta) < bestV) {
        bestV = Math.abs(delta);
        lineX = to;
        snapX = change.position.x + delta;
      }
    }

    const horizontalPairs: Array<[number, number]> = [
      [a.top, b.top],
      [a.top, b.centerY],
      [a.top, b.bottom],
      [a.centerY, b.top],
      [a.centerY, b.centerY],
      [a.centerY, b.bottom],
      [a.bottom, b.top],
      [a.bottom, b.centerY],
      [a.bottom, b.bottom],
    ];
    for (const [from, to] of horizontalPairs) {
      const delta = to - from;
      if (Math.abs(delta) <= distance && Math.abs(delta) < bestH) {
        bestH = Math.abs(delta);
        lineY = to;
        snapY = change.position.y + delta;
      }
    }
  }

  result.vertical = lineX;
  result.horizontal = lineY;
  result.snapPosition = { x: snapX, y: snapY };
  return result;
}
