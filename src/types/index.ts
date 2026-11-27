import type { Edge, Node } from '@xyflow/react';

export type DataSourceType = 'MYSQL' | 'DORIS' | 'DM8' | 'ORACLE';

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
  /** 仅 Doris：Stream Load HTTP 端口（后端从 extraParams.httpPort 解析） */
  httpPort?: number | null;
  /** 仅 Doris：数据源是否已配置 Stream Load 端口 */
  httpPortConfigured?: boolean;
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
  /** 仅 Doris：Stream Load HTTP 端口，保存时合入 extraParams.httpPort */
  httpPort?: number | null;
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
  /** Doris 归一化类型（后端 /columns 返回）。 */
  type: string;
  /** 源库原始类型，如 bigint unsigned，仅用于展示提示。 */
  sourceType?: string;
}

export type FlowNodeKind =
  | 'source'
  | 'filter'
  | 'convert'
  | 'calculator'
  | 'formula'
  | 'replaceNull'
  | 'sortRows'
  | 'splitFields'
  | 'splitFieldsToRows'
  | 'valueMapper'
  | 'uniqueRows'
  | 'columnsToRows'
  | 'rowsToColumns'
  | 'replaceInString'
  | 'llm'
  | 'groupBy'
  | 'join'
  | 'union'
  | 'sink';

