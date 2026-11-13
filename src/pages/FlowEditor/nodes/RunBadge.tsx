import { CheckCircleFilled, CloseCircleFilled, LoadingOutlined, MinusCircleFilled } from '@ant-design/icons';
import type { FlowNodeData } from '../../../types';

const TEXT: Record<string, string> = {
  RUNNING: '执行中',
  SUCCESS: '执行成功',
  FAILED: '执行失败',
  SKIPPED: '已跳过',
};

export default function RunBadge({ status }: { status?: FlowNodeData['runStatus'] }) {
  if (!status) return null;
  const icon =
    status === 'RUNNING' ? (
      <LoadingOutlined spin />
    ) : status === 'SUCCESS' ? (
      <CheckCircleFilled />
    ) : status === 'FAILED' ? (
      <CloseCircleFilled />
    ) : (
      <MinusCircleFilled />
    );
  return (
    <span className={`run-badge run-badge--${status.toLowerCase()}`} title={TEXT[status]}>
      {icon}
    </span>
  );
}
