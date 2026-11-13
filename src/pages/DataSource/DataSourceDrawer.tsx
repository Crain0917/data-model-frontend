import { useEffect, useRef, useState } from 'react';
import {
  App,
  Button,
  Drawer,
  Form,
  Input,
  InputNumber,
  Radio,
  Space,
  Tooltip,
} from 'antd';
import { CheckCircleFilled, CloseCircleFilled, ThunderboltOutlined } from '@ant-design/icons';
import {
  createDataSource,
  testDataSource,
  updateDataSource,
} from '../../api/datasource';
import type { DataSource, DataSourceFormValues, DataSourceType, TestConnectionResult } from '../../types';
import { testFailureText } from '../../utils/connectionError';

const DEFAULT_PORTS: Record<DataSourceType, number> = {
  MYSQL: 3306,
  DORIS: 9030,
  DM8: 5236,
};

const TYPE_LABEL: Record<DataSourceType, string> = {
  MYSQL: 'MySQL',
  DORIS: 'Doris',
  DM8: '达梦 DM8',
};

interface Props {
  open: boolean;
  record?: DataSource | null;
  onClose: () => void;
  onSaved: () => void;
}

export default function DataSourceDrawer({ open, record, onClose, onSaved }: Props) {
  const [form] = Form.useForm<DataSourceFormValues>();
  const { message, modal } = App.useApp();
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestConnectionResult | null>(null);
  const [dirty, setDirty] = useState(false);
  const typeRef = useRef<DataSourceType>('DORIS');
  const isEdit = Boolean(record?.id);

  useEffect(() => {
    if (!open) return;
    setTestResult(null);
    setDirty(false);
    if (record) {
      typeRef.current = record.type;
      form.setFieldsValue({
        name: record.name,
        type: record.type,
        host: record.host,
        port: record.port,
        dbName: record.dbName,
        username: record.username || '',
        password: '',
        extraParams: record.extraParams || '',
        remark: record.remark || '',
      });
    } else {
      typeRef.current = 'DORIS';
      form.resetFields();
      form.setFieldsValue({ type: 'DORIS', port: DEFAULT_PORTS.DORIS });
    }
  }, [open, record, form]);

  const doSave = async (testAfter: boolean) => {
    let values: DataSourceFormValues;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }
    setSaving(true);
    setTestResult(null);
    let id = record?.id;
    try {
      const payload = { ...values } as DataSourceFormValues;
      if (isEdit && !payload.password) delete payload.password;
      if (id) {
        await updateDataSource(id, payload);
      } else {
        const res = await createDataSource(payload);
        id = res.id;
      }
      setDirty(false);
      onSaved();
      message.success('数据源已保存');

      if (testAfter && id) {
        setTesting(true);
        try {
          const result = await testDataSource(id);
          setTestResult(result);
          if (result.success) {
            message.success(`连接成功（耗时 ${result.latencyMs}ms）`);
            onSaved();
            onClose();
          } else {
            message.warning('已保存，但连接测试未通过');
            onSaved();
          }
        } catch (e) {
          const err = e as Error & { data?: TestConnectionResult };
          setTestResult(
            err.data || { success: false, latencyMs: 0, message: err.message || '连接测试失败' },
          );
          message.warning('已保存，但连接测试未通过');
        } finally {
          setTesting(false);
        }
      } else {
        onClose();
      }
    } catch (e) {
      message.error((e as Error).message || '保存失败，请稍后重试');
    } finally {
      setSaving(false);
    }
  };

  const doTest = async () => {
    if (!record?.id) {
      message.info('请先保存数据源，再进行连接测试');
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      const result = await testDataSource(record.id);
      setTestResult(result);
      if (result.success) message.success(`连接成功（耗时 ${result.latencyMs}ms）`);
      else message.error('连接测试未通过');
    } catch (e) {
      const err = e as Error & { data?: TestConnectionResult };
      setTestResult(err.data || { success: false, latencyMs: 0, message: err.message });
      message.error('连接测试未通过');
    } finally {
      setTesting(false);
    }
  };

  const requestClose = () => {
    if (!dirty) {
      onClose();
      return;
    }
    modal.confirm({
      title: '有未保存的修改，确定关闭？',
      okText: '放弃修改',
      okButtonProps: { danger: true },
      cancelText: '继续编辑',
      onOk: onClose,
    });
  };

  return (
    <Drawer
      open={open}
      width={560}
      onClose={requestClose}
      maskClosable={false}
      destroyOnHidden
      title={record ? `编辑数据源 · ${record.name}` : '新建数据源'}
      extra={<span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>密码使用 AES-256-GCM 加密保存</span>}
      footer={
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Button onClick={doTest} loading={testing} icon={<ThunderboltOutlined />}>
            测试连接
          </Button>
          <Space>
            <Button onClick={requestClose}>取消</Button>
            <Button onClick={() => doSave(true)} loading={saving || testing}>
              保存并测试
            </Button>
            <Button type="primary" onClick={() => doSave(false)} loading={saving}>
              保存
            </Button>
          </Space>
        </div>
      }
    >
      <Form
        form={form}
        layout="vertical"
        requiredMark="optional"
        onValuesChange={() => setDirty(true)}
        initialValues={{ type: 'DORIS', port: DEFAULT_PORTS.DORIS }}
      >
        <Form.Item
          name="name"
          label="数据源名称"
          rules={[
            { required: true, message: '请输入数据源名称' },
            { min: 2, max: 50, message: '名称长度需为 2–50 个字符' },
          ]}
        >
          <Input placeholder="如 ods_doris_prod" />
        </Form.Item>

        <Form.Item name="type" label="类型" rules={[{ required: true, message: '请选择数据源类型' }]}>
          <Radio.Group
            optionType="button"
            buttonStyle="solid"
            onChange={(e) => {
              const next = e.target.value as DataSourceType;
              const port = form.getFieldValue('port');
              if (!port || port === DEFAULT_PORTS[typeRef.current]) {
                form.setFieldValue('port', DEFAULT_PORTS[next]);
                setDirty(true);
              }
              typeRef.current = next;
            }}
          >
            {(Object.keys(TYPE_LABEL) as DataSourceType[]).map((t) => (
              <Radio.Button key={t} value={t}>
                {TYPE_LABEL[t]}
              </Radio.Button>
            ))}
          </Radio.Group>
        </Form.Item>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 140px', gap: 12 }}>
          <Form.Item
            name="host"
            label="主机地址"
            rules={[
              { required: true, message: '请输入主机地址（如 192.168.10.11）' },
              {
                pattern: /^[A-Za-z0-9.-]+$/,
                message: '主机地址格式不正确，请勿包含 http:// 、路径或端口',
              },
            ]}
          >
            <Input placeholder="192.168.10.11" />
          </Form.Item>
          <Form.Item
            name="port"
            label="端口"
            rules={[
              { required: true, message: '请输入端口' },
              { type: 'number', min: 1, max: 65535, message: '端口需为 1–65535 之间的整数' },
            ]}
          >
            <InputNumber style={{ width: '100%' }} placeholder="9030" />
          </Form.Item>
        </div>

        <Form.Item
          name="dbName"
          label="默认库"
          rules={[
            { required: true, message: '请输入默认库' },
            { pattern: /^\S+$/, message: '库名不能包含空格' },
            { max: 64, message: '默认库不能超过 64 个字符' },
          ]}
        >
          <Input placeholder="data_model" />
        </Form.Item>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Form.Item
            name="username"
            label="用户名"
            rules={[{ required: true, message: '请输入用户名' }]}
          >
            <Input placeholder="data_model" autoComplete="off" />
          </Form.Item>
          <Form.Item
            name="password"
            label="密码"
            rules={[
              {
                required: !isEdit,
                message: '请输入密码',
              },
              { min: 8, max: 128, message: '密码长度需为 8–128 个字符' },
            ]}
          >
            <Input.Password
              placeholder={isEdit ? '已加密保存，留空则不修改' : '请输入密码'}
              autoComplete="new-password"
            />
          </Form.Item>
        </div>

        <Form.Item
          name="extraParams"
          label="额外参数"
          tooltip="JSON，可选，例如开启 rewriteBatchedStatements"
          rules={[
            {
              validator: (_, value: string) => {
                if (!value || !value.trim()) return Promise.resolve();
                try {
                  const parsed = JSON.parse(value);
                  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return Promise.resolve();
                  return Promise.reject(new Error('额外参数需为合法 JSON 对象，如 {"connectTimeout":"10s"}'));
                } catch {
                  return Promise.reject(new Error('额外参数需为合法 JSON 对象，如 {"connectTimeout":"10s"}'));
                }
              },
            },
          ]}
        >
          <Input.TextArea rows={3} placeholder='{"connectTimeout":"10s"}' />
        </Form.Item>

        <Form.Item name="remark" label="备注" rules={[{ max: 200, message: '备注不能超过 200 个字符' }]}>
          <Input.TextArea rows={3} placeholder="生产 ODS 集群" showCount maxLength={200} />
        </Form.Item>
      </Form>

      {testResult ? (
        <div className={`test-banner ${testResult.success ? 'test-banner--success' : 'test-banner--error'}`}>
          {testResult.success ? <CheckCircleFilled /> : <CloseCircleFilled />}
          <div>
            <div style={{ fontWeight: 600 }}>
              {testResult.success
                ? `连接成功（耗时 ${testResult.latencyMs}ms）`
                : testFailureText(testResult, {
                    host: form.getFieldValue('host') || record?.host || '',
                    port: form.getFieldValue('port') || record?.port || 0,
                    dbName: form.getFieldValue('dbName') || record?.dbName || '',
                  })}
            </div>
          </div>
        </div>
      ) : (
        <div className="form-hint" style={{ marginTop: 4 }}>
          测试连接统一执行 JDBC <span className="mono">SELECT 1</span>，超时 15s。测试失败不影响保存，状态会记为「异常」。
        </div>
      )}
    </Drawer>
  );
}
