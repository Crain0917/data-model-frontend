import { Button, Input, Select } from 'antd';
import { DeleteOutlined, PlusOutlined, RightOutlined } from '@ant-design/icons';
import type { ConditionRow, FieldDef } from '../../../types';
import { conditionsSql, OPERATOR_OPTIONS } from '../../../utils/dagUtils';
import { fieldOptions } from './common';

const EMPTY_COND: ConditionRow = {
  logic: 'AND',
  indent: 0,
  left: '',
  op: 'EQ',
  rightType: 'CONST',
  right: '',
};

interface Props {
  conditions: ConditionRow[];
  fields: FieldDef[];
  alias?: string;
  onChange: (conditions: ConditionRow[]) => void;
  allowRegexp?: boolean;
  emptyText?: string;
  showSql?: boolean;
}

export default function ConditionEditor({
  conditions,
  fields,
  alias = 'a',
  onChange,
  allowRegexp = true,
  emptyText = '暂无过滤条件，将扫描全部行。',
  showSql = true,
}: Props) {
  const operatorOptions = allowRegexp
    ? OPERATOR_OPTIONS
    : OPERATOR_OPTIONS.filter((op) => op.value !== 'REGEXP');

  const update = (index: number, patch: Partial<ConditionRow>) => {
    onChange(conditions.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
        <Button
          size="small"
          type="text"
          icon={<PlusOutlined />}
          onClick={() => onChange([...conditions, { ...EMPTY_COND }])}
        >
          加条件
        </Button>
      </div>

      {conditions.length === 0 ? (
        <div className="form-hint">{emptyText}</div>
      ) : (
        conditions.map((cond, index) => (
          <div
            key={index}
            style={{
              border: '1px solid var(--border)',
              borderRadius: 8,
              padding: 8,
              marginBottom: 8,
              background: 'var(--bg-subtle)',
            }}
          >
            <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
              {index > 0 ? (
                <Select
                  size="small"
                  value={cond.logic}
                  style={{ width: 58 }}
                  onChange={(v) => update(index, { logic: v })}
                  options={[
                    { value: 'AND', label: 'AND' },
                    { value: 'OR', label: 'OR' },
                  ]}
                />
              ) : (
                <span style={{ width: 58, fontSize: 11, color: 'var(--text-tertiary)' }}>WHERE</span>
              )}
              <Select
                size="small"
                showSearch
                value={cond.left || undefined}
                placeholder="字段"
                style={{ flex: 1, minWidth: 0 }}
                options={fieldOptions(fields)}
                onChange={(v) => update(index, { left: v })}
              />
              <Select
                size="small"
                value={cond.op}
                style={{ width: 104 }}
                options={operatorOptions}
                onChange={(v) =>
                  update(index, {
                    op: v,
                    rightType: v === 'IS_NULL' || v === 'IS_NOT_NULL' ? 'CONST' : cond.rightType,
                  })
                }
              />
              <Button
                size="small"
                type="text"
                danger
                icon={<DeleteOutlined />}
                onClick={() => onChange(conditions.filter((_, i) => i !== index))}
              />
            </div>
            <div style={{ display: 'flex', gap: 5, alignItems: 'center', marginTop: 6 }}>
              <span style={{ width: 58 }} />
              <Select
                size="small"
                value={cond.rightType}
                style={{ width: 76 }}
                onChange={(v) => update(index, { rightType: v, right: '' })}
                disabled={cond.op === 'IS_NULL' || cond.op === 'IS_NOT_NULL'}
                options={[
                  { value: 'CONST', label: '常量' },
                  { value: 'FIELD', label: '字段' },
                ]}
              />
              {cond.rightType === 'FIELD' ? (
                <Select
                  size="small"
                  showSearch
                  value={cond.right || undefined}
                  placeholder="右字段"
                  style={{ flex: 1, minWidth: 0 }}
                  options={fieldOptions(fields)}
                  onChange={(v) => update(index, { right: v })}
                />
              ) : (
                <>
                  <Input
                    size="small"
                    value={cond.right}
                    placeholder={
                      cond.op === 'IN' || cond.op === 'NOT_IN'
                        ? '1,2,3'
                        : cond.op === 'BETWEEN' || cond.op === 'NOT_BETWEEN'
                          ? '起始值'
                          : '值'
                    }
                    disabled={cond.op === 'IS_NULL' || cond.op === 'IS_NOT_NULL'}
                    onChange={(e) => update(index, { right: e.target.value })}
                    style={{ flex: 1, minWidth: 0 }}
                  />
                  {cond.op === 'BETWEEN' || cond.op === 'NOT_BETWEEN' ? (
                    <Input
                      size="small"
                      value={cond.right2 || ''}
                      placeholder="结束值"
                      onChange={(e) => update(index, { right2: e.target.value })}
                      style={{ flex: 1, minWidth: 0 }}
                    />
                  ) : null}
                </>
              )}
              <div style={{ display: 'flex' }}>
                <Button
                  size="small"
                  type="text"
                  icon={<RightOutlined rotate={90} />}
                  title="缩进（升组）"
                  onClick={() => update(index, { indent: Math.min(3, (cond.indent || 0) + 1) })}
                />
                <Button
                  size="small"
                  type="text"
                  icon={<RightOutlined rotate={-90} />}
                  title="反缩进（降组）"
                  onClick={() => update(index, { indent: Math.max(0, (cond.indent || 0) - 1) })}
                />
              </div>
            </div>
            {cond.indent > 0 ? (
              <div className="form-hint" style={{ marginTop: 4 }}>
                层级 {cond.indent}，按层级加括号
              </div>
            ) : null}
          </div>
        ))
      )}

      {showSql && conditions.length > 0 ? (
        <div className="form-hint mono" style={{ whiteSpace: 'pre-wrap', marginTop: 6 }}>
          {conditionsSql(conditions, alias)}
        </div>
      ) : null}
    </>
  );
}
