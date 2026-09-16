import { createContext, useCallback, useContext, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { TaskFormModal } from '../features/tasks/TaskFormModal';
import { EventFormModal } from '../features/events/EventFormModal';
import { BudgetFormModal, TransactionFormModal } from '../features/finance/FinanceForms';
import { ReminderFormModal } from '../features/reminders/ReminderFormModal';
import { HabitFormModal } from '../features/habits/HabitFormModal';
import { GoalFormModal } from '../features/goals/GoalFormModal';
import { WorkoutFormModal } from '../features/health/WorkoutFormModal';
import { RoutineFormModal } from '../features/routines/RoutineFormModal';
import { ProjectFormModal } from '../features/projects/ProjectFormModal';
import { AccountFormModal, RecurringFormModal, SavingsFormModal, SubscriptionFormModal } from '../features/finance/FinanceExtraForms';
import { useCreateNote } from '../api/hooks';
import { useToast } from './ToastContext';

const EditorContext = createContext(null);

const MODALS = {
  task: TaskFormModal,
  event: EventFormModal,
  transaction: TransactionFormModal,
  budget: BudgetFormModal,
  reminder: ReminderFormModal,
  habit: HabitFormModal,
  goal: GoalFormModal,
  workout: WorkoutFormModal,
  routine: RoutineFormModal,
  project: ProjectFormModal,
  account: AccountFormModal,
  recurring: RecurringFormModal,
  subscription: SubscriptionFormModal,
  savings: SavingsFormModal,
};

/**
 * One place that owns every create/edit dialog, so any screen (dashboard,
 * command palette, calendar…) can call `openEditor('task', { item, defaults })`.
 */
export function EditorProvider({ children }) {
  const [editor, setEditor] = useState(null);
  const navigate = useNavigate();
  const createNote = useCreateNote();
  const toast = useToast();

  const openEditor = useCallback(
    async (type, options = {}) => {
      if (type === 'note') {
        try {
          const note = await createNote.mutateAsync({ title: '', content: '', ...options.defaults });
          navigate(`/notes?note=${note._id}`);
        } catch (err) {
          toast.apiError(err, "Couldn't create note");
        }
        return;
      }
      setEditor({ type, ...options, openedAt: Date.now() });
    },
    [createNote, navigate, toast],
  );

  const close = useCallback(() => setEditor(null), []);

  return (
    <EditorContext.Provider value={openEditor}>
      {children}
      {Object.entries(MODALS).map(([type, Component]) => (
        <Component
          key={type}
          open={editor?.type === type}
          onClose={close}
          item={editor?.type === type ? editor.item : undefined}
          defaults={editor?.type === type ? editor.defaults : undefined}
          onSaved={editor?.type === type ? editor.onSaved : undefined}
        />
      ))}
    </EditorContext.Provider>
  );
}

export const useEditor = () => useContext(EditorContext);
