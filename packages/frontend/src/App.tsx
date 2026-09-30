import { useEffect } from 'react';
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { Layout } from './components/Layout';
import Dashboard from './pages/Dashboard';
import CheckIn from './pages/CheckIn';
import CheckOut from './pages/CheckOut';
import MapPage from './pages/MapPage';
import EventLog from './pages/EventLog';

export default function App() {
  const navigate = useNavigate();

  // POC 的入口網站固定是「戰情儀表板」（單頁應用，沒有網址路徑可還原）。
  // 這裡只在「真的重新整理」時才強制回到 /dash，直接輸入網址或書籤仍可保留深連結（如地圖定位）。
  useEffect(() => {
    const navEntry = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    if (navEntry?.type === 'reload') {
      navigate('/dash', { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Navigate to="/dash" replace />} />
        <Route path="/dash" element={<Dashboard />} />
        <Route path="/in" element={<CheckIn />} />
        <Route path="/out" element={<CheckOut />} />
        <Route path="/map" element={<MapPage />} />
        <Route path="/log" element={<EventLog />} />
        <Route path="*" element={<Navigate to="/dash" replace />} />
      </Route>
    </Routes>
  );
}
