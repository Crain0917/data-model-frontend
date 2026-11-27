import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  App,
  AutoComplete,
  Button,
  Input,
  InputNumber,
  Select,
  Tag,
  Tooltip,
} from 'antd';
import {
  DeleteOutlined,
  KeyOutlined,
  PlusOutlined,
  SyncOutlined,
  TableOutlined,
} from '@ant-design/icons';
import type { FieldDef, LlmConfig, LlmInputVariable } from '../../../types';
import { DEFAULT_LLM_PROMPT, findUpstream, outputFields } from '../../../utils/dagUtils';
import { blockingIssues } from '../../../utils/validation';
import {
  deleteLlmKey,
  getLlmKey,
  listLlmModels,
  putLlmKey,
  type LlmKeyStatus,
} from '../../../api/flow';
import {
  DangerLine,
  NodeCommon,
  SectionTitle,
  WarningLine,
  fieldOptions,
  type PanelProps,
} from './common';

const RESERVED_VARS = ['enum_list', 'fallback', 'input_text'];
const VAR_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

function normalize(cfg: Partial<LlmConfig>): LlmConfig {
  const num = (value: unknown, fallback: number) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  };
  const inputFields = (cfg.inputFields || []).map((v) => String(v ?? '')).filter(Boolean);
  const rawVars = (cfg.inputVariables || []).map((v) => ({
    field: String(v?.field ?? '').trim(),
    variable: String(v?.variable ?? ''),
  }));
  // 旧配置没有 inputVariables 时变量名默认取字段名；同名字段按出现顺序一一对应。
  const used = new Set<number>();
  const inputVariables: LlmInputVariable[] = inputFields.map((field) => {
    const index = rawVars.findIndex((v, i) => !used.has(i) && v.field === field);
    if (index < 0) return { field, variable: field };
    used.add(index);
    return { field, variable: rawVars[index].variable };
  });
  return {
    alias: cfg.alias || 'a',
    inputFields,
    inputVariables,
    outputField: String(cfg.outputField ?? ''),
    enumValues: (cfg.enumValues || []).map((v) => String(v ?? '')),
    batchRows: Math.max(1, Math.min(200, Math.round(num(cfg.batchRows, 20)))),
    endpoint: String(cfg.endpoint ?? ''),
    model: String(cfg.model ?? ''),
    promptTemplate: String(cfg.promptTemplate ?? ''),
    unknownValue: String(cfg.unknownValue ?? '未知'),
    timeoutSeconds: num(cfg.timeoutSeconds, 60),
    maxRetries: num(cfg.maxRetries, 2),
  };
}

function token(name: string) {
  return '${' + name + '}';
}

/** 已填完整 endpoint 时原样使用，否则按 BaseURL 自动补 /chat/completions。 */
function resolveChatUrl(endpoint: string) {
  const value = endpoint.trim();
  if (!value) return '';
  const base = value.replace(/\/+$/, '');
  if (/\/chat\/completions$/i.test(base)) return base;
  return `${base}/chat/completions`;
}

