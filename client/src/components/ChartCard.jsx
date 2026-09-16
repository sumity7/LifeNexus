import { useState } from 'react';
import { BarChart3, Table2 } from 'lucide-react';
import { Card, IconButton } from './ui';

/**
 * Card wrapper for charts with a built-in accessible table view,
 * so every visualised value is also available as text.
 */
export function ChartCard({ title, subtitle, icon, legend, table, actions, height = 220, className, children }) {
  const [mode, setMode] = useState('chart');
  return (
    <Card
      title={title}
      subtitle={subtitle}
      icon={icon}
      className={className}
      actions={
        <>
          {actions}
          {table && (
            <IconButton
              icon={mode === 'chart' ? Table2 : BarChart3}
              label={mode === 'chart' ? 'Show data as table' : 'Show chart'}
              size="sm"
              onClick={() => setMode((m) => (m === 'chart' ? 'table' : 'chart'))}
            />
          )}
        </>
      }
    >
      {mode === 'chart' ? (
        <>
          {legend && <div style={{ marginBottom: 10 }}>{legend}</div>}
          <div style={{ height, minWidth: 0 }}>{children}</div>
        </>
      ) : (
        <DataTable {...table} />
      )}
    </Card>
  );
}

export function DataTable({ columns, rows, maxHeight = 280 }) {
  return (
    <div className="table-wrap" style={{ maxHeight }}>
      <table className="table">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} className={c.numeric ? 'num' : undefined} scope="col">{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={row.id ?? i}>
              {columns.map((c) => (
                <td key={c.key} className={c.numeric ? 'num' : undefined}>
                  {c.format ? c.format(row[c.key], row) : row[c.key] ?? '—'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
