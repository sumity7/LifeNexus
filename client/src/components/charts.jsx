import { useEffect, useState } from 'react';

const VARS = ['chart-1', 'chart-2', 'chart-3', 'chart-4', 'chart-grid', 'chart-axis', 'chart-baseline', 'surface', 'text-secondary', 'warning', 'success'];

function readVars() {
  const styles = getComputedStyle(document.documentElement);
  return Object.fromEntries(VARS.map((name) => [name.replace(/-(\w)/g, (_, c) => c.toUpperCase()), styles.getPropertyValue(`--${name}`).trim()]));
}

/**
 * Resolved chart colours for the active theme. SVG presentation attributes
 * can't reliably use CSS variables, so charts read concrete values and
 * re-render when the theme or accent changes.
 */
export function useChartTheme() {
  const [colors, setColors] = useState(readVars);
  useEffect(() => {
    const observer = new MutationObserver(() => setColors(readVars()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-accent'] });
    return () => observer.disconnect();
  }, []);

  return {
    ...colors,
    axisTick: { fill: colors.chartAxis, fontSize: 11 },
    grid: { stroke: colors.chartGrid, strokeDasharray: undefined, vertical: false },
    cursorFill: { fill: colors.chartGrid, opacity: 0.45 },
  };
}

/** Tooltip body shared by every chart; values always wear text colours, identity comes from the swatch. */
export function ChartTooltip({ active, payload, label, labelFormatter, valueFormatter = (v) => v }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip__title">{labelFormatter ? labelFormatter(label, payload) : label}</div>
      {payload.map((entry) => (
        <div key={entry.dataKey} className="chart-tooltip__row">
          <span className="chart-tooltip__swatch" style={{ '--swatch': entry.color ?? entry.fill }} />
          {entry.name}
          <strong>{entry.value === null || entry.value === undefined ? '—' : valueFormatter(entry.value, entry)}</strong>
        </div>
      ))}
    </div>
  );
}

export function ChartLegend({ items }) {
  return (
    <div className="legend" role="list">
      {items.map((item) => (
        <span key={item.label} className="legend__item" role="listitem">
          <span className={item.line ? 'legend__line' : 'legend__swatch'} style={{ '--swatch': item.color }} />
          {item.label}
        </span>
      ))}
    </div>
  );
}

/** Reads a CSS custom property (e.g. an entity colour) as a concrete value. */
export const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

/** Marks spec: bars ≤ 24px with a 4px rounded data-end. */
export const BAR_PROPS = { maxBarSize: 24, radius: [4, 4, 0, 0] };
export const LINE_PROPS = { strokeWidth: 2, dot: false, strokeLinecap: 'round', strokeLinejoin: 'round', isAnimationActive: true };
