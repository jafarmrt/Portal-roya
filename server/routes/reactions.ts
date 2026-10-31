import { and, eq, inArray, sql } from 'drizzle-orm';
import { Router } from 'express';
import { z } from 'zod';
import { currentJalaliYear } from '../../shared/jalali.js';
import { REACTION_EMOJIS, REACTION_TARGETS, type ReactionCount, type ReactionTarget } from '../../shared/reactions.js';
import { db } from '../db/index.js';
import { birthdayWishes, colleagueWishes, employees, newColleagues, reactions } from '../db/schema.js';
import { broadcastChange, sendToUser } from '../events.js';
import { HttpError, currentUser, parse, route } from '../http.js';
import { fullName } from '../serializers.js';

export const reactionsRouter = Router();

/** The reactions under each of the given things, in the order of REACTION_EMOJIS. */
export async function reactionCounts(type: ReactionTarget, ids: string[], viewerId: string | null): Promise<Map<string, ReactionCount[]>> {
  const result = new Map<string, ReactionCount[]>();
  if (ids.length === 0) return result;
  const rows = await db
    .select({ targetId: reactions.targetId, emoji: reactions.emoji, userId: reactions.userId, firstName: employees.firstName, lastName: employees.lastName })
    .from(reactions)
    .innerJoin(employees, eq(employees.id, reactions.userId))
    .where(and(eq(reactions.targetType, type), inArray(reactions.targetId, ids)))
    .orderBy(reactions.createdAt);
  for (const id of ids) {
    const mine = rows.filter((r) => r.targetId === id);
    const counts = REACTION_EMOJIS.map((emoji) => {
      const by = mine.filter((r) => r.emoji === emoji);
      return {
        emoji,
        count: by.length,
        mine: !!viewerId && by.some((r) => r.userId === viewerId),
        // Guests see how many, not who.
        names: viewerId ? by.map((r) => fullName(r)) : [],
      };
    }).filter((c) => c.count > 0);
    result.set(id, counts);
  }
  return result;
}

/** Takes away the reactions of things that were deleted. */
export async function dropReactions(type: ReactionTarget, ids: string[]) {
  if (ids.length) await db.delete(reactions).where(and(eq(reactions.targetType, type), inArray(reactions.targetId, ids)));
}

/** Nightly: reactions whose introduction, message or card is gone (e.g. removed with a colleague). */
export async function pruneReactions() {
  await db.execute(sql`
    DELETE FROM ${reactions} r WHERE
      (r.target_type = 'intro' AND NOT EXISTS (SELECT 1 FROM ${newColleagues} n WHERE n.id = r.target_id)) OR
      (r.target_type = 'welcome' AND NOT EXISTS (SELECT 1 FROM ${colleagueWishes} w WHERE w.id::text = r.target_id)) OR
      (r.target_type = 'greeting' AND NOT EXISTS (SELECT 1 FROM ${birthdayWishes} b WHERE b.id::text = r.target_id))`);
}

const reactionSchema = z.object({
  target: z.enum(REACTION_TARGETS),
  id: z.string().trim().min(1).max(100),
  emoji: z.union([z.enum(REACTION_EMOJIS), z.literal('')]),
});

const numericId = (value: string) => {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) throw new HttpError(404, 'پیام یافت نشد.');
  return id;
};

/**
 * Checks the viewer may react to this thing and returns who it belongs to (they hear a soft chime):
 * the introduced colleague, the writer of the welcome message, or the person the card is for.
 */
async function ownerOf(target: ReactionTarget, id: string, viewerId: string): Promise<{ owner: string; resource: 'new_colleagues' | 'birthday_wishes' }> {
  if (target === 'intro') {
    const [card] = await db.select({ userId: newColleagues.userId }).from(newColleagues).where(eq(newColleagues.id, id));
    if (!card) throw new HttpError(404, 'کارت معرفی یافت نشد.');
    return { owner: card.userId, resource: 'new_colleagues' };
  }
  if (target === 'welcome') {
    const [wish] = await db
      .select({ senderId: colleagueWishes.senderId, newColleague: newColleagues.userId })
      .from(colleagueWishes)
      .innerJoin(newColleagues, eq(newColleagues.id, colleagueWishes.newColleagueId))
      .where(eq(colleagueWishes.id, numericId(id)));
    if (!wish) throw new HttpError(404, 'پیام یافت نشد.');
    if (wish.newColleague !== viewerId) throw new HttpError(403, 'فقط همکار جدید می‌تواند به پیام‌های خوش‌آمد واکنش نشان دهد.');
    return { owner: wish.senderId, resource: 'new_colleagues' };
  }
  const [card] = await db
    .select({ targetUserId: birthdayWishes.targetUserId, isPrivate: birthdayWishes.isPrivate, jalaliYear: birthdayWishes.jalaliYear })
    .from(birthdayWishes)
    .where(eq(birthdayWishes.id, numericId(id)));
  if (!card || card.isPrivate || card.jalaliYear !== currentJalaliYear()) throw new HttpError(404, 'کارت تبریک یافت نشد.');
  if (card.targetUserId === viewerId) throw new HttpError(400, 'واکنش شما به کارتی که گرفته‌اید روی خود کارت ثبت می‌شود.');
  return { owner: card.targetUserId, resource: 'birthday_wishes' };
}

/** Gives, changes ('❤️' instead of '👍') or takes back ('') the viewer's one reaction to something. */
reactionsRouter.put(
  '/reactions',
  route(async (req, res) => {
    const viewer = currentUser(req);
    const { target, id, emoji } = parse(reactionSchema, req.body);
    const { owner, resource } = await ownerOf(target, id, viewer.id);
    const where = and(eq(reactions.targetType, target), eq(reactions.targetId, id), eq(reactions.userId, viewer.id));
    const [before] = await db.select({ emoji: reactions.emoji }).from(reactions).where(where);
    if (!emoji) {
      await db.delete(reactions).where(where);
    } else {
      await db
        .insert(reactions)
        .values({ targetType: target, targetId: id, userId: viewer.id, emoji })
        .onConflictDoUpdate({ target: [reactions.targetType, reactions.targetId, reactions.userId], set: { emoji } });
    }
    broadcastChange(resource);
    // A new reaction (not a change of mind or taking it back) chimes for its owner; no notification.
    if (emoji && !before && owner !== viewer.id) sendToUser(owner, 'reaction', { emoji });
    res.json((await reactionCounts(target, [id], viewer.id)).get(id) ?? []);
  }),
);
