import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bell, BookHeart, CalendarPlus, CheckSquare, Clock, CornerDownLeft, Dumbbell, FileText, Flame, FolderKanban, LogOut, Moon, NotebookPen, Plus, Search, Sparkles, Sun, Target, Timer, Wallet, Zap,
} from 'lucide-react';
import { addRecentSearch, readRecentSearches } from '../../features/search/recent';
import { Kbd, Modal, Spinner } from '../ui';
import { useSearch } from '../../api/hooks';
import { useDebounce } from '../../hooks/useUtils';
import { useEditor } from '../../context/EditorContext';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { ALL_NAV_ITEMS } from '../../lib/constants';
import { buildSearchGroups } from '../../features/search/searchItems';

export function CommandPalette({ open, onClose }) {
  return (
    <Modal open={open} onClose={onClose} bare overlayClassName="cmdk-overlay" className="cmdk">
      <PaletteBody onClose={onClose} />
    </Modal>
  );
}

function PaletteBody({ onClose }) {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const debounced = useDebounce(query.trim(), 200);
  const search = useSearch(debounced);
  const navigate = useNavigate();
  const openEditor = useEditor();
  const { resolvedTheme, toggleTheme } = useTheme();
  const { logout, user } = useAuth();
  const listRef = useRef(null);
  const listId = useId();

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matches = (item) => !q || item.label.toLowerCase().includes(q) || item.keywords?.some((k) => k.includes(q));

    const actions = [
      { id: 'capture', label: 'Quick capture', icon: Zap, keywords: ['add', 'capture', 'quick', 'anything'], hint: 'C', run: () => window.dispatchEvent(new Event('lifeos:capture')) },
      { id: 'ask-ai', label: 'Ask the assistant', icon: Sparkles, keywords: ['ai', 'chat', 'assistant', 'ask'], run: () => navigate(q ? `/ai?prompt=${encodeURIComponent(query.trim())}` : '/ai') },
      { id: 'new-task', label: 'New task', icon: CheckSquare, keywords: ['add', 'todo', 'create'], hint: 'N', run: () => openEditor('task') },
      { id: 'new-project', label: 'New project', icon: FolderKanban, keywords: ['add', 'create'], run: () => openEditor('project') },
      { id: 'focus', label: 'Start focus session', icon: Timer, keywords: ['pomodoro', 'timer', 'deep work'], run: () => navigate('/focus') },
      { id: 'journal', label: "Write today's journal", icon: BookHeart, keywords: ['reflect', 'diary', 'mood'], run: () => navigate('/journal') },
      { id: 'upload', label: 'Upload document', icon: FileText, keywords: ['file', 'passport', 'vault'], run: () => navigate('/documents?upload=1') },
      { id: 'new-event', label: 'New calendar event', icon: CalendarPlus, keywords: ['add', 'meeting', 'schedule'], run: () => openEditor('event') },
      { id: 'new-note', label: 'New note', icon: NotebookPen, keywords: ['write', 'create'], run: () => openEditor('note') },
      { id: 'log-expense', label: 'Log expense', icon: Wallet, keywords: ['spend', 'money', 'transaction', 'finance'], run: () => openEditor('transaction', { defaults: { type: 'expense' } }) },
      { id: 'log-income', label: 'Log income', icon: Wallet, keywords: ['money', 'salary', 'transaction'], run: () => openEditor('transaction', { defaults: { type: 'income' } }) },
      { id: 'new-reminder', label: 'New reminder', icon: Bell, keywords: ['birthday', 'renewal', 'deadline'], run: () => openEditor('reminder') },
      { id: 'new-habit', label: 'New habit', icon: Flame, keywords: ['streak'], run: () => openEditor('habit') },
      { id: 'new-goal', label: 'New goal', icon: Target, keywords: ['objective'], run: () => openEditor('goal') },
      { id: 'log-workout', label: 'Log workout', icon: Dumbbell, keywords: ['exercise', 'health', 'run', 'gym'], run: () => openEditor('workout') },
      {
        id: 'toggle-theme',
        label: resolvedTheme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode',
        icon: resolvedTheme === 'dark' ? Sun : Moon,
        keywords: ['theme', 'dark', 'light', 'appearance'],
        run: toggleTheme,
      },
      { id: 'logout', label: 'Sign out', icon: LogOut, keywords: ['logout', 'exit'], run: logout },
    ];

    const pages = ALL_NAV_ITEMS.map((item) => ({
      id: `nav-${item.to}`,
      label: item.label,
      icon: item.icon,
      keywords: ['go', 'open', 'page'],
      meta: 'Page',
      run: () => navigate(item.to),
    }));

    const result = [];
    const matchedActions = actions.filter(matches);
    const matchedPages = pages.filter(matches);
    if (!q) {
      const recent = readRecentSearches();
      if (recent.length) result.push({ id: 'recent', label: 'Recent searches', items: recent.map((r) => ({ id: `recent-${r}`, label: r, icon: Clock, run: () => navigate(`/search?q=${encodeURIComponent(r)}`) })) });
    }
    if (matchedPages.length) result.push({ id: 'pages', label: 'Go to', items: matchedPages });
    if (matchedActions.length) result.push({ id: 'actions', label: 'Actions', items: q ? matchedActions : matchedActions.slice(0, 7) });

    if (debounced.length >= 2 && search.data) {
      for (const group of buildSearchGroups(search.data.results, user?.preferences?.currency)) {
        result.push({
          id: group.id,
          label: group.label,
          items: group.items.map((item) => ({ ...item, icon: group.icon, run: () => navigate(item.to) })),
        });
      }
      if (search.data.total > 0) {
        result.push({
          id: 'all',
          label: '',
          items: [{ id: 'see-all', label: `See all results for "${debounced}"`, icon: Search, run: () => navigate(`/search?q=${encodeURIComponent(debounced)}`) }],
        });
      }
    }
    return result;
  }, [query, debounced, search.data, openEditor, navigate, resolvedTheme, toggleTheme, logout, user]);

  const flat = groups.flatMap((g) => g.items);

  useEffect(() => setActiveIndex(0), [query, search.data]);

  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  const run = (item) => {
    if (debounced.length >= 2 && search.data?.total > 0 && !item.id.startsWith('nav-') && !item.id.startsWith('recent-')) addRecentSearch(debounced);
    onClose();
    item.run();
  };

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(flat.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (flat[activeIndex]) run(flat[activeIndex]);
    }
  };

  let index = -1;
  const searching = debounced.length >= 2 && search.isFetching;

  return (
    <>
      <div className="cmdk__input-wrap">
        <Search aria-hidden="true" />
        <input
          className="cmdk__input"
          placeholder="Search everything or type a command…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          data-autofocus
          role="combobox"
          aria-expanded="true"
          aria-controls={listId}
          aria-activedescendant={flat[activeIndex] ? `cmdk-${flat[activeIndex].id}` : undefined}
          aria-label="Command palette"
          autoComplete="off"
          spellCheck={false}
        />
        {searching ? <Spinner label="Searching" /> : <Kbd>Esc</Kbd>}
      </div>
      <div className="cmdk__list" id={listId} role="listbox" ref={listRef} aria-label="Results">
        {flat.length === 0 && (
          <div className="cmdk__empty">
            {debounced.length >= 2 && search.isPending ? 'Searching…' : `No results for "${query}"`}
          </div>
        )}
        {groups.map((group) => (
          <div key={group.id} role="group" aria-label={group.label || undefined}>
            {group.label && <div className="cmdk__group-label">{group.label}</div>}
            {group.items.map((item) => {
              index += 1;
              const i = index;
              const Icon = item.icon ?? Plus;
              return (
                <div
                  key={item.id}
                  id={`cmdk-${item.id}`}
                  role="option"
                  aria-selected={i === activeIndex}
                  className="cmdk__item"
                  onMouseMove={() => i !== activeIndex && setActiveIndex(i)}
                  onClick={() => run(item)}
                >
                  <span className="cmdk__item-icon"><Icon aria-hidden="true" /></span>
                  <span className="cmdk__item-text">
                    <span className="truncate" style={{ display: 'block' }}>{item.label}</span>
                    {item.sub && <span className="cmdk__item-sub truncate" style={{ display: 'block' }}>{item.sub}</span>}
                  </span>
                  {item.hint && <Kbd>{item.hint}</Kbd>}
                  {item.meta && <span className="cmdk__item-meta">{item.meta}</span>}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <div className="cmdk__footer" aria-hidden="true">
        <span><Kbd>↑</Kbd><Kbd>↓</Kbd> navigate</span>
        <span><Kbd><CornerDownLeft size={10} /></Kbd> select</span>
        <span><Kbd>Esc</Kbd> close</span>
      </div>
    </>
  );
}
