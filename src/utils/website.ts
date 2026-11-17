// Reading a company's own public website, shared by Enrich and the card reader.

export const FETCH_TIMEOUT_MS = 10_000;
export const MAX_HTML_BYTES = 600_000;
export const MAX_TEXT_CHARS = 14_000;

import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

const MAX_REDIRECTS = 3;

export const normalizeUrl = (website: string): URL | null => {
  const trimmed = website.trim();

  if (!trimmed) return null;

  try {
    const url = new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`);

    return isAllowedUrlShape(url) ? url : null;
  } catch {
    return null;
  }
};

// Only plain public web addresses: http(s), the normal ports, a real host name.
const isAllowedUrlShape = (url: URL) =>
  (url.protocol === 'https:' || url.protocol === 'http:') &&
  (url.port === '' || url.port === '80' || url.port === '443') &&
  !url.username && !url.password &&
  url.hostname.includes('.') &&
  isIP(url.hostname.replace(/^\[|\]$/g, '')) === 0 &&
  !/(^|\.)(localhost|local|internal|lan|home|corp|intranet)$/i.test(url.hostname);

// Private, loopback, link-local, carrier-grade NAT, multicast and other non-public ranges.
const isPrivateAddress = (address: string): boolean => {
  if (isIP(address) === 4) {
    const [a, b] = address.split('.').map(Number);

    return a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) ||
      (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19));
  }

  const v6 = address.toLowerCase();
  const mapped = v6.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);

  if (mapped) return isPrivateAddress(mapped[1]);

  return v6 === '::' || v6 === '::1' || v6.startsWith('fc') || v6.startsWith('fd') ||
    v6.startsWith('fe8') || v6.startsWith('fe9') || v6.startsWith('fea') || v6.startsWith('feb') ||
    v6.startsWith('ff') || v6.startsWith('64:ff9b');
};

// A card controls the address we fetch, so the server must never be pointed at its own network.
const resolvesPublicly = async (url: URL): Promise<boolean> => {
  try {
    const addresses = await lookup(url.hostname, { all: true, verbatim: true });

    return addresses.length > 0 && addresses.every(({ address }) => !isPrivateAddress(address));
  } catch {
    return false;
  }
};

export const readPage = async (start: URL) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    let url = start;

    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      if (!isAllowedUrlShape(url) || !(await resolvesPublicly(url))) return null;

      const response = await fetch(url, {
        redirect: 'manual',
        signal: controller.signal,
        headers: { 'User-Agent': 'CardScan/0.2 (Twenty app; reads public company pages)', Accept: 'text/html' },
      });

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');

        if (!location) return null;
        url = new URL(location, url); // checked again at the top of the loop
        continue;
      }

      if (!response.ok || !(response.headers.get('content-type') ?? '').includes('html')) return null;

      const buffer = new Uint8Array(await response.arrayBuffer()).slice(0, MAX_HTML_BYTES);

      return { html: new TextDecoder().decode(buffer), finalUrl: url.toString() };
    }

    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
};

export const meta = (html: string, name: string) =>
  html.match(new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]*content=["']([^"']*)["']`, 'i'))?.[1] ??
  html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:name|property)=["']${name}["']`, 'i'))?.[1] ??
  '';

export const visibleText = (html: string) =>
  html
    .replace(/<(script|style|noscript|svg|template)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_TEXT_CHARS);


const FREE_MAIL = /^(gmail|googlemail|outlook|hotmail|live|yahoo|icloud|me|gmx|web|proton|protonmail|aol|mail|yandex)\./i;

// When the card's company name is missing or unclear: the organisation's name as its own
// website states it (og:site_name, then the title), with the domain it came from.
export const companyNameFromWebsite = async (
  website: string,
  emails: string,
  pickName: (input: string) => Promise<string>,
): Promise<{ name: string; host: string } | null> => {
  const emailDomain = emails.split(';')[0]?.split('@')[1]?.trim() ?? '';
  const candidate = website.trim() || (emailDomain && !FREE_MAIL.test(emailDomain) ? emailDomain : '');
  const url = normalizeUrl(candidate);

  if (!url) return null;

  const page = await readPage(url);

  if (!page) return null;

  const siteName = meta(page.html, 'og:site_name');
  const title = page.html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim() ?? '';
  const description = meta(page.html, 'description') || meta(page.html, 'og:description');
  const name = await pickName(
    `Website: ${page.finalUrl}\nSite name: ${siteName}\nTitle: ${title}\nDescription: ${description}\nText: ${visibleText(page.html).slice(0, 2000)}`,
  );

  return name ? { name, host: new URL(page.finalUrl).host } : null;
};
