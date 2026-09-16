import { cloneElement, isValidElement, useId, useState } from 'react';
import clsx from 'clsx';
import { AlertCircle, Check, X } from 'lucide-react';
import { COLORS, WEEKDAYS } from '../../lib/constants';

export function Field({ label, hint, error, optional, labelExtra, children, className }) {
  const id = useId();
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  const control = isValidElement(children)
    ? cloneElement(children, {
        id: children.props.id ?? id,
        'aria-invalid': error ? true : undefined,
        'aria-describedby': describedBy,
      })
    : children;

  return (
    <div className={clsx('field', className)}>
      {label && (
        <label className="field__label" htmlFor={children?.props?.id ?? id}>
          <span>{label}</span>
          {labelExtra ?? (optional && <span className="field__optional">Optional</span>)}
        </label>
      )}
      {control}
      {error ? (
        <p className="field__error" id={`${id}-error`} role="alert">{error}</p>
      ) : (
        hint && <p className="field__hint" id={`${id}-hint`}>{hint}</p>
      )}
    </div>
  );
}

export const Input = ({ className, size, ref, ...props }) => (
  <input ref={ref} className={clsx('input', size === 'sm' && 'input--sm', className)} {...props} />
);

export const Textarea = ({ className, ref, ...props }) => <textarea ref={ref} className={clsx('input', className)} {...props} />;

export function Select({ options = [], placeholder, className, size, ref, ...props }) {
  return (
    <select ref={ref} className={clsx('input', size === 'sm' && 'input--sm', className)} {...props}>
      {placeholder && <option value="">{placeholder}</option>}
      {options.map((o) => {
        const opt = typeof o === 'string' ? { value: o, label: o } : o;
        return (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        );
      })}
    </select>
  );
}

export function FormError({ error }) {
  if (!error) return null;
  return (
    <div className="form-error" role="alert">
      <AlertCircle aria-hidden="true" />
      <span>{typeof error === 'string' ? error : error.message}</span>
    </div>
  );
}

export function Checkbox({ checked, onChange, label, priority, color, size, square, disabled, className, ...props }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={!!checked}
      aria-label={label}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onChange?.(!checked);
      }}
      className={clsx(
        'check',
        square && 'check--square',
        size === 'lg' && 'check--lg',
        priority && `check--${priority}`,
        color && ['check--color', `color-${color}`],
        className,
      )}
      {...props}
    >
      <Check aria-hidden="true" />
    </button>
  );
}

export function Switch({ checked, onChange, label, disabled }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={!!checked}
      aria-label={label}
      disabled={disabled}
      className="switch"
      onClick={() => onChange?.(!checked)}
    />
  );
}

export function ColorPicker({ value, onChange, label = 'Color' }) {
  return (
    <div className="swatches" role="radiogroup" aria-label={label}>
      {COLORS.map((c) => (
        <button
          key={c}
          type="button"
          role="radio"
          aria-checked={value === c}
          aria-label={c}
          title={c}
          className={`swatch color-${c}`}
          onClick={() => onChange(c)}
        />
      ))}
    </div>
  );
}

export function WeekdayPicker({ value = [], onChange, weekStartsOn = 1 }) {
  const order = [...WEEKDAYS.keys()].map((i) => (i + weekStartsOn) % 7);
  const toggle = (day) => onChange(value.includes(day) ? value.filter((d) => d !== day) : [...value, day].sort());
  return (
    <div className="choice-group" role="group" aria-label="Days of the week">
      {order.map((day) => (
        <button key={day} type="button" className="choice" aria-pressed={value.includes(day)} onClick={() => toggle(day)}>
          {WEEKDAYS[day].slice(0, 2)}
        </button>
      ))}
    </div>
  );
}

export function ChoiceGroup({ value, onChange, options, label, className }) {
  return (
    <div className={clsx('choice-group', className)} role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          className={clsx('choice', o.emoji && !o.label && 'choice--emoji')}
          onClick={() => onChange(o.value)}
          title={o.title}
          aria-label={o.title && !o.label ? o.title : undefined}
        >
          {o.emoji && <span aria-hidden={!!o.label}>{o.emoji}</span>} {o.label}
        </button>
      ))}
    </div>
  );
}

export function TagInput({ value = [], onChange, placeholder = 'Add tag…', suggestions = [], id, ...props }) {
  const [draft, setDraft] = useState('');
  const listId = useId();

  const add = (raw) => {
    const tag = raw.trim().toLowerCase().replace(/,/g, '');
    if (tag && !value.includes(tag) && value.length < 20) onChange([...value, tag.slice(0, 30)]);
    setDraft('');
  };

  return (
    <div className="tag-input" onClick={(e) => e.currentTarget.querySelector('input')?.focus()}>
      {value.map((tag) => (
        <span key={tag} className="badge">
          #{tag}
          <button type="button" aria-label={`Remove tag ${tag}`} onClick={() => onChange(value.filter((t) => t !== tag))}>
            <X size={12} />
          </button>
        </span>
      ))}
      <input
        id={id}
        value={draft}
        list={suggestions.length ? listId : undefined}
        placeholder={value.length ? '' : placeholder}
        onChange={(e) => (e.target.value.endsWith(',') ? add(e.target.value) : setDraft(e.target.value))}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            add(draft);
          } else if (e.key === 'Backspace' && !draft && value.length) {
            onChange(value.slice(0, -1));
          }
        }}
        onBlur={() => draft && add(draft)}
        {...props}
      />
      {suggestions.length > 0 && (
        <datalist id={listId}>
          {suggestions.filter((s) => !value.includes(s)).map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      )}
    </div>
  );
}
