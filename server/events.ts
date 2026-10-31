import type { Response } from 'express';

// Server-Sent Events hub. Clients receive lightweight "changed" signals and
// refetch the affected resource, so permission filtering stays in the REST API.

export type ResourceName =
  | 'news'
  | 'polls'
  | 'employees'
  | 'trainings'
  | 'calendar'
  | 'holidays'
  | 'new_colleagues'
  | 'birthday_wishes'
  | 'documents'
  | 'guides'
  | 'department_pages'
  | 'settings'
  | 'roles'
  | 'notifications'
  | 'moods'
  | 'todos'
  | 'notices'
  | 'presence';

interface Client {
  userId: string;
  res: Response;
}

const clients = new Set<Client>();
const HEARTBEAT_MS = 25_000;
/**
 * Every open page refetches a resource when it is signalled, so with the whole company online a burst
 * of changes (likes, an import, a run of edits) would mean that many refetches. The first signal goes
 * at once; more for the same resource within this long are sent as one at its end.
 */
export const COALESCE_MS = 1000;
const lastSent = new Map<ResourceName, number>();
const queued = new Set<ResourceName>();

let onConnectionsChanged: (userId: string, opened: boolean) => void = () => undefined;
/** Called when someone opens or closes a page of the portal («همکاران آنلاین» listens). */
export function watchConnections(listener: (userId: string, opened: boolean) => void) {
  onConnectionsChanged = listener;
}

/** The people who have at least one page of the portal open. */
export function connectedUserIds() {
  return new Set([...clients].map((c) => c.userId));
}

function send(res: Response, event: string, data: unknown) {
  try {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  } catch {
    // The close handler removes the client.
  }
}

export function addClient(userId: string, res: Response) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  // Tell nginx not to buffer the stream.
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const client: Client = { userId, res };
  clients.add(client);
  onConnectionsChanged(userId, true);
  const heartbeat = setInterval(() => res.write(': ping\n\n'), HEARTBEAT_MS);

  res.on('close', () => {
    clearInterval(heartbeat);
    clients.delete(client);
    onConnectionsChanged(userId, false);
  });
}

function sendChange(resource: ResourceName) {
  lastSent.set(resource, Date.now());
  for (const client of clients) send(client.res, 'changed', { resource });
}

export function broadcastChange(resource: ResourceName) {
  if (queued.has(resource)) return;
  const wait = (lastSent.get(resource) ?? 0) + COALESCE_MS - Date.now();
  if (wait <= 0) {
    sendChange(resource);
    return;
  }
  queued.add(resource);
  setTimeout(() => {
    queued.delete(resource);
    sendChange(resource);
  }, wait).unref?.();
}

/** A small change with its details for every open page (e.g. a like count), instead of a full refetch. */
export function broadcastEvent(event: string, data: unknown) {
  for (const client of clients) send(client.res, event, data);
}

/** A change only this person sees (e.g. their own notes), so their other open tabs refetch it. */
export function signalUser(userId: string, resource: ResourceName) {
  for (const client of clients) {
    if (client.userId === userId) send(client.res, 'changed', { resource });
  }
}

export function notifyUsers(userIds: string[]) {
  const targets = new Set(userIds);
  for (const client of clients) {
    if (targets.has(client.userId)) send(client.res, 'notification', {});
  }
}

/** Something for this person's open pages only, with its details (e.g. an emoji a colleague sent). */
export function sendToUser(userId: string, event: string, data: unknown) {
  for (const client of clients) {
    if (client.userId === userId) send(client.res, event, data);
  }
}
