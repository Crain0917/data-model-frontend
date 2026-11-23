import type { CalcOperation, CalcReturnType, CalculatorRow } from '../types';

export type CalcArgMode = 'FIELD' | 'LITERAL';

export interface CalcOpDoc {
  /** 作用、参数含义与注意事项 */
  description: string;
  /** 输入示例，例如 A=2.5，B=0 */
  exampleInput: string;
  /** 输出示例，例如 2（银行家舍入） */
  exampleOutput: string;
}

export interface CalcOpMeta extends CalcOpDoc {
  value: CalcOperation;
  group: string;
  label: string;
  /** 需要的参数个数：1 = A，2 = A+B，3 = A+B+C */
  arity: 1 | 2 | 3;
  /** B 只能是常量（DATE_FORMAT / DATE_PARSE 的格式掩码） */
  bLiteralOnly?: boolean;
  /** B 可留空（ROUND / STDROUND 默认 0 位） */
  bOptional?: boolean;
  /** B 缺省参数形态 */
  bMode?: CalcArgMode;
  bDefaultLiteral?: string;
  bPlaceholder?: string;
  /** C 仅常量 */
  cMode?: CalcArgMode;
  defaultReturn: CalcReturnType;
  returnTypes: CalcReturnType[];
}

const NUMERIC: CalcReturnType[] = ['DOUBLE', 'DECIMAL', 'BIGINT', 'INT'];
const DATE_ADD: CalcReturnType[] = ['DATE', 'DATETIME'];
const DATE_DIFF: CalcReturnType[] = ['BIGINT', 'INT'];
const DATE_EXTRACT: CalcReturnType[] = ['INT', 'BIGINT'];
const DATE_PARSE: CalcReturnType[] = ['DATETIME', 'DATE'];
const STRING: CalcReturnType[] = ['STRING'];

const DATE_ADD_OPS: Array<[CalcOperation, string]> = [
  ['DATE_ADD_DAYS', 'DATE_ADD_DAYS(A, B)'],
  ['DATE_SUB_DAYS', 'DATE_SUB_DAYS(A, B)'],
  ['DATE_ADD_MONTHS', 'DATE_ADD_MONTHS(A, B)'],
  ['DATE_SUB_MONTHS', 'DATE_SUB_MONTHS(A, B)'],
  ['DATE_ADD_HOURS', 'DATE_ADD_HOURS(A, B)'],
  ['DATE_SUB_HOURS', 'DATE_SUB_HOURS(A, B)'],
  ['DATE_ADD_MINUTES', 'DATE_ADD_MINUTES(A, B)'],
  ['DATE_SUB_MINUTES', 'DATE_SUB_MINUTES(A, B)'],
  ['DATE_ADD_SECONDS', 'DATE_ADD_SECONDS(A, B)'],
  ['DATE_SUB_SECONDS', 'DATE_SUB_SECONDS(A, B)'],
];

const DATE_DIFF_OPS: Array<[CalcOperation, string]> = [
  ['DATE_DIFF_DAYS', 'DATE_DIFF_DAYS(A, B)'],
  ['DATE_DIFF_HOURS', 'DATE_DIFF_HOURS(A, B)'],
  ['DATE_DIFF_MINUTES', 'DATE_DIFF_MINUTES(A, B)'],
  ['DATE_DIFF_SECONDS', 'DATE_DIFF_SECONDS(A, B)'],
];

const DATE_EXTRACT_OPS: Array<[CalcOperation, string]> = [
  ['YEAR_OF_DATE', 'YEAR_OF_DATE(A)'],
  ['MONTH_OF_DATE', 'MONTH_OF_DATE(A)'],
  ['DAY_OF_MONTH', 'DAY_OF_MONTH(A)'],
  ['DAY_OF_WEEK', 'DAY_OF_WEEK(A)'],
  ['DAY_OF_YEAR', 'DAY_OF_YEAR(A)'],
  ['WEEK_OF_YEAR', 'WEEK_OF_YEAR(A)'],
  ['QUARTER_OF_DATE', 'QUARTER_OF_DATE(A)'],
  ['HOUR_OF_DAY', 'HOUR_OF_DAY(A)'],
  ['MINUTE_OF_HOUR', 'MINUTE_OF_HOUR(A)'],
  ['SECOND_OF_MINUTE', 'SECOND_OF_MINUTE(A)'],
];

