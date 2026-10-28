import { can, type Employee, type SessionUser } from './auth.js';
import { needsProfile } from '../shared/profile.js';
import { toJalali } from '../shared/jalali.js';

export function fullName(e: Pick<Employee, 'firstName' | 'lastName'>) {
  return `${e.firstName} ${e.lastName}`.trim();
}

type Viewer = Pick<SessionUser, 'id' | 'permissions'>;

/**
 * Birthdays are personal: the full date (with the year) goes only to the colleague and to user
 * managers, who edit it. Other colleagues get the month and day ('MM/DD'), unless the colleague
 * hid it. Guests get neither.
 */
function birthdayFields(e: Employee, viewer: Viewer | null) {
  const isSelf = viewer?.id === e.id;
  const full = isSelf || can(viewer, 'users.manage');
  const shown = viewer && (isSelf || !e.hideBirthday);
  return {
    birthDate: full ? e.birthDate : '',
    birthDay: shown ? e.birthDate.slice(5) : '',
    hideBirthday: full ? e.hideBirthday : false,
  };
}

/** Public profile shape shared with the client. Never includes credentials. */
export function serializeEmployee(e: Employee, viewer: Viewer | null, managersById?: Map<string, Employee>) {
  const manager = e.directManagerId ? managersById?.get(e.directManagerId) : undefined;
  const viewerId = viewer?.id ?? '';
  return {
    id: e.id,
    username: e.username ?? '',
    hasAccount: e.hasAccount,
    firstName: e.firstName,
    lastName: e.lastName,
    position: e.position,
    department: e.department,
    role: e.role,
    authSource: e.authSource,
    isActive: e.isActive,
    email: e.email,
    mobile: e.mobile,
    extension: e.extension,
    bio: e.bio,
    location: e.location,
    avatar: e.avatarUrl,
    ...birthdayFields(e, viewer),
    hireDate: e.hireDate,
    // For user managers: the hire date is the day the person was added to the portal, which is right for
    // a new hire and usually a leftover default for someone who was already here.
    ...(can(viewer, 'users.manage') ? { hireDateIsEntryDay: e.hireDate !== '' && e.hireDate === toJalali(e.createdAt) } : {}),
    hideAnniversary: e.hideAnniversary,
    directManagerId: e.directManagerId,
    directManager: manager ? fullName(manager) : '',
    workExperiences: e.workExperiences,
    skills: e.skills.map((s) => ({
      id: s.id,
      name: s.name,
      category: s.category,
      endorsements: s.endorsedBy.length,
      endorsedByMe: s.endorsedBy.includes(viewerId),
    })),
  };
}

/** What a visitor sees when the directory is open to guests: no login name or personal mobile. */
export function serializeForGuest(e: Employee, managersById?: Map<string, Employee>) {
  return { ...serializeEmployee(e, null, managersById), username: '', mobile: '' };
}

export function serializeMe(e: SessionUser) {
  return { ...serializeEmployee(e, e), mustChangePassword: e.mustChangePassword, needsProfile: needsProfile(e), permissions: e.permissions };
}
