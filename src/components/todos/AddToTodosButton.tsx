import React, { useState } from 'react';
import { ListChecks, ListPlus } from 'lucide-react';
import { usePortal } from '../../context/PortalContext';
import type { TodoSourceType } from '../../../shared/todos';
import { TodoFormModal } from './TodoFormModal';

interface AddToTodosButtonProps {
  type: TodoSourceType;
  id: string;
  /** Prefilled title and due date of the new note. */
  title: string;
  dueDate?: string | null;
  className?: string;
  /** Icon only (with a tooltip), for rows of small icon buttons. */
  iconOnly?: boolean;
}

/**
 * «افزودن به یادداشت کارهای من» on a news item, event, course or document. Once the item is in the
 * list (and not done), the button says so and opens that note instead.
 */
export const AddToTodosButton: React.FC<AddToTodosButtonProps> = ({ type, id, title, dueDate, className = '', iconOnly }) => {
  const { featureOn, currentUser, todos } = usePortal();
  const [open, setOpen] = useState(false);
  if (!currentUser || !featureOn('todos')) return null;

  const existing = todos.find((t) => !t.doneAt && t.sourceType === type && t.sourceId === id);
  const label = existing ? 'در یادداشت کارهای من' : 'افزودن به یادداشت کارهای من';
  const Icon = existing ? ListChecks : ListPlus;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={iconOnly ? label : undefined}
        title={iconOnly ? label : undefined}
        className={`${className} ${existing ? 'text-emerald-700' : ''}`}
      >
        <Icon className="w-4 h-4 shrink-0" />
        {!iconOnly && <span>{label}</span>}
      </button>
      {open && (
        <TodoFormModal
          todo={existing}
          initial={existing ? undefined : { title, dueDate: dueDate ?? undefined, source: { type, id } }}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
};
