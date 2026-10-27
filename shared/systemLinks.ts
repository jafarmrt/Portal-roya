/** The two addresses of an organisation app: one used inside the company network, one from the internet. */
export interface SystemAddresses {
  /** Inside address, e.g. http://192.168.0.30 ('' or '#' = not set). */
  url: string;
  /** Internet address, e.g. https://crm.royaco.com ('' = not set). */
  externalUrl?: string;
}

const isSet = (url: string | undefined): url is string => Boolean(url) && url !== '#';

/**
 * True for an address that only works inside the company: a private or loopback IP, a name without a
 * dot (http://crm) or an internal-only suffix (.local, .lan, .internal, .corp, .home).
 */
export function isInsideOnlyUrl(url: string) {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase().replace(/^\[|\]$/g, '');
  } catch {
    return true;
  }
  if (/^(10|127)\.\d+\.\d+\.\d+$/.test(host)) return true;
  if (/^192\.168\.\d+\.\d+$/.test(host) || /^169\.254\.\d+\.\d+$/.test(host)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/.test(host)) return true;
  if (host === '::1' || /^f[cd][0-9a-f]{0,2}:/.test(host) || /^fe80:/.test(host)) return true;
  if (!host.includes('.')) return true;
  return /\.(local|lan|internal|corp|home|localdomain)$/.test(host);
}

/**
 * The address to open for a visitor inside (`inside` true) or outside the company. Inside, the inside
 * address wins and the internet one is the fallback. Outside, the internet address wins; without one the
 * inside address is used only when it also works from the internet, otherwise '' (the app is hidden).
 */
export function systemLink(system: SystemAddresses, inside: boolean): string {
  const internal = isSet(system.url) ? system.url : '';
  const external = isSet(system.externalUrl) ? system.externalUrl : '';
  if (inside) return internal || external;
  if (external) return external;
  return internal && !isInsideOnlyUrl(internal) ? internal : '';
}
