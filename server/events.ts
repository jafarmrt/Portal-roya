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
  | 'todos';

interface Client {
  userId: string;
  res: Response;
}

const clients = new Set<Client>();
const HEARTBEAT_MS = 25_000;

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
  const heartbeat = setInterval(() => res.write(': ping\n\n'), HEARTBEAT_MS);

  res.on('close', () => {
    clearInterval(heartbeat);
    clients.delete(client);
  });
}

export function broadcastChange(resource: ResourceName) {
  for (const client of clients) send(client.res, 'changed', { resource });
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
