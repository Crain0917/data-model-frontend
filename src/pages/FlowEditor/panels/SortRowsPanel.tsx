import { useState } from 'react';
import { Button, Input, Select, Switch } from 'antd';
import { DeleteOutlined, HolderOutlined, PlusOutlined, TableOutlined } from '@ant-design/icons';
import type {
  FieldDef,
  GroupOrderKey,
  GroupRankFunction,
  SortKey,
  SortRowsConfig,
} from '../../../types';
import { findUpstream, outputFields } from '../../../utils/dagUtils';
import {
  DangerLine,
  NodeCommon,
  SectionTitle,
  WarningLine,
  fieldOptions,
  useDragSort,
  type PanelProps,
} from './common';
import SqlPreview from './SqlPreview';

const RANK_FUNCS: Array<{ value: GroupRankFunction; label: string; desc: string }> = [
  { value: 'ROW_NUMBER', label: 'ROW_NUMBER()', desc: '成绩相同，名次不同（1,2,3,4）' },
  { value: 'RANK', label: 'RANK()', desc: '同分同名次，后面跳号（1,1,3,4）' },
  { value: 'DENSE_RANK', label: 'DENSE_RANK()', desc: '同分同名次，后面不跳号（1,1,2,3）' },
];

function normalize(cfg: Partial<SortRowsConfig>): SortRowsConfig {
  const fn = String(cfg.groupFunction || 'ROW_NUMBER').toUpperCase();
  return {
    alias: cfg.alias || 'a',
    sequenceEnabled: Boolean(cfg.sequenceEnabled),
    sequenceOutput: String(cfg.sequenceOutput || ''),
    simpleEnabled: Boolean(cfg.simpleEnabled),
    keys: (cfg.keys || []).map((k) => ({
      field: String(k.field || ''),
      direction: (String(k.direction || 'ASC').toUpperCase() as SortKey['direction']) || 'ASC',
      values: (k.values || []).map((v) => String(v ?? '')),
    })),
    groupEnabled: Boolean(cfg.groupEnabled),
    partitionBy: (cfg.partitionBy || []).map((v) => String(v ?? '')).filter(Boolean),
    groupOrderBy: (cfg.groupOrderBy || []).map((k) => ({
      field: String(k.field || ''),
      direction: String(k.direction || 'ASC').toUpperCase() === 'DESC' ? 'DESC' : 'ASC',
    })),
    groupFunction: (['ROW_NUMBER', 'RANK', 'DENSE_RANK'].includes(fn) ? fn : 'ROW_NUMBER') as GroupRankFunction,
    groupOutput: String(cfg.groupOutput || ''),
  };
}

function CustomValuesEditor({
  values,
  onChange,
}: {
  values: string[];
  onChange: (next: string[]) => void;
}) {
  const drag = useDragSort(values, onChange);
  const [draft, setDraft] = useState('');
  const list = values || [];
  const add = () => {
    const v = draft.trim();
    if (!v) return;
    onChange([...list, v]);
    setDraft('');
  };
  return (
    <div className="sort-values">
      <div className="form-hint" style={{ marginBottom: 6 }}>
        按列表顺序排序；未列出的值统一排在最后。
      </div>
      {list.map((value, index) => (
        <div
          key={index}
          className={`field-row${drag.rowClass(index)}`}
          style={{ gridTemplateColumns: '20px 1fr 28px' }}
          {...drag.rowProps(index)}
        >
          <span
            className="drag-handle"
            role="button"
            aria-label={`拖动调整值 ${value} 的顺序`}
            title="按住拖动调整顺序"
            {...drag.handleProps(index)}
          >
            <HolderOutlined />
          </span>
          <Input
            size="small"
            value={value}
            onChange={(e) => onChange(list.map((v, i) => (i === index ? e.target.value : v)))}
          />
          <Button
            size="small"
            type="text"
            danger
            icon={<DeleteOutlined />}
            onClick={() => onChange(list.filter((_, i) => i !== index))}
          />
        </div>
      ))}
      <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
        <Input
          size="small"
          value={draft}
          placeholder="输入一个值，回车添加"
          onChange={(e) => setDraft(e.target.value)}
          onPressEnter={add}
        />
        <Button size="small" icon={<PlusOutlined />} onClick={add}>
          添加
        </Button>
      </div>
    </div>
  );
}

