import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  DatabaseOutlined,
  PartitionOutlined,
  HistoryOutlined,
  MoonOutlined,
  SunOutlined,
  ThunderboltFilled,
} from '@ant-design/icons';
import { Tooltip } from 'antd';
import { useTheme } from '../theme/ThemeProvider';

const NAV = [
  { to: '/data-source', label: '数据源管理', icon: <DatabaseOutlined /> },
  { to: '/flow', label: '任务管理', icon: <PartitionOutlined /> },
  { to: '/logs', label: '任务日志', icon: <HistoryOutlined /> },
];

export default function AppLayout() {
  const { mode, toggle } = useTheme();
  const location = useLocation();
  const flush = location.pathname.endsWith('/editor');

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
        <div className={flush ? 'page page--flush' : 'page'}>
          <Outlet />
        </div>
      </main>
    </div>
  );
}
