import { Angry, Frown, Laugh, Meh, Smile, type LucideIcon } from 'lucide-react';
import type { Mood } from '../../../shared/mood';

/** How each of the five answers looks: its face, and its colours on the buttons and in «ماه من». */
export const MOOD_LOOK: Record<Mood, { icon: LucideIcon; text: string; hover: string; chip: string; cell: string }> = {
  'خیلی بد': { icon: Angry, text: 'text-danger-600', hover: 'hover:bg-danger-50 hover:border-danger-200', chip: 'bg-danger-50 text-danger-700', cell: 'bg-danger-400 text-white' },
  بد: { icon: Frown, text: 'text-amber-600', hover: 'hover:bg-amber-50 hover:border-amber-200', chip: 'bg-amber-50 text-amber-800', cell: 'bg-amber-300 text-amber-950' },
  معمولی: { icon: Meh, text: 'text-muted', hover: 'hover:bg-surface hover:border-line', chip: 'bg-surface text-ink-soft', cell: 'bg-surface-strong text-ink' },
  خوب: { icon: Smile, text: 'text-green-600', hover: 'hover:bg-green-50 hover:border-green-200', chip: 'bg-green-50 text-green-800', cell: 'bg-green-300 text-green-950' },
  عالی: { icon: Laugh, text: 'text-green-700', hover: 'hover:bg-green-50 hover:border-green-200', chip: 'bg-green-100 text-green-900', cell: 'bg-green-600 text-white' },
};

/** From «خیلی بد» to «عالی», the order of the buttons (right to left on the page). */
export const MOOD_ORDER: Mood[] = ['خیلی بد', 'بد', 'معمولی', 'خوب', 'عالی'];
