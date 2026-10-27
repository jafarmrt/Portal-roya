// Who a news item is for. Used by the server (visibility, notifications, read counts) and by the
// editor to show "N colleagues will see this" before publishing, so both always agree.

export interface Audience {
  departments: string[];
  locations: string[];
  /** Role ids. */
  roles: string[];
  /** People added by name, whatever their department, location or role. */
  userIds: string[];
}

export interface AudienceMember {
  id: string;
  department: string;
  location: string;
  role: string;
}

export const EVERYONE: Audience = { departments: [], locations: [], roles: [], userIds: [] };

export const isForEveryone = (a: Audience) =>
  a.departments.length === 0 && a.locations.length === 0 && a.roles.length === 0 && a.userIds.length === 0;

/**
 * Departments, locations and roles narrow each other: "sales" + "Shiraz branch" is the sales staff
 * in Shiraz. Within one list any entry matches. People chosen by name are added on top.
 */
export function inAudience(person: AudienceMember, a: Audience): boolean {
  if (isForEveryone(a)) return true;
  if (a.userIds.includes(person.id)) return true;
  const hasGroups = a.departments.length > 0 || a.locations.length > 0 || a.roles.length > 0;
  return (
    hasGroups &&
    (a.departments.length === 0 || a.departments.includes(person.department)) &&
    (a.locations.length === 0 || a.locations.includes(person.location)) &&
    (a.roles.length === 0 || a.roles.includes(person.role))
  );
}
