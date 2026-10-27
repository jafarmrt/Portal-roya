// Persian letters (Arabic block letters plus پ چ ژ ک گ ی), not digits or punctuation.
const PERSIAN_LETTER = /[ء-غف-يپچژکگی]/;

/** True when the text has Persian letters, e.g. «علی» but not "Ali". */
export const isPersian = (value: string) => PERSIAN_LETTER.test(value);

/**
 * AD accounts give their own name (in Persian) and birthday before using the portal, because AD
 * holds names in English and the portal never takes them from there.
 */
export function needsProfile(e: { authSource: string; firstName: string; lastName: string; birthDate: string }) {
  return e.authSource === 'ldap' && (!isPersian(e.firstName) || !isPersian(e.lastName) || !e.birthDate);
}
