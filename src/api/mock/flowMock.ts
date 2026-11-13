import type { FlowDetail, FlowRun, FlowSummary } from '../../types';

const FLOW_KEY = 'astryx.mock.flows';
const RUN_KEY = 'astryx.mock.runs';

const FIELDS_ORDERS = [
  { name: 'order_id', type: 'BIGINT' },
  { name: 'user_id', type: 'BIGINT' },
  { name: 'amt', type: 'DOUBLE' },
  { name: 'status', type: 'VARCHAR(32)' },
  { name: 'city', type: 'VARCHAR(64)' },
  { name: 'org_code', type: 'VARCHAR(32)' },
  { name: 'ts', type: 'DATETIME' },
  { name: 'remark', type: 'VARCHAR(255)' },
];

const FIELDS_USERS = [
  { name: 'user_id', type: 'BIGINT' },
  { name: 'cust_name', type: 'VARCHAR(128)' },
  { name: 'city', type: 'VARCHAR(64)' },
  { name: 'level', type: 'INT' },
  { name: 'register_ts', type: 'DATETIME' },
];

function seededFlows(): FlowDetail[] {
  return [
    {
      id: '1001',
      name: '订单清洗与城市汇总',
      description: '过滤有效订单，关联用户维表，按城市汇总金额后写入 ADS。',
      nodeCount: 6,
      lastRunStatus: 'SUCCESS',
      lastRunTime: '2026-11-13 09:12:34',
      updateTime: '2026-11-13 11:26:08',
      createTime: '2026-11-10 10:02:00',
      dataSourceId: 1,
      viewport: { x: 20, y: 20, zoom: 0.9 },
      nodes: [
        {
          id: 'node_1',
          type: 'source',
          position: { x: 60, y: 140 },
          data: {
            label: 'orders',
            kind: 'source',
            color: '#E8F0FE',
            config: { dataSourceId: 1, dataSourceName: 'ods_doris_prod', dbName: 'data_model', tableName: 'orders', fields: FIELDS_ORDERS },
          },
        },
        {
          id: 'node_2',
          type: 'source',
          position: { x: 60, y: 350 },
          data: {
            label: 'users',
            kind: 'source',
            color: '#E8F0FE',
            config: { dataSourceId: 1, dataSourceName: 'ods_doris_prod', dbName: 'data_model', tableName: 'users', fields: FIELDS_USERS },
          },
        },
        {
          id: 'node_3',
          type: 'filter',
          position: { x: 260, y: 120 },
          data: {
            label: 'filter_paid',
            kind: 'filter',
            color: '#FFF3E0',
            config: {
              alias: 'a',
              keepAll: false,
              distinct: false,
              limit: 5000,
              offset: 0,
              select: [
                { field: 'order_id', alias: 'order_id', keep: true, sort: '', type: 'BIGINT' },
                { field: 'user_id', alias: 'user_id', keep: true, sort: '', type: 'BIGINT' },
                { field: 'amt', alias: 'amt', keep: true, sort: 'DESC', type: 'DOUBLE' },
                { field: 'city', alias: 'city', keep: true, sort: '', type: 'VARCHAR(64)' },
                { field: 'status', alias: 'status', keep: false, sort: '', type: 'VARCHAR(32)' },
                { field: 'ts', alias: 'ts', keep: true, sort: '', type: 'DATETIME' },
              ],
              conditions: [
                { logic: 'AND', indent: 0, left: 'amt', op: 'GT', rightType: 'CONST', right: '100' },
                { logic: 'AND', indent: 0, left: 'status', op: 'EQ', rightType: 'CONST', right: 'PAID' },
              ],
            },
          },
        },
        {
          id: 'node_4',
          type: 'join',
          position: { x: 450, y: 235 },
          data: {
            label: 'join_user',
            kind: 'join',
            color: '#F3E8FF',
            config: {
              aliasLeft: 'a',
              aliasRight: 'b',
              joinType: 'LEFT',
              keys: [{ left: 'user_id', right: 'user_id' }],
              extraOn: '',
              autoPrefix: true,
              projection: [
                { side: 'a', field: 'order_id', alias: 'oid', keep: true, type: 'BIGINT' },
                { side: 'a', field: 'amt', alias: 'a_amt', keep: true, type: 'DOUBLE' },
                { side: 'a', field: 'city', alias: 'city', keep: true, type: 'VARCHAR(64)' },
                { side: 'b', field: 'cust_name', alias: 'cust', keep: true, type: 'VARCHAR(128)' },
                { side: 'b', field: 'level', alias: 'level', keep: true, type: 'INT' },
              ],
            },
          },
        },
        {
          id: 'node_5',
          type: 'groupBy',
          position: { x: 640, y: 235 },
          data: {
            label: 'gb_city',
            kind: 'groupBy',
            color: '#E6F7EE',
            config: {
              alias: 'a',
              globalAgg: false,
              groups: [{ field: 'city', alias: 'city', type: 'VARCHAR(64)' }],
              aggregates: [
                { field: 'a_amt', func: 'SUM', alias: 'sum_amt', type: 'DOUBLE' },
                { field: 'oid', func: 'COUNT', alias: 'cnt', type: 'BIGINT' },
              ],
              having: [{ logic: 'AND', indent: 0, left: 'sum_amt', op: 'GT', rightType: 'CONST', right: '1000' }],
              limit: 10000,
              offset: 0,
            },
          },
        },
        {
          id: 'node_6',
          type: 'sink',
          position: { x: 830, y: 270 },
          data: {
            label: 'sink_ads',
            kind: 'sink',
            color: '#E6F7EE',
            config: {},
          },
        },
      ],
      edges: [
        { id: 'edge_1', source: 'node_1', target: 'node_3', targetHandle: 'in-0', type: 'smoothstep', animated: false },
        { id: 'edge_2', source: 'node_2', target: 'node_4', targetHandle: 'in-0', type: 'smoothstep' },
        { id: 'edge_3', source: 'node_3', target: 'node_4', targetHandle: 'in-1', type: 'smoothstep' },
        { id: 'edge_4', source: 'node_4', target: 'node_5', targetHandle: 'in-0', type: 'smoothstep' },
        { id: 'edge_5', source: 'node_5', target: 'node_6', targetHandle: 'in-0', type: 'smoothstep' },
      ],
    },
    {
      id: '1002',
      name: '用户宽表构建',
      description: '以用户维表为核心，补全城市与等级信息，输出宽表供分析使用。',
      nodeCount: 0,
      lastRunStatus: 'FAILED',
      lastRunTime: '2026-11-12 18:22:10',
      updateTime: '2026-11-12 18:10:00',
      createTime: '2026-11-11 15:40:00',
      dataSourceId: 1,
      nodes: [],
      edges: [],
    },
    {
      id: '1003',
      name: '支付对账日汇总',
      description: '订单与支付流水对账，按日聚合差异金额，输出对账结果。',
      nodeCount: 0,
      lastRunStatus: null,
      lastRunTime: null,
      updateTime: '2026-11-09 11:20:00',
      createTime: '2026-11-09 11:20:00',
      dataSourceId: 2,
      nodes: [],
      edges: [],
    },
  ];
}

