import { EventEmitter } from 'events';
import type { Response } from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { COALESCE_MS, addClient, broadcastChange, broadcastEvent } from '../server/events';

/** A page of the portal left open, and what the server sent it. */
class OpenPage extends EventEmitter {
  written: string[] = [];
  setHeader() {}
  flushHeaders() {}
  write(chunk: string) {
    this.written.push(chunk);
    return true;
  }
  signals(resource: string) {
    return this.written.filter((w) => w.startsWith('event: changed') && w.includes(`"resource":"${resource}"`)).length;
  }
}

describe('live signals to open pages', () => {
  afterEach(() => vi.useRealTimers());

  it('sends the first change at once and a burst after it as one signal', () => {
    vi.useFakeTimers();
    const page = new OpenPage();
    addClient('signals.user', page as unknown as Response);

    broadcastChange('polls');
    expect(page.signals('polls')).toBe(1);
    // Ten likes or edits in the next moment: one more signal, at the end of the window.
    for (let i = 0; i < 10; i++) broadcastChange('polls');
    expect(page.signals('polls')).toBe(1);
    vi.advanceTimersByTime(COALESCE_MS);
    expect(page.signals('polls')).toBe(2);
    // Other resources are not held back by it.
    broadcastChange('calendar');
    expect(page.signals('calendar')).toBe(1);
    // After a quiet moment the next change goes at once again.
    vi.advanceTimersByTime(COALESCE_MS);
    broadcastChange('polls');
    expect(page.signals('polls')).toBe(3);
    page.emit('close');
  });

  it('sends small changes with their details, without a refetch signal', () => {
    const page = new OpenPage();
    addClient('signals.user', page as unknown as Response);
    broadcastEvent('news-likes', { id: 'news-1', likesCount: 4 });
    expect(page.written).toEqual(['event: news-likes\ndata: {"id":"news-1","likesCount":4}\n\n']);
    page.emit('close');
  });
});
