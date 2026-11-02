import toast from 'react-hot-toast';
import { usePortal } from '../../context/PortalContext';
import { TASK_UNDO_MS, type TaskAnswer } from '../../../shared/tasks';
import type { AssignedTask } from '../../types';

/** How long «برگردان» stays after a task is marked done or declined (well inside the server's window). */
const UNDO_SHOWN_MS = Math.min(8000, TASK_UNDO_MS);

/**
 * Answers a task handed to this person. «انجام شد» or «نمی‌توانم» on a task that was under way offers
 * «برگردان» for a few seconds: a wrong tap puts it back, and the server takes the answer back from the
 * bell of the one who handed it over if they have not read it yet.
 */
export function useAnswerTask() {
  const { answerTask } = usePortal();
  return async (task: AssignedTask, status: TaskAnswer, reply?: string) => {
    const before = task.status;
    const ok = await answerTask(task.id, status, reply);
    if (!ok) return false;
    if ((status === 'done' || status === 'declined') && (before === 'accepted' || before === 'in_progress')) {
      const title = task.title.length > 40 ? `${task.title.slice(0, 39)}…` : task.title;
      toast(
        (t) => (
          <span className="flex items-center gap-3 text-xs">
            <span>
              «{title}» {status === 'done' ? 'انجام شد' : 'رد شد'}؛ به {task.from.name} خبر داده شد.
            </span>
            <button
              type="button"
              onClick={() => {
                toast.dismiss(t.id);
                void answerTask(task.id, before);
              }}
              className="px-2 py-1 font-bold text-white/80 hover:text-white underline whitespace-nowrap"
            >
              برگردان
            </button>
          </span>
        ),
        { id: `task-answer-${task.id}`, duration: UNDO_SHOWN_MS },
      );
    }
    return true;
  };
}
