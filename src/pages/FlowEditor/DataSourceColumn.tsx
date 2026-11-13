import { useMemo, useState } from 'react';
import { Button, Input, Select, Skeleton } from 'antd';
import { PlusOutlined, SearchOutlined } from '@ant-design/icons';
import type { DataSource } from '../../types';

interface Props {
  dataSources: DataSource[];
  loading: boolean;
  selectedId: number | null;
  onSelect: (id: number) => void;
  onOpenCreate: () => void;
}

const TYPE_LABEL: Record<string, string> = { MYSQL: 'MySQL', DORIS: 'Doris', DM8: 'DM8' };

export default function DataSourceColumn({ dataSources, loading, selectedId, onSelect, onOpenCreate }: Props) {
  const [keyword, setKeyword] = useState('');
  const filtered = useMemo(
    () => dataSources.filter((d) => (keyword ? d.name.toLowerCase().includes(keyword.toLowerCase()) : true)),
    [dataSources, keyword],
  );

  return (
    <section className="editor-col editor-col--ds">
      <div className="col-head">
        <div className="col-title">
          <span>① 数据源</span>
          <span className="mini-tag">{dataSources.length}</span>
        </div>
        <Select
          size="small"
          showSearch
          value={selectedId ?? undefined}
          placeholder="选择数据源"
          style={{ width: '100%' }}
          optionFilterProp="label"
          onChange={onSelect}
          options={dataSources.map((d) => ({ value: d.id, label: `${d.name} · ${TYPE_LABEL[d.type] || d.type}` }))}
        />
        <Input
          size="small"
          allowClear
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          prefix={<SearchOutlined style={{ color: 'var(--text-tertiary)' }} />}
          placeholder="搜索数据源"
          style={{ marginTop: 8 }}
        />
      </div>
      <div className="col-scroll">
        {loading ? (
          <Skeleton active paragraph={{ rows: 5 }} title={false} />
        ) : filtered.length === 0 ? (
          <div className="col-empty">
            暂无数据源
            <div style={{ marginTop: 10 }}>
              <Button size="small" icon={<PlusOutlined />} onClick={onOpenCreate}>
                去创建
              </Button>
            </div>
          </div>
        ) : (
          filtered.map((ds) => (
            <div
              key={ds.id}
              className={`ds-item${selectedId === ds.id ? ' active' : ''}`}
              onClick={() => onSelect(ds.id)}
            >
              <span
                className={`status-dot ${
                  ds.lastTestStatus === 'SUCCESS'
                    ? 'status-dot--success'
                    : ds.lastTestStatus === 'FAILED'
                      ? 'status-dot--danger'
                      : 'status-dot--idle'
                }`}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="ds-item-name" title={ds.name}>
                  {ds.name}
                </div>
                <div className="ds-item-sub">
                  {TYPE_LABEL[ds.type] || ds.type} · {ds.dbName}
                </div>
              </div>
              <span className={`type-tag type-tag--${ds.type}`} style={{ fontSize: 10, height: 18 }}>
                {TYPE_LABEL[ds.type] || ds.type}
              </span>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
