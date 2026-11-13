import type { Edge, Node } from '@xyflow/react';

export type DataSourceType = 'MYSQL' | 'DORIS' | 'DM8';

export interface DataSource {
  id: number;
  name: string;
  type: DataSourceType;
  host: string;
  port: number;
  dbName: string;
  username?: string;
  extraParams?: string;
  remark?: string;
  lastTestStatus?: 'SUCCESS' | 'FAILED' | 'UNKNOWN' | string | null;
  lastTestTime?: string | null;
  createTime?: string;
  updateTime?: string;
}

export interface PageResult<T> {
  list: T[];
  total: number;
}

export interface DataSourceFormValues {
  name: string;
  type: DataSourceType;
  host: string;
  port: number;
  dbName: string;
  username: string;
  password?: string;
  extraParams?: string;
  remark?: string;
}

export interface TestConnectionResult {
  success: boolean;
  latencyMs: number;
  errorType?: string;
  message: string;
}

export interface TableInfo {
  tableName: string;
}

export interface ColumnInfo {
  name: string;
  type: string;
}

export type FlowNodeKind = 'source' | 'filter' | 'groupBy' | 'join' | 'union' | 'sink';

export interface FieldDef {
  name: string;
  type: string;
}

export interface SortSpec {
  field: string;
  direction: 'ASC' | 'DESC';
}

export interface ConditionRow {
  logic: 'AND' | 'OR';
  indent: number;
  left: string;
  op: string;
  rightType: 'CONST' | 'FIELD';
  right: string;
  right2?: string;
}

export interface SourceConfig {
  dataSourceId: number | null;
  dataSourceName?: string;
  dbName?: string;
  tableName: string;
  fields: FieldDef[];
}

export interface FilterConfig {
  alias: string;
  keepAll: boolean;
  select: Array<{ field: string; alias: string; keep: boolean; sort: '' | 'ASC' | 'DESC'; type?: string }>;
  conditions: ConditionRow[];
  distinct: boolean;
  limit?: number | null;
  offset?: number | null;
}

export interface GroupByConfig {
  alias: string;
  globalAgg: boolean;
  groups: Array<{ field: string; alias: string; type?: string }>;
  aggregates: Array<{ field: string; func: string; alias: string; type?: string }>;
  having: ConditionRow[];
  limit?: number | null;
  offset?: number | null;
}

export interface JoinConfig {
  aliasLeft: string;
  aliasRight: string;
  joinType: 'INNER' | 'LEFT' | 'RIGHT' | 'FULL';
  keys: Array<{ left: string; right: string }>;
  extraOn: string;
  projection: Array<{ side: 'a' | 'b'; field: string; alias: string; keep: boolean; type?: string }>;
  autoPrefix: boolean;
}

export interface UnionConfig {
  unionAll: boolean;
  alignBy: 'NAME' | 'POSITION';
  targets: Array<{ name: string; type?: string; sources: Record<string, string | null> }>;
}

export interface SinkConfig {
  targetType?: string;
  targetDataSourceId?: number | null;
  writeMode?: string;
}

export type AnyNodeConfig = SourceConfig | FilterConfig | GroupByConfig | JoinConfig | UnionConfig | SinkConfig;

export interface FlowNodeData extends Record<string, unknown> {
  label: string;
  kind: FlowNodeKind;
  color: string;
  config: AnyNodeConfig;
  warning?: string | null;
  runStatus?: 'RUNNING' | 'SUCCESS' | 'FAILED' | 'SKIPPED' | null;
}

export type FlowNode = Node<FlowNodeData>;
export type FlowEdge = Edge;

export interface FlowViewport {
  x: number;
  y: number;
  zoom: number;
}

export interface FlowSummary {
  id: string;
  name: string;
  description: string;
  nodeCount: number;
  lastRunStatus?: 'SUCCESS' | 'FAILED' | 'RUNNING' | null;
  lastRunTime?: string | null;
  updateTime: string;
  createTime: string;
}

export interface FlowDetail extends FlowSummary {
  nodes: FlowNode[];
  edges: FlowEdge[];
  viewport?: FlowViewport;
  dataSourceId?: number | null;
  dagJson?: unknown;
}

export type RunStatus = 'SUCCESS' | 'FAILED' | 'RUNNING' | 'SKIPPED' | 'WAITING';

export interface NodeRun {
  nodeId: string;
  nodeName: string;
  status: RunStatus;
  rows: number | null;
  durationMs: number | null;
  sql?: string;
  logs: string[];
  errorStack?: string;
}

export interface FlowRun {
  id: string;
  flowId: string;
  flowName: string;
  status: RunStatus;
  startTime: string;
  endTime?: string | null;
  durationMs?: number | null;
  trigger: 'MANUAL' | 'RETRY' | 'SCHEDULE';
  nodes: NodeRun[];
}
