import { readFileSync } from 'fs';
import { Client, InvalidCredentialsError, type Entry } from 'ldapts';
import { config } from './config.js';

/** A user as Active Directory describes them, after a successful password check. */
export interface DirectoryUser {
  username: string;
  dn: string;
  firstName: string;
  lastName: string;
  email: string;
  position: string;
  department: string;
  extension: string;
  mobile: string;
  /** null when no LDAP_ADMIN_GROUP is configured, so roles stay managed in the portal. */
  isAdmin: boolean | null;
}

export const DIRECTORY_PASSWORD_MESSAGE =
  'این حساب با اکتیو دایرکتوری سازمان وارد می‌شود؛ رمز آن را از ویندوز (Ctrl+Alt+Del) یا واحد فناوری اطلاعات تغییر دهید.';

/** Thrown when the domain controller cannot be reached or rejects the service account. */
export class DirectoryUnavailableError extends Error {}

// Matches nested group membership, so a member of a sub-group also counts.
const IN_CHAIN = '1.2.840.113556.1.4.1941';
const ATTRIBUTES = [
  'sAMAccountName',
  'givenName',
  'sn',
  'displayName',
  'mail',
  'title',
  'department',
  'telephoneNumber',
  'ipPhone',
  'mobile',
];

export function isDirectoryEnabled() {
  return config.ldap !== null;
}

/** Accepts `ali`, `ROYA\ali` and `ali@roya.local`, and returns `ali`. */
export function normalizeLoginName(input: string) {
  let name = input.trim().toLowerCase();
  const slash = name.lastIndexOf('\\');
  if (slash >= 0) name = name.slice(slash + 1);
  const at = name.indexOf('@');
  if (at > 0) name = name.slice(0, at);
  return name;
}

/** Escapes a value for use inside an LDAP search filter (RFC 4515). */
export function escapeFilterValue(value: string) {
  return value.replace(/[\\*()\0]/g, (c) => `\\${c.charCodeAt(0).toString(16).padStart(2, '0')}`);
}

function attr(entry: Entry, name: string) {
  // Attribute names are case-insensitive in LDAP, and servers differ in the case they return.
  const key = Object.keys(entry).find((k) => k.toLowerCase() === name.toLowerCase());
  const value = key ? entry[key] : undefined;
  const first = Array.isArray(value) ? value[0] : value;
  if (first === undefined) return '';
  return (Buffer.isBuffer(first) ? first.toString('utf8') : String(first)).trim();
}

function newClient() {
  const ldap = config.ldap!;
  const ca = ldap.caFile ? [readFileSync(ldap.caFile)] : undefined;
  const tlsOptions = { ca, rejectUnauthorized: ldap.tlsRejectUnauthorized };
  return {
    client: new Client({
      url: ldap.url,
      timeout: ldap.timeoutMs,
      connectTimeout: ldap.timeoutMs,
      tlsOptions: ldap.url.startsWith('ldaps:') ? tlsOptions : undefined,
    }),
    tlsOptions,
  };
}

async function connect(bindDn: string, password: string) {
  const { client, tlsOptions } = newClient();
  try {
    if (config.ldap!.startTls) await client.startTLS(tlsOptions);
    await client.bind(bindDn, password);
    return client;
  } catch (err) {
    // A failed bind leaves the socket open; close it so connections don't pile up.
    await client.unbind().catch(() => undefined);
    throw err;
  }
}

async function isMember(client: Client, userDn: string, groupDn: string) {
  const { searchEntries } = await client.search(userDn, {
    scope: 'base',
    filter: `(memberOf:${IN_CHAIN}:=${escapeFilterValue(groupDn)})`,
    attributes: ['dn'],
  });
  return searchEntries.length > 0;
}

function isConnectionProblem(err: unknown) {
  return !(err instanceof InvalidCredentialsError);
}

/**
 * Checks a username and password against Active Directory.
 * Returns null for a wrong password, an unknown user or a user outside LDAP_ALLOWED_GROUP.
 */
