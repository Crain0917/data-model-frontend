/**
 * 源库类型 → Doris 类型归一化，仅用于前端展示。
 * 规则逐条对齐后端 TypeMappingRegistry（MySQL / Oracle / DM8 / Doris），
 * 不写回 dagJson，也不参与存储。
 */

const DORIS_NATIVE_BASES = new Set([
  'BOOLEAN',
  'TINYINT',
  'SMALLINT',
  'INT',
  'BIGINT',
  'LARGEINT',
  'FLOAT',
  'DOUBLE',
  'DECIMAL',
  'CHAR',
  'VARCHAR',
  'STRING',
  'DATE',
  'DATETIME',
  'DATETIMEV2',
  'DATEV2',
  'JSON',
  'ARRAY',
  'MAP',
  'STRUCT',
  'VARIANT',
  'HLL',
  'BITMAP',
  'IPV4',
  'IPV6',
]);

const DORIS_PASSTHROUGH = new Set(['BOOLEAN', 'LARGEINT', 'STRING', 'JSON', 'DATETIMEV2']);

const DORIS_COMPLEX_RE = /^(ARRAY|MAP|STRUCT|VARIANT|HLL|BITMAP|IPV4|IPV6)\b/;

interface ParsedType {
  original: string;
  base: string;
  params: string;
  unsigned: boolean;
}

function parseType(raw: string): ParsedType {
  const original = raw.trim().replace(/\s+/g, ' ');
  let upper = original.toUpperCase();
  let unsigned = false;
  // 只剥离括号外的 UNSIGNED / ZEROFILL，避免 ENUM('unsigned') 之类的字面量被误伤。
  upper = upper.replace(/\([^)]*\)|\bUNSIGNED\b|\bZEROFILL\b/g, (match) => {
    if (match === 'UNSIGNED' || match === 'ZEROFILL') {
      unsigned = true;
      return ' ';
    }
    return match;
  });
  upper = upper.replace(/\s+/g, ' ').trim();

  const paren = upper.indexOf('(');
  let base = paren >= 0 ? upper.slice(0, paren).trim() : upper;
  let params = '';
  if (paren >= 0) {
    const close = upper.indexOf(')', paren);
    if (close > paren) params = upper.slice(paren + 1, close).trim();
  }
  // 与后端 Parsed 一致：TIMESTAMP WITH TIME ZONE / INTERVAL ... / DOUBLE PRECISION 归一到主类型。
  if (base.startsWith('TIMESTAMP')) base = 'TIMESTAMP';
  else if (base.startsWith('INTERVAL')) base = 'INTERVAL';
  else if (base.startsWith('DOUBLE')) base = 'DOUBLE';

  return { original, base, params, unsigned };
}

function param(p: ParsedType, index: number, defaultValue: number): number {
  if (!p.params) return defaultValue;
  const parts = p.params.split(',');
  if (index >= parts.length) return defaultValue;
  const value = Number.parseInt(parts[index].trim(), 10);
  return Number.isFinite(value) ? value : defaultValue;
}

function fsp(p: ParsedType): number {
  const value = param(p, 0, 0);
  if (value <= 0) return 0;
  return Math.min(value, 6);
}

function decimalType(p: ParsedType): string {
  const precision = param(p, 0, -1);
  const scale = param(p, 1, 0);
  if (precision <= 0 || precision > 38) return 'STRING';
  return `DECIMAL(${precision},${Math.max(0, scale)})`;
}

function charType(p: ParsedType): string {
  const len = param(p, 0, -1);
  if (len <= 0) return 'STRING';
  if (len <= 255) return `CHAR(${len})`;
  if (len <= 65533) return `VARCHAR(${len})`;
  return 'STRING';
}

function varcharType(p: ParsedType, max = 65533): string {
  const len = param(p, 0, -1);
  if (len <= 0) return 'STRING';
  if (len <= max) return `VARCHAR(${len})`;
  return 'STRING';
}

function bitType(p: ParsedType): string {
  const n = param(p, 0, 1);
  if (n <= 1) return 'BOOLEAN';
  if (n <= 64) return 'BIGINT';
  return 'STRING';
}