const STRING_UNARY_OPS: Array<[CalcOperation, string]> = [
  ['UPPER', 'UPPER(A)'],
  ['LOWER', 'LOWER(A)'],
  ['INITCAP', 'INITCAP(A)'],
  ['TRIM', 'TRIM(A)'],
  ['LTRIM', 'LTRIM(A)'],
  ['RTRIM', 'RTRIM(A)'],
];

/** 每个算子的中文说明与输入/输出示例；示例已核对 Doris（192.168.10.13:9030）实际语义。 */
export const CALC_OP_DOCS: Record<CalcOperation, CalcOpDoc> = {
  // 算术：Doris 中任一操作数为 NULL，结果即为 NULL
  ADD: {
    description: 'A + B：数值相加。任一参数为 NULL 时结果即为 NULL。',
    exampleInput: 'A=3，B=2',
    exampleOutput: '5',
  },
  SUBTRACT: {
    description: 'A - B：数值相减。任一参数为 NULL 时结果即为 NULL。',
    exampleInput: 'A=3，B=2',
    exampleOutput: '1',
  },
  MULTIPLY: {
    description: 'A × B：数值相乘。任一参数为 NULL 时结果即为 NULL。',
    exampleInput: 'A=3，B=2',
    exampleOutput: '6',
  },
  DIVIDE: {
    description: 'A ÷ B：数值相除，结果为小数；除数为 0 时返回 NULL（不报错）。',
    exampleInput: 'A=7，B=2',
    exampleOutput: '3.5',
  },
  MOD: {
    description: 'A % B：取余数；除数为 0 时返回 NULL。',
    exampleInput: 'A=7，B=3',
    exampleOutput: '1',
  },
  ADD3: {
    description: 'A + B + C：三个数值相加。',
    exampleInput: 'A=1，B=2，C=3',
    exampleOutput: '6',
  },
  MULTIPLY3: {
    description: 'A × B × C：三个数值相乘。',
    exampleInput: 'A=1，B=2，C=3',
    exampleOutput: '6',
  },
  AVG3: {
    description: '（A + B + C）÷ 3：三个数值的平均值，结果为小数。',
    exampleInput: 'A=1，B=2，C=3',
    exampleOutput: '2',
  },
  MIN: {
    description: '取 A、B 中较小的值（Doris LEAST）；任一参数为 NULL 时结果为 NULL。',
    exampleInput: 'A=3，B=5',
    exampleOutput: '3',
  },
  MAX: {
    description: '取 A、B 中较大的值（Doris GREATEST）；任一参数为 NULL 时结果为 NULL。',
    exampleInput: 'A=3，B=5',
    exampleOutput: '5',
  },

  // 取整 / 空值
  ROUND: {
    description:
      '银行家舍入：按 B 指定的小数位保留，恰好为 .5 时取最近的偶数；B 留空按 0 位。与 SQL 常见的四舍五入不同。',
    exampleInput: 'A=2.5，B=0',
    exampleOutput: '2（银行家舍入）',
  },
  STDROUND: {
    description:
      '标准四舍五入（Doris ROUND）：按 B 指定的小数位保留，.5 时向远离 0 的方向进位；B 留空按 0 位。',
    exampleInput: 'A=2.5，B=0',
    exampleOutput: '3',
  },
  CEIL: {
    description: '向上取整：不小于 A 的最小整数，返回 DOUBLE。',
    exampleInput: 'A=2.1',
    exampleOutput: '3',
  },
  FLOOR: {
    description: '向下取整：不大于 A 的最大整数，返回 DOUBLE。',
    exampleInput: 'A=2.9',
    exampleOutput: '2',
  },
  NVL: {
    description: 'A 为 NULL 时返回 B，否则返回 A（Doris IFNULL）；空字符串不算空值。',
    exampleInput: 'A=NULL，B=0',
    exampleOutput: '0',
  },

  // 日期加减：B 只能是整数常量，返回 DATETIME
  DATE_ADD_DAYS: {
    description: 'A 加 B 天，B 为整数常量；保留原时分秒。',
    exampleInput: 'A=2024-03-05，B=2',
    exampleOutput: '2024-03-07 00:00:00',
  },
  DATE_SUB_DAYS: {
    description: 'A 减 B 天，B 为整数常量；保留原时分秒。',
    exampleInput: 'A=2024-03-05，B=2',
    exampleOutput: '2024-03-03 00:00:00',
  },
  DATE_ADD_MONTHS: {
    description:
      'A 加 B 个月，B 为整数常量；目标月份没有对应日期时取该月最后一天（月末截断）。',
    exampleInput: 'A=2024-01-31，B=1',
    exampleOutput: '2024-02-29',
  },
  DATE_SUB_MONTHS: {
    description: 'A 减 B 个月，B 为整数常量；目标月份没有对应日期时取该月最后一天。',
    exampleInput: 'A=2024-03-31，B=1',
    exampleOutput: '2024-02-29',
  },
  DATE_ADD_HOURS: {
    description: 'A 加 B 小时，B 为整数常量；跨天时日期自动进位。',
    exampleInput: 'A=2024-03-05 14:08:09，B=2',
    exampleOutput: '2024-03-05 16:08:09',
  },
  DATE_SUB_HOURS: {
    description: 'A 减 B 小时，B 为整数常量；跨天时日期自动退位。',
    exampleInput: 'A=2024-03-05 14:08:09，B=2',
    exampleOutput: '2024-03-05 12:08:09',
  },
  DATE_ADD_MINUTES: {
    description: 'A 加 B 分钟，B 为整数常量。',
    exampleInput: 'A=2024-03-05 14:08:09，B=30',
    exampleOutput: '2024-03-05 14:38:09',
  },
  DATE_SUB_MINUTES: {
    description: 'A 减 B 分钟，B 为整数常量。',
    exampleInput: 'A=2024-03-05 14:08:09，B=30',
    exampleOutput: '2024-03-05 13:38:09',
  },
  DATE_ADD_SECONDS: {
    description: 'A 加 B 秒，B 为整数常量。',
    exampleInput: 'A=2024-03-05 14:08:09，B=30',
    exampleOutput: '2024-03-05 14:08:39',
  },
  DATE_SUB_SECONDS: {
    description: 'A 减 B 秒，B 为整数常量。',
    exampleInput: 'A=2024-03-05 14:08:09，B=30',
    exampleOutput: '2024-03-05 14:07:39',
  },

  // 日期差值：A - B，可为负数
  DATE_DIFF_DAYS: {
    description:
      'A 的日期减 B 的日期，只比较日期部分（忽略时分秒），结果为整天数，可为负数。',
    exampleInput: 'A=2024-03-05，B=2024-03-01',
    exampleOutput: '4',
  },
  DATE_DIFF_HOURS: {
    description:
      'A 减 B 的小时数（Doris TIMESTAMPDIFF），不足 1 小时向零截断，可为负数。',
    exampleInput: 'A=2024-03-05 02:30:00，B=2024-03-04 23:00:00',
    exampleOutput: '3',
  },
  DATE_DIFF_MINUTES: {
    description: 'A 减 B 的分钟数，不足 1 分钟向零截断，可为负数。',
    exampleInput: 'A=2024-03-05 10:01:30，B=2024-03-05 10:00:00',
    exampleOutput: '1',
  },
  DATE_DIFF_SECONDS: {
    description: 'A 减 B 的秒数，可为负数。',
    exampleInput: 'A=2024-03-05 10:01:30，B=2024-03-05 10:00:00',
    exampleOutput: '90',
  },

  // 日期提取
  YEAR_OF_DATE: {
    description: '提取年份（四位）。',
    exampleInput: 'A=2024-03-05',
    exampleOutput: '2024',
  },
  MONTH_OF_DATE: {
    description: '提取月份（1–12）。',
    exampleInput: 'A=2024-03-05',
    exampleOutput: '3',
  },
  DAY_OF_MONTH: {
    description: '提取当月第几天（1–31）。',
    exampleInput: 'A=2024-03-05',
    exampleOutput: '5',
  },
  DAY_OF_WEEK: {
    description: '提取星期序号：1=周日、2=周一、3=周二 … 7=周六（Doris DAYOFWEEK）。',
    exampleInput: 'A=2024-03-05（周二）',
    exampleOutput: '3',
  },
  DAY_OF_YEAR: {
    description: '提取当年第几天（1–366）。',
    exampleInput: 'A=2024-03-05',
    exampleOutput: '65',
  },
  WEEK_OF_YEAR: {
    description:
      '提取年内周序号：按 Doris WEEK() 默认模式，周日为一周起点，年初不满一周记第 0 周。',
    exampleInput: 'A=2024-03-05',
    exampleOutput: '9（2024-01-01 属第 0 周）',
  },
  QUARTER_OF_DATE: {
    description: '提取季度（1–4）。',
    exampleInput: 'A=2024-05-05',
    exampleOutput: '2',
  },
  HOUR_OF_DAY: {
    description: '提取小时（0–23，24 小时制）。',
    exampleInput: 'A=2024-03-05 14:08:09',
    exampleOutput: '14',
  },
  MINUTE_OF_HOUR: {
    description: '提取分钟（0–59）。',
    exampleInput: 'A=2024-03-05 14:08:09',
    exampleOutput: '8',
  },
  SECOND_OF_MINUTE: {
    description: '提取秒（0–59）。',
    exampleInput: 'A=2024-03-05 14:08:09',
    exampleOutput: '9',
  },

  // 日期格式化 / 解析：B 只能填常量掩码
  DATE_FORMAT: {
    description:
      '按格式掩码把日期/时间转成字符串。常用掩码：%Y 四位年、%m 月、%d 日、%H 24 小时、%i 分钟、%s 秒；B 只能填常量。',
    exampleInput: 'A=2024-03-05 14:08:09，B=%Y-%m-%d',
    exampleOutput: '"2024-03-05"',
  },
  DATE_PARSE: {
    description:
      '按格式掩码把字符串解析为 DATETIME（Doris STR_TO_DATE）；常用掩码同上，B 只能填常量，解析失败返回 NULL。',
    exampleInput: 'A=2024/03/05，B=%Y/%m/%d',
    exampleOutput: '2024-03-05 00:00:00',
  },

  // 字符串
  UPPER: {
    description: '把字母全部转为大写。',
    exampleInput: 'A="Hello World"',
    exampleOutput: '"HELLO WORLD"',
  },
  LOWER: {
    description: '把字母全部转为小写。',
    exampleInput: 'A="Hello World"',
    exampleOutput: '"hello world"',
  },
  INITCAP: {
    description: '每个单词首字母大写，其余字母小写。',
    exampleInput: 'A="hello world"',
    exampleOutput: '"Hello World"',
  },
  TRIM: {
    description: '去掉字符串首尾的空格。',
    exampleInput: 'A="  abc  "',
    exampleOutput: '"abc"',
  },
  LTRIM: {
    description: '只去掉字符串左侧（开头）的空格。',
    exampleInput: 'A="  abc  "',
    exampleOutput: '"abc  "',
  },
  RTRIM: {
    description: '只去掉字符串右侧（结尾）的空格。',
    exampleInput: 'A="  abc  "',
    exampleOutput: '"  abc"',
  },
  LENGTH: {
    description: '字符串的字节长度（UTF-8 下中文每字 3 字节），不是字符个数。',
    exampleInput: 'A="abc"',
    exampleOutput: '3（"中文" 为 6）',
  },
  SUBSTRING: {
    description:
      '从 A 的第 B 个字符开始取 C 个字符，B 从 1 开始计数，B/C 只能填常量。',
    exampleInput: 'A="abcdef"，B=2，C=3',
    exampleOutput: '"bcd"',
  },
  LEFT: {
    description: '取字符串左侧的 B 个字符。',
    exampleInput: 'A="abcdef"，B=2',
    exampleOutput: '"ab"',
  },
  RIGHT: {
    description: '取字符串右侧的 B 个字符。',
    exampleInput: 'A="abcdef"，B=2',
    exampleOutput: '"ef"',
  },
  REPLACE: {
    description: '把 A 中所有 B 替换为 C，B/C 只能填常量。',
    exampleInput: 'A="a-b-c"，B="-" ，C="/"',
    exampleOutput: '"a/b/c"',
  },
  CONCAT2: {
    description: '拼接 A、B 两个字符串；任一为 NULL 时结果为 NULL。',
    exampleInput: 'A="a"，B="b"',
    exampleOutput: '"ab"',
  },
  CONCAT3: {
    description: '拼接 A、B、C 三个字符串；任一为 NULL 时结果为 NULL。',
    exampleInput: 'A="a"，B="b"，C="c"',
    exampleOutput: '"abc"',
  },
  LPAD: {
    description:
      '用字符 C 在左侧补足，直到字符串长度为 B；B 为长度常量，C 为填充字符常量。',
    exampleInput: 'A="7"，B=3，C="0"',
    exampleOutput: '"007"',
  },
  RPAD: {
    description:
      '用字符 C 在右侧补足，直到字符串长度为 B；B 为长度常量，C 为填充字符常量。',
    exampleInput: 'A="7"，B=3，C="0"',
    exampleOutput: '"700"',
  },
};

