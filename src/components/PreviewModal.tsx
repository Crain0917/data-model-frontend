import { Modal, Table, Tag } from 'antd';

interface PreviewModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  columns: Array<{ name: string; type: string }>;
}

const SAMPLE_ROWS = [
  ['100001', '88213', '238.00', 'PAID', '北京', '2026-11-13 08:12:31'],
  ['100002', '88214', '1268.50', 'PAID', '上海', '2026-11-13 08:31:02'],
  ['100003', '88215', '89.90', 'REFUND', '广州', '2026-11-13 08:45:18'],
  ['100004', '88216', '512.00', 'PAID', '深圳', '2026-11-13 09:02:44'],
  ['100005', '88217', '76.00', 'PAID', '杭州', '2026-11-13 09:18:09'],
];

export default function PreviewModal({ open, onClose, title, columns }: PreviewModalProps) {
  const cols = (columns.length ? columns : [{ name: 'id', type: 'BIGINT' }]).map((c) => ({
    title: (
      <span>
        {c.name} <Tag style={{ marginLeft: 4, fontSize: 9 }}>{c.type}</Tag>
      </span>
    ),
    dataIndex: c.name,
    key: c.name,
    ellipsis: true,
  }));

  const data = SAMPLE_ROWS.slice(0, 5).map((row, i) => {
    const record: Record<string, string> = { key: String(i) };
    columns.forEach((c, idx) => {
      record[c.name] = row[idx] ?? '—';
    });
    return record;
  });

  return (
    <Modal open={open} onCancel={onClose} onOk={onClose} width={760} title={title} okText="关闭" cancelButtonProps={{ style: { display: 'none' } }}>
      <div style={{ marginBottom: 10, fontSize: 12, color: 'var(--text-secondary)' }}>
        预览前 100 行（示例数据，执行引擎接入后由 Doris 返回真实数据）
      </div>
      <Table size="small" columns={cols} dataSource={data} pagination={false} scroll={{ x: 'max-content' }} />
    </Modal>
  );
}
