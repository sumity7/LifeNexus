import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { format } from 'date-fns';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Activity, BedDouble, ChevronLeft, ChevronRight, Droplet, Dumbbell, Footprints, Minus, Plus, Smile } from 'lucide-react';
import {
  Button, Card, ChoiceGroup, EmptyState, ErrorState, Field, IconButton, Input, PageHeader, ProgressRing, Skeleton, SkeletonList, StatTile, Textarea,
} from '../../components/ui';
import { ChartCard } from '../../components/ChartCard';
import { BAR_PROPS, ChartLegend, ChartTooltip, LINE_PROPS, useChartTheme } from '../../components/charts';
import { useAddWater, useHealthLog, useHealthSummary, useUpsertHealthLog, useWorkouts } from '../../api/hooks';
import { useEditor } from '../../context/EditorContext';
import { useToast } from '../../context/ToastContext';
import { INTENSITIES, WORKOUT_META } from '../../lib/constants';
import { addDaysKey, formatKey, fromKey, relativeDay, todayKey } from '../../lib/dates';
import { formatDuration, formatLiters, percent } from '../../lib/format';

const MOODS = ['😞', '🙁', '😐', '🙂', '😄'];
const MOOD_LABELS = ['Awful', 'Low', 'Okay', 'Good', 'Great'];

