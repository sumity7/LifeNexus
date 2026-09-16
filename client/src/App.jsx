import { lazy } from 'react';
import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { EditorProvider } from './context/EditorContext';
import { AppShell } from './components/layout/AppShell';
import { Spinner } from './components/ui';
import Login from './pages/auth/Login';
import Register from './pages/auth/Register';
import ForgotPassword from './pages/auth/ForgotPassword';
import ResetPassword from './pages/auth/ResetPassword';

const Dashboard = lazy(() => import('./pages/dashboard/DashboardPage'));
const Tasks = lazy(() => import('./pages/tasks/TasksPage'));
const Habits = lazy(() => import('./pages/habits/HabitsPage'));
const Goals = lazy(() => import('./pages/goals/GoalsPage'));
const GoalDetail = lazy(() => import('./pages/goals/GoalDetailPage'));
const Calendar = lazy(() => import('./pages/calendar/CalendarPage'));
const Notes = lazy(() => import('./pages/notes/NotesPage'));
const Finance = lazy(() => import('./pages/finance/FinancePage'));
const Health = lazy(() => import('./pages/health/HealthPage'));
const Routines = lazy(() => import('./pages/routines/RoutinesPage'));
const Reminders = lazy(() => import('./pages/reminders/RemindersPage'));
const Analytics = lazy(() => import('./pages/analytics/AnalyticsPage'));
const SearchPage = lazy(() => import('./pages/search/SearchPage'));
const Settings = lazy(() => import('./pages/settings/SettingsPage'));
const Projects = lazy(() => import('./pages/projects/ProjectsPage'));
const ProjectDetail = lazy(() => import('./pages/projects/ProjectDetailPage'));
const Documents = lazy(() => import('./pages/documents/DocumentsPage'));
const Journal = lazy(() => import('./pages/journal/JournalPage'));
const Focus = lazy(() => import('./pages/focus/FocusPage'));
const AI = lazy(() => import('./pages/ai/AIPage'));
const Review = lazy(() => import('./pages/review/ReviewPage'));
const NotFound = lazy(() => import('./pages/NotFoundPage'));

function FullscreenLoader() {
  return (
    <div className="fullscreen-center">
      <Spinner size="lg" label="Loading LifeOS" />
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
