import { useEffect, useState } from 'react';
import { Alert, App, AutoComplete, Button, Input, Radio, Select, Switch } from 'antd';
import { DeleteOutlined, PlusOutlined, TableOutlined } from '@ant-design/icons';
import type {
  FieldDef,
  SortSpec,
  UniqueDuplicateTarget,
  UniqueMode,
  UniqueRowsConfig,
} from '../../../types';
import { findUpstream, isStringType, outputFields } from '../../../utils/dagUtils';
import { listTables } from '../../../api/datasource';
import {
  DangerLine,
  NodeCommon,
  SectionTitle,
  WarningLine,
  fieldOptions,
  type PanelProps,
} from './common';
import SqlPreview from './SqlPreview';

function normalize(cfg: Partial<UniqueRowsConfig>): UniqueRowsConfig {
  const target = cfg.duplicateTarget || ({} as Partial<UniqueDuplicateTarget>);
  return {
    alias: cfg.alias || 'a',
    mode: String(cfg.mode || 'SIMPLE').toUpperCase() === 'RULE' ? 'RULE' : 'SIMPLE',
    keyFields: Array.isArray(cfg.keyFields) ? cfg.keyFields.filter(Boolean) : [],
    ignoreCase: Boolean(cfg.ignoreCase),
    orderBy: (cfg.orderBy || []).filter((k) => String(k.field || '').trim()),
    duplicateOutput: String(cfg.duplicateOutput || 'DISCARD').toUpperCase() === 'TABLE' ? 'TABLE' : 'DISCARD',
    duplicateTarget: {
      dataSourceId: target.dataSourceId ?? null,
      tableName: String(target.tableName || ''),
      writeMode: String(target.writeMode || 'APPEND').toUpperCase() === 'OVERWRITE' ? 'OVERWRITE' : 'APPEND',
      autoCreate: target.autoCreate !== false,
    },
  };
}

