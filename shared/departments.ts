import { toLatinDigits } from './jalali.js';

// Departments are stored by name. The list in settings is the only source of names; every other
// place (profiles, news and poll audiences, Excel, Active Directory) uses one of its entries.

/** Tidies a typed name for display: Persian letters, single spaces, no stray marks. */
export function cleanDepartmentName(value: string): string {
  return value
    .normalize('NFC')
    .replace(/[يى]/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/ـ/g, '')
    .replace(/[\u200e\u200f\u202a-\u202e\ufeff]/g, '')
    .replace(/\s*\u200c\s*/g, '\u200c')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Two names with the same key are the same department: spelling variants such as ي/ی, ك/ک,
 * half-spaces, extra spaces, Persian digits or letter case do not make a new one.
 */
export function departmentKey(value: string): string {
  return toLatinDigits(cleanDepartmentName(value))
    .replace(/[\s\u200c]+/g, '')
    .toLowerCase();
}

/** The entry of `list` that `value` names, or undefined when it is not in the list. */
export function findDepartment(list: readonly string[], value: string): string | undefined {
  const key = departmentKey(value);
  if (!key) return undefined;
  return list.find((d) => departmentKey(d) === key);
}

/** An existing department that is probably meant, e.g. «فروش» for «واحد فروش». */
export function suggestDepartment(list: readonly string[], value: string): string | undefined {
  const key = departmentKey(value).replace(/^(واحد|بخش|دپارتمان|امور)/, '');
  if (key.length < 2) return undefined;
  return list.find((d) => {
    const other = departmentKey(d);
    return other.length >= 2 && (other.includes(key) || key.includes(other));
  });
}
