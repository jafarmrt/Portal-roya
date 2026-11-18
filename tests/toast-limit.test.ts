import { describe, expect, it } from 'vitest';
import { MAX_TOASTS, toastsToDismiss } from '../src/lib/toastLimit';

type T = { id: string; type: 'success' | 'error' | 'custom' | 'loading' | 'blank'; visible: boolean; createdAt: number };
const t = (id: string, createdAt: number, type: T['type'] = 'success', visible = true): T => ({ id, type, visible, createdAt });

describe('short messages on screen', () => {
  it('keeps at most three, taking the oldest away first', () => {
    expect(MAX_TOASTS).toBe(3);
    expect(toastsToDismiss([t('a', 1), t('b', 2), t('c', 3)])).toEqual([]);
    expect(toastsToDismiss([t('d', 4), t('a', 1), t('c', 3), t('b', 2), t('e', 5)])).toEqual(['a', 'b']);
  });

  it('does not count messages already on their way out', () => {
    expect(toastsToDismiss([t('a', 1, 'success', false), t('b', 2), t('c', 3), t('d', 4)])).toEqual([]);
  });

  it('keeps a message with a button of its own («برگردان») after the plain ones', () => {
    const toasts = [t('undo', 1, 'custom'), t('a', 2), t('b', 3), t('c', 4)];
    expect(toastsToDismiss(toasts)).toEqual(['a']);
    // Only when everything left has a button does the oldest of those go.
    expect(toastsToDismiss([t('u1', 1, 'custom'), t('u2', 2, 'custom'), t('u3', 3, 'custom'), t('u4', 4, 'custom')])).toEqual(['u1']);
  });
});
