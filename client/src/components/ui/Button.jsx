import clsx from 'clsx';

export function Button({
  variant = 'secondary',
  size = 'md',
  icon: Icon,
  iconRight: IconRight,
  loading = false,
  block = false,
  className,
  children,
  type = 'button',
  disabled,
  ref,
  ...props
}) {
  return (
    <button
      ref={ref}
      type={type}
      className={clsx('btn', `btn--${variant}`, size !== 'md' && `btn--${size}`, block && 'btn--block', loading && 'is-loading', className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      <span className="btn__content">
        {Icon && <Icon aria-hidden="true" />}
        {children}
        {IconRight && <IconRight aria-hidden="true" />}
      </span>
      {loading && <span className="spinner" aria-hidden="true" />}
    </button>
  );
}

/** Icon-only button. `label` is required: it becomes the accessible name and tooltip. */
export function IconButton({ icon: Icon, label, variant = 'ghost', size = 'md', className, ...props }) {
  return (
    <Button variant={variant} size={size} className={clsx('btn--icon', className)} aria-label={label} title={label} {...props}>
      <Icon aria-hidden="true" />
    </Button>
  );
}
