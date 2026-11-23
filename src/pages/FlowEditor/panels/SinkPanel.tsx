import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  App,
  Button,
  Input,
  InputNumber,
  Modal,
  Radio,
  Select,
  Switch,
  Tooltip,
} from 'antd';
import {
  DatabaseOutlined,
  ReloadOutlined,
  SyncOutlined,
  TableOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import type {
  DataSourceType,
  FieldDef,
  NodeRun,
  SinkConfig,
  SinkFieldMapping,
  SinkTableModel,
  SinkTargetType,
} from '../../../types';
import { findUpstream, outputFields } from '../../../utils/dagUtils';
import { NodeCommon, SectionTitle, type PanelProps } from './common';
import SqlPreview from './SqlPreview';

const TARGET_OPTIONS: Array<{ value: SinkTargetType; label: string }> = [
  { value: 'DORIS', label: 'Doris' },
  { value: 'MYSQL', label: 'MySQL' },
  { value: 'DM8', label: '达梦 DM8' },
  { value: 'ORACLE', label: 'Oracle' },
];

const TARGET_LABEL: Record<string, string> = {
  DORIS: 'Doris',
  MYSQL: 'MySQL',
  DM8: '达梦 DM8',
  ORACLE: 'Oracle',
};

const TABLE_RE = /^[A-Za-z0-9_$]+$/;
const TARGET_COLUMN_RE = /^[A-Za-z0-9_]+$/;
const HIDDEN = new Set(['__dm_rowid', '__dm_sink_seq']);

/** 后端 DataSourceVO 会直接给 httpPort；旧数据回退解析 extraParams.httpPort。 */
function readHttpPort(raw?: string): number | null {
  if (!raw || !raw.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as { httpPort?: unknown };
    const n = Number(parsed?.httpPort);
    return Number.isFinite(n) && n >= 1 && n <= 65535 ? n : null;
  } catch {
    return null;
  }
}

function normalize(cfg: Partial<SinkConfig>): SinkConfig {
  const type = String(cfg.targetType || 'DORIS').toUpperCase() as SinkTargetType;
  const targetType: SinkTargetType = ['DORIS', 'MYSQL', 'DM8', 'ORACLE'].includes(type) ? type : 'DORIS';
  const rawModel = String(cfg.tableModel || '').toUpperCase();
  const tableModel: SinkTableModel | null =
    targetType === 'DORIS' && (rawModel === 'UNIQUE' || rawModel === 'DUPLICATE')
      ? (rawModel as SinkTableModel)
      : null;
  const writeMode =
    String(cfg.writeMode || 'APPEND').toUpperCase() === 'OVERWRITE' && tableModel !== 'DUPLICATE'
      ? 'OVERWRITE'
      : 'APPEND';
  const keyColumns = Array.from(
    new Set(
      (Array.isArray(cfg.keyColumns) ? cfg.keyColumns : [])
        .map((k) => String(k ?? '').trim())
        .filter((k) => k && !HIDDEN.has(k.toLowerCase())),
    ),
  );
  return {
    targetType,
    dataSourceId: cfg.dataSourceId ?? null,
    tableName: cfg.tableName || '',
    writeMode,
    batchSize: Number(cfg.batchSize) || 10000,
    autoCreateTable: cfg.autoCreateTable !== false,
    watermarkColumn: cfg.watermarkColumn || null,
    fieldMapping: (cfg.fieldMapping || []).filter((m) => m.source),
    tableModel,
    keyColumns: tableModel === 'UNIQUE' ? keyColumns : [],
  };
}

function fmtCount(n: number | null | undefined) {
  return n == null ? '—' : n.toLocaleString();
}

function runText(run: NodeRun) {
  if (run.status === 'RUNNING' || run.status === 'PENDING') {
    const written = run.watermark?.committedRows ?? run.rows;
    return `写入中… 已写入 ${fmtCount(written)} 行`;
  }
  if (run.status === 'SUCCESS') {
    return `写入成功 · ${fmtCount(run.rows)} 行 · ${
      run.durationMs == null ? '—' : `${run.durationMs} ms`
    }`;
  }
  if (run.status === 'FAILED') {
    return `写入失败：Sink 写入 - ${run.errorStack || '未知原因'}`;
  }
  return '已跳过';
}

/** 失败态文案：只展示后端真实返回的水位线值/批次号/错误码，缺字段不伪造。 */
function failureDetail(run: NodeRun, cfgWatermark: string | null) {
  const wm = run.watermark;
  const hasWatermark =
    !!wm && (!!wm.column || wm.value != null || wm.committedRows != null || wm.lastBatchNo != null);
  const parts: string[] = [];
  if (hasWatermark && wm) {
    if (wm.lastBatchNo != null) parts.push(`第 ${wm.lastBatchNo + 1} 批失败`);
    parts.push(`已成功写入 ${fmtCount(wm.committedRows ?? run.rows)} 行`);
    const column = wm.column || cfgWatermark;
    if (column) {
      parts.push(wm.value != null ? `水位线停在 ${column} = ${wm.value}` : `水位线停在 ${column}`);
    }
  } else {
    parts.push(`已成功写入 ${fmtCount(run.rows)} 行`);
    if (cfgWatermark) {
      parts.push(`水位线停在 ${cfgWatermark} 的最后成功批次`);
    } else {
      parts.push('未配置水位线，重试会全量重写');
    }
  }
  let text = parts.join('；');
  if (run.errorCode != null) text += `（错误码 ${run.errorCode}）`;
  return `${text}。`;
}

export default function SinkPanel(props: PanelProps) {
  const {
    node,
    nodes,
    edges,
    flowId,
    onConfig,
    onConfigSilent,
    onMeta,
    onPreviewData,
    onPreviewSql,
    dataSources,
    lastRun,
    onRetryNode,
  } = props;
  const { modal, message } = App.useApp();
  const cfg = normalize(node.data.config as Partial<SinkConfig>);

  const upstream = findUpstream(node.id, nodes, edges);
  const upstreamFields: FieldDef[] = useMemo(
    () => (upstream ? outputFields(upstream, nodes, edges) : []),
    [upstream, nodes, edges],
  );
  const upstreamNames = useMemo(
    () => upstreamFields.map((f) => f.name).filter((n) => !HIDDEN.has(n)),
    [upstreamFields],
  );
  const upstreamKey = upstreamNames.join('|');

  const mappingTargets: string[] = [];
  {
    const seen = new Set<string>();
    cfg.fieldMapping.forEach((m) => {
      const target = (m.target || '').trim();
      if (!target || HIDDEN.has(target.toLowerCase()) || seen.has(target)) return;
      seen.add(target);
      mappingTargets.push(target);
    });
  }
  const keyTargetSet = new Set(mappingTargets);
  const unknownKeys = (cfg.keyColumns || []).filter((k) => !keyTargetSet.has(k));
  const isDoris = cfg.targetType === 'DORIS';
  const selectedTargetDs = dataSources.find(
    (d) => d.id === cfg.dataSourceId && d.type === cfg.targetType,
  );
  const streamLoadPort = selectedTargetDs
    ? selectedTargetDs.httpPort ?? readHttpPort(selectedTargetDs.extraParams)
    : null;
  const streamLoadConfigured = selectedTargetDs
    ? selectedTargetDs.httpPortConfigured ?? streamLoadPort != null
    : false;

  const [planOpen, setPlanOpen] = useState(false);

  const patch = (p: Partial<SinkConfig>) => onConfig({ ...cfg, ...p });

  const setTableModel = (model: SinkTableModel) => {
    if (model === 'DUPLICATE') {
      patch({ tableModel: model, keyColumns: [], writeMode: 'APPEND' });
    } else {
      patch({ tableModel: model });
    }
  };

  // 首次连接上游时按同名映射生成；不覆盖用户已改过的目标字段名
  useEffect(() => {
    if (!upstreamNames.length) return;
    if (cfg.fieldMapping.length === 0) {
      onConfigSilent?.({
        ...cfg,
        fieldMapping: upstreamFields
          .filter((f) => !HIDDEN.has(f.name))
          .map((f) => ({ source: f.name, target: f.name, type: f.type })),
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [upstreamKey]);

  const regenerate = () => {
    const apply = () => {
      const fieldMapping: SinkFieldMapping[] = upstreamFields
        .filter((f) => !HIDDEN.has(f.name))
        .map((f) => ({ source: f.name, target: f.name, type: f.type }));
      const nextTargets = new Set(fieldMapping.map((m) => m.target));
      const nextKeys = (cfg.keyColumns || []).filter((k) => nextTargets.has(k));
      const dropped = (cfg.keyColumns || []).filter((k) => !nextTargets.has(k));
      onConfig({
        ...cfg,
        fieldMapping,
        keyColumns: nextKeys,
        watermarkColumn: upstreamNames.includes(cfg.watermarkColumn || '')
          ? cfg.watermarkColumn
          : null,
      });
      if (dropped.length) {
        message.warning(`已自动剔除不在映射中的主键字段：${dropped.join('、')}`);
      }
    };
    if (cfg.fieldMapping.length) {
      modal.confirm({
        title: '按上游字段重新生成映射',
        content: '将按上游字段重建映射，已修改的目标字段名会被覆盖，确认？',
        okText: '确认',
        cancelText: '取消',
        onOk: apply,
      });
    } else {
      apply();
    }
  };

  const setMapping = (index: number, target: string) => {
    const next = cfg.fieldMapping.map((m, i) => (i === index ? { ...m, target } : m));
    patch({ fieldMapping: next });
  };

  const errors = useMemo(() => {
    const out: Record<string, string> = {};
    if (!cfg.dataSourceId) {
      out.dataSourceId =
        cfg.targetType === 'DORIS'
          ? '请选择 Doris 目标数据源（Stream Load 目标）'
          : '请选择目标数据源';
    }
    const table = cfg.tableName.trim();
    if (!table) {
      out.tableName = '请输入目标表名';
    } else if (table.includes('.')) {
      out.tableName = '表名只填表本身，不支持「库名.表名」格式';
    } else if (!TABLE_RE.test(table)) {
      out.tableName = '表名只能包含字母、数字、下划线和 $';
    } else {
      const max = cfg.targetType === 'DORIS' || cfg.targetType === 'MYSQL' ? 64 : 128;
      if (table.length > max) out.tableName = `表名长度不能超过 ${max} 个字符`;
    }
    if (!Number.isInteger(cfg.batchSize) || cfg.batchSize < 100 || cfg.batchSize > 100000) {
      out.batchSize = '批量大小需为 100–100000 之间的整数';
    }
    if (cfg.watermarkColumn && !upstreamNames.includes(cfg.watermarkColumn)) {
      out.watermark = '水位线字段必须是上游输出字段';
    }
    if (isDoris && cfg.autoCreateTable) {
      if (!cfg.tableModel) {
        out.tableModel = '请选择 Doris 建表模型（Unique Key 或 Duplicate Key）';
      } else if (cfg.tableModel === 'UNIQUE') {
        if (!(cfg.keyColumns || []).length) {
          out.keyColumns = 'Unique Key 模型请选择至少一个主键字段';
        } else {
          const unknown = (cfg.keyColumns || []).find((k) => !keyTargetSet.has(k));
          if (unknown) out.keyColumns = `主键字段不在输出字段中：${unknown}`;
        }
      } else if (cfg.tableModel === 'DUPLICATE') {
        if ((cfg.keyColumns || []).length) {
          out.keyColumns = 'Duplicate Key 模型不支持设置主键';
        }
        if (cfg.writeMode === 'OVERWRITE') {
          out.writeMode = 'Duplicate Key 模型仅支持追加写入';
        }
      }
    }
    if (cfg.fieldMapping.length) {
      const seen = new Set<string>();
      cfg.fieldMapping.forEach((m, i) => {
        if (!m.target) {
          out[`mapping_${i}`] = '目标字段不能为空';
        } else if (!TARGET_COLUMN_RE.test(m.target)) {
          out[`mapping_${i}`] = '目标字段只能包含字母、数字和下划线';
        } else if (HIDDEN.has(m.target.toLowerCase())) {
          out[`mapping_${i}`] = '目标字段不能使用内部列名';
        } else if (seen.has(m.target.toLowerCase())) {
          out[`mapping_${i}`] = `目标字段重复：${m.target}`;
        }
        seen.add(m.target.toLowerCase());
      });
      const missing = cfg.fieldMapping.find((m) => !upstreamNames.includes(m.source));
      if (missing) out.mapping = `上游字段不存在：${missing.source}，请重新生成映射`;
    } else if (upstreamNames.length) {
      out.mapping = '请按上游字段生成字段映射';
    }
    if (isDoris && cfg.dataSourceId && selectedTargetDs && !streamLoadConfigured) {
      out.httpPort =
        '该数据源未配置 Stream Load HTTP 端口，请到「数据源」中编辑并填写 httpPort（通常为 8040）后再保存/运行。';
    }
    return out;
  }, [cfg, upstreamNames, isDoris, selectedTargetDs, streamLoadConfigured]);

  const errorList = Object.values(errors);
  const staleMapping = cfg.fieldMapping.some(
    (m) => upstreamNames.length > 0 && !upstreamNames.includes(m.source),
  );
  const nodeRun: NodeRun | undefined = lastRun?.nodes.find((n) => n.nodeId === node.id);
  const sourceOptions = dataSources
    .filter((d) => d.type === (cfg.targetType as DataSourceType))
    .map((d) => ({ value: d.id, label: `${d.name} · ${d.type}` }));

  return (
    <div>
      <NodeCommon node={node} onMeta={onMeta} />

      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 12 }}
        message="数据将写入目标库的业务表"
        description="目标表由你在目标库中管理，删除任务不会删除它。"
      />

      <div className="form-section">
        <SectionTitle
          extra={
            errorList.length ? (
              <span className="chip chip--warning" style={{ fontSize: 10 }}>
                <WarningOutlined /> 配置不完整
              </span>
            ) : (
              <span className="chip chip--success" style={{ fontSize: 10 }}>
                已配置
              </span>
            )
          }
        >
          ① 目标
        </SectionTitle>

        <div className="form-hint" style={{ marginBottom: 4 }}>目标类型</div>
        <Radio.Group
          value={cfg.targetType}
          style={{ marginBottom: 10, display: 'flex', flexWrap: 'wrap', gap: 4 }}
          onChange={(e) => {
            const nextType = e.target.value as SinkTargetType;
            const keepSource = dataSources.some(
              (d) => d.id === cfg.dataSourceId && d.type === nextType,
            );
            patch({
              targetType: nextType,
              dataSourceId: keepSource ? cfg.dataSourceId : null,
              ...(nextType === 'DORIS' ? {} : { tableModel: null, keyColumns: [] }),
            });
          }}
        >
          {TARGET_OPTIONS.map((o) => (
            <Radio key={o.value} value={o.value}>{o.label}</Radio>
          ))}
        </Radio.Group>
        {cfg.targetType !== 'DORIS' ? (
          <div className="form-hint" style={{ marginBottom: 10 }}>
            {TARGET_LABEL[cfg.targetType]} 目标走 JDBC 批量 INSERT，每批一个事务。
          </div>
        ) : null}

        <div className="form-hint" style={{ marginBottom: 4 }}>
          目标数据源 <span style={{ color: 'var(--danger)' }}>*</span>
        </div>
        <Select
          showSearch
          allowClear
          value={cfg.dataSourceId ?? undefined}
          placeholder={
            cfg.targetType === 'DORIS'
              ? '请选择 Doris 目标数据源（Stream Load 目标）'
              : '请选择目标数据源'
          }
          style={{ width: '100%', marginBottom: errors.dataSourceId ? 4 : 10 }}
          options={sourceOptions}
          notFoundContent={`暂无 ${TARGET_LABEL[cfg.targetType]} 数据源`}
          onChange={(id) => patch({ dataSourceId: id ?? null })}
        />
        {errors.dataSourceId ? (
          <div className="form-hint" style={{ color: 'var(--danger)', marginBottom: 10 }}>
            {errors.dataSourceId}
          </div>
        ) : selectedTargetDs ? (
          <div className="form-hint" style={{ marginBottom: errors.httpPort ? 4 : 10 }}>
            已选：{selectedTargetDs.name}（
            {isDoris
              ? `Stream Load ${selectedTargetDs.host}:${streamLoadPort ?? '未配置'}`
              : `${selectedTargetDs.host}:${selectedTargetDs.port}`}
            {selectedTargetDs.dbName ? ` / ${selectedTargetDs.dbName}` : ''}）
          </div>
        ) : null}
        {errors.httpPort ? (
          <div className="form-hint" style={{ color: 'var(--danger)', marginBottom: 10 }}>
            {errors.httpPort}
          </div>
        ) : null}

        <div className="form-hint" style={{ marginBottom: 4 }}>
          表名 <span style={{ color: 'var(--danger)' }}>*</span>
        </div>
        <Input
          value={cfg.tableName}
          maxLength={128}
          placeholder="例如 result_orders（只填表名）"
          status={errors.tableName ? 'error' : undefined}
          onChange={(e) => patch({ tableName: e.target.value })}
        />
        {errors.tableName ? (
          <div className="form-hint" style={{ color: 'var(--danger)', marginTop: 4 }}>{errors.tableName}</div>
        ) : (
          <div className="form-hint" style={{ marginTop: 4 }}>
            表不存在且已开启自动建表时，将按上游字段创建表。
          </div>
        )}

        <div
          style={{
            marginTop: 12,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
          }}
        >
          <div>
            <div style={{ fontSize: 12.5 }}>自动建表</div>
            <div className="form-hint">
              {cfg.autoCreateTable ? '表不存在时按上游字段自动创建' : '表不存在时报错，不自动创建'}
            </div>
          </div>
          <Switch
            checked={cfg.autoCreateTable}
            onChange={(v) =>
              patch(v ? { autoCreateTable: true } : { autoCreateTable: false, tableModel: null, keyColumns: [] })
            }
          />
        </div>

        {isDoris && cfg.autoCreateTable ? (
          <>
            <div className="form-hint" style={{ marginTop: 12, marginBottom: 4 }}>
              建表模型 <span style={{ color: 'var(--danger)' }}>*</span>
            </div>
            <Radio.Group
              value={cfg.tableModel ?? undefined}
              style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}
              onChange={(e) => setTableModel(e.target.value as SinkTableModel)}
            >
              <Radio value="UNIQUE">Unique Key</Radio>
              <Radio value="DUPLICATE">Duplicate Key</Radio>
            </Radio.Group>
            {errors.tableModel ? (
              <div className="form-hint" style={{ color: 'var(--danger)', marginTop: 4 }}>
                {errors.tableModel}
              </div>
            ) : cfg.tableModel === 'UNIQUE' ? (
              <div className="form-hint" style={{ marginTop: 4 }}>
                Unique Key：按主键合并，同主键数据覆盖更新，可删除；主键字段不能为空。
              </div>
            ) : cfg.tableModel === 'DUPLICATE' ? (
              <div className="form-hint" style={{ marginTop: 4 }}>
                Duplicate Key：无主键、不去重，只能追加数据；重复执行会产生重复行。
              </div>
            ) : (
              <div className="form-hint" style={{ marginTop: 4 }}>
                自动建表前请选择表模型：Unique Key 可按主键覆盖更新，Duplicate Key 仅能追加。
              </div>
            )}

            {cfg.tableModel === 'UNIQUE' ? (
              <>
                <div className="form-hint" style={{ marginTop: 10, marginBottom: 4 }}>
                  主键字段 <span style={{ color: 'var(--danger)' }}>*</span>
                </div>
                <Select
                  mode="multiple"
                  allowClear
                  value={cfg.keyColumns ?? []}
                  placeholder={
                    mappingTargets.length ? '选择一个或多个目标字段作为主键' : '请先在下方完成字段映射'
                  }
                  status={errors.keyColumns ? 'error' : undefined}
                  style={{ width: '100%' }}
                  options={mappingTargets.map((t) => ({ value: t, label: t }))}
                  onChange={(keys) => patch({ keyColumns: keys })}
                />
                {errors.keyColumns ? (
                  <div className="form-hint" style={{ color: 'var(--danger)', marginTop: 4 }}>
                    {errors.keyColumns}
                  </div>
                ) : null}
                {unknownKeys.length ? (
                  <div className="warn-line" style={{ marginTop: 6 }}>
                    <span>⚠️</span>
                    <span>
                      字段映射已变化，主键字段不在输出字段中：{unknownKeys.join('、')}。保存时会自动剔除，请重新选择。
                    </span>
                  </div>
                ) : (
                  <div className="form-hint" style={{ marginTop: 4 }}>
                    主键字段必须来自上方字段映射，Doris 将按这些列合并同 Key 行。
                  </div>
                )}
              </>
            ) : cfg.tableModel === 'DUPLICATE' ? (
              <div className="form-hint" style={{ marginTop: 6 }}>
                Duplicate Key 模型没有主键，仅支持追加写入；写入方式已限制为追加。
              </div>
            ) : null}
          </>
        ) : isDoris ? (
          <div className="form-hint" style={{ marginTop: 10 }}>
            目标表已存在时建表模型以目标库实际表为准；如需自动建表请开启上方开关。
          </div>
        ) : null}
      </div>

      <div className="form-section">
        <SectionTitle>② 写入方式</SectionTitle>
        <div className="form-hint" style={{ marginBottom: 4 }}>写入模式</div>
        <Radio.Group
          value={cfg.writeMode}
          style={{ marginBottom: 8, display: 'flex', flexWrap: 'wrap', gap: 4 }}
          onChange={(e) => patch({ writeMode: e.target.value })}
        >
          <Radio value="APPEND">追加</Radio>
          <Tooltip
            title={
              cfg.tableModel === 'DUPLICATE'
                ? 'Duplicate Key 模型仅支持追加写入'
                : '写入前清空目标表已有数据'
            }
          >
            <span>
              <Radio value="OVERWRITE" disabled={cfg.tableModel === 'DUPLICATE'}>覆盖</Radio>
            </span>
          </Tooltip>
          <Tooltip title="当前版本暂不支持，后续版本提供">
            <Radio value="UPSERT" disabled>更新插入</Radio>
          </Tooltip>
        </Radio.Group>
        <div
          className="form-hint"
          style={{
            marginBottom: 12,
            color: cfg.writeMode === 'OVERWRITE' ? 'var(--warning)' : undefined,
          }}
        >
          {cfg.tableModel === 'DUPLICATE'
            ? 'Duplicate Key 模型无主键、不去重，只能追加写入。'
            : cfg.writeMode === 'APPEND'
              ? '只追加新数据，不删除目标表已有数据。'
              : '写入前会清空目标表已有数据，请谨慎选择。'}
        </div>
        {errors.writeMode ? (
          <div className="form-hint" style={{ color: 'var(--danger)', marginBottom: 10 }}>
            {errors.writeMode}
          </div>
        ) : null}

        <div className="form-hint" style={{ marginBottom: 4 }}>批量大小</div>
        <InputNumber
          min={100}
          max={100000}
          step={100}
          value={cfg.batchSize}
          status={errors.batchSize ? 'error' : undefined}
          style={{ width: '100%' }}
          onChange={(v) => patch({ batchSize: Number(v) || 0 })}
        />
        {errors.batchSize ? (
          <div className="form-hint" style={{ color: 'var(--danger)', marginTop: 4 }}>{errors.batchSize}</div>
        ) : (
          <div className="form-hint" style={{ marginTop: 4 }}>
            每批提交一次；Doris 目标单批还受 100MB 限制。默认 10000，范围 100–100000。
          </div>
        )}
      </div>

      <div className="form-section">
        <SectionTitle
          extra={
            <Button
              size="small"
              type="text"
              icon={<ReloadOutlined />}
              disabled={!upstreamNames.length}
              onClick={regenerate}
            >
              按上游字段重新生成
            </Button>
          }
        >
          ③ 字段映射
        </SectionTitle>

        {!upstreamNames.length ? (
          <div className="form-hint">请先连接上游并完成上游节点配置。</div>
        ) : (
          <>
            {staleMapping ? (
              <div className="warn-line">
                <span>⚠️</span>
                <span>{errors.mapping || '上游字段已变化，请重新生成映射。'}</span>
              </div>
            ) : null}
            <div className="field-table">
              <div className="field-row field-row--head" style={{ gridTemplateColumns: '1fr 1fr 92px' }}>
                <span>上游字段</span>
                <span>目标字段</span>
                <span>类型</span>
              </div>
              {cfg.fieldMapping.map((m: SinkFieldMapping, i: number) => (
                <div key={`${m.source}-${i}`}>
                  <div className="field-row" style={{ gridTemplateColumns: '1fr 1fr 92px' }}>
                    <span className="f-name" title={m.source}>{m.source}</span>
                    <Input
                      size="small"
                      value={m.target}
                      status={errors[`mapping_${i}`] ? 'error' : undefined}
                      onChange={(e) => setMapping(i, e.target.value)}
                    />
                    <span className="f-type">{m.type || '—'}</span>
                  </div>
                  {errors[`mapping_${i}`] ? (
                    <div
                      className="form-hint"
                      style={{ color: 'var(--danger)', padding: '2px 8px 4px' }}
                    >
                      {errors[`mapping_${i}`]}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
            {!staleMapping && errors.mapping ? (
              <div className="form-hint" style={{ color: 'var(--danger)', marginTop: 4 }}>
                {errors.mapping}
              </div>
            ) : null}
            <div className="form-hint" style={{ marginTop: 6 }}>
              默认按上游输出字段同名映射；内部列（__dm_rowid、__dm_sink_seq）不会写入目标。
            </div>
          </>
        )}
      </div>

      <div className="form-section">
        <SectionTitle>④ 水位线（可选）</SectionTitle>
        <Select
          allowClear
          showSearch
          value={cfg.watermarkColumn ?? undefined}
          placeholder="不设置（每次全量写入）"
          status={errors.watermark ? 'error' : undefined}
          style={{ width: '100%' }}
          options={upstreamNames.map((name) => ({ value: name, label: name }))}
          onChange={(value) => patch({ watermarkColumn: value ?? null })}
        />
        {errors.watermark ? (
          <div className="form-hint" style={{ color: 'var(--danger)', marginTop: 4 }}>{errors.watermark}</div>
        ) : null}
        {cfg.watermarkColumn ? (
          <div className="form-hint" style={{ marginTop: 6 }}>
            任务失败重试时，将从上次成功写入的水位线值之后继续写入。水位线每批提交后推进，重复值按（水位线值，行号）精确定位。
          </div>
        ) : (
          <div className="warn-line" style={{ marginTop: 8 }}>
            <span>⚠️</span>
            <span>未设置水位线字段：任务失败重试或重复执行会重新全量写入，可能产生重复数据。</span>
          </div>
        )}
      </div>

      <div className="form-section">
        <SectionTitle
          extra={
            <Button size="small" icon={<TableOutlined />} onClick={() => setPlanOpen(true)}>
              预览写入计划
            </Button>
          }
        >
          ⑤ 预览
        </SectionTitle>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Button
            size="small"
            icon={<DatabaseOutlined />}
            disabled={!upstreamFields.length}
            onClick={() => onPreviewData(upstreamFields)}
          >
            预览上游数据
          </Button>
          <span className="form-hint" style={{ alignSelf: 'center' }}>
            预览不执行写入，也不生成示例行。
          </span>
        </div>
      </div>

      {nodeRun || cfg.tableName ? (
        <div className="form-section">
          <SectionTitle>最近一次执行</SectionTitle>
          {nodeRun ? (
            <>
              <div
                className={
                  nodeRun.status === 'FAILED'
                    ? 'danger-line'
                    : nodeRun.status === 'SUCCESS'
                      ? 'form-hint'
                      : 'warn-line'
                }
                style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}
              >
                <span>
                  {nodeRun.status === 'RUNNING'
                    ? <SyncOutlined spin />
                    : nodeRun.status === 'SUCCESS'
                      ? '✓'
                      : '→'}
                </span>
                <span>{runText(nodeRun)}</span>
              </div>
              {nodeRun.targetTable ? (
                <div className="form-hint" style={{ marginBottom: 4 }}>
                  目标表：{nodeRun.targetTable}
                  {nodeRun.writeMode
                    ? ` · ${nodeRun.writeMode === 'OVERWRITE' ? '覆盖写入' : '追加写入'}`
                    : ''}
                  {nodeRun.status === 'SUCCESS' ? ` · 写入 ${fmtCount(nodeRun.rows)} 行` : ''}
                </div>
              ) : null}
              {nodeRun.status === 'FAILED' ? (
                <>
                  <div className="form-hint" style={{ marginBottom: 8 }}>
                    {failureDetail(nodeRun, cfg.watermarkColumn)}
                  </div>
                  {onRetryNode ? (
                    <Button
                      danger
                      size="small"
                      icon={<ReloadOutlined />}
                      disabled={lastRun?.status === 'RUNNING'}
                      onClick={() => onRetryNode(node.id)}
                    >
                      重试（从水位线续写，不重算上游）
                    </Button>
                  ) : null}
                </>
              ) : null}
            </>
          ) : (
            <div className="form-hint">本次任务尚未执行到该节点。</div>
          )}
        </div>
      ) : null}

      <SqlPreview node={node} nodes={nodes} edges={edges} flowId={flowId} onPreviewSql={onPreviewSql} />

      <Modal
        open={planOpen}
        onCancel={() => setPlanOpen(false)}
        title={`写入计划 · ${node.data.label}`}
        footer={<Button type="primary" onClick={() => setPlanOpen(false)}>关闭</Button>}
      >
        <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr', rowGap: 8, fontSize: 13 }}>
          <span className="form-hint">目标</span>
          <b>{cfg.targetType}:{cfg.tableName || '—'}</b>
          <span className="form-hint">目标数据源</span>
          <span>
            {selectedTargetDs
              ? `${selectedTargetDs.name}（${selectedTargetDs.host}:${selectedTargetDs.port}）`
              : '未选择'}
          </span>
          {isDoris ? (
            <>
              <span className="form-hint">Stream Load 端点</span>
              <span>
                {selectedTargetDs
                  ? `${selectedTargetDs.host}:${streamLoadPort ?? '未配置'}`
                  : '未选择'}
              </span>
            </>
          ) : null}
          <span className="form-hint">写入方式</span>
          <b>{cfg.writeMode === 'OVERWRITE' ? '覆盖（写入前清空目标表）' : '追加'}</b>
          <span className="form-hint">写入通道</span>
          <span>
            {cfg.targetType === 'DORIS'
              ? 'Stream Load（JSON 行，经所选数据源）'
              : 'JDBC 批量 INSERT'}
          </span>
          <span className="form-hint">批量大小</span>
          <span>{cfg.batchSize} 行/批</span>
          <span className="form-hint">自动建表</span>
          <span>{cfg.autoCreateTable ? '开启：表不存在时按上游字段创建' : '关闭：表不存在时报错'}</span>
          {isDoris ? (
            <>
              <span className="form-hint">建表模型</span>
              <b>
                {cfg.tableModel === 'UNIQUE'
                  ? 'Unique Key（按主键覆盖更新）'
                  : cfg.tableModel === 'DUPLICATE'
                    ? 'Duplicate Key（无主键，仅追加）'
                    : '未选择'}
              </b>
              <span className="form-hint">主键字段</span>
              <span>
                {cfg.tableModel === 'UNIQUE'
                  ? (cfg.keyColumns || []).length
                    ? cfg.keyColumns!.join('、')
                    : '未选择'
                  : '无（Duplicate Key）'}
              </span>
            </>
          ) : null}
          <span className="form-hint">水位线</span>
          <span>{cfg.watermarkColumn ? `${cfg.watermarkColumn}（每批提交后推进）` : '未设置（每次全量写入）'}</span>
          <span className="form-hint">字段映射</span>
          <span>
            {cfg.fieldMapping.length} 个：
            {cfg.fieldMapping.map((m) => `${m.source} → ${m.target}`).join('，')}
          </span>
        </div>
        <Alert
          type="warning"
          showIcon
          style={{ marginTop: 14 }}
          message="预览不执行写入"
          description="本页只展示将执行的写入计划，不会在目标库中创建表或写入任何数据。"
        />
      </Modal>

      {errorList.length ? (
        <div className="danger-line" style={{ marginTop: 4 }}>
          <span>✕</span>
          <span>
            配置尚未完成：{errorList[0]}
            {errorList.length > 1 ? ` 等 ${errorList.length} 项` : ''}。保存时后端会拒绝不合法配置。
          </span>
        </div>
      ) : null}

      {isDoris ? (
        <div className="form-hint" style={{ marginTop: 8 }}>
          Doris 建表模型：
          {cfg.tableModel === 'UNIQUE'
            ? `Unique Key（主键 ${(cfg.keyColumns || []).length ? cfg.keyColumns!.join('、') : '未选择'}）`
            : cfg.tableModel === 'DUPLICATE'
              ? 'Duplicate Key（无主键，仅追加）'
              : '未选择（自动建表前必须选择）'}
        </div>
      ) : null}

      <div className="form-hint" style={{ marginTop: 8 }}>
        重复执行会重建中间表并按写入模式处理目标数据；配置了水位线时失败重试从上次成功批次续写。
        未配置水位线的追加写入会产生重复行，属预期行为。
      </div>
    </div>
  );
}
