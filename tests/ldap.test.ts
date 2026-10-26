import { describe, expect, it } from 'vitest';
import { escapeFilterValue, normalizeLoginName } from '../server/ldap';

describe('LDAP helpers', () => {
  it('reduces every Windows login form to the plain username', () => {
    expect(normalizeLoginName('Ali.Rezaei')).toBe('ali.rezaei');
    expect(normalizeLoginName('ROYA\\ali')).toBe('ali');
    expect(normalizeLoginName(' ali@roya.local ')).toBe('ali');
  });

  it('escapes filter metacharacters so a username cannot widen the search', () => {
    expect(escapeFilterValue('*')).toBe('\\2a');
    expect(escapeFilterValue('a)(objectClass=*')).toBe('a\\29\\28objectClass=\\2a');
    expect(escapeFilterValue('back\\slash')).toBe('back\\5cslash');
  });
});
