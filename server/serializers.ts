import type { Employee } from './auth.js';

export function fullName(e: Pick<Employee, 'firstName' | 'lastName'>) {
  return `${e.firstName} ${e.lastName}`.trim();
}

/** Public profile shape shared with the client. Never includes credentials. */
export function serializeEmployee(e: Employee, viewerId: string, managersById?: Map<string, Employee>) {
  const manager = e.directManagerId ? managersById?.get(e.directManagerId) : undefined;
  return {
    id: e.id,
    username: e.username,
    firstName: e.firstName,
    lastName: e.lastName,
    position: e.position,
    department: e.department,
    role: e.role,
    isActive: e.isActive,
    email: e.email,
    mobile: e.mobile,
    extension: e.extension,
    bio: e.bio,
    location: e.location,
    avatar: e.avatarUrl,
    birthDate: e.birthDate,
    hireDate: e.hireDate,
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

export function serializeMe(e: Employee) {
  return { ...serializeEmployee(e, e.id), mustChangePassword: e.mustChangePassword };
}
