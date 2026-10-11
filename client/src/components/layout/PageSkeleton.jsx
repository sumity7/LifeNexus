import { Skeleton, SkeletonList } from '../ui';

/** Shown in place of a page while its code is still loading. */
export function PageSkeleton() {
  return (
    <div className="page page--wide page-skeleton" role="status" aria-label="Loading page">
      <div className="page-header">
        <div>
          <Skeleton width={180} height={28} />
          <Skeleton width={260} height={14} style={{ marginTop: 10 }} />
        </div>
      </div>
      <div className="stat-grid" style={{ marginBottom: 16 }}>
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="card stat">
            <Skeleton width="50%" />
            <Skeleton height={24} width="40%" style={{ marginTop: 10 }} />
          </div>
        ))}
      </div>
      <div className="card"><SkeletonList rows={6} /></div>
    </div>
  );
}
