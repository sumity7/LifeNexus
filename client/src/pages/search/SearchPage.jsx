import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import clsx from 'clsx';
import { Clock, Search, X } from 'lucide-react';
import { Button, Card, EmptyState, ErrorState, IconButton, Input, PageHeader, SkeletonList } from '../../components/ui';
import { useSearchAdvanced } from '../../api/hooks';
import { useAuth } from '../../context/AuthContext';
import { useDebounce } from '../../hooks/useUtils';
import { buildSearchGroups, SEARCH_TYPE_OPTIONS } from '../../features/search/searchItems';
import { addRecentSearch, readRecentSearches } from '../../features/search/recent';

export default function SearchPage() {
  const [params, setParams] = useSearchParams();
  const [value, setValue] = useState(params.get('q') ?? '');
  const [types, setTypes] = useState(() => (params.get('types') ?? '').split(',').filter(Boolean));
  const [from, setFrom] = useState(params.get('from') ?? '');
  const [to, setTo] = useState(params.get('to') ?? '');
  const [tag, setTag] = useState(params.get('tag') ?? '');
  const q = useDebounce(value.trim(), 300);
  const { user } = useAuth();
  const search = useSearchAdvanced({ q, types: types.join(',') || undefined, from: from || undefined, to: to || undefined, tag: tag || undefined });
  const [recent, setRecent] = useState(readRecentSearches);

  useEffect(() => {
    const next = {};
    if (q) next.q = q;
    if (types.length) next.types = types.join(',');
    if (from) next.from = from;
    if (to) next.to = to;
    if (tag) next.tag = tag;
    setParams(next, { replace: true });
  }, [q, types, from, to, tag, setParams]);

  useEffect(() => {
    if (q.length >= 2 && search.data?.total > 0) setRecent(addRecentSearch(q));
  }, [q, search.data?.total]);

  const groups = buildSearchGroups(search.data?.results, user?.preferences?.currency);
  const toggleType = (t) => setTypes((list) => (list.includes(t) ? list.filter((x) => x !== t) : [...list, t]));
  const filtering = types.length || from || to || tag;

  return (
    <div className="page" style={{ maxWidth: 900 }}>
      <PageHeader title="Search" subtitle="Everything in LifeNexus — tasks, calendar, goals, projects, notes, journal, documents, finance, focus and health." />
      <div className="input-group" style={{ marginBottom: 12 }}>
        <Search aria-hidden="true" />
        <Input value={value} onChange={(e) => setValue(e.target.value)} placeholder="Search everything…" aria-label="Search everything" autoFocus style={{ height: 44, fontSize: 'var(--text-md)' }} />
        {value && <span className="input-group__suffix"><IconButton icon={X} size="sm" label="Clear search" onClick={() => setValue('')} /></span>}
      </div>
      <div className="toolbar" style={{ gap: 6 }}>
        <div className="choice-group" role="group" aria-label="Filter by type">
          {SEARCH_TYPE_OPTIONS.map((t) => <button key={t.value} type="button" className="choice" aria-pressed={types.includes(t.value)} onClick={() => toggleType(t.value)}>{t.label}</button>)}
        </div>
        <div className="toolbar__spacer" />
        <Input size="sm" type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From date" style={{ width: 140 }} />
        <span className="text-xs muted">to</span>
        <Input size="sm" type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To date" style={{ width: 140 }} />
        <Input size="sm" value={tag} onChange={(e) => setTag(e.target.value.toLowerCase())} placeholder="#tag" aria-label="Filter by tag" style={{ width: 110 }} />
        {filtering && <Button size="sm" variant="ghost" onClick={() => { setTypes([]); setFrom(''); setTo(''); setTag(''); }}>Clear filters</Button>}
      </div>

      {q.length < 2 ? (
        <Card>
          {recent.length ? (
            <div className="stack stack--sm">
              <p className="text-2xs muted weight-semibold" style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}>Recent searches</p>
              <div className="row row--wrap" style={{ gap: 6 }}>
                {recent.map((r) => <button key={r} type="button" className="ai-chip" onClick={() => setValue(r)}><Clock size={11} aria-hidden="true" style={{ display: 'inline', marginRight: 4, verticalAlign: '-1px' }} />{r}</button>)}
              </div>
            </div>
          ) : (
            <EmptyState icon={Search} title="Start typing to search" description="Type at least two characters. Tip: press Ctrl/⌘ + K anywhere for quick search." />
          )}
        </Card>
      ) : search.isPending ? (
        <Card flush><SkeletonList rows={6} /></Card>
      ) : search.isError && !search.data ? (
        <Card><ErrorState error={search.error} onRetry={() => search.refetch()} /></Card>
      ) : search.data.total === 0 ? (
        <Card><EmptyState icon={Search} title={`No results for "${q}"`} description={filtering ? 'Try clearing the filters.' : 'Check the spelling or try a broader term.'} /></Card>
      ) : (
        <div className={clsx('stack')} style={{ gap: 16, opacity: search.isPlaceholderData ? 0.6 : 1 }}>
          <p className="text-sm muted" aria-live="polite">{search.data.total} result{search.data.total === 1 ? '' : 's'} for “{search.data.query}”</p>
          {groups.map((group) => (
            <Card key={group.id} title={group.label} icon={group.icon} flush>
              <div className="list">
                {group.items.map((item) => (
                  <Link key={item.id} to={item.to} className="list-row list-row--interactive">
                    <div className="grow">
                      <p className="text-sm weight-medium truncate">{item.label}</p>
                      {item.sub && <p className="text-xs muted truncate">{item.sub}</p>}
                    </div>
                  </Link>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