export async function authenticateWithDirectory(username: string, password: string): Promise<DirectoryUser | null> {
  const ldap = config.ldap;
  if (!ldap) return null;
  // An empty password would be an anonymous bind, which many servers accept.
  if (!username || !password) return null;

  let lookup: Client;
  try {
    lookup = ldap.bindDn
      ? await connect(ldap.bindDn, ldap.bindPassword)
      : await connect(`${username}@${ldap.domain}`, password);
  } catch (err) {
    // Without a service account a wrong user password fails here, which is not an outage.
    if (!ldap.bindDn && !isConnectionProblem(err)) return null;
    throw new DirectoryUnavailableError(`LDAP connection failed: ${(err as Error).message}`);
  }

  try {
    const { searchEntries } = await lookup.search(ldap.baseDn, {
      scope: 'sub',
      filter: ldap.userFilter.replaceAll('{{username}}', escapeFilterValue(username)),
      attributes: ATTRIBUTES,
      sizeLimit: 2,
    });
    if (searchEntries.length !== 1) return null;
    const entry = searchEntries[0];

    if (ldap.bindDn) {
      // The real password check: bind as the user on a separate connection.
      let userClient: Client;
      try {
        userClient = await connect(entry.dn, password);
      } catch (err) {
        if (isConnectionProblem(err)) throw new DirectoryUnavailableError(`LDAP user bind failed: ${(err as Error).message}`);
        return null;
      }
      await userClient.unbind().catch(() => undefined);
    }

    if (ldap.allowedGroup && !(await isMember(lookup, entry.dn, ldap.allowedGroup))) return null;
    const isAdmin = ldap.adminGroup ? await isMember(lookup, entry.dn, ldap.adminGroup) : null;

    const displayName = attr(entry, 'displayName');
    return {
      username: normalizeLoginName(attr(entry, 'sAMAccountName') || username),
      dn: entry.dn,
      firstName: attr(entry, 'givenName') || displayName,
      lastName: attr(entry, 'sn'),
      email: attr(entry, 'mail'),
      position: attr(entry, 'title'),
      department: attr(entry, 'department'),
      extension: attr(entry, 'telephoneNumber') || attr(entry, 'ipPhone'),
      mobile: attr(entry, 'mobile'),
      isAdmin,
    };
  } catch (err) {
    if (err instanceof DirectoryUnavailableError) throw err;
    throw new DirectoryUnavailableError(`LDAP search failed: ${(err as Error).message}`);
  } finally {
    await lookup.unbind().catch(() => undefined);
  }
}

/** Connection check for `node server-dist/index.cjs ldap-test <username>`: looks the user up without a password. */
export async function describeDirectoryUser(username: string) {
  const ldap = config.ldap;
  if (!ldap) throw new Error('LDAP_URL is not set.');
  if (!ldap.bindDn) throw new Error('ldap-test needs LDAP_BIND_DN and LDAP_BIND_PASSWORD.');
  const client = await connect(ldap.bindDn, ldap.bindPassword);
  try {
    const { searchEntries } = await client.search(ldap.baseDn, {
      scope: 'sub',
      filter: ldap.userFilter.replaceAll('{{username}}', escapeFilterValue(normalizeLoginName(username))),
      attributes: ATTRIBUTES,
      sizeLimit: 2,
    });
    if (searchEntries.length !== 1) return { found: searchEntries.length };
    const entry = searchEntries[0];
    return {
      found: 1,
      dn: entry.dn,
      attributes: Object.fromEntries(ATTRIBUTES.map((a) => [a, attr(entry, a)])),
      inAllowedGroup: ldap.allowedGroup ? await isMember(client, entry.dn, ldap.allowedGroup) : 'no LDAP_ALLOWED_GROUP',
      inAdminGroup: ldap.adminGroup ? await isMember(client, entry.dn, ldap.adminGroup) : 'no LDAP_ADMIN_GROUP',
    };
  } finally {
    await client.unbind().catch(() => undefined);
  }
}
