import { and, desc, eq } from 'drizzle-orm';
import { Router } from 'express';
import { db } from '../db/index.js';
import { notifications } from '../db/schema.js';
import { currentUser, route } from '../http.js';

export const notificationsRouter = Router();

notificationsRouter.get(
  '/notifications',
  route(async (req, res) => {
    const viewer = currentUser(req);
    const rows = await db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, viewer.id))
      .orderBy(desc(notifications.createdAt))
      .limit(100);
    res.json(
      rows.map((n) => ({
        id: String(n.id),
        title: n.title,
        message: n.message,
        type: n.type,
        linkTab: n.linkTab ?? undefined,
        linkId: n.linkId ?? undefined,
        isRead: n.isRead,
        date: n.createdAt.toISOString(),
      })),
    );
  }),
);

notificationsRouter.post(
  '/notifications/read-all',
  route(async (req, res) => {
    await db.update(notifications).set({ isRead: true }).where(eq(notifications.userId, currentUser(req).id));
    res.json({ success: true });
  }),
);

notificationsRouter.post(
  '/notifications/:id/read',
  route(async (req, res) => {
    await db
      .update(notifications)
      .set({ isRead: true })
      .where(and(eq(notifications.id, Number(req.params.id) || 0), eq(notifications.userId, currentUser(req).id)));
    res.json({ success: true });
  }),
);

notificationsRouter.delete(
  '/notifications/:id',
  route(async (req, res) => {
    await db
      .delete(notifications)
      .where(and(eq(notifications.id, Number(req.params.id) || 0), eq(notifications.userId, currentUser(req).id)));
    res.json({ success: true });
  }),
);