function datetimeType(p: ParsedType): string {
  const precision = fsp(p);
  return precision > 0 ? `DATETIMEV2(${precision})` : 'DATETIME';
}

function mapMysql(p: ParsedType): string {
  switch (p.base) {
    case 'TINYINT':
      return p.unsigned ? 'SMALLINT' : 'TINYINT';
    case 'SMALLINT':
      return p.unsigned ? 'INT' : 'SMALLINT';
    case 'MEDIUMINT':
      return 'INT';
    case 'INT':
    case 'INTEGER':
      return p.unsigned ? 'BIGINT' : 'INT';
    case 'BIGINT':
      return p.unsigned ? 'LARGEINT' : 'BIGINT';
    case 'DECIMAL':
    case 'NUMERIC':
    case 'DEC':
      return decimalType(p);
    case 'FLOAT':
      return 'FLOAT';
    case 'DOUBLE':
    case 'REAL':
      return 'DOUBLE';
    case 'CHAR':
      return charType(p);
    case 'VARCHAR':
    case 'CHARACTER VARYING':
      return varcharType(p);
    case 'TINYTEXT':
    case 'TEXT':
    case 'MEDIUMTEXT':
    case 'LONGTEXT':
    case 'TINYBLOB':
    case 'BLOB':
    case 'MEDIUMBLOB':
    case 'LONGBLOB':
      return 'STRING';
    case 'DATE':
      return 'DATE';
    case 'DATETIME':
      return datetimeType(p);
    case 'TIMESTAMP':
      return 'DATETIME';
    case 'TIME':
      return 'STRING';
    case 'YEAR':
      return 'SMALLINT';
    case 'ENUM':
    case 'SET':
      return 'STRING';
    case 'BIT':
      return bitType(p);
    case 'JSON':
      return 'JSON';
    case 'BOOLEAN':
    case 'BOOL':
      return 'BOOLEAN';
    case 'GEOMETRY':
    case 'POINT':
    case 'LINESTRING':
    case 'POLYGON':
      return 'STRING';
    default:
      return 'STRING';
  }
}

function mapOracle(p: ParsedType): string {
  switch (p.base) {
    case 'NUMBER':
    case 'DECIMAL':
    case 'NUMERIC':
      return p.params ? decimalType(p) : 'DOUBLE';
    case 'INTEGER':
    case 'INT':
    case 'SMALLINT':
      return 'DECIMAL(38,0)';
    case 'FLOAT':
    case 'BINARY_FLOAT':
      return 'FLOAT';
    case 'BINARY_DOUBLE':
      return 'DOUBLE';
    case 'CHAR':
    case 'NCHAR':
      return charType(p);
    case 'VARCHAR2':
    case 'NVARCHAR2':
    case 'VARCHAR':
    case 'CHARACTER VARYING':
      return varcharType(p);
    case 'CLOB':
    case 'NCLOB':
    case 'LONG':
    case 'BLOB':
    case 'RAW':
    case 'LONG RAW':
      return 'STRING';
    case 'DATE':
      return 'DATETIME';
    case 'TIMESTAMP':
      return `DATETIMEV2(${fsp(p)})`;
    case 'INTERVAL':
    case 'ROWID':
    case 'UROWID':
      return 'STRING';
    case 'BOOLEAN':
      return 'BOOLEAN';
    default:
      return 'STRING';
  }
}

function mapDm(p: ParsedType): string {
  switch (p.base) {
    case 'TINYINT':
      return 'TINYINT';
    case 'SMALLINT':
      return 'SMALLINT';
    case 'INT':
    case 'INTEGER':
      return 'INT';
    case 'BIGINT':
      return 'BIGINT';
    case 'DECIMAL':
    case 'NUMERIC':
    case 'NUMBER':
      return p.params ? decimalType(p) : 'DOUBLE';
    case 'FLOAT':
    case 'DOUBLE':
    case 'REAL':
      return 'DOUBLE';
    case 'CHAR':
    case 'CHARACTER':
      return charType(p);
    case 'VARCHAR':
    case 'VARCHAR2':
      return varcharType(p);
    case 'TEXT':
    case 'CLOB':
    case 'BLOB':
    case 'BINARY':
    case 'VARBINARY':
      return 'STRING';
    case 'DATE':
      return 'DATE';
    case 'TIME':
      return 'STRING';
    case 'DATETIME':
    case 'TIMESTAMP':
      return 'DATETIME';
    case 'BIT':
    case 'BOOLEAN':
      return 'BOOLEAN';
    default:
      return 'STRING';
  }
}

