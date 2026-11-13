import type {
  ColumnInfo,
  DataSource,
  DataSourceFormValues,
  TableInfo,
  TestConnectionResult,
} from '../../types';

const STORE_KEY = 'astryx.mock.datasources';

const SEED: DataSource[] = [
  {
    id: 1,
    name: 'ods_doris_prod',
    type: 'DORIS',
    host: '192.168.10.11',
    port: 9030,
    dbName: 'data_model',
    username: 'data_model',
    remark: '生产 ODS 集群，订单与用户主题',
    lastTestStatus: 'SUCCESS',
    lastTestTime: '2026-11-13 11:42:18',
    createTime: '2026-11-10 09:12:00',
    updateTime: '2026-11-13 11:42:18',
  },
  {
    id: 2,
    name: 'mysql_biz',
    type: 'MYSQL',
    host: '192.168.10.11',
    port: 3306,
    dbName: 'data_model',
    username: 'data_model',
    remark: '业务库，元数据与源表',
    lastTestStatus: 'SUCCESS',
    lastTestTime: '2026-11-13 10:18:05',
    createTime: '2026-11-10 09:20:00',
    updateTime: '2026-11-13 10:18:05',
  },
  {
    id: 3,
    name: 'dm8_legacy',
    type: 'DM8',
    host: '10.20.3.18',
    port: 5236,
    dbName: 'DMODS',
    username: 'SYSDBA',
    remark: '达梦历史库（待运维开通测试实例）',
    lastTestStatus: 'FAILED',
    lastTestTime: '2026-11-12 16:30:44',
    createTime: '2026-11-11 14:02:00',
    updateTime: '2026-11-12 16:30:44',
  },
  {
    id: 4,
    name: 'doris_ads_staging',
    type: 'DORIS',
    host: '192.168.10.12',
    port: 9030,
    dbName: 'ads_staging',
    username: 'etl',
    remark: 'ADS 预发集群（新增，尚未测试）',
    lastTestStatus: 'UNKNOWN',
    lastTestTime: null,
    createTime: '2026-11-13 09:05:00',
    updateTime: '2026-11-13 09:05:00',
  },
];

const TABLE_MAP: Record<string, string[]> = {
  DORIS: ['orders', 'orders_bak', 'users', 'order_items', 'dim_city', 'fact_payment', 'dws_order_summary'],
  MYSQL: ['orders', 'users', 'customers', 'products', 'order_items', 'payments', 'regions'],
  DM8: ['T_ORDER', 'T_USER', 'T_ORG', 'T_LEGACY_PAY'],
};

const COLUMN_MAP: Record<string, ColumnInfo[]> = {
  orders: [
    { name: 'order_id', type: 'BIGINT' },
    { name: 'user_id', type: 'BIGINT' },
    { name: 'amt', type: 'DOUBLE' },
    { name: 'status', type: 'VARCHAR(32)' },
    { name: 'city', type: 'VARCHAR(64)' },
    { name: 'org_code', type: 'VARCHAR(32)' },
    { name: 'ts', type: 'DATETIME' },
    { name: 'remark', type: 'VARCHAR(255)' },
  ],
  orders_bak: [
    { name: 'order_id', type: 'BIGINT' },
    { name: 'user_id', type: 'BIGINT' },
    { name: 'amount', type: 'DOUBLE' },
    { name: 'city_name', type: 'VARCHAR(64)' },
    { name: 'ts', type: 'DATETIME' },
  ],
  users: [
    { name: 'user_id', type: 'BIGINT' },
    { name: 'cust_name', type: 'VARCHAR(128)' },
    { name: 'city', type: 'VARCHAR(64)' },
    { name: 'level', type: 'INT' },
    { name: 'register_ts', type: 'DATETIME' },
  ],
  order_items: [
    { name: 'item_id', type: 'BIGINT' },
    { name: 'order_id', type: 'BIGINT' },
    { name: 'product_id', type: 'BIGINT' },
    { name: 'qty', type: 'INT' },
    { name: 'price', type: 'DECIMAL(18,2)' },
  ],
  dim_city: [
    { name: 'city', type: 'VARCHAR(64)' },
    { name: 'province', type: 'VARCHAR(64)' },
    { name: 'region', type: 'VARCHAR(32)' },
  ],
  fact_payment: [
    { name: 'pay_id', type: 'BIGINT' },
    { name: 'order_id', type: 'BIGINT' },
    { name: 'pay_amt', type: 'DOUBLE' },
    { name: 'pay_ts', type: 'DATETIME' },
  ],
  dws_order_summary: [
    { name: 'city', type: 'VARCHAR(64)' },
    { name: 'order_cnt', type: 'BIGINT' },
    { name: 'sum_amt', type: 'DOUBLE' },
    { name: 'last_ts', type: 'DATETIME' },
  ],
};

