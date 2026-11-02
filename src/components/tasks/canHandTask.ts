import { usePortal } from '../../context/PortalContext';
import type { UserProfile } from '../../types';

/**
 * Whether «سپردن کار» is offered for this colleague: «کارهای ارجاعی» is open for the viewer, and the
 * colleague can receive work (an active account other than the viewer's; while the part is in preview,
 * someone in the pilot group).
 */
export function useCanHandTask() {
  const { featureOn, currentUser, tasks } = usePortal();
  return (person: Pick<UserProfile, 'id' | 'isActive' | 'hasAccount'>) =>
    featureOn('tasks') &&
    Boolean(currentUser) &&
    person.id !== currentUser?.id &&
    person.isActive &&
    person.hasAccount &&
    Boolean(tasks.recipients?.includes(person.id));
}
