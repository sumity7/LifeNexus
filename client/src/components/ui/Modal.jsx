import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import { X } from 'lucide-react';
import { IconButton } from './Button';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), [contenteditable="true"]';

let scrollLocks = 0;
function lockScroll() {
  if (scrollLocks++ === 0) document.body.style.overflow = 'hidden';
}
function unlockScroll() {
  if (--scrollLocks === 0) document.body.style.overflow = '';
}

/**
 * Accessible dialog: portal-rendered, focus-trapped, closes on Escape or backdrop
 * click, and restores focus to the element that opened it.
 */
export function Modal({ open, onClose, title, description, children, footer, size = 'md', className, overlayClassName, hideClose, bare }) {
  const dialogRef = useRef(null);
  const onCloseRef = useRef(onClose);
  const titleId = useId();
  const descriptionId = useId();
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return undefined;
    const previouslyFocused = document.activeElement;
    const dialog = dialogRef.current;
    lockScroll();

    const focusables = () => [...dialog.querySelectorAll(FOCUSABLE)].filter((el) => el.getClientRects().length);
    const frame = requestAnimationFrame(() => {
      const target = dialog.querySelector('[data-autofocus]') ?? focusables().find((el) => !el.closest('.modal__header')) ?? dialog;
      target.focus({ preventScroll: true });
    });

    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCloseRef.current?.();
      } else if (e.key === 'Tab') {
        const els = focusables();
        if (!els.length) return;
        const first = els[0];
        const last = els[els.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    dialog.addEventListener('keydown', onKeyDown);

    return () => {
      cancelAnimationFrame(frame);
      dialog.removeEventListener('keydown', onKeyDown);
      unlockScroll();
      if (previouslyFocused instanceof HTMLElement && document.contains(previouslyFocused)) previouslyFocused.focus({ preventScroll: true });
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div
      className={clsx('modal-overlay', overlayClassName)}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCloseRef.current?.();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className={clsx(!bare && ['modal', `modal--${size}`], className)}
      >
        {bare ? (
          children
        ) : (
          <>
            {(title || !hideClose) && (
              <div className="modal__header">
                <div>
                  {title && <h2 id={titleId} className="modal__title">{title}</h2>}
                  {description && <p id={descriptionId} className="modal__description">{description}</p>}
                </div>
                {!hideClose && <IconButton icon={X} label="Close" size="sm" onClick={() => onCloseRef.current?.()} />}
              </div>
            )}
            <div className="modal__body">{children}</div>
            {footer && <div className="modal__footer">{footer}</div>}
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
