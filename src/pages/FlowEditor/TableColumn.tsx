import { useMemo, useState } from 'react';
import { Button, Input, Skeleton, Tooltip } from 'antd';
import { MenuFoldOutlined, PlusOutlined, ReloadOutlined, SearchOutlined, TableOutlined } from '@ant-design/icons';
import type { DataSource, TableInfo } from '../../types';

interface Props {
  dataSource: DataSource | null;
  tables: TableInfo[];
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  onAdd: (table: TableInfo) => void;
  onCollapse: () => void;
}

export default function TableColumn({ dataSource, tables, loading, error, onRefresh, onAdd, onCollapse }: Props) {
  const [keyword, setKeyword] = useState('');
  const filtered = useMemo(
    () => tables.filter((t) => (keyword ? t.tableName.toLowerCase().includes(keyword.toLowerCase()) : true)),
    [tables, keyword],
  );

  return (
    <section className="editor-col editor-col--tables">
      <div className="col-head">
        <div className="col-title">
          <span>② 表（{dataSource?.name || '—'}）</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <Tooltip title="刷新表列表">
              <Button type="text" size="small" icon={<ReloadOutlined />} onClick={onRefresh} loading={loading} />
            </Tooltip>
            <Tooltip title="收起表侧栏">
              <Button type="text" size="small" icon={<MenuFoldOutlined />} onClick={onCollapse} />
            </Tooltip>
          </span>
        </div>
        <Input
          size="small"
          allowClear
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          prefix={<SearchOutlined style={{ color: 'var(--text-tertiary)' }} />}
          placeholder="搜索表名"
        />
      </div>
      <div className="col-scroll">
        {!dataSource ? (
          <div className="col-empty">请先在左侧选择数据源</div>
        ) : loading ? (
          <Skeleton active paragraph={{ rows: 6 }} title={false} />
        ) : error ? (
          <div className="col-empty">
            {error}
            <div style={{ marginTop: 10 }}>
              <Button size="small" onClick={onRefresh}>
                重试
              </Button>
            </div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="col-empty">{keyword ? '没有匹配的表' : '该数据源下没有表'}</div>
        ) : (
          filtered.map((table) => (
            <div
              key={table.tableName}
              className="table-item"
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData(
                  'application/x-flow-table',
                  JSON.stringify({
                    dataSourceId: dataSource.id,
                    dataSourceName: dataSource.name,
                    dbName: dataSource.dbName,
                    tableName: table.tableName,
                  }),
                );
                e.dataTransfer.effectAllowed = 'copy';
              }}
              title="拖到画布生成 Source 节点"
            >
              <TableOutlined style={{ color: 'var(--color-primary)', fontSize: 13 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="table-item-name" title={table.tableName}>
                  {table.tableName}
                </div>
                <div className="table-item-sub">{dataSource.name}</div>
              </div>
              <span className="table-add">
                <Button
                  type="text"
                  size="small"
                  icon={<PlusOutlined />}
                  onClick={(e) => {
                    e.stopPropagation();
                    onAdd(table);
                  }}
                />
              </span>
            </div>
          ))
        )}
      </div>
      <div style={{ padding: '8px 12px', borderTop: '1px solid var(--border)', fontSize: 10.5, color: 'var(--text-tertiary)' }}>
        拖拽表到画布，或点 + 在画布中添加
      </div>
    </section>
  );
}
