import { useEffect, useState } from 'react';
import { App, Button, Modal, Tooltip } from 'antd';
import { CloseOutlined, DeleteOutlined, ExpandOutlined } from '@ant-design/icons';
import type { DataSource, FieldDef, FlowEdge, FlowNode, FlowRun } from '../../types';
import { NODE_META } from '../../utils/nodeMeta';
import { toDagJson } from '../../utils/dagJson';
import { useFlowStore } from './store';
import SqlModal from '../../components/SqlModal';
import PreviewModal from '../../components/PreviewModal';
import SourcePanel from './panels/SourcePanel';
import FilterPanel from './panels/FilterPanel';
import ConvertPanel from './panels/ConvertPanel';
import CalculatorPanel from './panels/CalculatorPanel';
import FormulaPanel from './panels/FormulaPanel';
import ReplaceNullPanel from './panels/ReplaceNullPanel';
import SortRowsPanel from './panels/SortRowsPanel';
import SplitFieldsPanel from './panels/SplitFieldsPanel';
import SplitToRowsPanel from './panels/SplitToRowsPanel';
import ValueMapperPanel from './panels/ValueMapperPanel';
import UniqueRowsPanel from './panels/UniqueRowsPanel';
import ColumnsToRowsPanel from './panels/ColumnsToRowsPanel';
import RowsToColumnsPanel from './panels/RowsToColumnsPanel';
import GroupByPanel from './panels/GroupByPanel';
import JoinPanel from './panels/JoinPanel';
import UnionPanel from './panels/UnionPanel';
import SinkPanel from './panels/SinkPanel';

interface Props {
  nodes: FlowNode[];
  edges: FlowEdge[];
  flowId: string;
  dataSources: DataSource[];
  lastRun?: FlowRun | null;
  onRetryNode?: (nodeId: string) => void;
}

