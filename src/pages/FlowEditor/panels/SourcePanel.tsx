import { useEffect, useState } from 'react';
import { App, Button, Input, Select, Spin, Tag } from 'antd';
import {
  DatabaseOutlined,
  ReloadOutlined,
  TableOutlined,
  DownOutlined,
  RightOutlined,
} from '@ant-design/icons';
import type { SourceConfig } from '../../../types';
import { listColumns, listTables } from '../../../api/datasource';
import { NodeCommon, SectionTitle, fieldOptions, type PanelProps } from './common';

export default function SourcePanel({
  node,
  onConfig,
  onMeta,
  onPreviewData,
  dataSources,
}: PanelProps) {
  const { message } = App.useApp();
  const cfg = node.data.config as SourceConfig;
  const [tables, setTables] = useState<Array<{ tableName: string }>>([]);
  const [loadingTables, setLoadingTables] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showFields, setShowFields] = useState(false);

  useEffect(() => {
    if (!cfg.dataSourceId) {
      setTables([]);
      return;
    }
    let alive = true;
    setLoadingTables(true);
    listTables(cfg.dataSourceId)
      .then((res) => {
        if (alive) setTables(res);
      })
      .catch(() => {
        if (alive) {
          setTables([]);
          message.error('表列表加载失败');
        }
      })
      .finally(() => {
        if (alive) setLoadingTables(false);
      });
    return () => {
      alive = false;
    };
  }, [cfg.dataSourceId, message]);

  const patch = (p: Partial<SourceConfig>) => onConfig({ ...cfg, ...p });

  const loadFields = async (dataSourceId: number, tableName: string) => {
    try {
      const fields = await listColumns(dataSourceId, tableName);
      return fields.map((f) => ({ name: f.name, type: f.type }));
    } catch (e) {
      message.error(`字段加载失败：${(e as Error).message}`);
      return [];
    }
  };

  const selectTable = async (tableName: string) => {
    if (!cfg.dataSourceId) return;
    const fields = await loadFields(cfg.dataSourceId, tableName);
    patch({ tableName, fields });
  };

  const refresh = async () => {
    if (!cfg.dataSourceId || !cfg.tableName) {
      message.warning('请先选择数据源与数据表');
      return;
    }
    setRefreshing(true);
    try {
      const fields = await loadFields(cfg.dataSourceId, cfg.tableName);
      const oldNames = new Set((cfg.fields || []).map((f) => f.name));
      const newNames = new Set(fields.map((f) => f.name));
      const added = fields.filter((f) => !oldNames.has(f.name)).length;
      const removed = (cfg.fields || []).filter((f) => !newNames.has(f.name)).length;
      const typeChanged = fields.filter((f) => {
        const old = (cfg.fields || []).find((o) => o.name === f.name);
        return old && old.type !== f.type;
      }).length;
      patch({ fields });
      if (added || removed || typeChanged) {
        message.warning(`字段有变化：新增 ${added}、删除 ${removed}、类型变更 ${typeChanged}，下游节点已标记待检查`);
      } else {
        message.success(`字段已刷新，共 ${fields.length} 个字段`);
      }
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div>
      <NodeCommon node={node} onMeta={onMeta} />

      <div className="form-section">
        <SectionTitle>数据源</SectionTitle>
        <Select
          showSearch
          value={cfg.dataSourceId ?? undefined}
          placeholder="请选择数据源"
          style={{ width: '100%' }}
          options={dataSources.map((d) => ({
            value: d.id,
            label: `${d.name}  ·  ${d.type}`,
          }))}
          onChange={(id) => {
            const ds = dataSources.find((d) => d.id === id);
            patch({ dataSourceId: id, dataSourceName: ds?.name, dbName: ds?.dbName, tableName: '', fields: [] });
          }}
        />
      </div>

      <div className="form-section">
        <SectionTitle>数据表</SectionTitle>
        <div style={{ display: 'flex', gap: 6 }}>
          <Select
            showSearch
            loading={loadingTables}
            value={cfg.tableName || undefined}
            placeholder={cfg.dataSourceId ? '请选择数据表' : '请先选择数据源'}
            disabled={!cfg.dataSourceId}
            style={{ flex: 1 }}
            options={tables.map((t) => ({ value: t.tableName, label: t.tableName }))}
            onChange={selectTable}
            notFoundContent={loadingTables ? <Spin size="small" /> : '没有表'}
          />
          <Button
            icon={<ReloadOutlined />}
            disabled={!cfg.dataSourceId}
            onClick={() => {
              if (!cfg.dataSourceId) return;
              listTables(cfg.dataSourceId).then(setTables).catch(() => message.error('刷新失败'));
            }}
          />
        </div>
      </div>

      <div className="form-section">
        <SectionTitle
          extra={
            <Button size="small" type="text" onClick={() => setShowFields((v) => !v)}>
              {showFields ? <DownOutlined /> : <RightOutlined />} {showFields ? '收起' : '查看字段'}
            </Button>
          }
        >
          字段信息
        </SectionTitle>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="chip chip--primary">
            <DatabaseOutlined /> {(cfg.fields || []).length} 个字段
          </span>
          <Button size="small" icon={<ReloadOutlined />} loading={refreshing} onClick={refresh}>
            刷新字段
          </Button>
          <Button
            size="small"
            icon={<TableOutlined />}
            disabled={!(cfg.fields || []).length}
            onClick={() => onPreviewData(cfg.fields || [])}
          >
            预览数据
          </Button>
        </div>
        {showFields ? (
          <div className="field-table" style={{ marginTop: 8, maxHeight: 260, overflow: 'auto' }}>
            <div className="field-row field-row--head" style={{ gridTemplateColumns: '1fr 110px' }}>
              <span>字段</span>
              <span>类型</span>
            </div>
            {(cfg.fields || []).map((f) => (
              <div key={f.name} className="field-row" style={{ gridTemplateColumns: '1fr 110px' }}>
                <span className="f-name">{f.name}</span>
                <Tag style={{ margin: 0, fontSize: 10 }}>{f.type}</Tag>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <div className="form-hint">
        Source 节点不生成 SQL，仅作为下游节点对原始表的引用。一张表可以在画布中生成多个 Source。
      </div>

      <div style={{ marginTop: 14 }}>
        <div className="form-hint" style={{ marginBottom: 4 }}>显示名（可选）</div>
        <Input
          value={node.data.label}
          maxLength={50}
          onChange={(e) => onMeta({ label: e.target.value })}
          placeholder="默认显示表名(数据源名)"
        />
      </div>
    </div>
  );
}