export interface FieldDef {
  name: string;
  /** Doris 归一化类型。 */
  type: string;
  /** 源库原始类型（仅 Source 字段保留，用于 tooltip）。 */
  sourceType?: string;
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

export interface SourceFilterConfig {
  conditions: ConditionRow[];
}

export interface SourceConfig {
  dataSourceId: number | null;
  dataSourceName?: string;
  dbName?: string;
  tableName: string;
  fields: FieldDef[];
  filter?: SourceFilterConfig;
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

export type ConvertTargetType =
  | 'STRING'
  | 'INT'
  | 'BIGINT'
  | 'DOUBLE'
  | 'DECIMAL'
  | 'DATE'
  | 'DATETIME'
  | 'BOOLEAN';

export type ConvertTrim = 'NONE' | 'LEFT' | 'RIGHT' | 'BOTH';

/** 契约字段名冻结，见后端 SqlBuilderFactory.convert。 */
export interface ConvertField {
  field: string;
  /** 空 = 该列不转换，原样输出 */
  targetType: ConvertTargetType | '' | null;
  /** STRING 长度 / DECIMAL 总位数 p */
  length?: number | null;
  /** DECIMAL 小数位 s */
  precision?: number | null;
  /** 仅 DATE/DATETIME，Doris 掩码（%Y-%m-%d %H:%i:%s） */
  format?: string | null;
  trim?: ConvertTrim;
  emptyToNull?: boolean;
  /** 空 = 沿用原字段名 */
  output?: string;
  /** true = 不输出该列，忽略其余设置 */
  remove?: boolean;
}

export interface ConvertConfig {
  alias: string;
  passthrough: boolean;
  conversions: ConvertField[];
}

export type CalcOperation =
  | 'ADD'
  | 'SUBTRACT'
  | 'MULTIPLY'
  | 'DIVIDE'
  | 'MOD'
  | 'ADD3'
  | 'MULTIPLY3'
  | 'AVG3'
  | 'MIN'
  | 'MAX'
  | 'ROUND'
  | 'STDROUND'
  | 'CEIL'
  | 'FLOOR'
  | 'NVL'
  | 'DATE_ADD_DAYS'
  | 'DATE_SUB_DAYS'
  | 'DATE_ADD_MONTHS'
  | 'DATE_SUB_MONTHS'
  | 'DATE_ADD_HOURS'
  | 'DATE_SUB_HOURS'
  | 'DATE_ADD_MINUTES'
  | 'DATE_SUB_MINUTES'
  | 'DATE_ADD_SECONDS'
  | 'DATE_SUB_SECONDS'
  | 'DATE_DIFF_DAYS'
  | 'DATE_DIFF_HOURS'
  | 'DATE_DIFF_MINUTES'
  | 'DATE_DIFF_SECONDS'
  | 'YEAR_OF_DATE'
  | 'MONTH_OF_DATE'
  | 'DAY_OF_MONTH'
  | 'DAY_OF_WEEK'
  | 'DAY_OF_YEAR'
  | 'WEEK_OF_YEAR'
  | 'QUARTER_OF_DATE'
  | 'HOUR_OF_DAY'
  | 'MINUTE_OF_HOUR'
  | 'SECOND_OF_MINUTE'
  | 'DATE_FORMAT'
  | 'DATE_PARSE'
  | 'UPPER'
  | 'LOWER'
  | 'INITCAP'
  | 'TRIM'
  | 'LTRIM'
  | 'RTRIM'
  | 'LENGTH'
  | 'SUBSTRING'
  | 'LEFT'
  | 'RIGHT'
  | 'REPLACE'
  | 'CONCAT2'
  | 'CONCAT3'
  | 'LPAD'
  | 'RPAD';

export type CalcArgMode = 'FIELD' | 'LITERAL';
export type CalcReturnType =
  | 'DOUBLE'
  | 'DECIMAL'
  | 'BIGINT'
  | 'INT'
  | 'DATE'
  | 'DATETIME'
  | 'STRING';
export type FormulaReturnType = 'DOUBLE' | 'DECIMAL' | 'STRING' | 'BIGINT' | 'INT';

/** 契约字段名冻结，见后端 SqlBuilderFactory.parseCalculations。 */
export interface CalculatorRow {
  output: string;
  operation: CalcOperation;
  fieldA: string;
  fieldB: string;
  fieldC?: string | null;
  /** B/C 缺省 FIELD，LITERAL 时必须写并带 literalB/literalC */
  argBType?: CalcArgMode;
  argCType?: CalcArgMode;
  literalB?: string | null;
  literalC?: string | null;
  returnType: CalcReturnType;
  length?: number | null;
  precision?: number | null;
}

export interface CalculatorConfig {
  alias: string;
  calculations: CalculatorRow[];
}

/** 契约字段名冻结，见后端 SqlBuilderFactory.parseFormulas。 */
export interface FormulaRow {
  output: string;
  expression: string;
  returnType: FormulaReturnType;
  length?: number | null;
  precision?: number | null;
}

export interface FormulaConfig {
  alias: string;
  formulas: FormulaRow[];
}

export type NullStrategy = 'VALUE' | 'MAX' | 'MIN' | 'AVG' | 'MEDIAN' | 'MODE';

/** 契约字段名冻结，见 需求-2026-11-24 §A3：只替换 NULL。 */
export interface ReplaceNullRule {
  field: string;
  strategy: NullStrategy;
  /** strategy=VALUE 时的替换值，字符串形式提交 */
  value: string;
  /** 空或等于 field = 原地替换 */
  output: string;
}

export interface ReplaceNullConfig {
  alias: string;
  rules: ReplaceNullRule[];
}

export type SortDirection = 'ASC' | 'DESC' | 'CUSTOM';

export interface SortKey {
  field: string;
  direction: SortDirection;
  /** direction=CUSTOM 时的有序值列表，未列出的值排最后 */
  values?: string[];
}

export interface GroupOrderKey {
  field: string;
  direction: 'ASC' | 'DESC';
}

export type GroupRankFunction = 'ROW_NUMBER' | 'RANK' | 'DENSE_RANK';

/** 契约字段名冻结，见 需求-2026-11-23-新增算子 §2。 */
export interface SortRowsConfig {
  alias: string;
  sequenceEnabled: boolean;
  sequenceOutput: string;
  simpleEnabled: boolean;
  keys: SortKey[];
  groupEnabled: boolean;
  partitionBy: string[];
  groupOrderBy: GroupOrderKey[];
  groupFunction: GroupRankFunction;
  groupOutput: string;
}

export interface SplitFieldPart {
  index: number;
  output: string;
}

/** 契约字段名冻结，见 需求-2026-11-23-新增算子 §3a。 */
export interface SplitFieldsConfig {
  alias: string;
  field: string;
  delimiter: string;
  keepOriginal: boolean;
  trim: boolean;
  emptyAsNull: boolean;
  parts: SplitFieldPart[];
}

/** 契约字段名冻结，见 需求-2026-11-23-新增算子 §3b。 */
export interface SplitFieldsToRowsConfig {
  alias: string;
  field: string;
  delimiter: string;
  output: string;
  keepOriginal: boolean;
  trim: boolean;
  dropEmpty: boolean;
  positionOutput: string;
}

export interface ValueMapping {
  from: string;
  to: string;
}

export type ValueUnmatched = 'KEEP' | 'VALUE' | 'NULL';

/** 契约字段名冻结，见 需求-2026-11-24 §B。 */
export interface ValueMapperRule {
  field: string;
  /** 空或等于 field = 原地替换 */
  output: string;
  mappings: ValueMapping[];
  unmatched: ValueUnmatched;
  /** unmatched=VALUE 时的字面量 */
  unmatchedValue: string;
}

export interface ValueMapperConfig {
  alias: string;
  rules: ValueMapperRule[];
}

export type UniqueMode = 'SIMPLE' | 'RULE';
export type DuplicateOutput = 'DISCARD' | 'TABLE';

export interface UniqueDuplicateTarget {
  dataSourceId: number | null;
  tableName: string;
  writeMode: SinkWriteMode;
  autoCreate: boolean;
}

/** 契约字段名冻结，见 需求-2026-11-24 §C。 */
export interface UniqueRowsConfig {
  alias: string;
  mode: UniqueMode;
  keyFields: string[];
  ignoreCase: boolean;
  orderBy: SortSpec[];
  duplicateOutput: DuplicateOutput;
  duplicateTarget: UniqueDuplicateTarget;
}

export type ColumnsToRowsValueType = 'STRING' | 'DOUBLE' | 'BIGINT';

export interface ColumnsToRowsValueField {
  field: string;
  /** 名称列取值，缺省用字段名 */
  label: string;
}

/** 契约字段名冻结，见 需求-2026-11-24 §D。 */
export interface ColumnsToRowsConfig {
  alias: string;
  keepFields: string[];
  valueFields: ColumnsToRowsValueField[];
  nameOutput: string;
  valueOutput: string;
  valueType: ColumnsToRowsValueType;
  skipNull: boolean;
}

export type PivotAggregate = 'SUM' | 'MAX' | 'MIN' | 'AVG' | 'COUNT';

export interface PivotValue {
  value: string;
  output: string;
}

/** 契约字段名冻结，见 需求-2026-11-24 §E。 */
export interface RowsToColumnsConfig {
  alias: string;
  groupFields: string[];
  pivotField: string;
  valueField: string;
  aggregate: PivotAggregate;
  pivotValues: PivotValue[];
}

/** 契约字段名冻结，见 需求-2026-11-25 三、替换字符串。 */
export interface ReplaceInStringConfig {
  alias: string;
  field: string;
  /** 留空或与 field 相同 = 原地替换 */
  output: string;
  search: string;
  replacement: string;
  useRegex: boolean;
}

/** 输入字段 → Prompt 变量名映射，见 需求-2026-11-26 §5.4。 */
export interface LlmInputVariable {
  field: string;
  variable: string;
}

/** 契约字段名冻结，见 需求-2026-11-25 4.1 / 2026-11-26 §5；API Key 不进入 dagJson。 */
export interface LlmConfig {
  alias: string;
  inputFields: string[];
  /** 旧配置可缺省：此时变量名默认取字段名。 */
  inputVariables: LlmInputVariable[];
  outputField: string;
  enumValues: string[];
  batchRows: number;
  endpoint: string;
  model: string;
  promptTemplate: string;
  unknownValue: string;
  timeoutSeconds: number;
  maxRetries: number;
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

export type SinkTargetType = 'DORIS' | 'MYSQL' | 'DM8' | 'ORACLE';
export type SinkWriteMode = 'APPEND' | 'OVERWRITE';
export type SinkTableModel = 'UNIQUE' | 'DUPLICATE';

export interface SinkFieldMapping {
  source: string;
  target: string;
  type?: string;
}

/** 契约 §17 / dag_json §5：字段名冻结，不要改。 */
export interface SinkConfig {
  targetType: SinkTargetType;
  dataSourceId: number | null;
  tableName: string;
  writeMode: SinkWriteMode;
  batchSize: number;
  autoCreateTable: boolean;
  watermarkColumn: string | null;
  fieldMapping: SinkFieldMapping[];
  /** 仅 Doris：自动建表模型；缺省 null 时后端按 DUPLICATE 兼容旧 DAG。 */
  tableModel?: SinkTableModel | null;
  /** 仅 Doris + UNIQUE：主键字段，取值为 fieldMapping.target。 */
  keyColumns?: string[];
}

export interface SinkPreviewMeta {
  targetType: string;
  targetTable: string;
  writeMode: string;
  fieldMapping: Array<{ source: string; target: string; type?: string | null }>;
}

export type AnyNodeConfig =
  | SourceConfig
  | FilterConfig
  | ConvertConfig
  | CalculatorConfig
  | FormulaConfig
  | ReplaceNullConfig
  | SortRowsConfig
  | SplitFieldsConfig
  | SplitFieldsToRowsConfig
  | ValueMapperConfig
  | UniqueRowsConfig
  | ColumnsToRowsConfig
  | RowsToColumnsConfig
  | ReplaceInStringConfig
  | LlmConfig
  | GroupByConfig
  | JoinConfig
  | UnionConfig
  | SinkConfig;

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
  lastRunStatus?: RunStatus | null;
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

export type RunStatus = 'SUCCESS' | 'FAILED' | 'RUNNING' | 'SKIPPED' | 'WAITING' | 'PENDING';

export type FailStage =
  | 'SOURCE_READ'
  | 'TYPE_MAPPING'
  | 'STREAM_LOAD'
  | 'SINK_WRITE'
  | 'DORIS_EXEC'
  | 'VALIDATE'
  | 'OTHER';

export interface NodeRunWatermark {
  column: string | null;
  value: string | null;
  lastRowid: number | null;
  committedRows: number | null;
  lastBatchNo: number | null;
}

export interface NodeRun {
  nodeId: string;
  nodeType?: string;
  nodeName: string;
  status: RunStatus;
  rows: number | null;
  durationMs: number | null;
  sql?: string;
  logs: string[];
  errorStack?: string;
  failStage?: FailStage | string;
  targetTable?: string;
  writeMode?: string | null;
  errorCode?: number | null;
  sqlText?: string | null;
  params?: string | null;
  watermark?: NodeRunWatermark | null;
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
  runType?: 'FULL' | 'NODE' | 'MIDDLE';
  targetNodeId?: string | null;
  errMsg?: string | null;
  nodes: NodeRun[];
}

export interface FlowDeleteResult {
  deletedTables: string[];
  failedTables: Array<{ dorisTable: string; reason?: string }>;
}

export interface NodeDataPreview {
  columns: ColumnInfo[];
  rows: unknown[][];
  truncated: boolean;
  source: 'SOURCE_DB' | 'DORIS' | 'MOCK' | 'LLM' | string;
  sql?: string;
  displaySql?: string;
  params?: unknown[];
  sink?: SinkPreviewMeta;
  /** 大模型节点预览附加信息：真实调用模型的次数与分批数。 */
  llm?: { calls?: number; batches?: number } | null;
}

export interface NodeLogs {
  sqlText?: string | null;
  sqlParams?: string | null;
  list: Array<{ time?: string; level?: string; message: string }>;
}

/** 契约字段名冻结：GET /flow-run/{runId}/node/{nodeId}/error-detail */
export interface NodeErrorDetail {
  runId: string | number;
  nodeId: string;
  nodeName: string;
  status: string;
  errorCode: number | null;
  failStage: string | null;
  errMsg: string | null;
  sqlText: string | null;
  sqlParams: string | null;
  errorUrl: string | null;
  streamLoadLog: string | null;
  streamLoadLogTruncated: boolean | null;
  fetchError: string | null;
}