export default function UniqueRowsPanel({
  node,
  nodes,
  edges,
  flowId,
  onConfig,
  onMeta,
  onPreviewSql,
  onPreviewData,
  dataSources,
}: PanelProps) {
  const { message } = App.useApp();
  const cfg = normalize(node.data.config as Partial<UniqueRowsConfig>);
  const upstream = findUpstream(node.id, nodes, edges);
  const upFields: FieldDef[] = upstream ? outputFields(upstream, nodes, edges) : [];
  const target = cfg.duplicateTarget;
  const diverting = cfg.duplicateOutput === 'TABLE';
  const dorisSources = dataSources.filter((d) => d.type === 'DORIS');

  const [tables, setTables] = useState<string[]>([]);
  const [loadingTables, setLoadingTables] = useState(false);

  useEffect(() => {
    if (!target.dataSourceId || !diverting) {
      setTables([]);
      return;
    }
    let alive = true;
    setLoadingTables(true);
    listTables(target.dataSourceId)
      .then((res) => {
        if (alive) setTables(res.map((t) => t.tableName));
      })
      .catch(() => {
        if (alive) {
          setTables([]);
          message.error('目标表列表加载失败');
        }
      })
      .finally(() => {
        if (alive) setLoadingTables(false);
      });
    return () => {
      alive = false;
    };
  }, [target.dataSourceId, diverting, message]);

  const patch = (p: Partial<UniqueRowsConfig>) => onConfig({ ...cfg, ...p });
  const patchTarget = (p: Partial<UniqueDuplicateTarget>) =>
    patch({ duplicateTarget: { ...target, ...p } });
  const updateOrder = (index: number, p: Partial<SortSpec>) => {
    patch({ orderBy: cfg.orderBy.map((row, i) => (i === index ? { ...row, ...p } : row)) });
  };

  const mixedCaseKeys = cfg.keyFields.filter((name) => {
    const field = upFields.find((f) => f.name.toLowerCase() === name.toLowerCase());
    return field && isStringType(field.type);
  });

  if (!upstream) {
    return (
      <div>
        <NodeCommon node={node} onMeta={onMeta} />
        <WarningLine>请先连接上游节点，行去重需要 1 条入线。</WarningLine>
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

      <div className="form-section">
        <SectionTitle>去重规则</SectionTitle>

        <div className="form-hint" style={{ marginBottom: 6 }}>去重模式</div>
        <Radio.Group
          value={cfg.mode}
          style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}
          onChange={(e) => patch({ mode: e.target.value as UniqueMode })}
        >
          <Radio value="SIMPLE">随机保留一条</Radio>
          <Radio value="RULE">按规则取第一条</Radio>
        </Radio.Group>
        <div className="form-hint" style={{ marginBottom: 12, lineHeight: 1.7 }}>
          {cfg.mode === 'SIMPLE'
            ? 'SIMPLE 使用 RAND() 随机保留一条，多次运行保留的行可能不同，不适合强一致业务。'
            : 'RULE 按下方排序字段升/降序取第一条，可配置多个排序字段。'}
        </div>

        <div className="form-hint" style={{ marginBottom: 4 }}>关键字段（全部相等才算重复）</div>
        <Select
          mode="multiple"
          allowClear
          value={cfg.keyFields}
          placeholder="选择一个或多个关键字段"
          style={{ width: '100%', marginBottom: 6 }}
          options={fieldOptions(upFields)}
          onChange={(keys) => patch({ keyFields: keys })}
        />
        <div className="form-hint" style={{ marginBottom: 12 }}>
          NULL 与 NULL 视为相等（Doris PARTITION BY 语义）。输出为上游全部可见列，顺序不变。
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <Switch size="small" checked={cfg.ignoreCase} onChange={(v) => patch({ ignoreCase: v })} />
          <span style={{ fontSize: 12.5 }}>忽略大小写</span>
          <span className="mini-tag">仅字符串字段</span>
        </div>
        <div className="form-hint" style={{ marginBottom: 12 }}>
          仅对字符串类型的关键字段生效（分组键按 LOWER(CAST(... AS STRING)) 处理），数字等非字符串字段不受影响。
        </div>

        {cfg.mode === 'RULE' ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div className="form-hint">排序字段（取第一条）</div>
              <Button
                size="small"
                type="text"
                icon={<PlusOutlined />}
                onClick={() => patch({ orderBy: [...cfg.orderBy, { field: '', direction: 'DESC' }] })}
              >
                添加排序
              </Button>
            </div>
            <div className="field-table">
              <div className="field-row field-row--head" style={{ gridTemplateColumns: '1fr 100px 30px' }}>
                <span>字段</span>
                <span>方向</span>
                <span />
              </div>
              {cfg.orderBy.length === 0 ? (
                <div className="field-row" style={{ gridTemplateColumns: '1fr' }}>
                  <span className="form-hint">至少添加 1 个排序字段。</span>
                </div>
              ) : null}
              {cfg.orderBy.map((row, index) => (
                <div key={index} className="field-row" style={{ gridTemplateColumns: '1fr 100px 30px' }}>
                  <Select
                    size="small"
                    showSearch
                    value={row.field || undefined}
                    placeholder="选择字段"
                    style={{ width: '100%' }}
                    options={fieldOptions(upFields)}
                    onChange={(v) => updateOrder(index, { field: v })}
                  />
                  <Select
                    size="small"
                    value={row.direction}
                    style={{ width: '100%' }}
                    options={[
                      { value: 'ASC', label: '升序 ASC' },
                      { value: 'DESC', label: '降序 DESC' },
                    ]}
                    onChange={(v) => updateOrder(index, { direction: v })}
                  />
                  <Button
                    size="small"
                    type="text"
                    danger
                    icon={<DeleteOutlined />}
                    onClick={() => patch({ orderBy: cfg.orderBy.filter((_, i) => i !== index) })}
                  />
                </div>
              ))}
            </div>
          </>
        ) : null}
      </div>

      <div className="form-section">
        <SectionTitle>重复行分流</SectionTitle>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Switch
            checked={diverting}
            onChange={(v) => patch({ duplicateOutput: v ? 'TABLE' : 'DISCARD' })}
          />
          <span style={{ fontSize: 12.5 }}>把重复行写入目标表</span>
        </div>
        <div className="form-hint" style={{ marginTop: 4, marginBottom: diverting ? 10 : 0 }}>
          {diverting
            ? '主输出仍保留去重后的行；重复行（dm_rn > 1）写入下方 Doris 目标表。重复流写入失败时节点失败。'
            : '关闭时重复行直接丢弃，不做额外物化。'}
        </div>

        {diverting ? (
          <>
            <Alert
              type="info"
              showIcon
              style={{ marginBottom: 10 }}
              message="v1 目标类型仅支持 Doris"
              description="按本节点输出列与 Doris 类型自动建表；写入失败会明确报错并保留目标表供重试。"
            />
            <div className="form-hint" style={{ marginBottom: 4 }}>
              目标数据源 <span style={{ color: 'var(--danger)' }}>*</span>
            </div>
            <Select
              showSearch
              allowClear
              value={target.dataSourceId ?? undefined}
              placeholder="请选择 Doris 目标数据源"
              style={{ width: '100%', marginBottom: 10 }}
              options={dorisSources.map((d) => ({ value: d.id, label: `${d.name} · ${d.type}` }))}
              notFoundContent="暂无 Doris 数据源"
              onChange={(id) =>
                patchTarget({ dataSourceId: id ?? null, tableName: '' })
              }
            />

            <div className="form-hint" style={{ marginBottom: 4 }}>
              目标表名 <span style={{ color: 'var(--danger)' }}>*</span>
            </div>
            <AutoComplete
              value={target.tableName}
              style={{ width: '100%', marginBottom: 10 }}
              options={tables.map((t) => ({ value: t }))}
              placeholder={target.autoCreate ? '填写新表名或选择已有表' : '选择已有表'}
              onChange={(v) => patchTarget({ tableName: v })}
              notFoundContent={loadingTables ? '加载中…' : null}
            />

            <div className="form-hint" style={{ marginBottom: 4 }}>写入模式</div>
            <Radio.Group
              value={target.writeMode}
              style={{ display: 'flex', gap: 4, marginBottom: 10 }}
              onChange={(e) => patchTarget({ writeMode: e.target.value })}
            >
              <Radio value="APPEND">追加 APPEND</Radio>
              <Radio value="OVERWRITE">覆盖 OVERWRITE</Radio>
            </Radio.Group>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <div>
                <div style={{ fontSize: 12.5 }}>自动建表</div>
                <div className="form-hint">表不存在时按输出列与 Doris 类型自动创建</div>
              </div>
              <Switch
                checked={target.autoCreate}
                onChange={(v) => patchTarget({ autoCreate: v })}
              />
            </div>
          </>
        ) : null}
      </div>

      {!cfg.keyFields.length ? <WarningLine>至少需要 1 个关键字段。</WarningLine> : null}
      {cfg.mode === 'RULE' && !cfg.orderBy.length ? (
        <WarningLine>按规则去重至少需要 1 个排序字段。</WarningLine>
      ) : null}
      {cfg.ignoreCase && !mixedCaseKeys.length ? (
        <WarningLine>当前关键字段中没有字符串字段，「忽略大小写」不会生效。</WarningLine>
      ) : null}
      {diverting && !target.dataSourceId ? <DangerLine>重复行分流需选择 Doris 目标数据源。</DangerLine> : null}
      {diverting && !target.tableName.trim() ? <DangerLine>重复行分流需填写目标表名。</DangerLine> : null}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
        <Button icon={<TableOutlined />} onClick={() => onPreviewData(outputFields(node, nodes, edges))}>
          预览数据
        </Button>
      </div>

      <SqlPreview node={node} nodes={nodes} edges={edges} flowId={flowId} onPreviewSql={onPreviewSql} />
    </div>
  );
}
