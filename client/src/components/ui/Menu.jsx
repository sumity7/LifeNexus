import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import { MoreHorizontal } from 'lucide-react';
import { IconButton } from './Button';

/**
 * Dropdown menu with full keyboard support.
 * items: [{ label, icon, onSelect, danger, hint, disabled } | { separator: true } | { heading }]
 */
export function Menu({ items, label = 'More actions', icon = MoreHorizontal, align = 'end', renderTrigger, size = 'sm' }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [position, setPosition] = useState(null);
  const triggerRef = useRef(null);
  const menuRef = useRef(null);
  const menuId = useId();

  const actionable = items.map((item, i) => (!item.separator && !item.heading && !item.disabled ? i : null)).filter((i) => i !== null);

  const close = useCallback((refocus = true) => {
    setOpen(false);
    setActive(-1);
    if (refocus) triggerRef.current?.focus();
  }, []);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const menuHeight = menuRef.current?.offsetHeight ?? 200;
    const menuWidth = menuRef.current?.offsetWidth ?? 200;
    const openUp = rect.bottom + menuHeight + 8 > window.innerHeight && rect.top > menuHeight;
    let left = align === 'end' ? rect.right - menuWidth : rect.left;
    left = Math.max(8, Math.min(left, window.innerWidth - menuWidth - 8));
    setPosition({ top: openUp ? rect.top - menuHeight - 4 : rect.bottom + 4, left });
  }, [open, align]);

  useEffect(() => {
    if (!open) return undefined;
    const onPointer = (e) => {
      if (!menuRef.current?.contains(e.target) && !triggerRef.current?.contains(e.target)) close(false);
    };
    const onScroll = (e) => {
      if (!menuRef.current?.contains(e.target)) close(false);
    };
    document.addEventListener('mousedown', onPointer);
    window.addEventListener('resize', onScroll);
    window.addEventListener('scroll', onScroll, true);
    menuRef.current?.focus();
    return () => {
      document.removeEventListener('mousedown', onPointer);
      window.removeEventListener('resize', onScroll);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open, close]);

  const select = (item) => {
    close();
    item.onSelect?.();
  };

  const onMenuKeyDown = (e) => {
    const pos = actionable.indexOf(active);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive(actionable[(pos + 1) % actionable.length]);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive(actionable[(pos - 1 + actionable.length) % actionable.length]);
    } else if (e.key === 'Home') {
      e.preventDefault();
      setActive(actionable[0]);
    } else if (e.key === 'End') {
      e.preventDefault();
      setActive(actionable[actionable.length - 1]);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (active >= 0) select(items[active]);
    } else if (e.key === 'Escape' || e.key === 'Tab') {
      e.preventDefault();
      e.stopPropagation();
      close();
    }
  };

  const triggerProps = {
    ref: triggerRef,
    'aria-haspopup': 'menu',
    'aria-expanded': open,
    'aria-controls': open ? menuId : undefined,
    onClick: (e) => {
      e.stopPropagation();
      setOpen((o) => !o);
    },
    onKeyDown: (e) => {
      if (e.key === 'ArrowDown' && !open) {
        e.preventDefault();
        setOpen(true);
        setActive(actionable[0]);
      }
    },
  };

  return (
    <>
      {renderTrigger ? renderTrigger(triggerProps) : <IconButton icon={icon} label={label} size={size} {...triggerProps} />}
      {open &&
        createPortal(
          <div
            ref={menuRef}
            id={menuId}
            role="menu"
            aria-label={label}
            tabIndex={-1}
            className="menu"
            style={position ? { top: position.top, left: position.left } : { visibility: 'hidden', top: 0, left: 0 }}
            onKeyDown={onMenuKeyDown}
            onClick={(e) => e.stopPropagation()}
          >
            {items.map((item, i) => {
              if (item.separator) return <div key={`sep-${i}`} className="menu__separator" role="separator" />;
              if (item.heading) return <div key={`h-${i}`} className="menu__label">{item.heading}</div>;
              const Icon = item.icon;
              return (
                <button
                  key={item.label}
                  type="button"
                  role="menuitem"
                  tabIndex={-1}
                  disabled={item.disabled}
                  data-active={active === i}
                  className={clsx('menu__item', item.danger && 'menu__item--danger')}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => select(item)}
                >
                  {Icon && <Icon aria-hidden="true" />}
                  {item.label}
                  {item.hint && <span className="menu__item-hint">{item.hint}</span>}
                </button>
              );
            })}
          </div>,
          document.body,
        )}
    </>
  );
}
