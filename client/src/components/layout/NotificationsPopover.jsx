import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { formatDistanceToNowStrict } from 'date-fns';
import { Bell, CheckCheck, Inbox, X } from 'lucide-react';
import { Button, EmptyState, ErrorState, IconButton, SkeletonList } from '../ui';
import { useDeleteNotification, useMarkAllNotificationsRead, useMarkNotificationRead, useNotifications } from '../../api/hooks';

const TYPE_EMOJI = { task: '✅', goal: '🎯', habit: '🔥', routine: '🔁', calendar: '📅', document: '📄', finance: '💳', ai: '✨', system: 'ℹ️' };

export function NotificationsButton() {
  const [open, setOpen] = useState(false);
  const notifications = useNotifications();
  const markRead = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead();
  const remove = useDeleteNotification();
  const navigate = useNavigate();
  const ref = useRef(null);
  const unread = notifications.data?.meta?.unread ?? 0;

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => !ref.current?.contains(e.target) && setOpen(false);
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const openItem = (n) => {
    if (!n.readAt) markRead.mutate(n._id);
    setOpen(false);
    if (n.href) navigate(n.href);
  };

  return (
    <div className="notif" ref={ref}>
      <button type="button" className="btn btn--ghost btn--icon notif__trigger" aria-label={`Notifications${unread ? ` (${unread} unread)` : ''}`} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <Bell aria-hidden="true" />
        {unread > 0 && <span className="notif__badge">{unread > 9 ? '9+' : unread}</span>}
      </button>
      {open && (
        <div className="notif__panel" role="dialog" aria-label="Notifications">
          <div className="notif__head">
            <strong>Notifications</strong>
            <div className="row" style={{ gap: 2 }}>
              {unread > 0 && <Button size="xs" variant="ghost" icon={CheckCheck} onClick={() => markAll.mutate()} loading={markAll.isPending}>Mark all read</Button>}
              <IconButton icon={X} size="xs" label="Close" onClick={() => setOpen(false)} />
            </div>
          </div>
          <div className="notif__list">
            {notifications.isPending ? (
              <SkeletonList rows={3} />
            ) : notifications.isError ? (
              <ErrorState compact error={notifications.error} onRetry={() => notifications.refetch()} />
            ) : !notifications.data.data.length ? (
              <EmptyState compact icon={Inbox} title="You're all caught up" description="Deadlines, expiring documents and budgets will show up here." />
            ) : (
              notifications.data.data.map((n) => (
                <div key={n._id} className={clsx('notif__item', !n.readAt && 'is-unread')}>
                  <button type="button" className="notif__body" onClick={() => openItem(n)}>
                    <span className="notif__emoji" aria-hidden="true">{TYPE_EMOJI[n.type]}</span>
                    <span className="grow">
                      <span className="notif__title">{n.title}</span>
                      {n.body && <span className="notif__text">{n.body}</span>}
                      <span className="notif__time">{formatDistanceToNowStrict(new Date(n.createdAt), { addSuffix: true })}</span>
                    </span>
                  </button>
                  <IconButton icon={X} size="xs" label="Dismiss" onClick={() => remove.mutate(n._id)} />
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