export default function HealthPage() {
  const today = todayKey();
  const [params, setParams] = useSearchParams();
  const requested = params.get('date');
  const date = requested && /^\d{4}-\d{2}-\d{2}$/.test(requested) && requested <= today ? requested : today;
  const setDate = (key) => setParams(key === today ? {} : { date: key }, { replace: true });

  const openEditor = useEditor();
  const theme = useChartTheme();
  const log = useHealthLog(date);
  const summary = useHealthSummary(today, 14);
  const longSummary = useHealthSummary(today, 90);
  const w = longSummary.data?.weight;
  const workouts = useWorkouts(addDaysKey(today, -29), today);

  const s = summary.data;
  const series = useMemo(() => (s?.series ?? []).map((d) => ({ ...d, label: format(fromKey(d.date), 'EEE d') })), [s]);

  return (
    <div className="page page--wide">
      <PageHeader
        title="Health"
        subtitle="Hydration, sleep, mood and movement."
        actions={
          <>
            <div className="row" style={{ gap: 2 }}>
              <IconButton icon={ChevronLeft} label="Previous day" onClick={() => setDate(addDaysKey(date, -1))} />
              <span className="weight-medium" style={{ minWidth: 132, textAlign: 'center' }} aria-live="polite">
                {relativeDay(date, { weekday: false })}{date !== today && ` · ${formatKey(date, 'EEE')}`}
              </span>
              <IconButton icon={ChevronRight} label="Next day" disabled={date >= today} onClick={() => setDate(addDaysKey(date, 1))} />
            </div>
            <Button variant="primary" icon={Dumbbell} onClick={() => openEditor('workout', { defaults: { date } })}>Log workout</Button>
          </>
        }
      />

      {log.isPending ? (
        <div className="health-grid" style={{ marginBottom: 16 }}>
          {Array.from({ length: 4 }, (_, i) => <Card key={i}><Skeleton height={110} /></Card>)}
        </div>
      ) : log.isError ? (
        <Card style={{ marginBottom: 16 }}><ErrorState error={log.error} onRetry={() => log.refetch()} /></Card>
      ) : (
        <DailyLog key={date} date={date} log={log.data} goals={s?.goals} />
      )}

      <h2 className="dash-section__title" style={{ margin: '28px 0 10px' }}>Last 14 days</h2>
      {summary.isError && !s ? (
        <Card><ErrorState error={summary.error} onRetry={() => summary.refetch()} /></Card>
      ) : (
        <>
          <div className="stat-grid" style={{ marginBottom: 16 }}>
            {!s ? (
              Array.from({ length: 4 }, (_, i) => <div key={i} className="card stat"><Skeleton width="40%" /><Skeleton height={24} width="50%" style={{ marginTop: 10 }} /></div>)
            ) : (
              <>
                <StatTile icon={BedDouble} label="Average sleep" value={s.averages.sleepHours !== null ? `${s.averages.sleepHours}h` : '—'} meta={`${s.sleepGoalDays} nights at ${s.goals.sleepGoalHours}h+`} />
                <StatTile icon={Droplet} label="Average water" value={s.averages.waterMl !== null ? formatLiters(s.averages.waterMl) : '—'} meta={`Goal met ${s.waterGoalDays} of ${s.daysLogged} days`} />
                <StatTile icon={Smile} label="Average mood" value={s.averages.mood !== null ? `${s.averages.mood}/5` : '—'} meta={s.averages.energy !== null ? `Energy ${s.averages.energy}/5` : 'Not logged'} />
                <StatTile icon={Activity} label="Workouts" value={s.workouts.count} meta={`${formatDuration(s.workouts.minutes)} total`} />
              </>
            )}
          </div>

          <div className="grid-3" style={{ marginBottom: 16 }}>
            <ChartCard
              title="Water intake"
              height={190}
              table={{ columns: [{ key: 'label', label: 'Day' }, { key: 'waterMl', label: 'Water', numeric: true, format: (v) => formatLiters(v) }], rows: series }}
            >
              {!s ? <Skeleton height="100%" /> : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={series} margin={{ top: 12, right: 4, bottom: 0, left: -8 }}>
                    <CartesianGrid vertical={false} stroke={theme.chartGrid} />
                    <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: theme.chartBaseline }} tick={theme.axisTick} interval="preserveStartEnd" minTickGap={16} />
                    <YAxis tickLine={false} axisLine={false} tick={theme.axisTick} width={40} tickFormatter={(v) => `${v / 1000}L`} />
                    <Tooltip cursor={theme.cursorFill} content={<ChartTooltip valueFormatter={(v) => formatLiters(v)} />} />
                    <ReferenceLine y={s.goals.waterGoalMl} stroke={theme.textSecondary} strokeWidth={1} label={{ value: 'Goal', position: 'insideTopRight', fill: theme.chartAxis, fontSize: 11 }} />
                    <Bar dataKey="waterMl" name="Water" fill={theme.chart1} {...BAR_PROPS} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartCard>

            <ChartCard
              title="Sleep"
              height={190}
              table={{ columns: [{ key: 'label', label: 'Day' }, { key: 'sleepHours', label: 'Hours', numeric: true }], rows: series }}
            >
              {!s ? <Skeleton height="100%" /> : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={series} margin={{ top: 12, right: 4, bottom: 0, left: -16 }}>
                    <CartesianGrid vertical={false} stroke={theme.chartGrid} />
                    <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: theme.chartBaseline }} tick={theme.axisTick} interval="preserveStartEnd" minTickGap={16} />
                    <YAxis tickLine={false} axisLine={false} tick={theme.axisTick} width={40} domain={[0, 10]} tickFormatter={(v) => `${v}h`} />
                    <Tooltip cursor={theme.cursorFill} content={<ChartTooltip valueFormatter={(v) => `${v}h`} />} />
                    <ReferenceLine y={s.goals.sleepGoalHours} stroke={theme.textSecondary} strokeWidth={1} label={{ value: 'Goal', position: 'insideTopRight', fill: theme.chartAxis, fontSize: 11 }} />
                    <Bar dataKey="sleepHours" name="Sleep" fill={theme.chart1} {...BAR_PROPS} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartCard>

            <ChartCard
              title="Mood & energy"
              height={172}
              legend={<ChartLegend items={[{ label: 'Mood', color: theme.chart1, line: true }, { label: 'Energy', color: theme.chart2, line: true }]} />}
              table={{ columns: [{ key: 'label', label: 'Day' }, { key: 'mood', label: 'Mood', numeric: true }, { key: 'energy', label: 'Energy', numeric: true }], rows: series }}
            >
              {!s ? <Skeleton height="100%" /> : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
                    <CartesianGrid vertical={false} stroke={theme.chartGrid} />
                    <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: theme.chartBaseline }} tick={theme.axisTick} interval="preserveStartEnd" minTickGap={16} />
                    <YAxis domain={[1, 5]} ticks={[1, 3, 5]} tickLine={false} axisLine={false} tick={theme.axisTick} width={40} />
                    <Tooltip content={<ChartTooltip valueFormatter={(v) => `${v}/5`} />} cursor={{ stroke: theme.chartBaseline }} />
                    <Line type="monotone" dataKey="mood" name="Mood" stroke={theme.chart1} connectNulls {...LINE_PROPS} activeDot={{ r: 4, stroke: theme.surface, strokeWidth: 2 }} />
                    <Line type="monotone" dataKey="energy" name="Energy" stroke={theme.chart2} connectNulls {...LINE_PROPS} activeDot={{ r: 4, stroke: theme.surface, strokeWidth: 2 }} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </ChartCard>
          </div>
        </>
      )}

      {w?.series?.length > 1 && (
        <ChartCard
          title="Weight trend"
          subtitle={`Last 90 days · ${w.first} → ${w.latest} kg (${w.change > 0 ? '+' : ''}${w.change} kg)${s?.goals.targetWeightKg ? ` · target ${s.goals.targetWeightKg} kg` : ''}`}
          height={180}
          className="mb"
          table={{ columns: [{ key: 'date', label: 'Date' }, { key: 'weightKg', label: 'Weight (kg)', numeric: true }], rows: w.series }}
        >
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={w.series.map((x) => ({ ...x, label: format(fromKey(x.date), 'MMM d') }))} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
              <CartesianGrid vertical={false} stroke={theme.chartGrid} />
              <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: theme.chartBaseline }} tick={theme.axisTick} interval="preserveStartEnd" minTickGap={24} />
              <YAxis domain={['auto', 'auto']} tickLine={false} axisLine={false} tick={theme.axisTick} width={44} tickFormatter={(v) => `${v}kg`} />
              <Tooltip content={<ChartTooltip valueFormatter={(v) => `${v} kg`} />} cursor={{ stroke: theme.chartBaseline }} />
              {s?.goals.targetWeightKg && <ReferenceLine y={s.goals.targetWeightKg} stroke={theme.textSecondary} strokeWidth={1} label={{ value: 'Target', position: 'insideTopRight', fill: theme.chartAxis, fontSize: 11 }} />}
              <Line type="monotone" dataKey="weightKg" name="Weight" stroke={theme.chart1} {...LINE_PROPS} dot={{ r: 3, fill: theme.chart1, stroke: theme.surface, strokeWidth: 2 }} activeDot={{ r: 5, stroke: theme.surface, strokeWidth: 2 }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      <Card title="Recent workouts" icon={Dumbbell} subtitle="Last 30 days" flush actions={<Button size="sm" icon={Plus} onClick={() => openEditor('workout')}>Log workout</Button>}>
        {workouts.isPending ? (
          <SkeletonList rows={4} />
        ) : workouts.isError && !workouts.data ? (
          <ErrorState compact error={workouts.error} onRetry={() => workouts.refetch()} />
        ) : !workouts.data.length ? (
          <EmptyState compact icon={Dumbbell} title="No workouts logged" description="Log runs, strength sessions, yoga and more." />
        ) : (
          <div className="list">
            {workouts.data.map((w) => (
              <button key={w._id} type="button" className="list-row list-row--interactive" style={{ width: '100%', border: 0, background: 'none', textAlign: 'left' }} onClick={() => openEditor('workout', { item: w })}>
                <span className="icon-tile icon-tile--sm" aria-hidden="true">{WORKOUT_META[w.type]?.emoji}</span>
                <div className="grow">
                  <p className="text-sm weight-medium">{w.title || WORKOUT_META[w.type]?.label}</p>
                  <p className="text-xs muted">{relativeDay(w.date)} · {INTENSITIES.find((i) => i.value === w.intensity)?.label} intensity</p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <p className="text-sm weight-medium tabular">{formatDuration(w.durationMin)}</p>
                  <p className="text-xs muted tabular">{[w.distanceKm && `${w.distanceKm} km`, w.calories && `${w.calories} kcal`].filter(Boolean).join(' · ')}</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </Card>

      <style>{`
        .health-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 16px; }
        .health-water { display: flex; align-items: center; gap: 16px; }
        .health-water .ring__label { font-size: var(--text-sm); }
        @media (max-width: 1200px) { .health-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
        @media (max-width: 640px) { .health-grid { grid-template-columns: minmax(0, 1fr); } }
      `}</style>
    </div>
  );
}

const toNumber = (v) => (v === '' || v === null || v === undefined ? null : Number(v));

function DailyLog({ date, log, goals }) {
  const upsert = useUpsertHealthLog();
  const addWater = useAddWater();
  const toast = useToast();
  const [values, setValues] = useState(() => ({
    sleepHours: log.sleepHours ?? '',
    sleepQuality: log.sleepQuality,
    mood: log.mood,
    energy: log.energy,
    weightKg: log.weightKg ?? '',
    steps: log.steps ?? '',
    notes: log.notes ?? '',
  }));
  const [saved, setSaved] = useState(false);
  const waterGoal = goals?.waterGoalMl ?? 2500;

  const save = (patch) =>
    upsert.mutate(
      { date, ...patch },
      { onSuccess: () => setSaved(true), onError: (err) => toast.apiError(err, "Couldn't save your log") },
    );

  const setField = (field, value) => setValues((v) => ({ ...v, [field]: value }));
  const saveNumber = (field, { min, max, integer } = {}) => () => {
    const n = toNumber(values[field]);
    const original = log[field] ?? null;
    if (n !== null && (Number.isNaN(n) || n < min || n > max)) {
      toast.error('Invalid value', { description: `Enter a number between ${min} and ${max}.` });
      setField(field, original ?? '');
      return;
    }
    const next = n === null ? null : integer ? Math.round(n) : n;
    if (next !== original) save({ [field]: next });
  };
  const choose = (field) => (value) => {
    const next = values[field] === value ? null : value;
    setField(field, next);
    save({ [field]: next });
  };

  const water = log.waterMl ?? 0;
  const changeWater = (deltaMl) => addWater.mutate({ date, deltaMl }, { onError: (err) => toast.apiError(err, "Couldn't update water") });

  return (
    <>
      <p className="text-xs muted" style={{ marginBottom: 8, minHeight: 18 }} role="status" aria-live="polite">
        {upsert.isPending ? 'Saving…' : saved ? 'All changes saved' : `Logging ${relativeDay(date).toLowerCase()}`}
      </p>
      <div className="health-grid">
        <Card title="Water" icon={Droplet}>
          <div className="health-water">
            <ProgressRing value={percent(water, waterGoal)} size={88} stroke={7} label={`${percent(water, waterGoal)}% of water goal`}>
              <span className="tabular">{formatLiters(water)}</span>
            </ProgressRing>
            <div className="stack stack--sm">
              <p className="text-xs muted">Goal {formatLiters(waterGoal)}</p>
              <div className="row" style={{ gap: 4 }}>
                <IconButton icon={Minus} variant="secondary" size="sm" label="Remove 250 ml" disabled={water <= 0 || addWater.isPending} onClick={() => changeWater(-250)} />
                <Button size="sm" icon={Plus} onClick={() => changeWater(250)} disabled={addWater.isPending}>250</Button>
                <Button size="sm" icon={Plus} onClick={() => changeWater(500)} disabled={addWater.isPending}>500</Button>
              </div>
            </div>
          </div>
        </Card>

        <Card title="Sleep" icon={BedDouble}>
          <div className="stack">
            <Field label="Hours slept">
              <Input
                type="number"
                min={0}
                max={24}
                step={0.25}
                value={values.sleepHours}
                onChange={(e) => setField('sleepHours', e.target.value)}
                onBlur={saveNumber('sleepHours', { min: 0, max: 24 })}
                placeholder={`Goal ${goals?.sleepGoalHours ?? 8}h`}
              />
            </Field>
            <Field label="Quality">
              <ChoiceGroup label="Sleep quality" value={values.sleepQuality} onChange={choose('sleepQuality')} options={[1, 2, 3, 4, 5].map((n) => ({ value: n, label: String(n), title: `${n} of 5` }))} />
            </Field>
          </div>
        </Card>

        <Card title="Mood & energy" icon={Smile}>
          <div className="stack">
            <Field label="Mood">
              <ChoiceGroup label="Mood" value={values.mood} onChange={choose('mood')} options={MOODS.map((emoji, i) => ({ value: i + 1, emoji, title: MOOD_LABELS[i] }))} />
            </Field>
            <Field label="Energy">
              <ChoiceGroup label="Energy" value={values.energy} onChange={choose('energy')} options={[1, 2, 3, 4, 5].map((n) => ({ value: n, label: String(n), title: `Energy ${n} of 5` }))} />
            </Field>
          </div>
        </Card>

        <Card title="Body & notes" icon={Footprints}>
          <div className="stack">
            <div className="form-row" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <Field label="Weight (kg)">
                <Input type="number" min={1} max={700} step={0.1} value={values.weightKg} onChange={(e) => setField('weightKg', e.target.value)} onBlur={saveNumber('weightKg', { min: 1, max: 700 })} />
              </Field>
              <Field label="Steps">
                <Input type="number" min={0} max={200000} value={values.steps} onChange={(e) => setField('steps', e.target.value)} onBlur={saveNumber('steps', { min: 0, max: 200000, integer: true })} />
              </Field>
            </div>
            <Textarea
              rows={2}
              value={values.notes}
              maxLength={1000}
              placeholder="How are you feeling?"
              aria-label="Health notes"
              style={{ minHeight: 56 }}
              onChange={(e) => setField('notes', e.target.value)}
              onBlur={() => values.notes !== (log.notes ?? '') && save({ notes: values.notes })}
            />
          </div>
        </Card>
      </div>
    </>
  );
}
