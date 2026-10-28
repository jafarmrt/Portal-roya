// The suggestions & complaints boxes (صندوق انتقادات و پیشنهادات). Each box is read by the roles
// that hold its permission, so the admin decides who reads the management box and who reads HR's.
// Each box has its own switch (see shared/features.ts); a box that is switched off takes no new
// messages, but its readers still see and answer the earlier ones.

export const SUGGESTION_BOXES = [
  { id: 'management', label: 'صندوق مدیریت', to: 'مدیریت شرکت', permission: 'suggestions.management', feature: 'suggestionsManagement' },
  { id: 'hr', label: 'صندوق منابع انسانی', to: 'واحد منابع انسانی', permission: 'suggestions.hr', feature: 'suggestionsHr' },
] as const;

export type SuggestionBox = (typeof SUGGESTION_BOXES)[number]['id'];
export const SUGGESTION_BOX_IDS = SUGGESTION_BOXES.map((b) => b.id) as [SuggestionBox, ...SuggestionBox[]];

/** The names an administrator gave a box, e.g. «صندوق مدیرعامل»; an empty name uses the built-in one. */
export type SuggestionBoxNames = Partial<Record<SuggestionBox, { label: string; to: string }>>;

/** The box's name and who it goes to («مدیریت شرکت»), as the administrator named them. */
export function boxNames(names: SuggestionBoxNames | null | undefined, id: string) {
  const box = suggestionBox(id);
  const custom = box ? names?.[box.id] : undefined;
  return { label: custom?.label || box?.label || id, to: custom?.to || box?.to || '' };
}

export const SUGGESTION_KINDS = [
  { id: 'suggestion', label: 'پیشنهاد' },
  { id: 'criticism', label: 'انتقاد' },
  { id: 'other', label: 'سایر' },
] as const;

export type SuggestionKind = (typeof SUGGESTION_KINDS)[number]['id'];
export const SUGGESTION_KIND_IDS = SUGGESTION_KINDS.map((k) => k.id) as [SuggestionKind, ...SuggestionKind[]];

export const suggestionBox = (id: string) => SUGGESTION_BOXES.find((b) => b.id === id);
export const suggestionKindLabel = (id: string) => SUGGESTION_KINDS.find((k) => k.id === id)?.label ?? id;

/** Tracking codes are shown in groups of four, e.g. "K7QM-3XPA-9TRW". Easily confused letters are left out. */
export const TRACKING_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** The code as typed (lower case, Persian digits, spaces or dashes) in its stored form. */
export function normalizeTrackingCode(input: string) {
  return input
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}