const SUCCESS_SQL = `CREATE TABLE flow_1001_node_5 AS
SELECT
  a.city,
  SUM(a.a_amt)  AS sum_amt,
  COUNT(a.oid)  AS cnt
FROM flow_1001_node_4 AS a
GROUP BY a.city
HAVING SUM(a.a_amt) > 1000`;

function seededRuns(): FlowRun[] {
  return [
    {
      id: 'R-20261113-0912',
      flowId: '1001',
      flowName: '订单清洗与城市汇总',
      status: 'SUCCESS',
      startTime: '2026-11-13 09:12:28',
      endTime: '2026-11-13 09:12:34',
      durationMs: 6231,
      trigger: 'MANUAL',
      nodes: [
        {
          nodeId: 'node_1',
          nodeName: 'orders',
          status: 'SUCCESS',
          rows: 128340,
          durationMs: 812,
          sql: '-- Source 节点不生成 SQL，直接引用 data_model.orders',
          logs: ['[09:12:28] Source 节点开始', '[09:12:28] 读取远端字段 8 个', '[09:12:29] 完成，下游可引用'],
        },
        {
          nodeId: 'node_2',
          nodeName: 'users',
          status: 'SUCCESS',
          rows: 8421,
          durationMs: 402,
          sql: '-- Source 节点不生成 SQL，直接引用 data_model.users',
          logs: ['[09:12:29] Source 节点开始', '[09:12:29] 读取远端字段 5 个'],
        },
        {
          nodeId: 'node_3',
          nodeName: 'filter_paid',
          status: 'SUCCESS',
          rows: 96520,
          durationMs: 1320,
          sql: `CREATE TABLE flow_1001_node_3 AS
SELECT a.order_id AS order_id, a.user_id AS user_id, a.amt AS amt,
       a.city AS city, a.ts AS ts
FROM data_model.orders AS a
WHERE (a.amt > 100) AND (a.status = 'PAID')
ORDER BY amt DESC
LIMIT 5000`,
          logs: ['[09:12:29] 开始执行单节点', '[09:12:30] Doris 返回 96520 行', '[09:12:30] 中间表 flow_1001_node_3 已生成'],
        },
        {
          nodeId: 'node_4',
          nodeName: 'join_user',
          status: 'SUCCESS',
          rows: 95210,
          durationMs: 1890,
          sql: `CREATE TABLE flow_1001_node_4 AS
SELECT a.order_id AS oid, a.amt AS a_amt, a.city AS city,
       b.cust_name AS cust, b.level AS level
FROM flow_1001_node_3 AS a
LEFT JOIN data_model.users AS b ON a.user_id = b.user_id`,
          logs: ['[09:12:30] Join Key: a.user_id = b.user_id', '[09:12:31] 左右流识别完成', '[09:12:32] 输出 95210 行'],
        },
        {
          nodeId: 'node_5',
          nodeName: 'gb_city',
          status: 'SUCCESS',
          rows: 312,
          durationMs: 640,
          sql: SUCCESS_SQL,
          logs: ['[09:12:32] 分组字段 city', '[09:12:32] 聚合 SUM(a_amt) / COUNT(oid)', '[09:12:33] HAVING 过滤完成，输出 312 行'],
        },
        {
          nodeId: 'node_6',
          nodeName: 'sink_ads',
          status: 'SKIPPED',
          rows: null,
          durationMs: 1,
          sql: '-- v1 未启用 Sink，跳过写入',
          logs: ['[09:12:33] Sink 节点已跳过（v1 未启用）'],
        },
      ],
    },
    {
      id: 'R-20261112-1822',
      flowId: '1002',
      flowName: '用户宽表构建',
      status: 'FAILED',
      startTime: '2026-11-12 18:22:03',
      endTime: '2026-11-12 18:22:10',
      durationMs: 7012,
      trigger: 'MANUAL',
      nodes: [
        {
          nodeId: 'node_11',
          nodeName: 'users',
          status: 'SUCCESS',
          rows: 8421,
          durationMs: 388,
          sql: '-- Source 节点不生成 SQL',
          logs: ['[18:22:03] Source 节点开始', '[18:22:04] 读取字段 5 个'],
        },
        {
          nodeId: 'node_12',
          nodeName: 'filter_active',
          status: 'FAILED',
          rows: null,
          durationMs: 5210,
          sql: 'SELECT * FROM data_model.users WHERE status = 1',
          logs: ['[18:22:04] 开始执行', '[18:22:09] 字段 status 不存在于上游 schema'],
          errorStack:
            'com.datamodel.engine.NodeExecuteException: 字段 status 不存在于上游 node_field\n  at SqlBuilder.filter(SqlBuilder.java:184)\n  at NodeExecutor.execute(NodeExecutor.java:96)',
        },
      ],
    },
    {
      id: 'R-20261112-0915',
      flowId: '1001',
      flowName: '订单清洗与城市汇总',
      status: 'SUCCESS',
      startTime: '2026-11-12 09:15:02',
      endTime: '2026-11-12 09:15:09',
      durationMs: 7104,
      trigger: 'MANUAL',
      nodes: [
        {
          nodeId: 'node_1',
          nodeName: 'orders',
          status: 'SUCCESS',
          rows: 127890,
          durationMs: 790,
          logs: ['[09:15:02] 读取 8 个字段'],
        },
        {
          nodeId: 'node_5',
          nodeName: 'gb_city',
          status: 'SUCCESS',
          rows: 308,
          durationMs: 652,
          sql: SUCCESS_SQL,
          logs: ['[09:15:06] 聚合完成，输出 308 行'],
        },
      ],
    },
    {
      id: 'R-20261110-1604',
      flowId: '1003',
      flowName: '支付对账日汇总',
      status: 'FAILED',
      startTime: '2026-11-10 16:04:00',
      endTime: '2026-11-10 16:04:05',
      durationMs: 5020,
      trigger: 'MANUAL',
      nodes: [
        {
          nodeId: 'node_21',
          nodeName: 'fact_payment',
          status: 'FAILED',
          rows: null,
          durationMs: 5000,
          sql: 'SELECT * FROM ads_staging.fact_payment LIMIT 100',
          logs: ['[16:04:00] 开始连接', '[16:04:05] 默认库 ads_staging 不存在或无权限访问'],
          errorStack: 'java.sql.SQLSyntaxErrorException: Unknown database \'ads_staging\'',
        },
      ],
    },
    {
      id: 'R-20261109-1108',
      flowId: '1003',
      flowName: '支付对账日汇总',
      status: 'SUCCESS',
      startTime: '2026-11-09 11:08:00',
      endTime: '2026-11-09 11:08:04',
      durationMs: 4120,
      trigger: 'MANUAL',
      nodes: [],
    },
  ];
}

