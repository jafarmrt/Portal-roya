import { BlockList, isIPv4 } from 'node:net';
import type { Request } from 'express';

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

/** True for an address inside the company network, e.g. 192.168.0.15; false for an internet address. */
export function isCompanyAddress(address: string | undefined) {
  if (!address) return false;
  const ip = address.replace(/^::ffff:/i, '').replace(/%.*$/, '');
  try {
    return companyNetwork.check(ip, isIPv4(ip) ? 'ipv4' : 'ipv6');
  } catch {
    return false;
  }
}

/**
 * True when the visitor is inside the company network. Behind nginx this relies on TRUST_PROXY=true;
 * without it every request seems to come from nginx itself (127.0.0.1), as it did before HTTPS.
 */
export const fromCompanyNetwork = (req: Request) => isCompanyAddress(req.ip);