const KEY_GRID = '20px 1fr 104px 28px';
const GROUP_KEY_GRID = '20px 1fr 104px 28px';

export default function SortRowsPanel({
  node,
  nodes,
  edges,
  flowId,
  onConfig,
  onMeta,
  onPreviewSql,
  onPreviewData,
}: PanelProps) {
  const cfg = normalize(node.data.config as Partial<SortRowsConfig>);
  const upstream = findUpstream(node.id, nodes, edges);
  const upFields: FieldDef[] = upstream ? outputFields(upstream, nodes, edges) : [];
  const keys = cfg.keys.filter((k) => k.field) as SortKey[];
  const groupOrderBy = cfg.groupOrderBy.filter((k) => k.field) as GroupOrderKey[];

  const patch = (p: Partial<SortRowsConfig>) => onConfig({ ...cfg, ...p });
  const keyDrag = useDragSort(cfg.keys, (next) => patch({ keys: next }));
  const groupDrag = useDragSort(cfg.groupOrderBy, (next) => patch({ groupOrderBy: next }));

  const updateKey = (index: number, p: Partial<SortKey>) => {
    patch({ keys: cfg.keys.map((k, i) => (i === index ? { ...k, ...p } : k)) });
  };
  const updateGroupKey = (index: number, p: Partial<GroupOrderKey>) => {
    patch({ groupOrderBy: cfg.groupOrderBy.map((k, i) => (i === index ? { ...k, ...p } : k)) });
  };

  const orderSource = cfg.simpleEnabled && keys.length
    ? '顺序列按「简单排序」的字段生成'
    : cfg.groupEnabled && groupOrderBy.length
      ? '未启用简单排序，顺序列与最终行序按「分区字段 + 组内排序字段」生成'
      : '未启用简单排序或组内排序，顺序列不会生成';

  if (!upstream) {
    return (
      <div>
        <NodeCommon node={node} onMeta={onMeta} />
        <WarningLine>请先连接上游节点，排序需要 1 条入线。</WarningLine>
      </div>
    );
  }

  if (!upFields.length) {
    return (
      <div>
        <NodeCommon node={node} onMeta={onMeta} />
        <WarningLine>上游尚未提供字段，请先配置上游节点后再获取字段。</WarningLine>
      </div>
    );
  }

  return (
    <div>
      <NodeCommon node={node} onMeta={onMeta} />

      <div className="form-section">
        <SectionTitle>输入流</SectionTitle>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span className="form-hint">别名</span>
          <Input
            size="small"
            value={cfg.alias}
            style={{ width: 72 }}
            onChange={(e) => patch({ alias: e.target.value || 'a' })}
          />
          <span className="form-hint" style={{ marginLeft: 4 }}>
            上游：{upstream.data.label} · {upFields.length} 字段
          </span>
        </div>
      </div>

      {/* 第一部分：顺序字段 */}
      <div className="form-section panel-block">
        <SectionTitle
          extra={
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Switch
                size="small"
                checked={cfg.sequenceEnabled}
                onChange={(v) => patch({ sequenceEnabled: v })}
              />
              <span style={{ fontSize: 11 }}>展示排序字段</span>
            </div>
          }
        >
          1 · 顺序字段
        </SectionTitle>
        {cfg.sequenceEnabled ? (
          <>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span className="form-hint">顺序列名</span>
              <Input
                size="small"
                value={cfg.sequenceOutput}
                placeholder="seq_no"
                style={{ width: 180 }}
                onChange={(e) => patch({ sequenceOutput: e.target.value })}
              />
            </div>
            <div className="form-hint" style={{ marginTop: 6 }}>
              顺序列是最终排序结果上的行号，从 1 开始（BIGINT）。{orderSource}。
            </div>
          </>
        ) : (
          <div className="form-hint">关闭时不输出顺序列。</div>
        )}
      </div>

      {/* 第二部分：简单排序 */}
      <div className="form-section panel-block">
        <SectionTitle
          extra={
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Switch
                size="small"
                checked={cfg.simpleEnabled}
                onChange={(v) => patch({ simpleEnabled: v })}
              />
              <span style={{ fontSize: 11 }}>启用</span>
            </div>
          }
        >
          2 · 简单排序
        </SectionTitle>
        {cfg.simpleEnabled ? (
          <>
            <div className="form-hint" style={{ marginBottom: 6 }}>
              多键按列表顺序逐级排序；自定义顺序使用 Doris FIELD，未列出的值排在最后。
            </div>
            {cfg.keys.length ? (
              <div className="field-table">
                <div className="field-row field-row--head" style={{ gridTemplateColumns: KEY_GRID }}>
                  <span />
                  <span>排序字段</span>
                  <span>方向</span>
                  <span />
                </div>
                {cfg.keys.map((key, index) => (
                  <div
                    key={`${key.field}-${index}`}
                    className={`field-row${keyDrag.rowClass(index)}`}
                    style={{ gridTemplateColumns: KEY_GRID }}
                    {...keyDrag.rowProps(index)}
                  >
                    <span
                      className="drag-handle"
                      role="button"
                      aria-label={`拖动调整排序字段 ${key.field} 的优先级`}
                      title="按住拖动调整顺序"
                      {...keyDrag.handleProps(index)}
                    >
                      <HolderOutlined />
                    </span>
                    <Select
                      size="small"
                      showSearch
                      value={key.field || undefined}
                      placeholder="选择字段"
                      style={{ width: '100%' }}
                      options={fieldOptions(upFields)}
                      onChange={(v) => updateKey(index, { field: v })}
                    />
                    <Select
                      size="small"
                      value={key.direction}
                      style={{ width: '100%' }}
                      options={[
                        { value: 'ASC', label: '升序 ASC' },
                        { value: 'DESC', label: '降序 DESC' },
                        { value: 'CUSTOM', label: '自定义顺序' },
                      ]}
                      onChange={(v) => updateKey(index, { direction: v })}
                    />
                    <Button
                      size="small"
                      type="text"
                      danger
                      icon={<DeleteOutlined />}
                      onClick={() => patch({ keys: cfg.keys.filter((_, i) => i !== index) })}
                    />
                  </div>
                ))}
              </div>
            ) : (
              <WarningLine>简单排序至少需要 1 个排序字段。</WarningLine>
            )}
            {cfg.keys.map((key, index) =>
              key.direction === 'CUSTOM' ? (
                <div className="sort-values-block" key={`custom-${index}`}>
                  <div className="form-hint" style={{ fontWeight: 600 }}>
                    自定义顺序值 · {key.field || `第 ${index + 1} 个排序字段`}
                  </div>
                  <CustomValuesEditor
                    values={key.values || []}
                    onChange={(values) => updateKey(index, { values })}
                  />
                </div>
              ) : null,
            )}
            <Button
              size="small"
              type="dashed"
              icon={<PlusOutlined />}
              block
              style={{ marginTop: 8 }}
              onClick={() =>
                patch({ keys: [...cfg.keys, { field: upFields[0]?.name || '', direction: 'ASC', values: [] }] })
              }
            >
              添加排序字段
            </Button>
          </>
        ) : (
          <div className="form-hint">关闭时不生成 ORDER BY（仅组内排序时按分区字段 + 组内排序字段出最终行序）。</div>
        )}
      </div>

      {/* 第三部分：组内排序 */}
      <div className="form-section panel-block">
        <SectionTitle
          extra={
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Switch
                size="small"
                checked={cfg.groupEnabled}
                onChange={(v) => patch({ groupEnabled: v })}
              />
              <span style={{ fontSize: 11 }}>启用</span>
            </div>
          }
        >
          3 · 组内排序
        </SectionTitle>
        {cfg.groupEnabled ? (
          <>
            <div className="form-hint" style={{ marginBottom: 6 }}>
              按分区字段分组，在组内按排序字段计算名次；组内排序只计算名次，不单独改变最终行序。
            </div>
            <div style={{ marginBottom: 8 }}>
              <div className="form-hint" style={{ marginBottom: 4 }}>分区字段（PARTITION BY）</div>
              <Select
                size="small"
                mode="multiple"
                value={cfg.partitionBy}
                placeholder="选择分区字段"
                style={{ width: '100%' }}
                options={fieldOptions(upFields)}
                onChange={(v) => patch({ partitionBy: v })}
              />
            </div>

            <div className="form-hint" style={{ marginBottom: 4 }}>组内排序字段（ORDER BY）</div>
            {cfg.groupOrderBy.length ? (
              <div className="field-table">
                <div className="field-row field-row--head" style={{ gridTemplateColumns: GROUP_KEY_GRID }}>
                  <span />
                  <span>排序字段</span>
                  <span>方向</span>
                  <span />
                </div>
                {cfg.groupOrderBy.map((key, index) => (
                  <div
                    key={`${key.field}-${index}`}
                    className={`field-row${groupDrag.rowClass(index)}`}
                    style={{ gridTemplateColumns: GROUP_KEY_GRID }}
                    {...groupDrag.rowProps(index)}
                  >
                    <span
                      className="drag-handle"
                      role="button"
                      aria-label={`拖动调整组内排序字段 ${key.field} 的优先级`}
                      title="按住拖动调整顺序"
                      {...groupDrag.handleProps(index)}
                    >
                      <HolderOutlined />
                    </span>
                    <Select
                      size="small"
                      showSearch
                      value={key.field || undefined}
                      placeholder="选择字段"
                      style={{ width: '100%' }}
                      options={fieldOptions(upFields)}
                      onChange={(v) => updateGroupKey(index, { field: v })}
                    />
                    <Select
                      size="small"
                      value={key.direction}
                      style={{ width: '100%' }}
                      options={[
                        { value: 'ASC', label: '升序 ASC' },
                        { value: 'DESC', label: '降序 DESC' },
                      ]}
                      onChange={(v) => updateGroupKey(index, { direction: v })}
                    />
                    <Button
                      size="small"
                      type="text"
                      danger
                      icon={<DeleteOutlined />}
                      onClick={() => patch({ groupOrderBy: cfg.groupOrderBy.filter((_, i) => i !== index) })}
                    />
                  </div>
                ))}
              </div>
            ) : (
              <WarningLine>组内排序至少需要 1 个排序字段。</WarningLine>
            )}
            <Button
              size="small"
              type="dashed"
              icon={<PlusOutlined />}
              block
              style={{ marginTop: 8, marginBottom: 10 }}
              onClick={() =>
                patch({
                  groupOrderBy: [...cfg.groupOrderBy, { field: upFields[0]?.name || '', direction: 'DESC' }],
                })
              }
            >
              添加组内排序字段
            </Button>

            <div className="form-hint" style={{ marginBottom: 6 }}>名次函数（三选一，业务含义不同）</div>
            <div className="rank-options">
              {RANK_FUNCS.map((fn) => (
                <button
                  key={fn.value}
                  type="button"
                  className={`rank-option${cfg.groupFunction === fn.value ? ' active' : ''}`}
                  onClick={() => patch({ groupFunction: fn.value })}
                >
                  <span className="rank-option-name">{fn.label}</span>
                  <span className="rank-option-desc">{fn.desc}</span>
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 10 }}>
              <span className="form-hint">名次列名</span>
              <Input
                size="small"
                value={cfg.groupOutput}
                placeholder="rn"
                style={{ width: 180 }}
                onChange={(e) => patch({ groupOutput: e.target.value })}
              />
              <span className="mini-tag">BIGINT</span>
            </div>
            {!cfg.partitionBy.length ? <WarningLine>组内排序至少需要 1 个分区字段。</WarningLine> : null}
            {!cfg.groupOutput.trim() ? <WarningLine>组内名次列名不能为空。</WarningLine> : null}
          </>
        ) : (
          <div className="form-hint">关闭时不输出组内名次列。</div>
        )}
      </div>

      {!cfg.sequenceEnabled && !cfg.simpleEnabled && !cfg.groupEnabled ? (
        <WarningLine>三部分全部关闭时节点为纯透传，SQL 合法但不改变数据。</WarningLine>
      ) : null}
      {cfg.sequenceEnabled && !cfg.sequenceOutput.trim() ? (
        <DangerLine>已开启顺序列，但顺序列名为空。</DangerLine>
      ) : null}
      {cfg.sequenceEnabled &&
      !((cfg.simpleEnabled && cfg.keys.some((key) => key.field.trim())) || cfg.groupEnabled) ? (
        <WarningLine>
          未启用简单排序或组内排序时，顺序列不会生成（后端会忽略），请先启用其中一种排序。
        </WarningLine>
      ) : null}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Button icon={<TableOutlined />} onClick={() => onPreviewData(outputFields(node, nodes, edges))}>
          预览数据
        </Button>
      </div>

      <SqlPreview node={node} nodes={nodes} edges={edges} flowId={flowId} onPreviewSql={onPreviewSql} />
    </div>
  );
}