function meta(
  value: CalcOperation,
  group: string,
  label: string,
  arity: 1 | 2 | 3,
  defaultReturn: CalcReturnType,
  returnTypes: CalcReturnType[],
  extra: Partial<CalcOpMeta> = {},
): CalcOpMeta {
  return {
    value,
    group,
    label,
    arity,
    defaultReturn,
    returnTypes,
    ...CALC_OP_DOCS[value],
    ...extra,
  };
}

export const CALC_OPS: CalcOpMeta[] = [
  meta('ADD', '算术', 'A + B', 2, 'DOUBLE', NUMERIC),
  meta('SUBTRACT', '算术', 'A - B', 2, 'DOUBLE', NUMERIC),
  meta('MULTIPLY', '算术', 'A × B', 2, 'DOUBLE', NUMERIC),
  meta('DIVIDE', '算术', 'A ÷ B', 2, 'DOUBLE', NUMERIC),
  meta('MOD', '算术', 'A % B', 2, 'DOUBLE', NUMERIC),
  meta('ADD3', '算术', 'A + B + C', 3, 'DOUBLE', NUMERIC),
  meta('MULTIPLY3', '算术', 'A × B × C', 3, 'DOUBLE', NUMERIC),
  meta('AVG3', '算术', '(A + B + C) ÷ 3', 3, 'DOUBLE', NUMERIC),
  meta('MIN', '算术', 'MIN(A, B)', 2, 'DOUBLE', NUMERIC),
  meta('MAX', '算术', 'MAX(A, B)', 2, 'DOUBLE', NUMERIC),

  meta('ROUND', '取整 / 空值', 'ROUND(A, B) 银行家舍入', 2, 'DOUBLE', NUMERIC, {
    bMode: 'LITERAL',
    bOptional: true,
    bDefaultLiteral: '0',
    bPlaceholder: '小数位，默认 0',
  }),
  meta('STDROUND', '取整 / 空值', 'STDROUND(A, B) 四舍五入', 2, 'DOUBLE', NUMERIC, {
    bMode: 'LITERAL',
    bOptional: true,
    bDefaultLiteral: '0',
    bPlaceholder: '小数位，默认 0',
  }),
  meta('CEIL', '取整 / 空值', 'CEIL(A)', 1, 'DOUBLE', NUMERIC),
  meta('FLOOR', '取整 / 空值', 'FLOOR(A)', 1, 'DOUBLE', NUMERIC),
  meta('NVL', '取整 / 空值', 'NVL(A, B) A 为空时取 B', 2, 'DOUBLE', NUMERIC),

  ...DATE_ADD_OPS.map(([value, label]) =>
    meta(value, '日期', label, 2, 'DATETIME', DATE_ADD, {
      bMode: 'LITERAL',
      bDefaultLiteral: '1',
      bPlaceholder: '数量',
    }),
  ),
  ...DATE_DIFF_OPS.map(([value, label]) =>
    meta(value, '日期', label, 2, 'BIGINT', DATE_DIFF),
  ),
  ...DATE_EXTRACT_OPS.map(([value, label]) =>
    meta(value, '日期', label, 1, 'INT', DATE_EXTRACT),
  ),
  meta('DATE_FORMAT', '日期', 'DATE_FORMAT(A, B)', 2, 'STRING', STRING, {
    bLiteralOnly: true,
    bPlaceholder: '%Y-%m-%d %H:%i:%s',
  }),
  meta('DATE_PARSE', '日期', 'DATE_PARSE(A, B)', 2, 'DATETIME', DATE_PARSE, {
    bLiteralOnly: true,
    bPlaceholder: '%Y-%m-%d %H:%i:%s',
  }),

  ...STRING_UNARY_OPS.map(([value, label]) =>
    meta(value, '字符串', label, 1, 'STRING', STRING),
  ),
  meta('LENGTH', '字符串', 'LENGTH(A)', 1, 'INT', ['INT', 'BIGINT']),
  meta('SUBSTRING', '字符串', 'SUBSTRING(A, B, C)', 3, 'STRING', STRING, {
    bMode: 'LITERAL',
    bDefaultLiteral: '1',
    bPlaceholder: '起始位置',
    cMode: 'LITERAL',
  }),
  meta('LEFT', '字符串', 'LEFT(A, B)', 2, 'STRING', STRING),
  meta('RIGHT', '字符串', 'RIGHT(A, B)', 2, 'STRING', STRING),
  meta('REPLACE', '字符串', 'REPLACE(A, B, C)', 3, 'STRING', STRING, {
    bMode: 'LITERAL',
    cMode: 'LITERAL',
  }),
  meta('CONCAT2', '字符串', 'CONCAT(A, B)', 2, 'STRING', STRING),
  meta('CONCAT3', '字符串', 'CONCAT(A, B, C)', 3, 'STRING', STRING),
  meta('LPAD', '字符串', 'LPAD(A, B, C)', 3, 'STRING', STRING, {
    bMode: 'LITERAL',
    cMode: 'LITERAL',
  }),
  meta('RPAD', '字符串', 'RPAD(A, B, C)', 3, 'STRING', STRING, {
    bMode: 'LITERAL',
    cMode: 'LITERAL',
  }),
];