const DEFAULT_COLUMNS: ColumnInfo[] = [
  { name: 'id', type: 'BIGINT' },
  { name: 'name', type: 'VARCHAR(128)' },
  { name: 'amount', type: 'DOUBLE' },
  { name: 'created_at', type: 'DATETIME' },
];

function load(): DataSource[] {
  const raw = localStorage.getItem(STORE_KEY);
  if (!raw) {
    localStorage.setItem(STORE_KEY, JSON.stringify(SEED));
    return [...SEED];
  }
  try {
    return JSON.parse(raw) as DataSource[];
  } catch {
    return [...SEED];
  }
}

function save(list: DataSource[]) {
  localStorage.setItem(STORE_KEY, JSON.stringify(list));
}

function delay<T>(value: T, ms = 260): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

function now() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

export const datasourceMock = {
  list(params: { keyword?: string; type?: string; page?: number; size?: number }) {
    const list = load()
      .filter((d) => (params.type ? d.type === params.type : true))
      .filter((d) => (params.keyword ? d.name.toLowerCase().includes(params.keyword.toLowerCase()) : true))
      .sort((a, b) => (b.lastTestTime || '').localeCompare(a.lastTestTime || ''));
    const page = params.page || 1;
    const size = params.size || 20;
    return delay({ list: list.slice((page - 1) * size, page * size), total: list.length });
  },

  create(values: DataSourceFormValues) {
    const list = load();
    if (list.some((d) => d.name === values.name && d.type === values.type)) {
      return Promise.reject(new Error('数据源名称已存在'));
    }
    const item: DataSource = {
      ...values,
      password: undefined,
      id: Math.max(0, ...list.map((d) => d.id)) + 1,
      lastTestStatus: 'UNKNOWN',
      lastTestTime: null,
      createTime: now(),
      updateTime: now(),
    } as unknown as DataSource;
    list.push(item);
    save(list);
    return delay({ id: item.id });
  },

  update(id: number, values: DataSourceFormValues) {
    const list = load();
    const idx = list.findIndex((d) => d.id === id);
    if (idx < 0) return Promise.reject(new Error('数据源不存在'));
    list[idx] = { ...list[idx], ...values, password: undefined, updateTime: now() } as DataSource;
    save(list);
    return delay(undefined);
  },

  remove(id: number) {
    save(load().filter((d) => d.id !== id));
    return delay(undefined);
  },

  test(id: number): Promise<TestConnectionResult> {
    const item = load().find((d) => d.id === id);
    if (!item) return Promise.reject(new Error('数据源不存在'));
    const failed = item.type === 'DM8';
    const result: TestConnectionResult = failed
      ? {
          success: false,
          latencyMs: 15000,
          errorType: 'TIMEOUT',
          message: '无法连接到 10.20.3.18:5236，请检查地址、端口与网络连通性',
        }
      : { success: true, latencyMs: 180 + Math.round(Math.random() * 160), message: '连接成功' };
    const list = load();
    const target = list.find((d) => d.id === id)!;
    target.lastTestStatus = failed ? 'FAILED' : 'SUCCESS';
    target.lastTestTime = now();
    save(list);
    return delay(result, failed ? 700 : 620);
  },

  tables(id: number) {
    const item = load().find((d) => d.id === id);
    if (!item) return Promise.reject(new Error('数据源不存在'));
    return delay({ list: (TABLE_MAP[item.type] || TABLE_MAP.DORIS).map((t) => ({ tableName: t })) });
  },

  columns(table: string) {
    return delay({ list: COLUMN_MAP[table] || DEFAULT_COLUMNS });
  },
};
