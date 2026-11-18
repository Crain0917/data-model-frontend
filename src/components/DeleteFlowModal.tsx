import { useEffect, useState } from 'react';
import { Alert, App, Input, Modal } from 'antd';
import { ExclamationCircleFilled } from '@ant-design/icons';
import { ApiError } from '../api/http';
import { deleteFlow } from '../api/flow';
import type { FlowDeleteResult } from '../types';

interface Props {
  open: boolean;
  flow: { id: string; name: string } | null;
  onClose: () => void;
  onDeleted: (result: FlowDeleteResult) => void;
}

export default function DeleteFlowModal({ open, flow, onClose, onDeleted }: Props) {
  const { message } = App.useApp();
  const [typed, setTyped] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTyped('');
    setError(null);
    setDeleting(false);
  }, [open, flow?.id]);

  const matched = !!flow && typed.trim() === flow.name;

  const submit = async () => {
    if (!flow || !matched || deleting) return;
    setDeleting(true);
    setError(null);
    try {
      const result = await deleteFlow(flow.id, typed.trim());
      message.success('任务已删除');
      onDeleted(result);
      onClose();
    } catch (e) {
      const apiError = e as ApiError;
      if (apiError.code === 4010) {
        setError('任务名称不匹配，未执行删除。请重新输入完整任务名（区分大小写）。');
      } else if (apiError.code === 4005) {
        setError(apiError.message || '任务正在运行，暂时无法删除，请等待本次执行结束。');
      } else if (apiError.code === 4002) {
        setError('任务不存在或已被删除。');
      } else {
        setError(apiError.message || '删除失败，请稍后重试');
      }
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Modal
      open={open}
      title={
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <ExclamationCircleFilled style={{ color: 'var(--danger)' }} />
          删除任务「{flow?.name}」
        </span>
      }
      okText="删除任务"
      cancelText="取消"
      okButtonProps={{ danger: true, disabled: !matched, loading: deleting }}
      onCancel={() => {
        if (!deleting) onClose();
      }}
      onOk={submit}
      destroyOnHidden
    >
      <div style={{ marginTop: 12 }}>
        <Alert
          type="error"
          showIcon
          message="此操作不可撤销"
          description={
            <ul style={{ margin: '6px 0 0', paddingLeft: 18, lineHeight: 1.9 }}>
              <li>该任务的节点产物表（Doris）将被删除；</li>
              <li>共享的源表仅在没有任何其他任务引用时才会删除；</li>
              <li>画布、节点配置与全部执行历史将被删除；</li>
              <li>
                <b>Sink 写入的目标业务表不会被删除</b>，目标库中的数据保持原样。
              </li>
            </ul>
          }
        />

        <div className="form-hint" style={{ margin: '14px 0 6px' }}>
          请输入任务名称 <b style={{ color: 'var(--text-primary)' }}>{flow?.name}</b>{' '}
          以确认删除（首尾空格会被忽略，区分大小写）：
        </div>
        <Input
          value={typed}
          autoFocus
          placeholder={flow?.name || ''}
          status={error ? 'error' : undefined}
          onChange={(e) => {
            setTyped(e.target.value);
            setError(null);
          }}
          onPressEnter={submit}
        />
        {!matched && typed.length > 0 ? (
          <div className="form-hint" style={{ marginTop: 4 }}>
            名称还不一致，输入完整任务名后才能删除。
          </div>
        ) : null}

        {error ? (
          <Alert
            type="error"
            showIcon
            style={{ marginTop: 12 }}
            message="删除未完成"
            description={error}
          />
        ) : null}
      </div>
    </Modal>
  );
}
