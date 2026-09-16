import clsx from 'clsx';
import { AlertTriangle, RotateCw, WifiOff } from 'lucide-react';
import { Button } from './Button';

export const Spinner = ({ size, label = 'Loading' }) => (
  <span className={clsx('spinner', size === 'lg' && 'spinner--lg')} role="status" aria-label={label} />
);

export const Skeleton = ({ width = '100%', height = 14, radius, className, style }) => (
  <span
    className={clsx('skeleton', className)}
    style={{ display: 'block', width, height, borderRadius: radius, ...style }}
    aria-hidden="true"
  />
);

/** A stack of shimmering rows used as a generic list placeholder. */
export function SkeletonList({ rows = 4, gap = 12, className }) {
  return (
    <div className={clsx('stack', className)} style={{ gap, padding: '8px 16px' }} role="status" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="row" style={{ gap: 10 }}>
          <Skeleton width={18} height={18} radius={9} />
          <Skeleton width={`${55 + ((i * 17) % 35)}%`} />
        </div>
      ))}
    </div>
  );
}

export function EmptyState({ icon: Icon, title, description, action, compact, className }) {
  return (
    <div className={clsx('state', compact && 'state--compact', className)}>
      {Icon && (
        <div className="state__icon" aria-hidden="true">
          <Icon />
        </div>
      )}
      <p className="state__title">{title}</p>
      {description && <p className="state__description">{description}</p>}
      {action && <div className="state__action">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry, title, compact, className }) {
  const offline = error?.status === 0;
  return (
    <div className={clsx('state state--error', compact && 'state--compact', className)} role="alert">
      <div className="state__icon" aria-hidden="true">
        {offline ? <WifiOff /> : <AlertTriangle />}
      </div>
      <p className="state__title">{title ?? (offline ? "You're offline" : "Couldn't load this")}</p>
      <p className="state__description">{error?.message ?? 'Something went wrong. Please try again.'}</p>
      {onRetry && (
        <div className="state__action">
          <Button size="sm" icon={RotateCw} onClick={onRetry}>
            Try again
          </Button>
        </div>
      )}
    </div>
  );
}

/**
 * Renders the right state for a React Query result:
 * loading → `loading`, error → retryable error, empty → `empty`, otherwise `children(data)`.
 */
export function QueryState({ query, loading, empty, isEmpty, compact, children }) {
  if (query.isPending) return loading ?? <SkeletonList />;
  if (query.isError && !query.data) {
    return <ErrorState error={query.error} onRetry={() => query.refetch()} compact={compact} />;
  }
  if (empty && isEmpty?.(query.data)) return empty;
  return children(query.data);
}
