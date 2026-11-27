import { useEffect, useMemo, useState } from 'react';
import { App, Button, Modal, Tooltip } from 'antd';
import {
  CloseOutlined,
  DeleteOutlined,
  ExpandOutlined,
  SaveOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import type { DataSource, FieldDef, FlowEdge, FlowNode, FlowRun } from '../../types';
import { NODE_META } from '../../utils/nodeMeta';
import { toDagJson } from '../../utils/dagJson';
import { blockingIssues } from '../../utils/validation';
import { draftDirty, useFlowStore } from './store';
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
import ReplaceInStringPanel from './panels/ReplaceInStringPanel';
import LlmPanel from './panels/LlmPanel';
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
  /** 执行当前节点：返回 ok=false 时展示中文原因。 */
  onRunNode?: (nodeId: string) => Promise<{ ok: boolean; message?: string }>;
}

export default function ConfigDrawer({
  nodes,
  edges,
  flowId,
  dataSources,
  lastRun,
  onRetryNode,
  onRunNode,
}: Props) {
  const { modal, message } = App.useApp();
  const selectedId = useFlowStore((s) => s.selectedNodeId);
  const drafts = useFlowStore((s) => s.drafts);
  const baselines = useFlowStore((s) => s.baselines);
  const pendingDraft = useFlowStore((s) => s.pendingDraft);
  const updateNodeConfig = useFlowStore((s) => s.updateNodeConfig);
  const updateNodeConfigSilent = useFlowStore((s) => s.updateNodeConfigSilent);
  const updateNodeData = useFlowStore((s) => s.updateNodeData);
  const removeNodes = useFlowStore((s) => s.removeNodes);
  const swapJoinInputs = useFlowStore((s) => s.swapJoinInputs);
  const requestSelect = useFlowStore((s) => s.requestSelect);
  const saveNodeDraft = useFlowStore((s) => s.saveNodeDraft);
  const resolveDraftPrompt = useFlowStore((s) => s.resolveDraftPrompt);
  const discardDraft = useFlowStore((s) => s.discardDraft);

  const [expanded, setExpanded] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [startingNode, setStartingNode] = useState(false);
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
    limit?: number;
    notice?: string;
  }>({
    open: false,
    fields: [],
    title: '',
  });

  // 面板与预览使用「已保存配置 + 当前草稿」的合成节点。
  const effectiveNodes = useMemo(
    () =>
      nodes.map((n) => {
        const draft = drafts[n.id];
        if (!draft) return n;
        return {
          ...n,
          data: {
            ...n.data,
            config: draft.config,
            label: draft.label,
            color: draft.color,
          },
        };
      }),
    [nodes, drafts],
  );

  const node = effectiveNodes.find((n) => n.id === selectedId);
  const open = Boolean(node);
  const meta = node ? NODE_META[node.data.kind] : NODE_META.filter;
  const dirty = Boolean(
    node && draftDirty(node, selectedId ? drafts[selectedId] : undefined, selectedId ? baselines[selectedId] : undefined),
  );
  const blocking = node ? blockingIssues(node, effectiveNodes, edges) : [];

  // 切换或删除节点时退出放大模式，避免下次选中节点时弹窗自动重现。
  useEffect(() => {
    setExpanded(false);
  }, [selectedId]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || expanded || pendingDraft) return;
      requestSelect(null);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, expanded, pendingDraft, requestSelect]);

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
    const isLlm = node.data.kind === 'llm';
    setPreview({
      open: true,
      fields,
      title: `${node.data.label} · 数据预览`,
      nodeId: node.id,
      dagJson: toDagJson(effectiveNodes, edges),
      limit: isLlm ? 20 : 100,
      notice: isLlm ? '本次预览真实调用模型，最多 20 行，按单次批量行数分批。' : undefined,
    });
  };

  const saveDraft = async () => {
    if (!node || !dirty) return;
    setSavingDraft(true);
    try {
      const err = await saveNodeDraft(node.id);
      if (err) message.error(err, 6);
      else message.success('节点配置已保存');
    } finally {
      setSavingDraft(false);
    }
  };

  const resolvePrompt = async (action: 'save' | 'discard' | 'cancel') => {
    if (action === 'save') setSavingDraft(true);
    try {
      const err = await resolveDraftPrompt(action);
      if (err) message.error(err, 6);
    } finally {
      if (action === 'save') setSavingDraft(false);
    }
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

  const cancel = () => {
    if (!node) return;
    if (!dirty) {
      requestSelect(null);
      return;
    }
    modal.confirm({
      title: '放弃未保存的修改？',
      content: `「${node.data.label}」的配置已修改但尚未保存，取消将丢弃本次修改。`,
      okText: '放弃修改',
      okButtonProps: { danger: true },
      cancelText: '继续编辑',
      onOk: () => {
        discardDraft(node.id);
        requestSelect(null);
      },
    });
  };

  const runNode = async () => {
    if (!node || startingNode || savingDraft) return;
    if (blocking.length) {
      message.warning(`配置未完成：${blocking.join('；')}`, 5);
      return;
    }
    if (dirty) {
      const saveFirst = await new Promise<boolean>((resolve) => {
        modal.confirm({
          title: '请先保存节点配置再执行',
          content: `「${node.data.label}」的配置有未保存修改，是否保存后执行？`,
          okText: '保存并执行',
          cancelText: '取消',
          onOk: () => resolve(true),
          onCancel: () => resolve(false),
        });
      });
      if (!saveFirst) return;
      setSavingDraft(true);
      const err = await saveNodeDraft(node.id);
      setSavingDraft(false);
      if (err) {
        message.error(err, 6);
        return;
      }
    }
    if (!onRunNode) return;
    setStartingNode(true);
    try {
      const result = await onRunNode(node.id);
      if (!result.ok && result.message) message.warning(result.message, 5);
    } finally {
      setStartingNode(false);
    }
  };

  const panelProps = {
    node: node as FlowNode,
    nodes: effectiveNodes,
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
      case 'replaceInString':
        return <ReplaceInStringPanel {...panelProps} />;
      case 'llm':
        return <LlmPanel {...panelProps} />;
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

  const draftStatus = dirty ? (
    <span className="draft-dirty">
      <span className="status-dot status-dot--idle" /> 有未保存修改
    </span>
  ) : (
    <span className="form-hint">节点配置需手动保存</span>
  );

  const footerActions = (
    <>
      <Button danger type="text" icon={<DeleteOutlined />} onClick={remove}>
        删除节点
      </Button>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {draftStatus}
        <Tooltip title={blocking.length ? blocking.join('；') : '先执行其所有前置节点，不会执行后置节点'}>
          <Button
            size="small"
            icon={<ThunderboltOutlined />}
            disabled={startingNode || savingDraft || !onRunNode}
            loading={startingNode}
            onClick={() => void runNode()}
          >
            执行此节点
          </Button>
        </Tooltip>
        <Button size="small" onClick={cancel}>
          取消
        </Button>
        <Tooltip title={blocking.length ? blocking.join('；') : '保存当前节点配置并写入流程'}>
          <Button
            type="primary"
            size="small"
            icon={<SaveOutlined />}
            disabled={!dirty || Boolean(blocking.length)}
            loading={savingDraft}
            onClick={saveDraft}
          >
            保存配置
          </Button>
        </Tooltip>
      </div>
    </>
  );

  const pendingLabel =
    nodes.find((n) => n.id === selectedId)?.data.label || '当前节点';

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
          <Button
            type="text"
            size="small"
            icon={<CloseOutlined />}
            onClick={() => requestSelect(null)}
            aria-label="关闭节点配置"
          />
        </div>

        <div className="config-body">
          {node && !expanded ? renderPanel() : null}
        </div>

        <div className="config-foot">{footerActions}</div>
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
            <div className="config-modal-foot">{footerActions}</div>
          </>
        ) : null}
      </Modal>

      <Modal
        open={Boolean(pendingDraft)}
        title="节点配置有未保存修改"
        closable={false}
        maskClosable={false}
        keyboard={false}
        footer={[
          <Button key="cancel" onClick={() => void resolvePrompt('cancel')}>
            取消
          </Button>,
          <Button key="discard" danger onClick={() => void resolvePrompt('discard')}>
            不保存
          </Button>,
          <Button key="save" type="primary" loading={savingDraft} onClick={() => void resolvePrompt('save')}>
            保存
          </Button>,
        ]}
      >
        <div style={{ fontSize: 13, lineHeight: 1.8 }}>
          「{pendingLabel}」的配置已修改但尚未保存。
          {pendingDraft?.mode === 'action'
            ? '保存后继续当前操作；选择「不保存」将丢弃草稿并继续。'
            : '保存后离开，或丢弃草稿恢复上次已保存内容。'}
        </div>
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
        limit={preview.limit}
        notice={preview.notice}
        nodes={effectiveNodes}
        onLocateNode={(id) => {
          setPreview((s) => ({ ...s, open: false }));
          requestSelect(id);
        }}
      />
    </>
  );
}