export default function LlmPanel({
  node,
  nodes,
  edges,
  flowId,
  onConfig,
  onMeta,
  onPreviewData,
}: PanelProps) {
  const { message, modal } = App.useApp();
  const cfg = normalize(node.data.config as Partial<LlmConfig>);
  const rows = cfg.inputVariables;
  const upstream = findUpstream(node.id, nodes, edges);
  const upFields: FieldDef[] = upstream ? outputFields(upstream, nodes, edges) : [];
  const issues = blockingIssues(node, nodes, edges);

  const [enumDraft, setEnumDraft] = useState('');
  const [models, setModels] = useState<string[]>([]);
  const [modelOpen, setModelOpen] = useState(false);
  const [modelSearch, setModelSearch] = useState('');
  const [loadingModels, setLoadingModels] = useState(false);
  const [modelListHint, setModelListHint] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [keyStatus, setKeyStatus] = useState<LlmKeyStatus | null>(null);
  const [keyLoading, setKeyLoading] = useState(true);
  const [keyError, setKeyError] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState(false);
  const promptRef = useRef<any>(null);
  const modelBoxRef = useRef<HTMLDivElement>(null);
  const justSelectedRef = useRef(false);

  // 选择选项后 antd 内部可能再次回调展开；用一个短抑制窗口确保下拉真正关闭。
  const closeModelList = () => {
    justSelectedRef.current = true;
    window.setTimeout(() => setModelOpen(false), 0);
    window.setTimeout(() => {
      justSelectedRef.current = false;
    }, 250);
  };

  const patch = (p: Partial<LlmConfig>) => onConfig({ ...cfg, ...p });

  useEffect(() => {
    setEnumDraft('');
    setModels([]);
    setModelOpen(false);
    setModelSearch('');
    setModelListHint(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node.id]);

  // 受控展开时点击面板其它区域要收起下拉，选项本身和输入框内的点击除外。
  useEffect(() => {
    if (!modelOpen) return undefined;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Element | null;
      if (modelBoxRef.current?.contains(target as Node)) return;
      if (target?.closest?.('.ant-select-dropdown')) return;
      setModelOpen(false);
    };
    document.addEventListener('mousedown', onDown, true);
    return () => document.removeEventListener('mousedown', onDown, true);
  }, [modelOpen]);

  useEffect(() => {
    let alive = true;
    setKeyLoading(true);
    setKeyError(null);
    getLlmKey(flowId, node.id)
      .then((status) => {
        if (alive) setKeyStatus(status);
      })
      .catch((e) => {
        if (!alive) return;
        setKeyStatus(null);
        setKeyError((e as Error).message || '密钥状态读取失败');
      })
      .finally(() => {
        if (alive) setKeyLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [flowId, node.id]);

  const setRows = (next: LlmInputVariable[]) => {
    patch({ inputFields: next.map((r) => r.field), inputVariables: next });
  };

  const addRow = () => {
    const unused = upFields.find((f) => !rows.some((r) => r.field === f.name));
    if (!unused) {
      message.warning('所有上游字段都已添加映射');
      return;
    }
    setRows([...rows, { field: unused.name, variable: unused.name }]);
  };

  const updateRow = (index: number, p: Partial<LlmInputVariable>) => {
    setRows(rows.map((r, i) => (i === index ? { ...r, ...p } : r)));
  };

  const changeField = (index: number, field: string) => {
    const row = rows[index];
    // 变量名仍是旧字段名（或为空）时跟随新字段，用户自定义的变量名保留。
    const autoVar = !row.variable || row.variable === row.field;
    updateRow(index, { field, variable: autoVar ? field : row.variable });
  };

  const removeRow = (index: number) => {
    setRows(rows.filter((_, i) => i !== index));
  };

  const addEnum = () => {
    const value = enumDraft.trim();
    if (!value) return;
    if (cfg.enumValues.includes(value)) {
      message.warning('该枚举值已存在');
      return;
    }
    patch({ enumValues: [...cfg.enumValues, value] });
    setEnumDraft('');
  };

  const removeEnum = (value: string) => {
    patch({ enumValues: cfg.enumValues.filter((v) => v !== value) });
  };

  const insertToken = (value: string) => {
    const el = promptRef.current?.resizableTextArea?.textArea as HTMLTextAreaElement | undefined;
    const text = cfg.promptTemplate;
    const start = el?.selectionStart ?? text.length;
    const end = el?.selectionEnd ?? text.length;
    patch({ promptTemplate: `${text.slice(0, start)}${value}${text.slice(end)}` });
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      el.setSelectionRange(start + value.length, start + value.length);
    });
  };

  const restoreDefaultPrompt = () => {
    modal.confirm({
      title: '恢复默认 Prompt 模板？',
      content: '当前模板内容将被默认模板覆盖。',
      okText: '恢复默认',
      cancelText: '取消',
      onOk: () => patch({ promptTemplate: DEFAULT_LLM_PROMPT }),
    });
  };

  const fetchModels = async () => {
    if (!cfg.endpoint.trim()) {
      message.warning('请先填写大模型接口地址');
      return;
    }
    setLoadingModels(true);
    setModelListHint(null);
    try {
      const list = await listLlmModels(flowId, node.id, cfg.endpoint.trim());
      setModels(list);
      if (list.length) {
        setModelSearch('');
        setModelOpen(true);
        message.success(`已获取 ${list.length} 个模型`);
      }
      else {
        setModelListHint('接口未返回模型，请手动填写模型名称');
        message.warning('接口未返回模型，请手动填写模型名称');
      }
    } catch (e) {
      const notReady = (e as { httpStatus?: number }).httpStatus === 404;
      const hint = notReady
        ? '模型列表接口暂未就绪（404），请手动填写模型名称'
        : `${(e as Error).message || '获取模型列表失败'}，请手动填写模型名称`;
      setModelListHint(hint);
      message.warning(hint);
    } finally {
      setLoadingModels(false);
    }
  };

  const saveKey = async () => {
    if (!apiKey.trim()) {
      message.warning('请先填写 API Key');
      return;
    }
    setSavingKey(true);
    try {
      const status = await putLlmKey(flowId, node.id, {
        apiKey: apiKey.trim(),
        endpoint: cfg.endpoint,
        model: cfg.model,
      });
      setKeyStatus(status);
      setKeyError(null);
      setApiKey('');
      message.success('API Key 已保存');
    } catch (e) {
      message.error((e as Error).message || '密钥保存失败');
    } finally {
      setSavingKey(false);
    }
  };

  const clearKey = () => {
    modal.confirm({
      title: '清除该节点的 API Key？',
      content: '清除后该节点执行前需要重新配置密钥。',
      okText: '清除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        try {
          await deleteLlmKey(flowId, node.id);
          setKeyStatus({ configured: false, maskedKey: null, endpoint: null, model: null });
          message.success('已清除 API Key');
        } catch (e) {
          message.error((e as Error).message || '清除失败');
        }
      },
    });
  };

  if (!upstream) {
    return (
      <div>
        <NodeCommon node={node} onMeta={onMeta} />
        <WarningLine>请先连接上游节点，大模型节点需要 1 条入线。</WarningLine>
      </div>
    );
  }

  if (!upFields.length) {
    return (
      <div>
        <NodeCommon node={node} onMeta={onMeta} />
        <WarningLine>上游尚未提供字段，请先配置上游节点后再获取字段。</WarningLine>
      </div>
    );
  }

  const keyConfigured = Boolean(keyStatus?.configured);
  const keyUnavailable = Boolean(keyError);
  const batch = Math.max(1, Math.min(200, Math.round(cfg.batchRows || 20)));
  const batchCalls = Math.ceil(10000 / batch);

  // Prompt 模式：含 ${input_text} 走批量；否则按字段变量逐行；两者都没有则阻断保存。
  const template = cfg.promptTemplate;
  const hasBatchToken = template.includes(token('input_text'));
  const templateVars = rows
    .map((r) => r.variable.trim())
    .filter((v) => v && template.includes(token(v)));
  const promptMode: 'batch' | 'row' | 'invalid' = hasBatchToken
    ? 'batch'
    : templateVars.length
      ? 'row'
      : 'invalid';

  const varCounts = new Map<string, number>();
  for (const row of rows) {
    const key = row.variable.trim().toLowerCase();
    if (!key) continue;
    varCounts.set(key, (varCounts.get(key) || 0) + 1);
  }
  const rowVarError = (row: LlmInputVariable): string | null => {
    const value = row.variable.trim();
    if (!value) return null;
    if (!VAR_PATTERN.test(value)) return '变量名需以字母/下划线开头，只含字母、数字、下划线';
    if (RESERVED_VARS.includes(value)) return `「${value}」是保留变量名`;
    if ((varCounts.get(value.toLowerCase()) || 0) > 1) return '变量名重复';
    return null;
  };

  const chipVars = Array.from(
    new Set(rows.map((r) => r.variable.trim()).filter((v) => v && VAR_PATTERN.test(v))),
  );

  const chatUrl = resolveChatUrl(cfg.endpoint);
  const modelKeyword = modelSearch.trim().toLowerCase();
  const filteredModels = modelKeyword
    ? models.filter((m) => m.toLowerCase().includes(modelKeyword))
    : models;

  return (
    <div>
      <NodeCommon node={node} onMeta={onMeta} />

      <div className="form-section">
        <SectionTitle>模型连接配置</SectionTitle>
        <div className="form-hint" style={{ marginBottom: 4 }}>
          大模型接口地址 <span style={{ color: 'var(--danger)' }}>*</span>
        </div>
        <Input
          size="small"
          value={cfg.endpoint}
          placeholder="https://api.deepseek.com 或 https://api.deepseek.com/chat/completions"
          onChange={(e) => patch({ endpoint: e.target.value })}
        />
        <div className="form-hint" style={{ marginTop: 4, lineHeight: 1.7 }}>
          方式 A（只填 BaseURL，如 <span className="mono">https://api.deepseek.com</span>）：自动补全
          <span className="mono"> /chat/completions</span>；方式 B（填完整接口地址）：原样使用。
        </div>
        {chatUrl ? (
          <div
            className="llm-endpoint-preview"
            style={{
              marginTop: 6,
              marginBottom: 10,
              padding: '6px 10px',
              borderRadius: 7,
              border: '1px solid var(--border)',
              background: 'var(--bg-subtle, #fafbfc)',
              fontSize: 12,
              lineHeight: 1.6,
              wordBreak: 'break-all',
            }}
          >
            <span style={{ color: 'var(--text-secondary)' }}>当前将请求：</span>
            <span className="mono" style={{ color: 'var(--color-primary)', fontWeight: 600 }}>
              {chatUrl}
            </span>
          </div>
        ) : (
          <div style={{ marginBottom: 10 }} />
        )}

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 220px', minWidth: 0 }}>
            <div className="form-hint" style={{ marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
              <KeyOutlined />
              API Key <span style={{ color: 'var(--danger)' }}>*</span>
              {keyLoading ? (
                <Tag style={{ marginLeft: 4 }}>读取中…</Tag>
              ) : keyConfigured ? (
                <Tag color="green" style={{ marginLeft: 4 }}>
                  已配置 {keyStatus?.maskedKey || ''}
                </Tag>
              ) : (
                <Tag color="orange" style={{ marginLeft: 4 }}>未配置密钥</Tag>
              )}
            </div>
            <Input.Password
              size="small"
              value={apiKey}
              autoComplete="new-password"
              placeholder={keyConfigured ? '输入新 Key 可替换现有密钥' : '输入 API Key'}
              style={{ marginBottom: 6 }}
              onChange={(e) => setApiKey(e.target.value)}
            />
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <Button size="small" type="primary" loading={savingKey} onClick={saveKey}>
                {keyConfigured ? '替换密钥' : '保存密钥'}
              </Button>
              {keyConfigured ? (
                <Button size="small" danger type="text" onClick={clearKey}>
                  清除密钥
                </Button>
              ) : null}
            </div>
          </div>

          <div style={{ flex: '1 1 220px', minWidth: 0 }}>
            <div className="form-hint" style={{ marginBottom: 4 }}>
              模型名称 <span style={{ color: 'var(--danger)' }}>*</span>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <div ref={modelBoxRef} style={{ flex: 1, minWidth: 0 }}>
                <AutoComplete
                  size="small"
                  value={cfg.model}
                  open={modelOpen && filteredModels.length > 0}
                  options={filteredModels.map((m) => ({ value: m }))}
                  placeholder="点击获取列表或直接输入模型名"
                  style={{ width: '100%' }}
                  filterOption={false}
                  onFocus={() => {
                    setModelSearch('');
                    if (models.length) setModelOpen(true);
                  }}
                  onClick={() => {
                    if (!modelOpen) setModelSearch('');
                    if (models.length) setModelOpen(true);
                  }}
                  onSearch={(text) => {
                    setModelSearch(text);
                    if (models.length && !justSelectedRef.current) setModelOpen(true);
                  }}
                  onOpenChange={(v) => {
                    if (v && justSelectedRef.current) return;
                    setModelOpen(v);
                  }}
                  onSelect={closeModelList}
                  onBlur={closeModelList}
                  onChange={(v) => patch({ model: v })}
                />
              </div>
              <Tooltip title="从接口地址拉取可用模型列表">
                <Button
                  size="small"
                  icon={<SyncOutlined />}
                  loading={loadingModels}
                  disabled={!cfg.endpoint.trim()}
                  onClick={fetchModels}
                >
                  获取模型列表
                </Button>
              </Tooltip>
            </div>
            {models.length ? (
              <div className="form-hint" style={{ marginTop: 4 }}>
                已加载 {models.length} 个模型，点击输入框展开选择，也可继续手输。
              </div>
            ) : null}
            {modelListHint ? (
              <div className="form-hint" style={{ marginTop: 4, color: 'var(--warn-text, #b45309)' }}>
                {modelListHint}
              </div>
            ) : null}
          </div>
        </div>

        <div className="form-hint" style={{ marginTop: 8, lineHeight: 1.7 }}>
          密钥仅存后端，不写入 dag_json、不进入 localStorage、不回填明文；可先填 Key 再获取模型列表。
        </div>
        {keyUnavailable ? (
          <Alert
            type="warning"
            showIcon
            style={{ marginTop: 8 }}
            message="暂时无法读取密钥状态"
            description={`${keyError}。请检查网络或后端服务后重试；读取失败不影响已保存的节点配置。`}
          />
        ) : null}
      </div>

      <div className="form-section">
        <SectionTitle>标准输出枚举值</SectionTitle>
        <div className="form-hint" style={{ marginBottom: 6 }}>
          模型允许返回的标准取值 <span style={{ color: 'var(--danger)' }}>*</span>
        </div>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 8,
            alignItems: 'center',
            padding: 10,
            borderRadius: 8,
            border: '1px solid var(--border)',
            background: 'var(--bg-subtle, #fafbfc)',
          }}
        >
          {cfg.enumValues.map((value) => (
            <Tag key={value} color="blue" closable onClose={() => removeEnum(value)}>
              {value}
            </Tag>
          ))}
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <Input
              size="small"
              value={enumDraft}
              placeholder="输入枚举值，回车添加"
              style={{ width: 180 }}
              onChange={(e) => setEnumDraft(e.target.value)}
              onPressEnter={addEnum}
            />
            <Button size="small" icon={<PlusOutlined />} onClick={addEnum}>
              添加
            </Button>
          </div>
        </div>
        <div className="form-hint" style={{ marginTop: 4, lineHeight: 1.7 }}>
          枚举列表自动注入 Prompt 变量 <span className="mono">{token('enum_list')}</span>；模型只能返回以上值，不得自创。
        </div>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 12 }}>
          <div style={{ flex: '1 1 220px', minWidth: 0 }}>
            <div className="form-hint" style={{ marginBottom: 4 }}>
              兜底值（无法判断 / 为空 / 调用失败） <span style={{ color: 'var(--danger)' }}>*</span>
            </div>
            <Input
              size="small"
              value={cfg.unknownValue}
              placeholder="未知"
              onChange={(e) => patch({ unknownValue: e.target.value })}
            />
            <div className="form-hint" style={{ marginTop: 4 }}>
              不计入枚举列表，注入 <span className="mono">{token('fallback')}</span>；留空会导致无法保存。
            </div>
          </div>
          <div style={{ flex: '1 1 220px', minWidth: 0 }}>
            <div className="form-hint" style={{ marginBottom: 4 }}>
              输出新字段名称 <span style={{ color: 'var(--danger)' }}>*</span>
            </div>
            <Input
              size="small"
              value={cfg.outputField}
              placeholder="例如 standard_status"
              onChange={(e) => patch({ outputField: e.target.value })}
            />
            <div className="form-hint" style={{ marginTop: 4 }}>
              字符串类型；追加一列，原有上游字段全部保留。
            </div>
          </div>
        </div>
      </div>

      <div className="form-section">
        <SectionTitle>输入字段与变量映射</SectionTitle>
        <div
          style={{
            border: '1px solid var(--border)',
            borderRadius: 8,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.2fr) 36px',
              gap: 10,
              padding: '8px 10px',
              fontSize: 12,
              color: 'var(--text-secondary, #6b7686)',
              background: 'var(--bg-subtle, #fafbfc)',
              borderBottom: '1px solid var(--border)',
            }}
          >
            <span>上游字段</span>
            <span>Prompt 变量名</span>
            <span />
          </div>
          {rows.length === 0 ? (
            <div className="form-hint" style={{ padding: '10px 12px' }}>
              尚未添加字段，至少需要 1 个输入字段。
            </div>
          ) : null}
          {rows.map((row, index) => {
            const varError = rowVarError(row);
            return (
              <div
                key={`${row.field}-${index}`}
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.2fr) 36px',
                  gap: 10,
                  padding: '8px 10px',
                  alignItems: 'start',
                  borderBottom: index === rows.length - 1 ? 'none' : '1px solid var(--border)',
                }}
              >
                <Select
                  size="small"
                  value={row.field || undefined}
                  placeholder="选择上游字段"
                  options={fieldOptions(upFields).map((opt) => ({
                    ...opt,
                    disabled: rows.some((r, i) => i !== index && r.field === opt.value),
                  }))}
                  onChange={(v) => changeField(index, v)}
                />
                <div>
                  <Input
                    size="small"
                    value={row.variable}
                    placeholder={row.field || '变量名，如 status'}
                    status={varError ? 'error' : undefined}
                    onChange={(e) => updateRow(index, { variable: e.target.value })}
                    onBlur={() => {
                      if (!row.variable.trim() && row.field) {
                        updateRow(index, { variable: row.field });
                      }
                    }}
                  />
                  {varError ? (
                    <div style={{ color: 'var(--danger)', fontSize: 12, marginTop: 2 }}>
                      {varError}
                    </div>
                  ) : null}
                </div>
                <Button
                  size="small"
                  type="text"
                  danger
                  icon={<DeleteOutlined />}
                  onClick={() => removeRow(index)}
                />
              </div>
            );
          })}
          <div style={{ padding: '8px 10px', borderTop: '1px solid var(--border)' }}>
            <Button type="link" size="small" icon={<PlusOutlined />} onClick={addRow}>
              添加字段映射
            </Button>
          </div>
        </div>
        <div className="form-hint" style={{ marginTop: 6, lineHeight: 1.7 }}>
          每个字段绑定一个变量，Prompt 中按变量分别引用；变量名需唯一，非文本字段自动转为字符串。
        </div>
      </div>

      <div className="form-section">
        <SectionTitle>批次配置</SectionTitle>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <span className="form-hint">单次批量处理行数</span>
          <InputNumber
            size="small"
            min={1}
            max={200}
            precision={0}
            value={cfg.batchRows}
            style={{ width: 104 }}
            onChange={(v) => patch({ batchRows: Number(v) || 1 })}
          />
          <span className="form-hint">范围 1~200，手动填写</span>
        </div>
        <div className="form-hint" style={{ marginTop: 6, lineHeight: 1.8 }}>
          {promptMode === 'batch'
            ? `每 ${batch} 行调用一次模型，例如 1 万行约 ${batchCalls} 次请求。`
            : `逐行模式下每行调用一次模型，例如 1 万行约 10000 次请求。`}
          超时 {cfg.timeoutSeconds} 秒、失败重试 {cfg.maxRetries} 次。
        </div>
      </div>

      <div className="form-section">
        <SectionTitle
          extra={
            <Button size="small" type="link" onClick={restoreDefaultPrompt}>
              恢复默认模板
            </Button>
          }
        >
          Prompt 模板
        </SectionTitle>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginBottom: 8 }}>
          <span className="form-hint">可用变量（点击插入）：</span>
          {[token('enum_list'), token('fallback'), token('input_text'), ...chipVars.map((v) => token(v))].map(
            (value) => (
              <span
                key={value}
                onClick={() => insertToken(value)}
                style={{
                  fontFamily: 'ui-monospace, Menlo, Consolas, monospace',
                  fontSize: 12,
                  padding: '2px 8px',
                  borderRadius: 6,
                  border: '1px dashed var(--border-strong, #c8d0dc)',
                  background: 'var(--bg-subtle, #f2f4f7)',
                  cursor: 'pointer',
                }}
              >
                {value}
              </span>
            ),
          )}
        </div>
        <Input.TextArea
          ref={promptRef}
          value={cfg.promptTemplate}
          autoSize={{ minRows: 8, maxRows: 20 }}
          placeholder={`必须包含 ${token('input_text')}（批量）或至少一个字段变量（逐行）`}
          onChange={(e) => patch({ promptTemplate: e.target.value })}
        />

        {promptMode === 'batch' ? (
          <Alert
            type="success"
            showIcon
            style={{ marginTop: 8 }}
            message="批量模式"
            description="模板包含 ${input_text}，整批记录会作为 JSON 数组一次提交，请求次数最少。"
          />
        ) : null}
        {promptMode === 'row' ? (
          <Alert
            type="warning"
            showIcon
            style={{ marginTop: 8 }}
            message="逐行模式：10 万行 = 10 万次请求，建议用 ${input_text} 批量"
            description="模板未包含 ${input_text}，只按字段变量逐行调用；数据量大时耗时长、费用高。可点击「恢复默认模板」改用批量模板。"
          />
        ) : null}
        {promptMode === 'invalid' ? (
          <Alert
            type="error"
            showIcon
            style={{ marginTop: 8 }}
            message="模板缺少变量，无法保存"
            description="模板必须包含 ${input_text}（批量）或至少一个字段变量（逐行）。"
          />
        ) : null}
        <div className="form-hint" style={{ marginTop: 6, lineHeight: 1.7 }}>
          保留变量：<span className="mono">{token('enum_list')}</span> 枚举列表、
          <span className="mono">{token('fallback')}</span> 兜底值、
          <span className="mono">{token('input_text')}</span> 整批数据。
        </div>
      </div>

      {issues.map((issue) => (
        <DangerLine key={issue}>{issue}</DangerLine>
      ))}
      {!keyLoading && !keyConfigured && !keyUnavailable ? (
        <WarningLine>尚未配置 API Key，执行该节点前需要先在「模型连接配置」中保存密钥。</WarningLine>
      ) : null}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
        <Tooltip title="预览会真实调用模型，最多 20 行，可能产生费用">
          <Button icon={<TableOutlined />} onClick={() => onPreviewData(outputFields(node, nodes, edges))}>
            预览数据（真实调用模型）
          </Button>
        </Tooltip>
      </div>
    </div>
  );
}
