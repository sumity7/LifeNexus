import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Kbd } from '../../components/ui';
import { useCreateTask } from '../../api/hooks';
import { useToast } from '../../context/ToastContext';

/** Inline "type and press Enter" task capture. */
export function QuickAddTask({ defaults = {}, placeholder = 'Add a task…' }) {
  const [title, setTitle] = useState('');
  const createTask = useCreateTask();
  const toast = useToast();

  const submit = (e) => {
    e.preventDefault();
    const value = title.trim();
    if (!value) return;
    setTitle('');
    createTask.mutate(
      { title: value, ...defaults },
      {
        onError: (err) => {
          setTitle(value);
          toast.apiError(err, "Couldn't add task");
        },
      },
    );
  };

  return (
    <form className="quick-add" onSubmit={submit}>
      <Plus aria-hidden="true" />
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={placeholder} aria-label="Quick add task" maxLength={200} />
      {title && <Kbd>Enter</Kbd>}
    </form>
  );
}
