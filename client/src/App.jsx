import { lazy } from 'react';
import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { EditorProvider } from './context/EditorContext';
import { AppShell } from './components/layout/AppShell';
import { Spinner } from './components/ui';
import { PAGE_LOADERS } from './lib/pageLoaders';
import Login from './pages/auth/Login';
import Register from './pages/auth/Register';
import ForgotPassword from './pages/auth/ForgotPassword';
import ResetPassword from './pages/auth/ResetPassword';

const Dashboard = lazy(PAGE_LOADERS['/']);
const Tasks = lazy(PAGE_LOADERS['/tasks']);
const Habits = lazy(PAGE_LOADERS['/habits']);
const Goals = lazy(PAGE_LOADERS['/goals']);
const GoalDetail = lazy(PAGE_LOADERS['/goals/:id']);
const Calendar = lazy(PAGE_LOADERS['/calendar']);
const Notes = lazy(PAGE_LOADERS['/notes']);
const Finance = lazy(PAGE_LOADERS['/finance']);
const Health = lazy(PAGE_LOADERS['/health']);
const Routines = lazy(PAGE_LOADERS['/routines']);
const Reminders = lazy(PAGE_LOADERS['/reminders']);
const Analytics = lazy(PAGE_LOADERS['/analytics']);
const SearchPage = lazy(PAGE_LOADERS['/search']);
const Settings = lazy(PAGE_LOADERS['/settings']);
const Projects = lazy(PAGE_LOADERS['/projects']);
const ProjectDetail = lazy(PAGE_LOADERS['/projects/:id']);
const Documents = lazy(PAGE_LOADERS['/documents']);
const Journal = lazy(PAGE_LOADERS['/journal']);
const Focus = lazy(PAGE_LOADERS['/focus']);
const AI = lazy(PAGE_LOADERS['/ai']);
const Review = lazy(PAGE_LOADERS['/review']);
const NotFound = lazy(() => import('./pages/NotFoundPage'));

function FullscreenLoader() {
  return (
    <div className="fullscreen-center">
      <Spinner size="lg" label="Loading LifeNexus" />
    </div>
  );
}

function RequireAuth() {
  const { status } = useAuth();
  const location = useLocation();
  if (status === 'loading') return <FullscreenLoader />;
  if (status === 'unauthenticated') return <Navigate to="/login" replace state={{ from: location }} />;
  return (
    <EditorProvider>
      <Outlet />
    </EditorProvider>
  );
}

function PublicOnly() {
  const { status } = useAuth();
  const location = useLocation();
  if (status === 'loading') return <FullscreenLoader />;
  if (status === 'authenticated') {
    const from = location.state?.from;
    return <Navigate to={from ? `${from.pathname}${from.search ?? ''}` : '/'} replace />;
  }
  return <Outlet />;
}

export default function App() {
  return (
    <Routes>
      <Route element={<PublicOnly />}>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
      </Route>
      {/* Reachable regardless of current auth status — a reset link from email must always work. */}
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route element={<RequireAuth />}>
        <Route element={<AppShell />}>
          <Route index element={<Dashboard />} />
          <Route path="tasks" element={<Tasks />} />
          <Route path="habits" element={<Habits />} />
          <Route path="goals" element={<Goals />} />
          <Route path="goals/:id" element={<GoalDetail />} />
          <Route path="projects" element={<Projects />} />
          <Route path="projects/:id" element={<ProjectDetail />} />
          <Route path="documents" element={<Documents />} />
          <Route path="journal" element={<Journal />} />
          <Route path="focus" element={<Focus />} />
          <Route path="ai" element={<AI />} />
          <Route path="review" element={<Review />} />
          <Route path="calendar" element={<Calendar />} />
          <Route path="notes" element={<Notes />} />
          <Route path="finance" element={<Finance />} />
          <Route path="health" element={<Health />} />
          <Route path="routines" element={<Routines />} />
          <Route path="reminders" element={<Reminders />} />
          <Route path="analytics" element={<Analytics />} />
          <Route path="search" element={<SearchPage />} />
          <Route path="settings" element={<Settings />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Route>
    </Routes>
  );
}
