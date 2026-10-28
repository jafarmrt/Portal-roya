// Persian letters (Arabic block letters plus پ چ ژ ک گ ی), not digits or punctuation.
const PERSIAN_LETTER = /[ء-غف-يپچژکگی]/;

/** True when the text has Persian letters, e.g. «علی» but not "Ali". */
export const isPersian = (value: string) => PERSIAN_LETTER.test(value);

/** Shown where a colleague's unit or position is not set yet; it is a state, not a unit of the list. */
export const NO_DEPARTMENT = 'واحد تعیین نشده';
export const NO_POSITION = 'سمت تعیین نشده';

/** «سمت · واحد», with whatever is not set yet said plainly. */
export const placeText = (e: { position: string; department: string }, separator = ' · ') =>
  [e.position || NO_POSITION, e.department || NO_DEPARTMENT].join(separator);

/** The head of each unit, from the units' pages. */
export const unitHeads = (pages: readonly { department: string; headId: string | null }[]) =>
  new Map(pages.flatMap((p) => (p.headId ? [[p.department, p.headId] as const] : [])));

/**
 * Who someone reports to: their direct manager, or else the head of their unit (never themselves).
 * `viaUnit` says the second, so it can be shown as such.
 */
export function managerOf(e: { id: string; directManagerId: string | null; department: string }, heads: ReadonlyMap<string, string>) {
  if (e.directManagerId) return { id: e.directManagerId, viaUnit: false };
  const head = e.department ? heads.get(e.department) : undefined;
  return head && head !== e.id ? { id: head, viaUnit: true } : null;
}

/**
 * What the first-sign-in form asks. AD accounts give their own name (in Persian) and birthday, because
 * AD holds names in English and the portal never takes them from there. Anyone whose unit or position
 * is not set (AD rarely has them) picks their own, and the people who manage staff are told.
 */
export function profileGaps(e: { authSource: string; firstName: string; lastName: string; birthDate: string; department: string; position: string }) {
  return {
    names: e.authSource === 'ldap' && (!isPersian(e.firstName) || !isPersian(e.lastName) || !e.birthDate),
    department: !e.department,
    position: !e.position,
  };
}

export function needsProfile(e: Parameters<typeof profileGaps>[0]) {
  const gaps = profileGaps(e);
  return gaps.names || gaps.department || gaps.position;
}