function isDorisNative(p: ParsedType): boolean {
  return DORIS_NATIVE_BASES.has(p.base) || DORIS_COMPLEX_RE.test(p.base);
}

/** 已是 Doris 类型的值按 Doris 规则幂等归一，不二次降级。 */
function canonicalNative(p: ParsedType): string {
  if (DORIS_PASSTHROUGH.has(p.base)) {
    if (p.base === 'DATETIMEV2') {
      const precision = param(p, 0, 0);
      if (precision > 6) return 'DATETIMEV2(6)';
      return precision > 0 ? `DATETIMEV2(${precision})` : 'DATETIMEV2';
    }
    return p.base;
  }
  if (DORIS_COMPLEX_RE.test(p.base)) return p.original;
  switch (p.base) {
    case 'DECIMAL':
      return decimalType(p);
    case 'CHAR':
      return charType(p);
    case 'VARCHAR':
      return varcharType(p);
    case 'DATETIME':
      return datetimeType(p);
    case 'BOOLEAN':
    case 'LARGEINT':
    case 'STRING':
    case 'JSON':
      return p.base;
    default:
      return p.base;
  }
}

function mapAuto(p: ParsedType): string {
  switch (p.base) {
    case 'VARCHAR2':
    case 'NVARCHAR2':
      return varcharType(p);
    case 'NCHAR':
      return charType(p);
    case 'CLOB':
    case 'NCLOB':
    case 'LONG':
    case 'RAW':
    case 'LONG RAW':
    case 'ROWID':
    case 'UROWID':
      return 'STRING';
    case 'NUMBER':
      return p.params ? decimalType(p) : 'DOUBLE';
    case 'BINARY_FLOAT':
      return 'FLOAT';
    case 'BINARY_DOUBLE':
      return 'DOUBLE';
    default:
      return mapMysql(p);
  }
}

/**
 * 把源库原始类型归一到 Doris 类型。
 * dialect 已知时（MYSQL / ORACLE / DM8 / DORIS）按对应方言映射；
 * 未知时按通用规则（MySQL 规则 + Oracle/DM 专有类型名）。
 */
export function normalizeDorisType(rawType?: string | null, dialect?: string | null): string {
  const raw = String(rawType ?? '').trim();
  if (!raw) return 'STRING';
  const p = parseType(raw);
  const d = String(dialect ?? '').trim().toUpperCase();

  if (!p.unsigned && isDorisNative(p)) return canonicalNative(p);

  switch (d) {
    case 'ORACLE':
      return mapOracle(p);
    case 'DM8':
    case 'DM':
    case 'DAMENG':
      return mapDm(p);
    case 'MYSQL':
      return mapMysql(p);
    case 'DORIS':
      // 后端 normalizeDorisType 对非原生类型走 MySQL 规则。
      return mapMysql(p);
    default:
      return mapAuto(p);
  }
}

/** 展示用类型文案；空类型返回空串，交给调用方显示占位符。 */
export function displayDorisType(rawType?: string | null, dialect?: string | null): string {
  const raw = String(rawType ?? '').trim();
  return raw ? normalizeDorisType(raw, dialect) : '';
}

/** 原始类型与归一化不同时提示「源类型 → Doris」，否则给出纯归一化提示。 */
export function typeTooltip(rawType?: string | null, normalized?: string | null): string {
  const raw = String(rawType ?? '').trim();
  const norm = String(normalized ?? '').trim();
  if (!norm) return '未知类型';
  return raw && raw !== norm ? `源类型：${raw} → Doris：${norm}` : `Doris 归一化类型：${norm}`;
}
