import { Suspense, useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import {
  Bell, CalendarDays, CalendarPlus, CheckSquare, Dumbbell, FileText, Flame, FolderKanban, LayoutDashboard, LogOut, Menu as MenuIcon, Moon,
  NotebookPen, PanelLeftClose, PanelLeftOpen, Plus, Search, Settings, Sparkles, Sun, Target, Wallet, Zap,
} from 'lucide-react';
import { Button, IconButton, Kbd, Menu, Spinner } from '../ui';
import { CommandPalette } from './CommandPalette';
import { QuickCapture } from './QuickCapture';
import { NotificationsButton } from './NotificationsPopover';
import { FocusPill } from '../../features/focus/FocusPill';
import { ErrorBoundary } from '../ErrorBoundary';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { useEditor } from '../../context/EditorContext';
import { useHotkey, useScrolled } from '../../hooks/useUtils';
import { ALL_NAV_ITEMS, NAV_SECTIONS, SETTINGS_NAV } from '../../lib/constants';
import { initials } from '../../lib/format';

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
export const MOD_KEY = isMac ? '⌘' : 'Ctrl';

function readCollapsed() {
  try {
    return localStorage.getItem('lifeos:sidebar-collapsed') === '1';
  } catch {
    return false;
  }
}

export function AppShell() {
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [captureOpen, setCaptureOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const openEditor = useEditor();

  useEffect(() => {
    const onOpen = () => setCaptureOpen(true);
    window.addEventListener('lifeos:capture', onOpen);
    return () => window.removeEventListener('lifeos:capture', onOpen);
  }, []);

  useEffect(() => {
    setMobileOpen(false);
    window.scrollTo(0, 0);
  }, [location.pathname]);

  useEffect(() => {
    try {
      localStorage.setItem('lifeos:sidebar-collapsed', collapsed ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, [collapsed]);

  useHotkey('mod+k', () => setPaletteOpen((o) => !o), { allowInInputs: true });
  useHotkey('mod+j', () => setCaptureOpen((o) => !o), { allowInInputs: true });
  useHotkey('c', () => setCaptureOpen(true));
  useHotkey('n', () => openEditor('task'));
  useHotkey('g d', () => navigate('/'));
  useHotkey('g t', () => navigate('/tasks'));
  useHotkey('g c', () => navigate('/calendar'));
  useHotkey('g h', () => navigate('/habits'));
  useHotkey('g n', () => navigate('/notes'));
  useHotkey('g a', () => navigate('/ai'));
  useHotkey('g f', () => navigate('/focus'));
  useHotkey('g j', () => navigate('/journal'));

  return (
    <div className={clsx('app', collapsed && 'is-collapsed')}>
      <a href="#main" className="skip-link">Skip to content</a>
      <Sidebar
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed((c) => !c)}
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
        onSearch={() => setPaletteOpen(true)}
      />
      {mobileOpen && <div className="sidebar-backdrop" onClick={() => setMobileOpen(false)} aria-hidden="true" />}
      <div className="main">
        <Topbar onMenu={() => setMobileOpen(true)} onSearch={() => setPaletteOpen(true)} />
        <main id="main" tabIndex={-1} style={{ outline: 'none' }}>
          <ErrorBoundary key={location.pathname}>
            <Suspense fallback={<div className="fullscreen-center" style={{ minHeight: '60vh' }}><Spinner size="lg" /></div>}>
              <Outlet />
            </Suspense>
          </ErrorBoundary>
        </main>
      </div>
      <MobileNav onMore={() => setMobileOpen(true)} />
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      <QuickCapture open={captureOpen} onClose={() => setCaptureOpen(false)} />
    </div>
  );
}

export const openQuickCapture = () => window.dispatchEvent(new Event('lifeos:capture'));

function Sidebar({ collapsed, onToggleCollapse, open, onClose, onSearch }) {
  const { user, logout } = useAuth();
  const { resolvedTheme, toggleTheme } = useTheme();
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <aside className={clsx('sidebar', open && 'is-open')} aria-label="Main navigation">
      <div className="sidebar__brand">
        <span className="brand-mark" aria-hidden="true"><Zap /></span>
        <span className="brand-name">LifeOS</span>
        <IconButton
          className="sidebar__collapse"
          icon={collapsed ? PanelLeftOpen : PanelLeftClose}
          label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          size="sm"
          onClick={onToggleCollapse}
        />
      </div>

      <button type="button" className="sidebar__search" onClick={onSearch} title={`Search (${MOD_KEY}+K)`}>
        <Search aria-hidden="true" />
        <span>Search…</span>
        <Kbd>{MOD_KEY} K</Kbd>
      </button>

      <nav className="sidebar__nav">
        {NAV_SECTIONS.map((section) => (
          <div key={section.label} className="nav-section">
            <div className="nav-section__label">{section.label}</div>
            {section.items.map((item) => (
              <NavLink key={item.to} to={item.to} end={item.end} className="nav-link" title={collapsed ? item.label : undefined}>
                <item.icon aria-hidden="true" />
                <span className="nav-label">{item.label}</span>
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      <div className="sidebar__footer">
        <NavLink to={SETTINGS_NAV.to} className="nav-link" title={collapsed ? 'Settings' : undefined}>
          <Settings aria-hidden="true" />
          <span className="nav-label">Settings</span>
        </NavLink>
        <Menu
          label="Account menu"
          align="start"
          items={[
            { heading: user?.email },
            { label: 'Settings', icon: Settings, onSelect: () => navigate('/settings') },
            { label: resolvedTheme === 'dark' ? 'Light mode' : 'Dark mode', icon: resolvedTheme === 'dark' ? Sun : Moon, onSelect: toggleTheme },
            { separator: true },
            { label: 'Sign out', icon: LogOut, onSelect: logout },
          ]}
          renderTrigger={(props) => (
            <button type="button" className="user-button" {...props} aria-label="Account menu">
              <span className="avatar" aria-hidden="true">{initials(user?.name)}</span>
              <div className="grow">
                <div className="user-button__name truncate">{user?.name}</div>
                <div className="user-button__email truncate">{user?.email}</div>
              </div>
            </button>
          )}
        />
      </div>
    </aside>
  );
}

function Topbar({ onMenu, onSearch }) {
  const location = useLocation();
  const scrolled = useScrolled();
  const openEditor = useEditor();
  const navigate = useNavigate();
  const { resolvedTheme, toggleTheme } = useTheme();

  const current =
    ALL_NAV_ITEMS.find((item) => (item.end ? location.pathname === item.to : location.pathname.startsWith(item.to) && item.to !== '/')) ??
    (location.pathname === '/search' ? { label: 'Search', icon: Search } : location.pathname.startsWith('/ai') ? { label: 'Assistant', icon: Sparkles } : ALL_NAV_ITEMS[0]);
  const CurrentIcon = current.icon;

  return (
    <header className={clsx('topbar', scrolled && 'is-scrolled')}>
      <IconButton className="topbar__menu" icon={MenuIcon} label="Open navigation" onClick={onMenu} />
      <div className="topbar__crumb">
        <CurrentIcon aria-hidden="true" />
        <strong>{current.label}</strong>
      </div>
      <div className="topbar__spacer" />
      <FocusPill />
      <IconButton className="mobile-only" icon={Search} label="Search" onClick={onSearch} />
      <IconButton icon={Zap} label={`Quick capture (${MOD_KEY}+J)`} onClick={openQuickCapture} />
      <NotificationsButton />
      <IconButton icon={resolvedTheme === 'dark' ? Sun : Moon} label={resolvedTheme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'} onClick={toggleTheme} />
      <Menu
        label="Create new"
        items={[
          { label: 'Quick capture', icon: Zap, hint: 'C', onSelect: openQuickCapture },
          { separator: true },
          { label: 'Task', icon: CheckSquare, hint: 'N', onSelect: () => openEditor('task') },
          { label: 'Event', icon: CalendarPlus, onSelect: () => openEditor('event') },
          { label: 'Note', icon: NotebookPen, onSelect: () => openEditor('note') },
          { label: 'Expense', icon: Wallet, onSelect: () => openEditor('transaction', { defaults: { type: 'expense' } }) },
          { label: 'Reminder', icon: Bell, onSelect: () => openEditor('reminder') },
          { separator: true },
          { label: 'Habit', icon: Flame, onSelect: () => openEditor('habit') },
          { label: 'Goal', icon: Target, onSelect: () => openEditor('goal') },
          { label: 'Project', icon: FolderKanban, onSelect: () => openEditor('project') },
          { label: 'Workout', icon: Dumbbell, onSelect: () => openEditor('workout') },
          { label: 'Document', icon: FileText, onSelect: () => navigate('/documents?upload=1') },
        ]}
        renderTrigger={(props) => (
          <Button variant="primary" size="sm" icon={Plus} {...props}>
            <span className="desktop-only">New</span>
          </Button>
        )}
      />
    </header>
  );
}

function MobileNav({ onMore }) {
  const items = [
    { to: '/', label: 'Home', icon: LayoutDashboard, end: true },
    { to: '/tasks', label: 'Tasks', icon: CheckSquare },
    { to: '/calendar', label: 'Calendar', icon: CalendarDays },
    { to: '/ai', label: 'Assistant', icon: Sparkles },
  ];
  return (
    <nav className="mobile-nav" aria-label="Quick navigation">
      {items.map((item) => (
        <NavLink key={item.to} to={item.to} end={item.end} className="mobile-nav__item">
          <item.icon aria-hidden="true" />
          {item.label}
        </NavLink>
      ))}
      <button type="button" className="mobile-nav__item" onClick={onMore}>
        <MenuIcon aria-hidden="true" />
        More
      </button>
    </nav>
  );
}
