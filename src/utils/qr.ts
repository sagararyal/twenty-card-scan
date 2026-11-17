import jpeg from 'jpeg-js';
import jsQR from 'jsqr';

import type { CardRead } from 'src/logic-functions/card-schema';

// QR codes on business cards usually hold a vCard (the most reliable data on the card),
// a MECARD, or a link (LinkedIn, a personal page). A vision model sees the pattern but
// cannot decode it, so it is decoded here, without any model.

const MAX_EDGE = 1600;

const downscale = (rgba: Uint8Array, width: number, height: number, maxEdge: number) => {
  const scale = Math.min(1, maxEdge / Math.max(width, height));

  if (scale === 1) {
    return { data: new Uint8ClampedArray(rgba.buffer, rgba.byteOffset, rgba.byteLength), width, height };
  }

  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));
  const out = new Uint8ClampedArray(w * h * 4);

  for (let y = 0; y < h; y++) {
    const sy = Math.min(height - 1, Math.floor(y / scale));

    for (let x = 0; x < w; x++) {
      const sx = Math.min(width - 1, Math.floor(x / scale));
      const from = (sy * width + sx) * 4;
      const to = (y * w + x) * 4;

      out[to] = rgba[from];
      out[to + 1] = rgba[from + 1];
      out[to + 2] = rgba[from + 2];
      out[to + 3] = 255;
    }
  }

  return { data: out, width: w, height: h };
};

const isJpeg = (bytes: Uint8Array) => bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;

// Returns the QR text, or null when there is none (or the photo is not a JPEG).
export const decodeQr = (bytes: Uint8Array): string | null => {
  if (!isJpeg(bytes)) {
    return null;
  }

  try {
    const image = jpeg.decode(bytes, { useTArray: true, formatAsRGBA: true, maxResolutionInMP: 50 });

    for (const edge of [MAX_EDGE, 2600]) {
      const small = downscale(image.data, image.width, image.height, edge);
      const found = jsQR(small.data, small.width, small.height, { inversionAttempts: 'attemptBoth' });

      if (found?.data) {
        return found.data;
      }

      if (Math.max(image.width, image.height) <= edge) {
        break;
      }
    }
  } catch {
    return null;
  }

  return null;
};

export type QrInfo = {
  kind: 'vcard' | 'mecard' | 'link' | 'text';
  text: string;
  fields: Partial<CardRead>;
};

const unescapeVcard = (value: string) =>
  value.replace(/\\n/gi, ' ').replace(/\\([,;\\])/g, '$1').trim();

const isLinkedin = (url: string) => /linkedin\.com\//i.test(url);

