import { getDomain, getHostname, parse } from "tldts";

const URL_SHORTENERS = new Set([
  "bit.ly",
  "t.co",
  "goo.gl",
  "tinyurl.com",
  "ow.ly",
  "is.gd",
  "buff.ly",
  "rebrand.ly",
  "cutt.ly",
  "shorturl.at",
  "tiny.cc",
  "rb.gy",
  "bl.ink",
  "soo.gd",
  "s.id",
]);

export function getRegistrableDomain(input: string): string | null {
  return getDomain(input);
}

export function doDomainsMatch(domainA: string, domainB: string): boolean {
  const a = getDomain(domainA);
  const b = getDomain(domainB);
  if (!a || !b) return false;
  return a.toLowerCase() === b.toLowerCase();
}

export function isUrlShortener(url: string): boolean {
  const domain = getDomain(url);
  if (!domain) return false;
  return URL_SHORTENERS.has(domain.toLowerCase());
}

export function isHttps(url: string): boolean {
  try {
    return new URL(url).protocol === "https:";
  } catch {
    return false;
  }
}

export function extractHostname(url: string): string | null {
  return getHostname(url);
}

export function isValidDomain(domain: string): boolean {
  const parsed = parse(domain);
  return parsed.domain !== null && parsed.isIcann === true;
}

export function emailDomainMatchesWebsite(
  email: string,
  websiteDomain: string
): boolean {
  const emailParts = email.split("@");
  if (emailParts.length !== 2) return false;
  const emailDomain = getDomain(emailParts[1]!);
  const siteDomain = getDomain(websiteDomain);
  if (!emailDomain || !siteDomain) return false;
  return emailDomain.toLowerCase() === siteDomain.toLowerCase();
}
