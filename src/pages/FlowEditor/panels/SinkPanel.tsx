import { Input, Radio, Select } from 'antd';
import { LockOutlined } from '@ant-design/icons';
import { NodeCommon, SectionTitle, type PanelProps } from './common';

export default function SinkPanel({ node, onMeta }: PanelProps) {
  return (
    <div>
      <NodeCommon node={node} onMeta={onMeta} />

      <div className="warn-line" style={{ marginTop: 4 }}>
        <span>⚠️</span>
        <span>Sink 写入节点开发中，v1 不会执行落地动作。执行时状态记为 SKIPPED。</span>
      </div>

      <div className="form-section" style={{ opacity: 0.65 }}>
        <SectionTitle
          extra={
            <span className="chip" style={{ fontSize: 10 }}>
              <LockOutlined /> 只读
            </span>
          }
        >
          目标配置
        </SectionTitle>

        <div className="form-hint" style={{ marginBottom: 4 }}>目标类型</div>
        <Radio.Group disabled value="DORIS" style={{ marginBottom: 10 }}>
          <Radio value="MYSQL">MySQL</Radio>
          <Radio value="DORIS">Doris</Radio>
          <Radio value="DM8">达梦 DM8</Radio>
        </Radio.Group>

        <div className="form-hint" style={{ marginBottom: 4 }}>目标数据源</div>
        <Select disabled placeholder="v2 启用后可选" style={{ width: '100%', marginBottom: 10 }} />

        <div className="form-hint" style={{ marginBottom: 4 }}>写入模式</div>
        <Select
          disabled
          value="APPEND"
          style={{ width: '100%', marginBottom: 10 }}
          options={[
            { value: 'APPEND', label: 'Append 追加' },
            { value: 'OVERWRITE', label: 'Overwrite 覆盖' },
            { value: 'UPSERT', label: 'Upsert 更新插入' },
          ]}
        />

        <div className="form-hint" style={{ marginBottom: 4 }}>字段映射</div>
        <Input disabled placeholder="v2 启用后可选" />
      </div>

      <div className="form-hint">
        v1 阶段 Sink 会正常参与拓扑排序，保证上游全部执行，但执行器直接写入一条 node_run
        （status=SKIPPED，msg="v1 未启用"），不生成任何写入 SQL。
      </div>
    </div>
  );
}
