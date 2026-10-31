import { BlockList, isIPv4, isIP } from 'node:net';
import type { Request } from 'express';
import { config } from './config.js';

// Addresses that only exist inside a company network (RFC 1918, loopback, link-local, IPv6 ULA).
const companyNetwork = new BlockList();
companyNetwork.addSubnet('10.0.0.0', 8, 'ipv4');
companyNetwork.addSubnet('172.16.0.0', 12, 'ipv4');
companyNetwork.addSubnet('192.168.0.0', 16, 'ipv4');
companyNetwork.addSubnet('127.0.0.0', 8, 'ipv4');
companyNetwork.addSubnet('169.254.0.0', 16, 'ipv4');
companyNetwork.addAddress('::1', 'ipv6');
companyNetwork.addSubnet('fc00::', 7, 'ipv6');
companyNetwork.addSubnet('fe80::', 10, 'ipv6');

const bare = (address: string) => address.replace(/^::ffff:/i, '').replace(/%.*$/, '');

/**
 * Company addresses that still mean "from the internet": a router that hides every internet visitor
 * behind its own LAN address (OUTSIDE_ADDRESSES in .env). Wrong entries are skipped with a warning.
 */
export function outsideList(entries: string[]) {
  const list = new BlockList();
  for (const entry of entries) {
    const [ip, bits] = entry.split('/');
    const family = isIP(ip ?? '');
    const prefix = bits === undefined ? undefined : Number(bits);
    if (!family || (prefix !== undefined && !(Number.isInteger(prefix) && prefix >= 0 && prefix <= (family === 4 ? 32 : 128)))) {
      console.warn(`OUTSIDE_ADDRESSES: «${entry}» is not an address or range and is ignored.`);
      continue;
    }
    const type = family === 4 ? 'ipv4' : 'ipv6';
    if (prefix === undefined) list.addAddress(ip!, type);
    else list.addSubnet(ip!, prefix, type);
  }
  return list;
}
const outside = outsideList(config.outsideAddresses);

/** True for an address inside the company network, e.g. 192.168.0.15; false for an internet address. */
export function isCompanyAddress(address: string | undefined, outsideAddresses: BlockList = outside) {
  if (!address) return false;
  const ip = bare(address);
  try {
    const type = isIPv4(ip) ? 'ipv4' : 'ipv6';
    return companyNetwork.check(ip, type) && !outsideAddresses.check(ip, type);
  } catch {
    return false;
  }
}

/** The visitor's address as the portal sees it (without the ::ffff: prefix), for the admins' check. */
export const visitorAddress = (req: Request) => bare(req.ip ?? '');

/**
 * True when the visitor is inside the company network. Behind nginx this relies on TRUST_PROXY=true;
 * without it every request seems to come from nginx itself (127.0.0.1), as it did before HTTPS.
 */
export const fromCompanyNetwork = (req: Request) => isCompanyAddress(req.ip);
