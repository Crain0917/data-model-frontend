import { http } from './http';
import { datasourceMock } from './mock/datasourceMock';
import type {
  ColumnInfo,
  DataSource,
  DataSourceFormValues,
  PageResult,
  TableInfo,
  TestConnectionResult,
} from '../types';

export const USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true';

export interface DataSourceQuery {
  keyword?: string;
  type?: string;
  page?: number;
  size?: number;
}

type RawDataSource = Partial<DataSource> & {
  defaultDb?: string;
  status?: string | null;
};

function normalizeDataSource(raw: RawDataSource): DataSource {
  const status = raw.lastTestStatus ?? raw.status;
  return {
    ...raw,
    dbName: raw.dbName || raw.defaultDb || '',
    lastTestStatus:
      status && /^ok$/i.test(status) ? 'SUCCESS' : status && /^fail/i.test(status) ? 'FAILED' : status,
  } as DataSource;
}

export async function listDataSources(query: DataSourceQuery = {}): Promise<PageResult<DataSource>> {
  if (USE_MOCK) return datasourceMock.list(query);
  const res = (await http.get('/data-source', { params: query })) as unknown as
    | PageResult<RawDataSource>
    | RawDataSource[];
  const list = Array.isArray(res) ? res : res.list || [];
  return {
    list: list.map(normalizeDataSource),
    total: Array.isArray(res) ? list.length : res.total ?? list.length,
  };
}

export async function createDataSource(values: DataSourceFormValues): Promise<{ id: number }> {
  if (USE_MOCK) return datasourceMock.create(values);
  return http.post('/data-source', values);
}

export async function updateDataSource(id: number, values: DataSourceFormValues): Promise<void> {
  if (USE_MOCK) return datasourceMock.update(id, values);
  return http.put(`/data-source/${id}`, values);
}

export async function deleteDataSource(id: number): Promise<void> {
  if (USE_MOCK) return datasourceMock.remove(id);
  return http.delete(`/data-source/${id}`);
}

export async function testDataSource(id: number): Promise<TestConnectionResult> {
  if (USE_MOCK) return datasourceMock.test(id);
  const res = (await http.post(`/data-source/${id}/test`)) as unknown as TestConnectionResult & {
    costMs?: number;
  };
  return {
    ...res,
    latencyMs: res.latencyMs ?? res.costMs ?? 0,
  };
}

type RawTable = Partial<TableInfo> & { name?: string };
type RawColumn = Partial<ColumnInfo> & { columnName?: string };

export async function listTables(id: number): Promise<TableInfo[]> {
  if (USE_MOCK) {
    const res = await datasourceMock.tables(id);
    return res.list;
  }
  const res = (await http.get(`/data-source/${id}/tables`)) as unknown as
    | { list: RawTable[] }
    | RawTable[];
  const list = Array.isArray(res) ? res : res.list || [];
  return list.map((raw) => ({ tableName: raw.tableName ?? raw.name ?? '' }));
}

export async function listColumns(id: number, table: string): Promise<ColumnInfo[]> {
  if (USE_MOCK) {
    const res = await datasourceMock.columns(table);
    return res.list;
  }
  const res = (await http.get(
    `/data-source/${id}/tables/${encodeURIComponent(table)}/columns`,
  )) as unknown as { list: RawColumn[] } | RawColumn[];
  const list = Array.isArray(res) ? res : res.list || [];
  return list.map((raw) => ({
    name: raw.name ?? raw.columnName ?? '',
    type: raw.type ?? '',
    ...(raw.sourceType ? { sourceType: String(raw.sourceType) } : {}),
  }));
}