function readFlows(): FlowDetail[] {
  const raw = localStorage.getItem(FLOW_KEY);
  if (!raw) {
    const seed = seededFlows();
    localStorage.setItem(FLOW_KEY, JSON.stringify(seed));
    return seed;
  }
  try {
    return JSON.parse(raw) as FlowDetail[];
  } catch {
    return seededFlows();
  }
}

function writeFlows(flows: FlowDetail[]) {
  localStorage.setItem(FLOW_KEY, JSON.stringify(flows));
}

function readRuns(): FlowRun[] {
  const raw = localStorage.getItem(RUN_KEY);
  if (!raw) {
    const seed = seededRuns();
    localStorage.setItem(RUN_KEY, JSON.stringify(seed));
    return seed;
  }
  try {
    return JSON.parse(raw) as FlowRun[];
  } catch {
    return seededRuns();
  }
}

function writeRuns(runs: FlowRun[]) {
  localStorage.setItem(RUN_KEY, JSON.stringify(runs));
}

function delay<T>(value: T, ms = 180): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

function nowStr() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function toSummary(f: FlowDetail): FlowSummary {
  const { nodes, edges, viewport, dataSourceId, ...rest } = f;
  return { ...rest, nodeCount: nodes.length };
}

export const flowMock = {
  list(keyword?: string) {
    const flows = readFlows()
      .map(toSummary)
      .filter((f) => (keyword ? f.name.toLowerCase().includes(keyword.toLowerCase()) : true))
      .sort((a, b) => b.updateTime.localeCompare(a.updateTime));
    return delay(flows);
  },

  get(id: string) {
    const flow = readFlows().find((f) => f.id === id);
    return flow ? delay(JSON.parse(JSON.stringify(flow)) as FlowDetail) : Promise.reject(new Error('任务不存在'));
  },

  create(name: string, description: string) {
    const flows = readFlows();
    const id = String(Math.max(1000, ...flows.map((f) => Number(f.id))) + 1);
    const item: FlowDetail = {
      id,
      name,
      description,
      nodeCount: 0,
      lastRunStatus: null,
      lastRunTime: null,
      updateTime: nowStr(),
      createTime: nowStr(),
      nodes: [],
      edges: [],
      dataSourceId: null,
    };
    flows.push(item);
    writeFlows(flows);
    return delay(item);
  },

  updateMeta(id: string, patch: { name?: string; description?: string }) {
    const flows = readFlows();
    const flow = flows.find((f) => f.id === id);
    if (!flow) return Promise.reject(new Error('任务不存在'));
    Object.assign(flow, patch, { updateTime: nowStr() });
    writeFlows(flows);
    return delay(undefined);
  },

  remove(id: string) {
    writeFlows(readFlows().filter((f) => f.id !== id));
    writeRuns(readRuns().filter((r) => r.flowId !== id));
    return delay(undefined);
  },

  duplicate(id: string) {
    const flows = readFlows();
    const source = flows.find((f) => f.id === id);
    if (!source) return Promise.reject(new Error('任务不存在'));
    const newId = String(Math.max(1000, ...flows.map((f) => Number(f.id))) + 1);
    const nodeIdMap = new Map<string, string>();
    const nodes = source.nodes.map((n, i) => {
      const newIdN = `node_${Date.now()}_${i}`;
      nodeIdMap.set(n.id, newIdN);
      return { ...n, id: newIdN, selected: false };
    });
    const edges = source.edges.map((e) => ({
      ...e,
      id: `edge_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      source: nodeIdMap.get(e.source) || e.source,
      target: nodeIdMap.get(e.target) || e.target,
    }));
    const item: FlowDetail = {
      ...source,
      id: newId,
      name: `${source.name} 副本`,
      nodes,
      edges,
      createTime: nowStr(),
      updateTime: nowStr(),
      lastRunStatus: null,
      lastRunTime: null,
    };
    flows.push(item);
    writeFlows(flows);
    return delay(item);
  },

  saveDag(
    id: string,
    payload: {
      nodes: FlowDetail['nodes'];
      edges: FlowDetail['edges'];
      viewport?: FlowDetail['viewport'];
      dagJson?: unknown;
    },
  ) {
    const flows = readFlows();
    const flow = flows.find((f) => f.id === id);
    if (!flow) return Promise.reject(new Error('任务不存在'));
    flow.nodes = JSON.parse(JSON.stringify(payload.nodes));
    flow.edges = JSON.parse(JSON.stringify(payload.edges));
    flow.nodeCount = payload.nodes.length;
    if (payload.viewport) flow.viewport = payload.viewport;
    if (payload.dagJson) {
      flow.dagJson = JSON.parse(JSON.stringify(payload.dagJson));
    }
    flow.updateTime = nowStr();
    writeFlows(flows);
    return delay(undefined, 120);
  },

  markRun(id: string, status: FlowDetail['lastRunStatus']) {
    const flows = readFlows();
    const flow = flows.find((f) => f.id === id);
    if (flow) {
      flow.lastRunStatus = status;
      flow.lastRunTime = nowStr();
      flow.updateTime = nowStr();
      writeFlows(flows);
    }
  },

  runs(flowId?: string) {
    const runs = readRuns()
      .filter((r) => (flowId ? r.flowId === flowId : true))
      .sort((a, b) => b.startTime.localeCompare(a.startTime));
    return delay(runs);
  },

  appendRun(run: FlowRun) {
    const runs = readRuns();
    runs.unshift(run);
    writeRuns(runs);
  },
};
