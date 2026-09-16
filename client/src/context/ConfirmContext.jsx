import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button, Modal } from '../components/ui';

const ConfirmContext = createContext(null);

/**
 * `const confirm = useConfirm(); if (await confirm({ title, description })) …`
 * Resolves true only when the user explicitly confirms.
 */
export function ConfirmProvider({ children }) {
  const [state, setState] = useState(null);
  const resolver = useRef(null);

  const confirm = useCallback(
    (options) =>
      new Promise((resolve) => {
        resolver.current = resolve;
        setState({ confirmLabel: 'Delete', cancelLabel: 'Cancel', destructive: true, ...options });
      }),
    [],
  );

  const settle = (value) => {
    resolver.current?.(value);
    resolver.current = null;
    setState(null);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Modal
        open={!!state}
        onClose={() => settle(false)}
        size="sm"
        hideClose
        footer={
          <>
            <Button variant="ghost" onClick={() => settle(false)}>
              {state?.cancelLabel}
            </Button>
            <Button variant={state?.destructive ? 'danger' : 'primary'} onClick={() => settle(true)} data-autofocus>
              {state?.confirmLabel}
            </Button>
          </>
        }
      >
        {state?.destructive && (
          <div className="confirm__icon" aria-hidden="true">
            <AlertTriangle />
          </div>
        )}
        <h2 className="modal__title">{state?.title}</h2>
        {state?.description && <p className="modal__description" style={{ marginTop: 6 }}>{state.description}</p>}
      </Modal>
    </ConfirmContext.Provider>
  );
}

export const useConfirm = () => useContext(ConfirmContext);
