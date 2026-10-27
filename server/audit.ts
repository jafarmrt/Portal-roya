import type { SessionUser } from './auth.js';
import { db } from './db/index.js';
import { type AuditAction, type AuditEntity, auditLog } from './db/schema.js';
import { fullName } from './serializers.js';

export interface AuditEntry {
  action: AuditAction;
  entity: AuditEntity;
  id?: string | null;
  title: string;
  detail?: string;
}

/**
 * Records who changed what, for the admin's change history. A failure is logged and does not undo
 * or fail the change itself.
 */
export async function audit(actor: SessionUser, entry: AuditEntry) {
  try {
    await db.insert(auditLog).values({
      actorId: actor.id,
      actorName: fullName(actor),
      action: entry.action,
      entity: entry.entity,
      entityId: entry.id ?? null,
      title: entry.title.slice(0, 300),
      detail: (entry.detail ?? '').slice(0, 1000),
    });
  } catch (err) {
    console.error('Audit log error:', err);
  }
}

/** "عنوان، متن" from the keys that changed, each label once. */
export function changedLabels<K extends string>(keys: K[], labels: Record<K, string>) {
  return [...new Set(keys.map((k) => labels[k]).filter(Boolean))].join('، ');
}

/** "a ← b" for a value that changed, as Persian text reads right to left: before, then after. */
export const fromTo = (before: string, after: string) => `${before || '—'} ← ${after || '—'}`;
