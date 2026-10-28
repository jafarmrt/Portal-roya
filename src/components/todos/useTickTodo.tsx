import toast from 'react-hot-toast';
import { usePortal } from '../../context/PortalContext';
import type { PersonalTodo } from '../../types';

/** How long «برگردان» stays after a note is ticked off. */
const UNDO_MS = 6000;

/** Ticks a note off and offers «برگردان» for a few seconds, so a wrong tap is easily put right. */
export function useTickTodo() {
  const { updateTodo } = usePortal();
  return async (todo: PersonalTodo) => {
    if (!(await updateTodo(todo.id, { done: true }))) return;
    toast(
      (t) => (
        <span className="flex items-center gap-3 text-xs">
          <span>«{todo.title.length > 40 ? `${todo.title.slice(0, 39)}…` : todo.title}» انجام شد{todo.repeat ? '؛ نوبت بعدی نوشته شد' : ''}.</span>
          <button
            type="button"
            onClick={() => {
              toast.dismiss(t.id);
              void updateTodo(todo.id, { done: false });
            }}
            className="px-2 py-1 font-bold text-sky-200 hover:text-white underline whitespace-nowrap"
          >
            برگردان
          </button>
        </span>
      ),
      { id: `todo-done-${todo.id}`, duration: UNDO_MS },
    );
  };
}
