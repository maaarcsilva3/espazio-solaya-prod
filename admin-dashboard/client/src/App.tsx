import { Navigate, Route, Routes } from 'react-router-dom';
import { Spinner } from 'flowbite-react';
import { useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import RequestsPage from './pages/RequestsPage';
import OfferingsPage from './pages/OfferingsPage';
import CalendarPage from './pages/CalendarPage';
import AdminsPage from './pages/AdminsPage';
import AgentsPage from './pages/AgentsPage';
import SettingsPage from './pages/SettingsPage';
import StatusesPage from './pages/StatusesPage';
import PipelinePage from './pages/PipelinePage';
import PipelineAnalyticsPage from './pages/PipelineAnalyticsPage';

export default function App() {
  const { admin, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner size="xl" />
      </div>
    );
  }

  if (!admin) {
    return (
      <Routes>
        <Route path="*" element={<LoginPage />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<DashboardPage />} />
        <Route path="requests" element={<RequestsPage />} />
        <Route path="pipeline/events" element={<PipelinePage pipeline="event_venue" />} />
        <Route path="pipeline/rooms" element={<PipelinePage pipeline="room_booking" />} />
        <Route path="pipeline/analytics" element={<PipelineAnalyticsPage />} />
        <Route path="calendar" element={<CalendarPage />} />
        <Route path="offerings" element={<OfferingsPage />} />
        <Route path="agents" element={<AgentsPage />} />
        <Route path="admins" element={<AdminsPage />} />
        <Route path="statuses" element={<StatusesPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