// Turns the raw QR text into card fields. Only fields the QR actually holds are set.
export const parseQr = (raw: string): QrInfo => {
  const text = raw.trim();
  const fields: Partial<CardRead> = {};
  const emails: string[] = [];
  const phones: string[] = [];
  const urls: string[] = [];

  if (/^BEGIN:VCARD/i.test(text)) {
    // Unfold continuation lines, then read one property per line.
    const lines = text.replace(/\r?\n[ \t]/g, '').split(/\r?\n/);

    for (const line of lines) {
      const colon = line.indexOf(':');

      if (colon < 0) {
        continue;
      }

      const name = line.slice(0, colon).split(';')[0].toUpperCase().replace(/^ITEM\d+\./, '');
      const value = unescapeVcard(line.slice(colon + 1));

      if (!value) {
        continue;
      }

      if (name === 'N') {
        const [last, first] = line.slice(colon + 1).split(';').map(unescapeVcard);

        if (first) fields.firstName = first;
        if (last) fields.lastName = last;
      } else if (name === 'FN' && !fields.firstName && !fields.lastName) {
        const parts = value.split(/\s+/);

        fields.firstName = parts.slice(0, -1).join(' ') || parts[0];
        fields.lastName = parts.length > 1 ? parts[parts.length - 1] : '';
      } else if (name === 'ORG') {
        fields.companyName = line.slice(colon + 1).split(';').map(unescapeVcard).filter(Boolean)[0] ?? value;
      } else if (name === 'TITLE') {
        fields.jobTitle = value;
      } else if (name === 'EMAIL') {
        emails.push(value);
      } else if (name === 'TEL') {
        phones.push(value.replace(/^tel:/i, ''));
      } else if (name === 'URL') {
        urls.push(value);
      } else if (name === 'ADR') {
        const [, , street, city, , , country] = line.slice(colon + 1).split(';').map(unescapeVcard);

        if (street) fields.addressLine = street;
        if (city) fields.city = city;
        if (country) fields.country = country;
      }
    }

    finish();

    return { kind: 'vcard', text, fields };
  }

  if (/^MECARD:/i.test(text)) {
    for (const part of text.slice(7).split(/(?<!\\);/)) {
      const colon = part.indexOf(':');
      const key = part.slice(0, colon).toUpperCase();
      const value = part.slice(colon + 1).replace(/\\(.)/g, '$1').trim();

      if (!value) continue;
      if (key === 'N') {
        const [last, first] = value.split(',').map((s) => s.trim());

        if (first) fields.firstName = first;
        if (last) fields.lastName = last;
      } else if (key === 'EMAIL') emails.push(value);
      else if (key === 'TEL') phones.push(value);
      else if (key === 'URL') urls.push(value);
      else if (key === 'ORG') fields.companyName = value;
      else if (key === 'TITLE') fields.jobTitle = value;
    }

    finish();

    return { kind: 'mecard', text, fields };
  }

  if (/^https?:\/\//i.test(text)) {
    urls.push(text);
    finish();

    return { kind: 'link', text, fields };
  }

  if (/^mailto:/i.test(text)) {
    emails.push(text.slice(7).split('?')[0]);
    finish();

    return { kind: 'link', text, fields };
  }

  return { kind: 'text', text, fields };

  function finish() {
    if (emails.length) fields.emails = emails.join('; ');
    if (phones.length) fields.phones = phones.join('; ');

    const linkedin = urls.find(isLinkedin);
    const website = urls.find((url) => !isLinkedin(url));

    if (linkedin) fields.linkedin = linkedin;
    if (website) fields.website = website;
  }
};

const mergeList = (first: string, second: string) => {
  const seen = new Set<string>();

  return [...first.split(';'), ...second.split(';')]
    .map((item) => item.trim())
    .filter((item) => item && !seen.has(item.toLowerCase()) && seen.add(item.toLowerCase()))
    .join('; ');
};

// The printed card stays the source; the QR fills what the print left empty, and
// every difference is reported so the person decides in review (a QR is not always
// the card owner's own: it can be an event app, a colleague or the company page).
const SINGLE_FIELDS: (keyof CardRead)[] = [
  'firstName', 'lastName', 'jobTitle', 'companyName', 'website', 'linkedin', 'addressLine', 'city', 'country',
];

const same = (a: string, b: string) =>
  a.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '') === b.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');

export const applyQr = (read: CardRead, qr: QrInfo): { read: CardRead; differences: string[] } => {
  const merged: CardRead = { ...read };
  const differences: string[] = [];

  for (const key of SINGLE_FIELDS) {
    const fromQr = (qr.fields[key] as string | undefined)?.trim();
    const printed = String(read[key] ?? '').trim();

    if (!fromQr) continue;
    if (!printed) {
      (merged as Record<string, unknown>)[key] = fromQr;
    } else if (!same(printed, fromQr)) {
      differences.push(`QR ${key}: ${fromQr}`);
    }
  }

  if (qr.fields.emails) merged.emails = mergeList(read.emails ?? '', qr.fields.emails);
  if (qr.fields.phones) merged.phones = mergeList(read.phones ?? '', qr.fields.phones);

  return { read: merged, differences };
};

// Width and height from a JPEG header (start-of-frame marker), without decoding the image.
export const jpegSize = (bytes: Uint8Array): { width: number; height: number } | null => {
  if (!isJpeg(bytes)) return null;

  let i = 2;

  while (i + 9 < bytes.length) {
    if (bytes[i] !== 0xff) return null;

    const marker = bytes[i + 1];
    const length = (bytes[i + 2] << 8) + bytes[i + 3];

    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { height: (bytes[i + 5] << 8) + bytes[i + 6], width: (bytes[i + 7] << 8) + bytes[i + 8] };
    }

    i += 2 + length;
  }

  return null;
};
