import { useState } from 'react';
import { App, Button } from 'antd';
import { CloseOutlined, DeleteOutlined } from '@ant-design/icons';
import type { DataSource, FieldDef, FlowEdge, FlowNode } from '../../types';
import { NODE_META } from '../../utils/nodeMeta';
import { useFlowStore } from './store';
import SqlModal from '../../components/SqlModal';
import PreviewModal from '../../components/PreviewModal';
import SourcePanel from './panels/SourcePanel';
import FilterPanel from './panels/FilterPanel';
import GroupByPanel from './panels/GroupByPanel';
import JoinPanel from './panels/JoinPanel';
import UnionPanel from './panels/UnionPanel';
import SinkPanel from './panels/SinkPanel';

interface Props {
  nodes: FlowNode[];
  edges: FlowEdge[];
  flowId: string;
  dataSources: DataSource[];
}

export default function ConfigDrawer({ nodes, edges, flowId, dataSources }: Props) {
  const { modal, message } = App.useApp();
  const selectedId = useFlowStore((s) => s.selectedNodeId);
  const setSelected = useFlowStore((s) => s.setSelected);
  const updateNodeConfig = useFlowStore((s) => s.updateNodeConfig);
  const updateNodeConfigSilent = useFlowStore((s) => s.updateNodeConfigSilent);
  const updateNodeData = useFlowStore((s) => s.updateNodeData);
  const removeNodes = useFlowStore((s) => s.removeNodes);
  const swapJoinInputs = useFlowStore((s) => s.swapJoinInputs);

  const [sqlModal, setSqlModal] = useState<{ open: boolean; sql: string; title: string }>({
    open: false,
    sql: '',
    title: '',
  });
  const [preview, setPreview] = useState<{ open: boolean; fields: FieldDef[]; title: string }>({
    open: false,
    fields: [],
    title: '',
  });

  const node = nodes.find((n) => n.id === selectedId);
  const open = Boolean(node);
  const meta = node ? NODE_META[node.data.kind] : NODE_META.filter;

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
    setPreview({ open: true, fields, title: `${node.data.label} · 数据预览` });
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
          <Button type="text" size="small" icon={<CloseOutlined />} onClick={() => setSelected(null)} />
        </div>

        <div className="config-body">
          {node ? (
            <>
              {node.data.kind === 'source' ? <SourcePanel {...panelProps} /> : null}
              {node.data.kind === 'filter' ? <FilterPanel {...panelProps} /> : null}
              {node.data.kind === 'groupBy' ? <GroupByPanel {...panelProps} /> : null}
              {node.data.kind === 'join' ? <JoinPanel {...panelProps} /> : null}
              {node.data.kind === 'union' ? <UnionPanel {...panelProps} /> : null}
              {node.data.kind === 'sink' ? <SinkPanel {...panelProps} /> : null}
            </>
          ) : null}
        </div>

        <div className="config-foot">
          <Button danger type="text" icon={<DeleteOutlined />} onClick={remove}>
            删除节点
          </Button>
          <span className="form-hint">修改后 2s 自动保存</span>
        </div>
      </aside>

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
        columns={preview.fields}
      />
    </>
  );
}
