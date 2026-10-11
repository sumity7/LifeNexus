/**
 * Code-split pages, keyed by route. App.jsx turns these into lazy components; navigation links
 * call `preloadPage` on hover/focus so the code is usually there before the click.
 */
export const PAGE_LOADERS = {
  '/': () => import('../pages/dashboard/DashboardPage'),
  '/tasks': () => import('../pages/tasks/TasksPage'),
  '/habits': () => import('../pages/habits/HabitsPage'),
  '/goals': () => import('../pages/goals/GoalsPage'),
  '/goals/:id': () => import('../pages/goals/GoalDetailPage'),
  '/calendar': () => import('../pages/calendar/CalendarPage'),
  '/notes': () => import('../pages/notes/NotesPage'),
  '/finance': () => import('../pages/finance/FinancePage'),
  '/health': () => import('../pages/health/HealthPage'),
  '/routines': () => import('../pages/routines/RoutinesPage'),
  '/reminders': () => import('../pages/reminders/RemindersPage'),
  '/analytics': () => import('../pages/analytics/AnalyticsPage'),
  '/search': () => import('../pages/search/SearchPage'),
  '/settings': () => import('../pages/settings/SettingsPage'),
  '/projects': () => import('../pages/projects/ProjectsPage'),
  '/projects/:id': () => import('../pages/projects/ProjectDetailPage'),
  '/documents': () => import('../pages/documents/DocumentsPage'),
  '/journal': () => import('../pages/journal/JournalPage'),
  '/focus': () => import('../pages/focus/FocusPage'),
  '/ai': () => import('../pages/ai/AIPage'),
  '/review': () => import('../pages/review/ReviewPage'),
};

export function preloadPage(path) {
  // A failed preload is not an error: the real navigation will load (and report) it again.
  PAGE_LOADERS[path]?.().catch(() => {});
}

/** Props that warm a page's code as soon as the user shows intent to open it. */
export const preloadOn = (path) => ({
  onMouseEnter: () => preloadPage(path),
  onFocus: () => preloadPage(path),
  onTouchStart: () => preloadPage(path),
});
