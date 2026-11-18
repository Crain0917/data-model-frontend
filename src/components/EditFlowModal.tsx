import { useEffect, useState } from 'react';
import { Alert, App, Input, Modal } from 'antd';
import { ApiError } from '../api/http';
import { updateFlow, type FlowMetaResult } from '../api/flow';

interface Props {
  open: boolean;
  flow: { id: string; name: string; description: string } | null;
  onClose: () => void;
  onSaved: (result: FlowMetaResult) => void;
}

export default function EditFlowModal({ open, flow, onClose, onSaved }: Props) {
  const { message } = App.useApp();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !flow) return;
    setName(flow.name);
    setDescription(flow.description || '');
    setNameError(null);
    setSubmitError(null);
    setSaving(false);
  }, [open, flow]);

  const trimmedName = name.trim();
  const trimmedDesc = description.trim();
  const nameMissing = !trimmedName;
  const nameBadLength = trimmedName.length > 0 && (trimmedName.length < 2 || trimmedName.length > 100);
  const changed =
    !!flow && (trimmedName !== flow.name || trimmedDesc !== (flow.description || ''));

  const validateName = () => {
    if (!trimmedName) return '请输入任务名称';
    if (trimmedName.length < 2) return '任务名称至少 2 个字符';
    if (trimmedName.length > 100) return '任务名称不能超过 100 个字符';
    return null;
  };

  const submit = async () => {
    if (!flow || saving) return;
    const err = validateName();
    if (err) {
      setNameError(err);
      return;
    }
    if (!changed) return;
    setSaving(true);
    setSubmitError(null);
    try {
      const payload: { name?: string; description?: string } = {};
      if (trimmedName !== flow.name) payload.name = trimmedName;
      if (trimmedDesc !== (flow.description || '')) payload.description = trimmedDesc;
      const result = await updateFlow(flow.id, payload);
      message.success('任务信息已更新');
      onSaved(result);
      onClose();
    } catch (e) {
      const apiError = e as ApiError;
      if (apiError.code === 4003) {
        setNameError(apiError.message || '任务名称已存在');
      } else if (apiError.code === 4000) {
        setNameError(apiError.message || '任务名称不合法');
        setSubmitError(apiError.message || '任务名称不合法');
      } else if (apiError.code === 4002) {
        setSubmitError('任务不存在或已被删除');
      } else {
        setSubmitError(apiError.message || '保存失败，请稍后重试');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      title="编辑任务信息"
      okText="保存"
      cancelText="取消"
      confirmLoading={saving}
      okButtonProps={{ disabled: !changed || nameMissing || nameBadLength }}
      onCancel={() => {
        if (!saving) onClose();
      }}
      onOk={submit}
      destroyOnHidden
    >
      <div style={{ marginTop: 12 }}>
        <div className="form-hint" style={{ marginBottom: 4 }}>
          任务名称 <span style={{ color: 'var(--danger)' }}>*</span>
          <span style={{ marginLeft: 6 }}>（2–100 个字符）</span>
        </div>
        <Input
          value={name}
          autoFocus
          maxLength={100}
          showCount
          status={nameError || nameBadLength ? 'error' : undefined}
          onChange={(e) => {
            setName(e.target.value);
            setNameError(null);
            setSubmitError(null);
          }}
          onPressEnter={submit}
        />
        {nameError ? (
          <div className="form-hint" style={{ color: 'var(--danger)', marginTop: 4 }}>{nameError}</div>
        ) : null}

        <div className="form-hint" style={{ margin: '12px 0 4px' }}>
          描述 <span>（可选，最多 200 个字符）</span>
        </div>
        <Input.TextArea
          value={description}
          rows={3}
          maxLength={200}
          showCount
          placeholder="一句话说明这个任务做什么"
          onChange={(e) => {
            setDescription(e.target.value);
            setSubmitError(null);
          }}
        />

        <div className="form-hint" style={{ marginTop: 10 }}>
          只修改名称与描述，不会改动画布与节点配置。
        </div>

        {submitError ? (
          <Alert
            type="error"
            showIcon
            style={{ marginTop: 12 }}
            message="保存失败"
            description={submitError}
          />
        ) : null}
      </div>
    </Modal>
  );
}
