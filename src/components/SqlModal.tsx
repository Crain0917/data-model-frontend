import { App, Button, Modal } from 'antd';
import { CopyOutlined } from '@ant-design/icons';

export default function SqlModal({
  open,
  onClose,
  title,
  sql,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  sql: string;
}) {
  const { message } = App.useApp();

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(sql);
      message.success('已复制');
    } catch {
      message.error('复制失败，请手动选择后复制');
    }
  };

  return (
    <Modal
      open={open}
      onCancel={onClose}
      width={720}
      title={title}
      footer={[
        <Button key="copy" icon={<CopyOutlined />} onClick={copy}>
          复制 SQL
        </Button>,
        <Button key="close" type="primary" onClick={onClose}>
          关闭
        </Button>,
      ]}
    >
      <pre className="sql-preview" style={{ maxHeight: 460 }}>{sql}</pre>
    </Modal>
  );
}
