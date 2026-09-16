import { useId } from 'react';
import { Trash2 } from 'lucide-react';
import { Button, Modal } from './ui';

/** Modal with a form body and a standard Cancel / Save (and optional Delete) footer. ⌘/Ctrl+Enter submits. */
export function FormModal({ onClose, title, description, size, onSubmit, submitLabel = 'Save', submitting, onDelete, deleting, children }) {
  const formId = useId();
  return (
    <Modal
      open
      onClose={onClose}
      title={title}
      description={description}
      size={size}
      footer={
        <>
          {onDelete && (
            <Button variant="danger-ghost" icon={Trash2} className="modal__footer-start" onClick={onDelete} loading={deleting}>
              Delete
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form={formId} loading={submitting}>
            {submitLabel}
          </Button>
        </>
      }
    >
      <form
        id={formId}
        className="form"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (!submitting) onSubmit();
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            if (!submitting) onSubmit();
          }
        }}
      >
        {children}
      </form>
    </Modal>
  );
}
