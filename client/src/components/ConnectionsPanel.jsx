import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Link2, Plus, Search, X } from 'lucide-react';
import { Badge, Button, Card, EmptyState, IconButton, Input, Modal, Select, SkeletonList } from './ui';
import { useCreateLink, useDeleteLink, useGraph, useSearch } from '../api/hooks';
import { useToast } from '../context/ToastContext';
import { useDebounce } from '../hooks/useUtils';
import { ENTITY_LABELS } from '../lib/constants';
import { buildSearchGroups } from '../features/search/searchItems';

const SEARCH_TO_ENTITY = { tasks: 'task', notes: 'note', goals: 'goal', projects: 'project', habits: 'habit', events: 'event', reminders: 'reminder', transactions: 'transaction', journal: 'journal', documents: 'document', focus: 'focus', routines: 'routine' };

/**
 * "Connected items" for any entity: structural relations (goal → tasks…) plus
 * user-made links, with a picker to link anything searchable.
 */
export function ConnectionsPanel({ type, id, compact = false, title = 'Connections' }) {
  const graph = useGraph(type, id);
  const remove = useDeleteLink();
  const toast = useToast();
  const [picking, setPicking] = useState(false);

  const nodes = graph.data ?? [];
  return (
    <Card
      title={title}
      icon={Link2}
      subtitle={nodes.length ? `${nodes.length} connected item${nodes.length === 1 ? '' : 's'}` : undefined}
      flush
      actions={<IconButton icon={Plus} size="sm" label="Link an item" onClick={() => setPicking(true)} />}
    >
      {graph.isPending ? (
        <SkeletonList rows={2} />
      ) : nodes.length === 0 ? (
        <EmptyState compact icon={Link2} title="Nothing connected yet" description="Link notes, documents, events or goals to keep context together." action={<Button size="sm" icon={Plus} onClick={() => setPicking(true)}>Link item</Button>} />
      ) : (
        <div className="list">
          {nodes.slice(0, compact ? 6 : 50).map((n) => (
            <div key={`${n.type}:${n.id}`} className="list-row" style={{ minHeight: 36 }}>
              <Badge>{ENTITY_LABELS[n.type] ?? n.type}</Badge>
              <Link to={n.href} className="grow truncate text-sm weight-medium">{n.label}</Link>
              {n.source === 'link' ? (
                <IconButton
                  icon={X}
                  size="xs"
                  label={`Unlink ${n.label}`}
                  loading={remove.isPending && remove.variables === n._id}
                  onClick={() => remove.mutate(n._id, { onError: (err) => toast.apiError(err, "Couldn't unlink") })}
                />
              ) : (
                <span className="text-2xs faint" title="Connected through structure (e.g. task belongs to goal)">auto</span>
              )}
            </div>
          ))}
        </div>
      )}
      {picking && <LinkPicker type={type} id={id} onClose={() => setPicking(false)} />}
    </Card>
  );
}

function LinkPicker({ type, id, onClose }) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('');
  const q = useDebounce(query.trim(), 200);
  const search = useSearch(q);
  const create = useCreateLink();
  const toast = useToast();

  const groups = useMemo(() => buildSearchGroups(search.data?.results).filter((g) => !filter || g.id === filter), [search.data, filter]);

  const link = (groupId, itemId) => {
    const toType = SEARCH_TO_ENTITY[groupId];
    if (!toType) return;
    create.mutate(
      { from: { type, id }, to: { type: toType, id: itemId } },
      { onSuccess: () => { toast.success('Linked'); onClose(); }, onError: (err) => toast.apiError(err, "Couldn't link") },
    );
  };

  return (
    <Modal open onClose={onClose} title="Link an item" description="Search anything in LifeNexus and connect it here." size="sm">
      <div className="stack">
        <div className="row">
          <div className="input-group grow">
            <Search aria-hidden="true" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search tasks, notes, documents…" aria-label="Search items to link" data-autofocus />
          </div>
          <Select size="sm" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="All types" style={{ width: 130 }} aria-label="Filter type"
            options={Object.entries(SEARCH_TO_ENTITY).map(([k, v]) => ({ value: k, label: ENTITY_LABELS[v] }))} />
        </div>
        {q.length < 2 ? (
          <p className="text-sm muted">Type at least two characters.</p>
        ) : search.isPending ? (
          <SkeletonList rows={3} />
        ) : !groups.length ? (
          <p className="text-sm muted">No matches.</p>
        ) : (
          <div className="stack stack--sm" style={{ maxHeight: 320, overflowY: 'auto' }}>
            {groups.map((g) => (
              <div key={g.id}>
                <p className="text-2xs muted weight-semibold" style={{ textTransform: 'uppercase', letterSpacing: '0.05em', margin: '6px 0 2px' }}>{g.label}</p>
                {g.items.map((item) => {
                  const itemId = item.id.replace(/^[a-z]+-/, '');
                  const self = SEARCH_TO_ENTITY[g.id] === type && itemId === id;
                  return (
                    <button key={item.id} type="button" className="menu__item" disabled={self || create.isPending} onClick={() => link(g.id, itemId)} style={{ width: '100%' }}>
                      <span className="truncate">{item.label}</span>
                      {item.sub && <span className="menu__item-hint truncate" style={{ maxWidth: 160 }}>{item.sub}</span>}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
