import { toLatinDigits } from './jalali.js';

/**
 * Lowercases, unifies Arabic/Persian letter variants and digits so "علي" finds "علی". Used by the
 * search box and by the server for the text of documents, so both sides compare the same way.
 */
export function normalizeForSearch(value: string | null | undefined): string {
  return toLatinDigits(value ?? '')
    .toLowerCase()
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/ۀ/g, 'ه')
    // Vowel marks and the hamza of "سامانهٔ" (text read from PDFs may put a space before them).
    .replace(/\s?[\u064B-\u065F\u0670]/g, '')
    .replace(/‌/g, ' ');
}
