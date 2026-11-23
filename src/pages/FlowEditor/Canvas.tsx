import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  useStore,
  type Connection,
  type NodeChange,
  type NodeTypes,
} from '@xyflow/react';
import { App } from 'antd';
import { DeleteOutlined, ThunderboltFilled } from '@ant-design/icons';
import type { FlowEdge, FlowNode, FlowNodeKind } from '../../types';
import { NODE_META } from '../../utils/nodeMeta';
import { createNode } from '../../utils/dagUtils';
import { getHelperLines } from '../../utils/helperLines';
import { nodeWarning, validateConnection } from '../../utils/validation';
import { listColumns } from '../../api/datasource';
import { useFlowStore } from './store';
import SourceNode from './nodes/SourceNode';
import TransformNode from './nodes/TransformNode';
import SinkNode from './nodes/SinkNode';
import NodePalette from './NodePalette';

const nodeTypes: NodeTypes = {
  source: SourceNode,
  filter: TransformNode,
  convert: TransformNode,
  calculator: TransformNode,
  formula: TransformNode,
  groupBy: TransformNode,
  join: TransformNode,
  union: TransformNode,
  sink: SinkNode,
};

interface Props {
  flowId: string;
  nodes: FlowNode[];
  edges: FlowEdge[];
  fitSignal?: number;
}

interface HelperLineState {
  horizontal?: number;
  vertical?: number;
}

function HelperLinesRenderer({ horizontal, vertical }: HelperLineState) {
  const transform = useStore((s) => s.transform);
  if (horizontal === undefined && vertical === undefined) return null;
  return (
    <div
      className="helper-lines"
      style={{
        transform: `translate(${transform[0]}px, ${transform[1]}px) scale(${transform[2]})`,
      }}
    >
      {vertical !== undefined ? (
        <div className="helper-line helper-line--vertical" style={{ transform: `translateX(${vertical}px)` }} />
      ) : null}
      {horizontal !== undefined ? (
        <div className="helper-line helper-line--horizontal" style={{ transform: `translateY(${horizontal}px)` }} />
      ) : null}
    </div>
  );
}

