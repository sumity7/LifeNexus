import { CheckCircle2, Flame, Target } from 'lucide-react';
import { ProgressBar } from '../../components/ui';

export function AuthLayout({ title, subtitle, children }) {
  return (
    <div className="auth">
      <div className="auth__panel">
        <div className="row" style={{ gap: 12 }}>
          <span className="brand-mark brand-mark--lg" aria-hidden="true"><img src="/brand/logo-symbol.png" alt="" /></span>
          <span className="brand-name brand-name--lg">LifeNexus</span>
        </div>
        <main className="auth__form-wrap">
          <h1 className="auth__title">{title}</h1>
          <p className="auth__subtitle">{subtitle}</p>
          {children}
        </main>
        <p className="text-xs faint">Your data is private and encrypted in transit.</p>
      </div>

      <aside className="auth__aside" aria-hidden="true">
        <p className="auth__quote">One calm place for your tasks, habits, goals, money and health — so you can stop juggling and start living.</p>
        <div className="auth__preview">
          <div className="card stat">
            <p className="stat__label"><CheckCircle2 /> Today</p>
            <p className="stat__value">5 of 7 tasks done</p>
            <ProgressBar value={71} size="sm" className="mt" />
          </div>
          <div className="card stat">
            <p className="stat__label"><Flame /> Morning meditation</p>
            <p className="stat__value">12-day streak</p>
          </div>
          <div className="card stat">
            <p className="stat__label"><Target /> Run a half marathon</p>
            <p className="stat__value">64% complete</p>
            <ProgressBar value={64} size="sm" tone="success" />
          </div>
        </div>
      </aside>
    </div>
  );
}