export default function ConfigDrawer({
  nodes,
  edges,
  flowId,
  dataSources,
  lastRun,
  onRetryNode,
}: Props) {
  const { modal, message } = App.useApp();
  const selectedId = useFlowStore((s) => s.selectedNodeId);
  const setSelected = useFlowStore((s) => s.setSelected);
  const updateNodeConfig = useFlowStore((s) => s.updateNodeConfig);
  const updateNodeConfigSilent = useFlowStore((s) => s.updateNodeConfigSilent);
  const updateNodeData = useFlowStore((s) => s.updateNodeData);
  const removeNodes = useFlowStore((s) => s.removeNodes);
  const swapJoinInputs = useFlowStore((s) => s.swapJoinInputs);

  const [expanded, setExpanded] = useState(false);
  const [sqlModal, setSqlModal] = useState<{ open: boolean; sql: string; title: string }>({
    open: false,
    sql: '',
    title: '',
  });
  const [preview, setPreview] = useState<{
    open: boolean;
    fields: FieldDef[];
    title: string;
    nodeId?: string;
    dagJson?: unknown;
  }>({
    open: false,
    fields: [],
    title: '',
  });

  const node = nodes.find((n) => n.id === selectedId);
  const open = Boolean(node);
  const meta = node ? NODE_META[node.data.kind] : NODE_META.filter;

  // 切换或删除节点时退出放大模式，避免下次选中节点时弹窗自动重现。
  useEffect(() => {
    setExpanded(false);
  }, [selectedId]);

  const onConfig = (config: any) => {
    if (node) updateNodeConfig(node.id, config);
  };
  const onConfigSilent = (config: any) => {
    if (node) updateNodeConfigSilent(node.id, config);
  };
  const onMeta = (patch: Partial<FlowNode['data']>) => {
    if (node) updateNodeData(node.id, patch);
  };
  const onPreviewSql = (sql: string) => {
    if (!node) return;
    setSqlModal({ open: true, sql, title: `${node.data.label} · SQL 预览` });
  };
  const onPreviewData = (fields: FieldDef[]) => {
    if (!node) return;
    setPreview({
      open: true,
      fields,
      title: `${node.data.label} · 数据预览`,
      nodeId: node.id,
      dagJson: toDagJson(nodes, edges),
    });
  };

  const remove = () => {
    if (!node) return;
    modal.confirm({
      title: `删除节点「${node.data.label}」？`,
      content: '其配置与相连的线将一并删除。',
      okText: '删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: () => {
        removeNodes([node.id]);
        message.success('节点已删除');
      },
    });
  };

  const panelProps = {
    node: node as FlowNode,
    nodes,
    edges,
    flowId,
    onConfig,
    onConfigSilent,
    onMeta,
    onPreviewSql,
    onPreviewData,
    onSwapInputs: () => node && swapJoinInputs(node.id),
    dataSources,
    lastRun,
    onRetryNode,
  };

  const renderPanel = () => {
    if (!node) return null;
    switch (node.data.kind) {
      case 'source':
        return <SourcePanel {...panelProps} />;
      case 'filter':
        return <FilterPanel {...panelProps} />;
      case 'convert':
        return <ConvertPanel {...panelProps} />;
      case 'calculator':
        return <CalculatorPanel {...panelProps} />;
      case 'formula':
        return <FormulaPanel {...panelProps} />;
      case 'replaceNull':
        return <ReplaceNullPanel {...panelProps} />;
      case 'sortRows':
        return <SortRowsPanel {...panelProps} />;
      case 'splitFields':
        return <SplitFieldsPanel {...panelProps} />;
      case 'splitFieldsToRows':
        return <SplitToRowsPanel {...panelProps} />;
      case 'valueMapper':
        return <ValueMapperPanel {...panelProps} />;
      case 'uniqueRows':
        return <UniqueRowsPanel {...panelProps} />;
      case 'columnsToRows':
        return <ColumnsToRowsPanel {...panelProps} />;
      case 'rowsToColumns':
        return <RowsToColumnsPanel {...panelProps} />;
      case 'groupBy':
        return <GroupByPanel {...panelProps} />;
      case 'join':
        return <JoinPanel {...panelProps} />;
      case 'union':
        return <UnionPanel {...panelProps} />;
      case 'sink':
        return <SinkPanel {...panelProps} />;
      default:
        return null;
    }
  };

  return (
    <>
      <aside className={`config-drawer${open ? ' open' : ''}`}>
        <div className="config-head">
          <div
            className="config-head-icon"
            style={{ background: node ? `${meta.tint}1f` : 'transparent', color: meta.tint }}
          >
            {meta.icon}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="config-title">{node?.data.label || '节点配置'}</div>
            <div className="config-sub">
              {meta.label} · {meta.desc}
            </div>
          </div>
          <Tooltip title="放大编辑">
            <Button
              type="text"
              size="small"
              icon={<ExpandOutlined />}
              disabled={!node}
              onClick={() => setExpanded(true)}
              aria-label="放大编辑"
            />
          </Tooltip>
          <Button type="text" size="small" icon={<CloseOutlined />} onClick={() => setSelected(null)} />
        </div>

        <div className="config-body">
          {node && !expanded ? renderPanel() : null}
        </div>

        <div className="config-foot">
          <Button danger type="text" icon={<DeleteOutlined />} onClick={remove}>
            删除节点
          </Button>
          <span className="form-hint">修改后 2s 自动保存</span>
        </div>
      </aside>

      <Modal
        open={expanded && open}
        onCancel={() => setExpanded(false)}
        footer={null}
        width="min(1200px, 92vw)"
        title={
          node
            ? node.data.label === meta.label
              ? meta.label
              : `${node.data.label} · ${meta.label}`
            : '节点配置'
        }
        className="config-modal"
        styles={{ body: { maxHeight: '76vh', overflow: 'auto', paddingTop: 12 } }}
      >
        {/* 弹窗打开时抽屉内面板不渲染，关闭后内容卸载，保证同一时刻只有一个面板实例。 */}
        {expanded && node ? (
          <>
            <div className="config-modal-inner">{renderPanel()}</div>
            <div className="config-modal-foot">
              <Button danger type="text" icon={<DeleteOutlined />} onClick={remove}>
                删除节点
              </Button>
              <span className="form-hint">修改后 2s 自动保存</span>
            </div>
          </>
        ) : null}
      </Modal>

      <SqlModal
        open={sqlModal.open}
        onClose={() => setSqlModal((s) => ({ ...s, open: false }))}
        title={sqlModal.title}
        sql={sqlModal.sql}
      />
      <PreviewModal
        open={preview.open}
        onClose={() => setPreview((s) => ({ ...s, open: false }))}
        title={preview.title}
        flowId={flowId}
        nodeId={preview.nodeId}
        dagJson={preview.dagJson}
        fallbackColumns={preview.fields}
      />
    </>
  );
}