const OP_MAP: Record<string, CalcOpMeta> = Object.fromEntries(
  CALC_OPS.map((op) => [op.value, op]),
);

export function calcOp(value: string | undefined | null): CalcOpMeta {
  return OP_MAP[String(value || 'ADD').toUpperCase()] || OP_MAP.ADD;
}

export function calcOpGroups(): Array<{ label: string; options: Array<{ value: CalcOperation; label: string }> }> {
  const groups: Array<{ label: string; options: Array<{ value: CalcOperation; label: string }> }> = [];
  CALC_OPS.forEach((op) => {
    let group = groups.find((g) => g.label === op.group);
    if (!group) {
      group = { label: op.group, options: [] };
      groups.push(group);
    }
    group.options.push({ value: op.value, label: op.label });
  });
  return groups;
}

export function argBMode(row: CalculatorRow): CalcArgMode {
  return row.argBType === 'LITERAL' ? 'LITERAL' : 'FIELD';
}

export function argCMode(row: CalculatorRow): CalcArgMode {
  return row.argCType === 'LITERAL' ? 'LITERAL' : 'FIELD';
}

function empty(value: string | null | undefined): boolean {
  return value == null || String(value).trim() === '';
}

/** 行内校验：返回第一条错误；完整时返回 null。 */
export function calcRowIssue(row: CalculatorRow): string | null {
  const op = calcOp(row.operation);
  if (!String(row.output || '').trim()) return '请填写输出字段名';
  if (empty(row.fieldA)) return '请选择字段 A';
  if (op.arity >= 2) {
    const mode = op.bLiteralOnly ? 'LITERAL' : argBMode(row);
    if (mode === 'FIELD') {
      if (empty(row.fieldB)) return '请选择字段 B';
    } else if (!op.bOptional && empty(row.literalB)) {
      return op.value === 'DATE_FORMAT' || op.value === 'DATE_PARSE'
        ? '请填写日期格式，例如 %Y-%m-%d'
        : '请填写常量 B';
    }
  }
  if (op.arity >= 3) {
    const mode = op.cMode || argCMode(row);
    if (mode === 'FIELD') {
      if (empty(row.fieldC)) return '请选择字段 C';
    } else if (empty(row.literalC)) {
      return '请填写常量 C';
    }
  }
  return null;
}

/** 是否满足执行条件；精度的合法性由面板单独提示。 */
export function isCalcRowComplete(row: CalculatorRow): boolean {
  return calcRowIssue(row) == null;
}