function CanvasInner({ flowId, nodes, edges, fitSignal = 0 }: Props) {
  const { message } = App.useApp();
  const { screenToFlowPosition, fitView } = useReactFlow();
  const onNodesChange = useFlowStore((s) => s.onNodesChange);
  const onEdgesChange = useFlowStore((s) => s.onEdgesChange);
  const connect = useFlowStore((s) => s.connect);
  const addNode = useFlowStore((s) => s.addNode);
  const removeNodes = useFlowStore((s) => s.removeNodes);
  const setSelected = useFlowStore((s) => s.setSelected);
  const viewport = useFlowStore((s) => s.viewport);
  const setViewport = useFlowStore((s) => s.setViewport);
  const [dragOver, setDragOver] = useState(false);
  const [helperLines, setHelperLines] = useState<HelperLineState>({});
  const [ctrlActive, setCtrlActive] = useState(false);
  const helperLinesRef = useRef<HelperLineState>({});
  const ctrlRef = useRef(false);
  const dragChangeRef = useRef<Extract<NodeChange<FlowNode>, { type: 'position' }> | null>(null);
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;
  const wrapperRef = useRef<HTMLDivElement>(null);

  const clearHelperLines = useCallback(() => {
    if (helperLinesRef.current.horizontal !== undefined || helperLinesRef.current.vertical !== undefined) {
      helperLinesRef.current = {};
      setHelperLines({});
    }
  }, []);

  // Ctrl（macOS 兼容 Cmd）按住时才启用对齐辅助线与吸附，拖动中途按下/松开即时生效
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      const held = e.ctrlKey || e.metaKey;
      if (held === ctrlRef.current) return;
      ctrlRef.current = held;
      setCtrlActive(held);
      if (!held) {
        clearHelperLines();
        return;
      }
      const drag = dragChangeRef.current;
      if (!drag) return;
      const { horizontal, vertical } = getHelperLines(drag, nodesRef.current);
      helperLinesRef.current = { horizontal, vertical };
      setHelperLines({ horizontal, vertical });
    };
    const handleBlur = () => {
      ctrlRef.current = false;
      setCtrlActive(false);
      clearHelperLines();
    };
    window.addEventListener('keydown', handleKey);
    window.addEventListener('keyup', handleKey);
    window.addEventListener('blur', handleBlur);
    return () => {
      window.removeEventListener('keydown', handleKey);
      window.removeEventListener('keyup', handleKey);
      window.removeEventListener('blur', handleBlur);
    };
  }, [clearHelperLines]);

  useEffect(() => {
    if (!fitSignal) return;
    const timer = window.setTimeout(() => {
      void fitView({ padding: 0.22, duration: 220 });
    }, 240);
    return () => window.clearTimeout(timer);
  }, [fitSignal, fitView]);

  const handleNodesChange = useCallback(
    (changes: NodeChange<FlowNode>[]) => {
      const dragChange = changes.find(
        (c): c is Extract<NodeChange<FlowNode>, { type: 'position' }> => c.type === 'position' && Boolean((c as { dragging?: boolean }).dragging),
      );
      if (!dragChange || !ctrlRef.current) {
        dragChangeRef.current = dragChange ?? null;
        clearHelperLines();
        onNodesChange(changes);
        return;
      }
      dragChangeRef.current = dragChange;

      const { horizontal, vertical, snapPosition } = getHelperLines(dragChange, nodes);
      if (horizontal !== helperLinesRef.current.horizontal || vertical !== helperLinesRef.current.vertical) {
        helperLinesRef.current = { horizontal, vertical };
        setHelperLines({ horizontal, vertical });
      }

      if (snapPosition.x === undefined && snapPosition.y === undefined) {
        onNodesChange(changes);
        return;
      }
      const snapped = changes.map((change) => {
        if (change !== dragChange || !('position' in change) || !change.position) return change;
        return {
          ...change,
          position: {
            x: snapPosition.x ?? change.position.x,
            y: snapPosition.y ?? change.position.y,
          },
        };
      });
      onNodesChange(snapped as NodeChange<FlowNode>[]);
    },
    [nodes, onNodesChange, clearHelperLines],
  );

  const nodesWithWarnings = useMemo(
    () =>
      nodes.map((n) => ({
        ...n,
        data: { ...n.data, warning: nodeWarning(n, nodes, edges) },
      })),
    [nodes, edges],
  );

  const selectedCount = nodes.filter((n) => n.selected).length;

  const displayEdges = useMemo(
    () =>
      edges.map((e) => ({
        ...e,
        type: e.type || 'smoothstep',
        markerEnd: e.markerEnd || { type: MarkerType.ArrowClosed, width: 16, height: 16, color: '#94A3B8' },
      })),
    [edges],
  );

  const onConnect = useCallback(
    (conn: Connection) => {
      const check = validateConnection(conn.source, conn.target, conn.targetHandle, nodes, edges);
      if (!check.ok) {
        if (check.reason) message.error(check.reason);
        return;
      }
      connect(conn);
    },
    [nodes, edges, connect, message],
  );

  const isValidConnection = useCallback(
    (conn: Connection | FlowEdge) =>
      validateConnection(conn.source, conn.target, conn.targetHandle, nodes, edges).ok,
    [nodes, edges],
  );

  const handleDrop = async (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragOver(false);
    const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
    const kind = event.dataTransfer.getData('application/x-flow-node') as FlowNodeKind;
    const tablePayload = event.dataTransfer.getData('application/x-flow-table');
    if (kind) {
      const node = createNode(kind, { x: position.x - 60, y: position.y - 60 });
      addNode(node);
      message.success(`已添加 ${NODE_META[kind].label} 节点`);
      return;
    }
    if (tablePayload) {
      try {
        const payload = JSON.parse(tablePayload) as {
          dataSourceId: number;
          dataSourceName: string;
          dbName?: string;
          tableName: string;
        };
        const columns = await listColumns(payload.dataSourceId, payload.tableName);
        const node = createNode(
          'source',
          { x: position.x - 48, y: position.y - 48 },
          {
            dataSourceId: payload.dataSourceId,
            dataSourceName: payload.dataSourceName,
            dbName: payload.dbName,
            tableName: payload.tableName,
            fields: columns.map((c) => ({ name: c.name, type: c.type })),
          },
          payload.tableName,
        );
        addNode(node);
        message.success(`已添加 Source 节点：${payload.tableName}`);
      } catch (e) {
        message.error(`创建 Source 节点失败：${(e as Error).message}`);
      }
    }
  };

  const addAtCenter = (kind: FlowNodeKind) => {
    const rect = wrapperRef.current?.getBoundingClientRect();
    const center = screenToFlowPosition({
      x: (rect?.left || 0) + (rect?.width || 800) / 2,
      y: (rect?.top || 0) + (rect?.height || 600) / 2,
    });
    const node = createNode(kind, { x: center.x - 60, y: center.y - 60 });
    addNode(node);
    message.success(`已添加 ${NODE_META[kind].label} 节点`);
  };

  return (
    <div className="canvas-shell">
      <NodePalette onAdd={addAtCenter} />
      <div
        ref={wrapperRef}
        className="canvas-stage"
        onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        if (!dragOver) setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      <ReactFlow
        nodes={nodesWithWarnings}
        edges={displayEdges}
        nodeTypes={nodeTypes}
        onNodesChange={handleNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        isValidConnection={isValidConnection}
        onConnectEnd={(_event, state) => {
          const anyState = state as unknown as {
            isValid?: boolean;
            fromNode?: { id: string } | null;
            toNode?: { id: string } | null;
            toHandle?: { id: string | null } | null;
          };
          if (anyState.isValid) return;
          if (!anyState.fromNode || !anyState.toNode) return;
          const check = validateConnection(
            anyState.fromNode.id,
            anyState.toNode.id,
            anyState.toHandle?.id,
            nodes,
            edges,
          );
          if (!check.ok && check.reason) message.error(check.reason);
        }}
        onNodeClick={(_e, node) => setSelected(node.id)}
        onPaneClick={() => setSelected(null)}
        onMoveEnd={(_e, vp) => setViewport(vp)}
        defaultViewport={viewport}
        fitView
        fitViewOptions={{ padding: 0.22 }}
        minZoom={0.3}
        maxZoom={2}
        deleteKeyCode={['Backspace', 'Delete']}
        selectionOnDrag
        multiSelectionKeyCode="Shift"
        panOnScroll
        defaultEdgeOptions={{
          type: 'smoothstep',
          markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16, color: '#94A3B8' },
        }}
        proOptions={{ hideAttribution: true }}
        style={{ background: 'transparent' }}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1.4} color="var(--dot-color)" />
        <HelperLinesRenderer horizontal={helperLines.horizontal} vertical={helperLines.vertical} />
        <Controls position="bottom-left" showInteractive={false} />
        {nodes.length ? (
          <MiniMap
            position="bottom-right"
            pannable
            zoomable
            nodeStrokeWidth={2}
            nodeColor={(n) => NODE_META[(n.data as { kind: FlowNodeKind }).kind]?.tint || '#94A3B8'}
            maskColor="rgba(15, 18, 32, 0.55)"
            style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 10, width: 168, height: 112 }}
          />
        ) : null}
      </ReactFlow>

      {dragOver ? (
        <div
          style={{
            position: 'absolute',
            inset: 10,
            border: '2px dashed var(--color-primary)',
            borderRadius: 14,
            pointerEvents: 'none',
            background: 'rgba(79,107,255,.04)',
            zIndex: 11,
          }}
        />
      ) : null}

      {nodes.length === 0 ? (
        <div className="canvas-empty">
          <div className="canvas-empty-card">
            <h3>从左侧拖入数据表开始编排</h3>
            <p style={{ fontSize: 12.5, color: 'var(--text-secondary)', margin: 0 }}>
              画布会自动保存，刷新后节点位置与配置都会还原。
            </p>
            <ol className="steps">
              <li>
                <span className="step-num">1</span>
                <span>选择左侧数据源，找到要处理的表。</span>
              </li>
              <li>
                <span className="step-num">2</span>
                <span>把表拖到画布，生成圆形 Source 节点。</span>
              </li>
              <li>
                <span className="step-num">3</span>
                <span>从节点库拖入加工节点并连线，非法连线会被即时拦截。</span>
              </li>
            </ol>
            <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--text-tertiary)' }}>
              <ThunderboltFilled style={{ color: 'var(--color-primary)' }} />
              节点 ID 与首节点位置会写入 dag_json，后端 DAG 解析直接消费。
            </div>
          </div>
        </div>
      ) : null}

      {selectedCount > 1 ? (
        <div
          style={{
            position: 'absolute',
            top: 16,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 14,
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border)',
            borderRadius: 999,
            boxShadow: 'var(--shadow-card)',
            padding: '6px 8px 6px 14px',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            fontSize: 12,
          }}
        >
          <span>
            已选中 <b>{selectedCount}</b> 个节点
          </span>
          <button
            className="chip chip--danger"
            style={{ border: 0, cursor: 'pointer' }}
            onClick={() => {
              const ids = nodes.filter((n) => n.selected).map((n) => n.id);
              removeNodes(ids);
              message.success(`已删除 ${ids.length} 个节点`);
            }}
          >
            <DeleteOutlined /> 删除
          </button>
        </div>
      ) : null}

      <div
        style={{
          position: 'absolute',
          bottom: 14,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 9,
          fontSize: 11,
          color: 'var(--text-tertiary)',
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border)',
          borderRadius: 999,
          padding: '4px 12px',
          opacity: 0.9,
        }}
      >
        拖拽移动 · <span style={{ color: ctrlActive ? 'var(--color-primary)' : 'inherit', fontWeight: ctrlActive ? 600 : 400 }}>
          {ctrlActive ? 'Ctrl 吸附对齐已开启' : '按住 Ctrl 拖动节点可吸附对齐'}
        </span> · 滚轮缩放 · 框选多选 · Delete 删除 · {flowId ? `flow_${flowId}` : ''}
      </div>
      </div>
    </div>
  );
}

export default function Canvas(props: Props) {
  return (
    <ReactFlowProvider>
      <CanvasInner {...props} />
    </ReactFlowProvider>
  );
}
