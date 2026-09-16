import clsx from 'clsx';

/**
 * Horizontal ranked bars with direct labels — used for category breakdowns.
 * items: [{ key, label, value, color? }]. Values beyond `limit` fold into "Other".
 */
export function RankList({ items, formatValue = (v) => v, limit = 7, showShare = true, max }) {
  const sorted = [...items].sort((a, b) => b.value - a.value);
  const shown = sorted.length > limit ? [...sorted.slice(0, limit - 1), { key: '__other', label: 'Other', value: sorted.slice(limit - 1).reduce((s, i) => s + i.value, 0) }] : sorted;
  const total = sorted.reduce((s, i) => s + i.value, 0);
  const top = max ?? Math.max(...shown.map((i) => i.value), 1);

  return (
    <div className="rank-list">
      {shown.map((item) => (
        <div key={item.key} className={clsx('rank-row', item.color && `color-${item.color}`)}>
          <div className="rank-row__head">
            <span className="truncate">{item.label}</span>
            <span className="rank-row__value">
              {formatValue(item.value)}
              {showShare && total > 0 && <span className="rank-row__share">{Math.round((item.value / total) * 100)}%</span>}
            </span>
          </div>
          <div className="rank-row__track" aria-hidden="true">
            <div className="rank-row__bar" style={{ width: `${Math.max(2, (item.value / top) * 100)}%`, ...(item.color && { '--bar': 'var(--c)' }) }} />
          </div>
        </div>
      ))}
    </div>
  );
}
