import { EventEmitter } from 'events';
import type { Response } from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { COALESCE_MS, addClient, broadcastChange, broadcastEvent } from '../server/events';
import { setClientBuildForTests } from '../server/version';

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
    // After the greeting every connection starts with (below), only the change itself.
    expect(page.written.slice(1)).toEqual(['event: news-likes\ndata: {"id":"news-1","likesCount":4}\n\n']);
    page.emit('close');
  });

  it('greets every connection with the build of the page the server hands out', () => {
    setClientBuildForTests('build-two');
    const page = new OpenPage();
    addClient('signals.user', page as unknown as Response);
    expect(page.written[0]).toBe('event: hello\ndata: {"clientBuild":"build-two"}\n\n');
    page.emit('close');
    setClientBuildForTests(undefined);
  });
});
