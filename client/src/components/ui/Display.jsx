import { useRef } from 'react';
import clsx from 'clsx';

export function Card({ title, subtitle, icon: Icon, actions, children, className, bodyClassName, flush, footer, as: Tag = 'section', ...props }) {
  return (
    <Tag className={clsx('card', className)} {...props}>
      {(title || actions) && (
        <header className="card__header">
          <div className="card__heading">
            {title && (
              <h2 className="card__title">
                {Icon && <Icon aria-hidden="true" />}
                {title}
              </h2>
            )}
            {subtitle && <p className="card__subtitle">{subtitle}</p>}
          </div>
          {actions && <div className="card__actions">{actions}</div>}
        </header>
      )}
      <div className={clsx(flush ? 'card__body--flush' : 'card__body', bodyClassName)}>{children}</div>
      {footer && <footer className="card__footer">{footer}</footer>}
    </Tag>
  );
}

export function PageHeader({ eyebrow, title, subtitle, actions }) {
  return (
    <header className="page-header">
      <div>
        {eyebrow && <p className="page-header__eyebrow">{eyebrow}</p>}
        <h1 className="page-header__title">{title}</h1>
        {subtitle && <p className="page-header__subtitle">{subtitle}</p>}
      </div>
      {actions && <div className="page-header__actions">{actions}</div>}
    </header>
  );
}

export function Badge({ tone, color, icon: Icon, children, className, ...props }) {
  return (
    <span className={clsx('badge', tone && `badge--${tone}`, color && ['badge--entity', `color-${color}`], className)} {...props}>
      {Icon && <Icon aria-hidden="true" />}
      {children}
    </span>
  );
}

export const Dot = ({ color, size, className }) => (
  <span className={clsx('dot', size === 'sm' && 'dot--sm', color && `color-${color}`, className)} aria-hidden="true" />
);

export const Kbd = ({ children }) => <kbd className="kbd">{children}</kbd>;

export function ProgressBar({ value = 0, tone, color, size, label, className }) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div
      className={clsx('progress', tone && `progress--${tone}`, color && ['progress--entity', `color-${color}`], size && `progress--${size}`, className)}
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <div className="progress__bar" style={{ width: `${pct}%` }} />
    </div>
  );
}

export function ProgressRing({ value = 0, size = 40, stroke = 4, color, children, label }) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div
      className={clsx('ring', color && `color-${color}`)}
      style={{ width: size, height: size, ...(color && { '--ring': 'var(--c)' }) }}
      role="img"
      aria-label={label ?? `${Math.round(pct)}%`}
    >
      <svg width={size} height={size} aria-hidden="true">
        <circle className="ring__track" cx={size / 2} cy={size / 2} r={radius} fill="none" strokeWidth={stroke} />
        <circle
          className="ring__value"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - pct / 100)}
        />
      </svg>
      {children !== undefined && <span className="ring__label">{children}</span>}
    </div>
  );
}

export function StatTile({ label, value, meta, icon: Icon, className }) {
  return (
    <div className={clsx('card stat', className)}>
      <p className="stat__label">
        {Icon && <Icon aria-hidden="true" />}
        {label}
      </p>
      <p className="stat__value">{value}</p>
      {meta && <div className="stat__meta">{meta}</div>}
    </div>
  );
}

function useRovingKeys(options, value, onChange) {
  const refs = useRef([]);
  const onKeyDown = (e, index) => {
    const delta = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (delta === undefined && e.key !== 'Home' && e.key !== 'End') return;
    e.preventDefault();
    let next = e.key === 'Home' ? 0 : e.key === 'End' ? options.length - 1 : (index + delta + options.length) % options.length;
    refs.current[next]?.focus();
    onChange(options[next].value);
  };
  return { refs, onKeyDown, activeIndex: options.findIndex((o) => o.value === value) };
}

/** Compact pill switcher (single choice). */
export function Segmented({ options, value, onChange, label, className }) {
  const { refs, onKeyDown } = useRovingKeys(options, value, onChange);
  return (
    <div className={clsx('segmented', className)} role="radiogroup" aria-label={label}>
      {options.map((o, i) => (
        <button
          key={o.value}
          ref={(el) => (refs.current[i] = el)}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          tabIndex={value === o.value ? 0 : -1}
          className="segmented__item"
          onClick={() => onChange(o.value)}
          onKeyDown={(e) => onKeyDown(e, i)}
        >
          {o.icon && <o.icon aria-hidden="true" />}
          {o.label}
          {o.count !== undefined && <span className="segmented__count">{o.count}</span>}
        </button>
      ))}
    </div>
  );
}

/** Underlined view tabs. */
export function Tabs({ options, value, onChange, label, className }) {
  const { refs, onKeyDown } = useRovingKeys(options, value, onChange);
  return (
    <div className={clsx('tabs', className)} role="tablist" aria-label={label}>
      {options.map((o, i) => (
        <button
          key={o.value}
          ref={(el) => (refs.current[i] = el)}
          type="button"
          role="tab"
          aria-selected={value === o.value}
          tabIndex={value === o.value ? 0 : -1}
          className="tabs__item"
          onClick={() => onChange(o.value)}
          onKeyDown={(e) => onKeyDown(e, i)}
        >
          {o.icon && <o.icon size={14} aria-hidden="true" />}
          {o.label}
          {o.count !== undefined && <span className="segmented__count">{o.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function SectionLabel({ children, count, className }) {
  return (
    <div className={clsx('section-label', className)}>
      {children}
      {count !== undefined && <span className="section-label__count">{count}</span>}
    </div>
  );
}
