const cache = new Map();

function formatter(key, factory) {
  if (!cache.has(key)) cache.set(key, factory());
  return cache.get(key);
}

export function formatCurrency(amount, currency = 'USD', { compact = false, signed = false } = {}) {
  const value = Number(amount) || 0;
  const useCompact = compact && Math.abs(value) >= 10_000;
  const fmt = formatter(`cur:${currency}:${compact}:${useCompact}`, () =>
    new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      notation: useCompact ? 'compact' : 'standard',
      minimumFractionDigits: compact ? 0 : 2,
      maximumFractionDigits: compact ? (useCompact ? 1 : 0) : 2,
    }),
  );
  const text = fmt.format(Math.abs(value));
  if (value < 0) return `−${text}`;
  return signed && value > 0 ? `+${text}` : text;
}

export const formatNumber = (value, options = {}) =>
  formatter(`num:${JSON.stringify(options)}`, () => new Intl.NumberFormat(undefined, options)).format(value ?? 0);

export const pluralize = (count, singular, plural = `${singular}s`) => `${count} ${count === 1 ? singular : plural}`;

export function formatDuration(minutes) {
  if (!minutes) return '0m';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!h) return `${m}m`;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export const formatLiters = (ml) => `${formatNumber((ml ?? 0) / 1000, { maximumFractionDigits: 2 })} L`;

export const percent = (part, total) => (total ? Math.min(100, Math.round((part / total) * 100)) : 0);

export function initials(name = '') {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('');
}
