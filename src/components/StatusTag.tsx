import { CheckCircleFilled, CloseCircleFilled, LoadingOutlined, MinusCircleOutlined } from '@ant-design/icons';
import type { RunStatus } from '../types';

const MAP: Record<string, { text: string; cls: string }> = {
  SUCCESS: { text: '成功', cls: 'chip--success' },
  FAILED: { text: '失败', cls: 'chip--danger' },
  RUNNING: { text: '运行中', cls: 'chip--info' },
  SKIPPED: { text: '跳过', cls: '' },
  WAITING: { text: '等待', cls: '' },
};

export function StatusTag({ status }: { status?: RunStatus | string | null }) {
  if (!status) return <span className="chip">—</span>;
  const meta = MAP[status] || { text: status, cls: '' };
  const icon =
    status === 'SUCCESS' ? (
      <CheckCircleFilled />
    ) : status === 'FAILED' ? (
      <CloseCircleFilled />
    ) : status === 'RUNNING' ? (
      <LoadingOutlined />
    ) : status === 'SKIPPED' ? (
      <MinusCircleOutlined />
    ) : null;
  return (
    <span className={`chip ${meta.cls}`}>
      {icon}
      {meta.text}
    </span>
  );
}

export function DataSourceStatus({ status }: { status?: string | null }) {
  if (status === 'SUCCESS') {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12.5 }}>
        <span className="status-dot status-dot--success" /> 正常
      </span>
    );
  }
  if (status === 'FAILED') {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12.5 }}>
        <span className="status-dot status-dot--danger" /> 异常
      </span>
    );
  }
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--text-secondary)' }}>
      <span className="status-dot status-dot--idle" /> 未测试
    </span>
  );
}
