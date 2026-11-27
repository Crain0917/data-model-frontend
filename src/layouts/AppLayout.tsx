import { useState, type MouseEvent } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  DatabaseOutlined,
  PartitionOutlined,
  HistoryOutlined,
  MoonOutlined,
  SunOutlined,
  ThunderboltFilled,
} from '@ant-design/icons';
import { App, Button, Modal, Tooltip } from 'antd';
import { useTheme } from '../theme/ThemeProvider';
import { dirtyDraftIds, useFlowStore } from '../pages/FlowEditor/store';

const NAV = [
  { to: '/data-source', label: '数据源管理', icon: <DatabaseOutlined /> },
  { to: '/flow', label: '任务管理', icon: <PartitionOutlined /> },
  { to: '/logs', label: '任务日志', icon: <HistoryOutlined /> },
];

export default function AppLayout() {
  const { mode, toggle } = useTheme();
  const { message } = App.useApp();
  const location = useLocation();
  const navigate = useNavigate();
  const dirtyCount = useFlowStore((s) => dirtyDraftIds(s.nodes, s.drafts, s.baselines).length);
  const pendingLeavePath = useFlowStore((s) => s.pendingLeavePath);
  const requestLeave = useFlowStore((s) => s.requestLeave);
  const resolveLeave = useFlowStore((s) => s.resolveLeave);
  const dirtyNodeLabel = useFlowStore(
    (s) => s.nodes.find((n) => n.id === s.selectedNodeId)?.data.label || null,
  );
  const [leaveBusy, setLeaveBusy] = useState(false);
  const flush = location.pathname.endsWith('/editor');
  const workspace = location.pathname === '/data-source' || location.pathname === '/logs';
  const pageClass = flush ? 'page page--flush' : workspace ? 'page page--workspace' : 'page';

  const handleNav = (to: string) => (event: MouseEvent<HTMLAnchorElement>) => {
    if (location.pathname === to) return;
    event.preventDefault();
    if (requestLeave(to)) navigate(to);
  };

  const settleLeave = async (action: 'save' | 'discard' | 'cancel') => {
    const target = useFlowStore.getState().pendingLeavePath;
    setLeaveBusy(true);
    try {
      const result = await resolveLeave(action);
      if (result.error) {
        message.error(result.error, 6);
        return;
      }
      if (result.go && target) navigate(target);
    } finally {
      setLeaveBusy(false);
    }
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            <ThunderboltFilled style={{ fontSize: 19 }} />
          </div>
          <div className="brand-text">
            <div className="brand-name">DataFlow</div>
            <div className="brand-sub">可视化数据编排</div>
          </div>
        </div>

        <div className="nav-section-label">工作台</div>
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            onClick={handleNav(item.to)}
            className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
          >
            {item.icon}
            <span className="nav-label">{item.label}</span>
          </NavLink>
        ))}

        <div className="sidebar-footer">
          <Tooltip title={mode === 'light' ? '切换到暗色主题' : '切换到亮色主题'} placement="right">
            <button className="nav-item" onClick={toggle} style={{ border: 0, background: 'none', width: '100%', textAlign: 'left' }}>
              {mode === 'light' ? <MoonOutlined /> : <SunOutlined />}
              <span className="nav-label">{mode === 'light' ? '暗色主题' : '亮色主题'}</span>
            </button>
          </Tooltip>
          <div className="sidebar-user">
            <div className="avatar">DM</div>
            <div className="sidebar-user-meta">
              <div style={{ fontSize: 12.5, fontWeight: 600 }}>数据平台团队</div>
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>v1.0 · 内测</div>
            </div>
          </div>
        </div>
      </aside>

      <main className="app-main">
        <div className={pageClass}>
          <Outlet />
        </div>
      </main>

      <Modal
        open={Boolean(pendingLeavePath)}
        title="节点配置有未保存修改"
        closable={false}
        maskClosable={false}
        keyboard={false}
        footer={[
          <Button key="cancel" disabled={leaveBusy} onClick={() => void settleLeave('cancel')}>
            取消
          </Button>,
          <Button key="discard" danger disabled={leaveBusy} onClick={() => void settleLeave('discard')}>
            不保存
          </Button>,
          <Button
            key="save"
            type="primary"
            loading={leaveBusy}
            onClick={() => void settleLeave('save')}
          >
            保存
          </Button>,
        ]}
      >
        <div style={{ fontSize: 13, lineHeight: 1.8 }}>
          「{dirtyNodeLabel || '当前节点'}」的配置已修改但尚未保存。
          {dirtyCount > 1 ? `共有 ${dirtyCount} 个节点存在未保存修改。` : ''}
          保存后离开，或丢弃草稿恢复上次已保存内容。
        </div>
      </Modal>
    </div>
  );
}
