import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { formatDistanceToNowStrict } from 'date-fns';
import { Bell, Database, Download, KeyRound, LaptopMinimal, LayoutDashboard, LogOut, Monitor, Moon, Palette, ShieldCheck, SlidersHorizontal, Sparkles, Sun, Trash2, User } from 'lucide-react';
import {
  Badge, Button, Card, EmptyState, Field, FormError, Input, Kbd, Modal, PageHeader, Segmented, Select, SkeletonList, Switch,
} from '../../components/ui';
import { useAIStatus, useDeleteConversation, useRevokeOtherSessions, useRevokeSession, useSessions } from '../../api/hooks';
import { fetchFile } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { useToast } from '../../context/ToastContext';
import { useConfirm } from '../../context/ConfirmContext';
import { useFormState } from '../../hooks/useFormState';
import { ACCENTS, AI_SCOPES, CURRENCIES, NOTIFICATION_PREFS } from '../../lib/constants';
import { MOD_KEY } from '../../components/layout/AppShell';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';

const ACCENT_HEX = { indigo: '#4f46e5', blue: '#2563eb', teal: '#0f766e', green: '#15803d', orange: '#c2410c', rose: '#e11d48', violet: '#7c3aed' };

export default function SettingsPage() {
  const location = useLocation();
  useEffect(() => {
    if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [location.hash]);
  return (
    <div className="page" style={{ maxWidth: 820 }}>
      <PageHeader title="Settings" subtitle="Manage your profile, preferences, notifications, AI access, security and data." />
      <div className="stack" style={{ gap: 16 }}>
        <ProfileCard />
        <AppearanceCard />
        <PreferencesCard />
        <NotificationsCard />
        <div id="ai"><AICard /></div>
        <SecurityCard />
        <div id="sessions"><SessionsCard /></div>
        <ShortcutsCard />
        <DataCard />
        <DangerCard />
      </div>
    </div>
  );
}

function PrefToggleRow({ label, description, checked, onChange }) {
  return (
    <div className="pref-row">
      <div className="grow">
        <p className="pref-row__label">{label}</p>
        {description && <p className="pref-row__desc">{description}</p>}
      </div>
      <Switch checked={checked} onChange={onChange} label={label} />
    </div>
  );
}

function NotificationsCard() {
  const { user, updateProfile } = useAuth();
  const toast = useToast();
  const prefs = user.preferences.notifications ?? {};
  const set = (key, value) => updateProfile({ preferences: { notifications: { [key]: value } } }).catch((err) => toast.apiError(err, "Couldn't save"));
  return (
    <Card title="Notifications" icon={Bell} subtitle="In-app notifications are generated from your data — nothing is sent by email.">
      {NOTIFICATION_PREFS.map((p) => <PrefToggleRow key={p.value} label={p.label} description={p.description} checked={prefs[p.value] !== false} onChange={(v) => set(p.value, v)} />)}
    </Card>
  );
}

function AICard() {
  const { user, updateProfile } = useAuth();
  const status = useAIStatus();
  const toast = useToast();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const [clearing, setClearing] = useState(false);
  const ai = user.preferences.ai ?? {};
  const save = (patch) => updateProfile({ preferences: { ai: patch } }).then(() => queryClient.invalidateQueries({ queryKey: ['ai'] })).catch((err) => toast.apiError(err, "Couldn't save"));
  const clearHistory = async () => {
    if (!(await confirm({ title: 'Delete all AI conversations?', description: 'Conversation history and proposed actions are removed. Executed items stay where they were created.' }))) return;
    setClearing(true);
    try {
      await api.del('/ai/conversations');
      queryClient.invalidateQueries({ queryKey: ['ai'] });
      toast.success('Conversation history cleared');
    } catch (err) {
      toast.apiError(err, "Couldn't clear history");
    } finally {
      setClearing(false);
    }
  };
  return (
    <Card title="AI assistant" icon={Sparkles} subtitle={status.data?.configured ? `Provider: ${status.data.provider} · ${status.data.model ?? ''}` : 'No provider configured on the server — the assistant is unavailable until AI_PROVIDER and a key are set.'}>
      <PrefToggleRow label="Enable AI features" description="Assistant, daily brief narrative, weekly review narrative and note actions." checked={ai.enabled !== false} onChange={(v) => save({ enabled: v })} />
      <PrefToggleRow label="Remember conversations" description="When off, chats are not saved after the reply is shown." checked={ai.rememberConversations !== false} onChange={(v) => save({ rememberConversations: v })} />
      <p className="text-2xs muted weight-semibold" style={{ margin: '14px 0 2px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>What the assistant can read</p>
      <p className="text-xs muted" style={{ marginBottom: 4 }}>Only the modules you allow are retrieved as context. Nothing is ever sent in bulk — just the relevant items for each question.</p>
      {AI_SCOPES.map((s) => <PrefToggleRow key={s.value} label={s.label} checked={ai.scopes?.[s.value] !== false} onChange={(v) => save({ scopes: { [s.value]: v } })} />)}
      <div className="row" style={{ marginTop: 14 }}>
        <Button size="sm" variant="danger-ghost" icon={Trash2} onClick={clearHistory} loading={clearing}>Clear conversation history</Button>
      </div>
    </Card>
  );
}

function SessionsCard() {
  const sessions = useSessions();
  const revoke = useRevokeSession();
  const revokeOthers = useRevokeOtherSessions();
  const toast = useToast();
  const list = sessions.data ?? [];
  return (
    <Card title="Active sessions" icon={LaptopMinimal} subtitle="Devices signed in to your account" flush actions={list.length > 1 && <Button size="sm" variant="ghost" onClick={() => revokeOthers.mutate(undefined, { onSuccess: () => toast.success('Other devices signed out') })} loading={revokeOthers.isPending}>Sign out others</Button>}>
      {sessions.isPending ? <SkeletonList rows={2} /> : !list.length ? <EmptyState compact icon={ShieldCheck} title="No active sessions" /> : (
        <div className="list">
          {list.map((s) => (
            <div key={s._id} className="list-row">
              <span className="icon-tile icon-tile--sm" aria-hidden="true"><LaptopMinimal /></span>
              <div className="grow">
                <p className="text-sm weight-medium truncate">{describeAgent(s.userAgent)} {s.current && <Badge tone="success">This device</Badge>}</p>
                <p className="text-xs muted">Signed in {formatDistanceToNowStrict(new Date(s.createdAt), { addSuffix: true })} · expires {formatDistanceToNowStrict(new Date(s.expiresAt), { addSuffix: true })}</p>
              </div>
              {!s.current && <Button size="sm" variant="ghost" icon={LogOut} onClick={() => revoke.mutate(s._id, { onSuccess: () => toast.success('Session revoked') })} loading={revoke.isPending && revoke.variables === s._id}>Revoke</Button>}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function describeAgent(ua = '') {
  const browser = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  const os = /Windows/.test(ua) ? 'Windows' : /Mac OS/.test(ua) ? 'macOS' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Linux/.test(ua) ? 'Linux' : 'Unknown OS';
  return `${browser} on ${os}`;
}

function DataCard() {
  const toast = useToast();
  const [exporting, setExporting] = useState(false);
  const exportData = async () => {
    setExporting(true);
    try {
      const res = await fetchFile('/api/auth/export');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = Object.assign(document.createElement('a'), { href: url, download: `lifeos-export-${new Date().toISOString().slice(0, 10)}.json` });
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.success('Export ready', { description: 'Your data was downloaded as JSON.' });
    } catch (err) {
      toast.apiError(err, "Couldn't export data");
    } finally {
      setExporting(false);
    }
  };
  return (
    <Card title="Your data" icon={Database}>
      <div className="row row--between row--wrap" style={{ gap: 12 }}>
        <div>
          <p className="text-sm weight-medium">Export everything</p>
          <p className="text-xs muted">Tasks, projects, goals, habits, notes, journal, finance, health, focus and document metadata as one JSON file. Files themselves are downloaded individually from Documents.</p>
        </div>
        <Button icon={Download} onClick={exportData} loading={exporting}>Export JSON</Button>
      </div>
      <hr style={{ margin: '16px 0' }} />
      <p className="text-xs muted">Import and scheduled backups are planned; the export format is versioned (<code>version: 1</code>) so it can be imported later.</p>
    </Card>
  );
}

function ProfileCard() {
  const { user, updateProfile } = useAuth();
  const toast = useToast();
  const form = useFormState({ name: user.name });
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.validate({ name: (v) => (!v.trim() ? 'Name is required' : null) })) return;
    setSaving(true);
    try {
      await updateProfile({ name: form.values.name.trim() });
      toast.success('Profile updated');
    } catch (err) {
      form.handleError(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card title="Profile" icon={User}>
      <form className="form" onSubmit={submit} noValidate>
        <FormError error={form.formError} />
        <div className="form-row">
          <Field label="Name" error={form.errors.name}>
            <Input {...form.bind('name')} maxLength={80} autoComplete="name" />
          </Field>
          <Field label="Email" hint="Email can't be changed">
            <Input value={user.email} disabled />
          </Field>
        </div>
        <div><Button type="submit" variant="primary" loading={saving} disabled={form.values.name.trim() === user.name}>Save profile</Button></div>
      </form>
    </Card>
  );
}

function AppearanceCard() {
  // Appearance is persisted to the account automatically by AuthProvider.
  const { theme, accent, setTheme, setAccent } = useTheme();

  return (
    <Card title="Appearance" icon={Palette} subtitle="Saved to your account automatically">
      <div className="stack" style={{ gap: 18 }}>
        <Field label="Theme">
          <Segmented
            label="Theme"
            value={theme}
            onChange={setTheme}
            options={[{ value: 'light', label: 'Light', icon: Sun }, { value: 'dark', label: 'Dark', icon: Moon }, { value: 'system', label: 'System', icon: Monitor }]}
          />
        </Field>
        <Field label="Accent color">
          <div className="swatches" role="radiogroup" aria-label="Accent color">
            {ACCENTS.map((a) => (
              <button
                key={a}
                type="button"
                role="radio"
                aria-checked={accent === a}
                aria-label={a}
                title={a}
                className="swatch"
                style={{ '--c': ACCENT_HEX[a], width: 28, height: 28 }}
                onClick={() => setAccent(a)}
              />
            ))}
          </div>
        </Field>
      </div>
    </Card>
  );
}

function PreferencesCard() {
  const { user, updateProfile } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const p = user.preferences;
  const form = useFormState({
    currency: p.currency, weekStartsOn: p.weekStartsOn, waterGoalMl: String(p.waterGoalMl), sleepGoalHours: String(p.sleepGoalHours),
    targetWeightKg: p.targetWeightKg ? String(p.targetWeightKg) : '', focusMinutes: String(p.focusMinutes ?? 25), breakMinutes: String(p.breakMinutes ?? 5),
    timezone: p.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone, language: p.language ?? 'en',
  });
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    const valid = form.validate({
      waterGoalMl: (v) => (!(Number(v) >= 250 && Number(v) <= 10000) ? 'Between 250 and 10,000 ml' : null),
      sleepGoalHours: (v) => (!(Number(v) >= 3 && Number(v) <= 14) ? 'Between 3 and 14 hours' : null),
      focusMinutes: (v) => (!(Number(v) >= 5 && Number(v) <= 180) ? 'Between 5 and 180 minutes' : null),
      breakMinutes: (v) => (!(Number(v) >= 1 && Number(v) <= 60) ? 'Between 1 and 60 minutes' : null),
      targetWeightKg: (v) => (v && !(Number(v) >= 1 && Number(v) <= 700) ? 'Enter a valid weight' : null),
    });
    if (!valid) return;
    setSaving(true);
    try {
      await updateProfile({
        preferences: {
          currency: form.values.currency,
          weekStartsOn: Number(form.values.weekStartsOn),
          waterGoalMl: Math.round(Number(form.values.waterGoalMl)),
          sleepGoalHours: Number(form.values.sleepGoalHours),
          targetWeightKg: form.values.targetWeightKg ? Number(form.values.targetWeightKg) : null,
          focusMinutes: Math.round(Number(form.values.focusMinutes)),
          breakMinutes: Math.round(Number(form.values.breakMinutes)),
          timezone: form.values.timezone.trim(),
          language: form.values.language,
        },
      });
      toast.success('Preferences saved');
    } catch (err) {
      form.handleError(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card title="Preferences" icon={SlidersHorizontal} actions={<Button size="sm" variant="ghost" icon={LayoutDashboard} onClick={() => navigate('/?customize=1')}>Customize dashboard</Button>}>
      <form className="form" onSubmit={submit} noValidate>
        <FormError error={form.formError} />
        <div className="form-row">
          <Field label="Currency">
            <Select {...form.bind('currency')} options={CURRENCIES} />
          </Field>
          <Field label="Week starts on">
            <Segmented label="Week starts on" value={Number(form.values.weekStartsOn)} onChange={(v) => form.set('weekStartsOn', v)} options={[{ value: 1, label: 'Monday' }, { value: 0, label: 'Sunday' }]} />
          </Field>
        </div>
        <div className="form-row">
          <Field label="Language">
            <Select {...form.bind('language')} options={[{ value: 'en', label: 'English' }, { value: 'hi', label: 'Hindi (UI coming soon)' }, { value: 'es', label: 'Spanish (UI coming soon)' }]} />
          </Field>
          <Field label="Timezone" hint="Used for reminders and briefs">
            <Input {...form.bind('timezone')} maxLength={64} placeholder="Asia/Kolkata" />
          </Field>
        </div>
        <div className="form-row">
          <Field label="Daily water goal (ml)" error={form.errors.waterGoalMl}>
            <Input type="number" min={250} max={10000} step={50} {...form.bind('waterGoalMl')} />
          </Field>
          <Field label="Sleep goal (hours)" error={form.errors.sleepGoalHours}>
            <Input type="number" min={3} max={14} step={0.5} {...form.bind('sleepGoalHours')} />
          </Field>
          <Field label="Target weight (kg)" optional error={form.errors.targetWeightKg}>
            <Input type="number" min={1} max={700} step={0.1} {...form.bind('targetWeightKg')} />
          </Field>
        </div>
        <div className="form-row">
          <Field label="Default focus session (min)" error={form.errors.focusMinutes}>
            <Input type="number" min={5} max={180} {...form.bind('focusMinutes')} />
          </Field>
          <Field label="Break length (min)" error={form.errors.breakMinutes}>
            <Input type="number" min={1} max={60} {...form.bind('breakMinutes')} />
          </Field>
        </div>
        <div><Button type="submit" variant="primary" loading={saving}>Save preferences</Button></div>
      </form>
    </Card>
  );
}

function SecurityCard() {
  const { changePassword } = useAuth();
  const toast = useToast();
  const initial = { currentPassword: '', newPassword: '', confirmPassword: '' };
  const form = useFormState(initial);
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    const valid = form.validate({
      currentPassword: (v) => (!v ? 'Enter your current password' : null),
      newPassword: (v) => (v.length < 8 ? 'Use at least 8 characters' : !/[A-Za-z]/.test(v) || !/\d/.test(v) ? 'Include a letter and a number' : null),
      confirmPassword: (v, all) => (v !== all.newPassword ? "Passwords don't match" : null),
    });
    if (!valid) return;
    setSaving(true);
    try {
      await changePassword({ currentPassword: form.values.currentPassword, newPassword: form.values.newPassword });
      Object.entries(initial).forEach(([k, v]) => form.set(k, v));
      toast.success('Password changed', { description: 'Other devices have been signed out.' });
    } catch (err) {
      form.handleError(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card title="Password" icon={KeyRound}>
      <form className="form" onSubmit={submit} noValidate>
        <FormError error={form.formError} />
        <Field label="Current password" error={form.errors.currentPassword}>
          <Input type="password" autoComplete="current-password" {...form.bind('currentPassword')} />
        </Field>
        <div className="form-row">
          <Field label="New password" error={form.errors.newPassword}>
            <Input type="password" autoComplete="new-password" {...form.bind('newPassword')} maxLength={128} />
          </Field>
          <Field label="Confirm new password" error={form.errors.confirmPassword}>
            <Input type="password" autoComplete="new-password" {...form.bind('confirmPassword')} maxLength={128} />
          </Field>
        </div>
        <div><Button type="submit" variant="primary" loading={saving}>Change password</Button></div>
      </form>
    </Card>
  );
}

function ShortcutsCard() {
  const shortcuts = [
    [[MOD_KEY, 'K'], 'Open command palette & search'],
    [['N'], 'New task'],
    [['G', 'D'], 'Go to dashboard'],
    [['G', 'T'], 'Go to tasks'],
    [['G', 'C'], 'Go to calendar'],
    [['G', 'H'], 'Go to habits'],
    [['G', 'N'], 'Go to notes'],
    [['G', 'A'], 'Go to assistant'],
    [['G', 'F'], 'Go to focus'],
    [['G', 'J'], 'Go to journal'],
    [[MOD_KEY, 'J'], 'Quick capture'],
    [['C'], 'Quick capture (when not typing)'],
    [[MOD_KEY, 'Enter'], 'Save the open form'],
    [['Esc'], 'Close dialogs and menus'],
  ];
  return (
    <Card title="Keyboard shortcuts" icon={Monitor}>
      <div className="grid-2" style={{ gap: '10px 24px' }}>
        {shortcuts.map(([keys, label]) => (
          <div key={label} className="row row--between text-sm">
            <span className="secondary">{label}</span>
            <span className="row" style={{ gap: 3 }}>{keys.map((k) => <Kbd key={k}>{k}</Kbd>)}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

function DangerCard() {
  const { logout, deleteAccount } = useAuth();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const confirmDelete = async () => {
    if (!password) return setError('Enter your password to confirm');
    setDeleting(true);
    try {
      await deleteAccount(password);
      toast.success('Your account has been deleted');
    } catch (err) {
      setError(err.message);
      setDeleting(false);
    }
  };

  return (
    <Card title="Account" icon={Trash2}>
      <div className="row row--between row--wrap" style={{ gap: 12 }}>
        <div>
          <p className="text-sm weight-medium">Sign out</p>
          <p className="text-xs muted">End your session on this device.</p>
        </div>
        <Button icon={LogOut} onClick={logout}>Sign out</Button>
      </div>
      <hr style={{ margin: '16px 0' }} />
      <div className="row row--between row--wrap" style={{ gap: 12 }}>
        <div>
          <p className="text-sm weight-medium">Delete account</p>
          <p className="text-xs muted">Permanently delete your account and all of your data. This cannot be undone.</p>
        </div>
        <Button variant="danger" icon={Trash2} onClick={() => setOpen(true)}>Delete account</Button>
      </div>

      <Modal
        open={open}
        onClose={() => { setOpen(false); setPassword(''); setError(null); }}
        size="sm"
        title="Delete your account?"
        description="All tasks, habits, goals, notes, finances and health data will be permanently erased."
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="danger" onClick={confirmDelete} loading={deleting}>Delete everything</Button>
          </>
        }
      >
        <Field label="Confirm with your password" error={error}>
          <Input type="password" value={password} onChange={(e) => { setPassword(e.target.value); setError(null); }} autoComplete="current-password" data-autofocus onKeyDown={(e) => e.key === 'Enter' && confirmDelete()} />
        </Field>
      </Modal>
    </Card>
  );
}
