import { Navigate, Route, Routes } from 'react-router-dom';
import AppLayout from './layouts/AppLayout';
import DataSourcePage from './pages/DataSource';
import FlowListPage from './pages/FlowList';
import FlowEditorPage from './pages/FlowEditor';
import LogsPage from './pages/Logs';

export default function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<Navigate to="/data-source" replace />} />
        <Route path="/data-source" element={<DataSourcePage />} />
        <Route path="/flow" element={<FlowListPage />} />
        <Route path="/flow/:flowId/editor" element={<FlowEditorPage />} />
        <Route path="/logs" element={<LogsPage />} />
        <Route path="*" element={<Navigate to="/data-source" replace />} />
      </Route>
    </Routes>
  );
}
