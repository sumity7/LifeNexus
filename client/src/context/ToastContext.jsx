import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import { CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { Button, IconButton } from '../components/ui';

const ToastContext = createContext(null);
const ICONS = { success: CheckCircle2, error: XCircle, info: Info };
let nextId = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timers = useRef(new Map());

  const dismiss = useCallback((id) => {
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    setToasts((list) => list.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
    setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), 180);
  }, []);

  const show = useCallback(
    (type, title, { description, action, duration = type === 'error' ? 6000 : 3500 } = {}) => {
      const id = ++nextId;
      setToasts((list) => [...list.slice(-3), { id, type, title, description, action }]);
      timers.current.set(id, setTimeout(() => dismiss(id), duration));
      return id;
    },
    [dismiss],
  );

  const api = useMemo(
    () => ({
      success: (title, opts) => show('success', title, opts),
      error: (title, opts) => show('error', title, opts),
      info: (title, opts) => show('info', title, opts),
      /** Shows an API error, using its message as the description. */
      apiError: (error, title = 'Something went wrong') => show('error', title, { description: error?.message }),
      dismiss,
    }),
    [show, dismiss],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      {createPortal(
        <div className="toaster" aria-live="polite" aria-relevant="additions">
          {toasts.map((toast) => {
            const Icon = ICONS[toast.type];
            return (
              <div key={toast.id} className={clsx('toast', `toast--${toast.type}`, toast.leaving && 'is-leaving')} role={toast.type === 'error' ? 'alert' : 'status'}>
                <span className="toast__icon"><Icon aria-hidden="true" /></span>
                <div className="toast__content">
                  <p className="toast__title">{toast.title}</p>
                  {toast.description && <p className="toast__description">{toast.description}</p>}
                </div>
                <div className="toast__actions">
                  {toast.action && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        toast.action.onClick();
                        dismiss(toast.id);
                      }}
                    >
                      {toast.action.label}
                    </Button>
                  )}
                  <IconButton icon={X} label="Dismiss notification" size="xs" onClick={() => dismiss(toast.id)} />
                </div>
              </div>
            );
          })}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
