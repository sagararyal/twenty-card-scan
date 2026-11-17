// What the model returns for one card. Twenty's JSON responses allow only flat
// string / number / boolean fields, so lists come back as text joined by "; ".
// QR codes are decoded separately in code (models cannot read QR bits reliably).

export const CARD_READ_INSTRUCTIONS = [
  'You read business cards from photos and return the printed fields as JSON.',
  'Transcribe exactly what is printed. Never guess or complete a field you cannot read: leave it empty and name it in "unclear".',
  'Do not take information from QR codes or barcodes; they are decoded separately. Read only the printed text.',
  'Keep phone numbers with their country code and extension as printed. Put mobile numbers (labelled mobile, cell, M, Handy) in "mobile" and all others in "phones".',
  'Keep email casing. For several emails or phones, join them with "; ".',
  'Write the country as its full English name if it is printed or obvious from the address, else leave it empty.',
  'If the card shows a name in a second language or script, put it in "nameOtherLanguage".',
  'Put parent-group or partner logos, slogans, social handles and anything else useful in "otherNotes".',
  'Set "cardType" to "organization" when the card names no person (a company or project card), else "person".',
  'Give where the card sits in the first photo as fractions of the photo width and height (0 = left or top edge, 1 = right or bottom edge): cardLeft, cardTop, cardRight, cardBottom. Use 0, 0, 1, 1 if the card fills the photo.',
  'If the photo is not a business card, set "isBusinessCard" to false and leave everything else empty.',
].join(' ');

const field = (description: string) => ({ type: 'string', description }) as const;

const STRING_FIELDS = [
  ['cardType', '"person", or "organization" when no person is named'],
  ['firstName', 'Given name as printed'],
  ['lastName', 'Family name as printed'],
  ['nameOtherLanguage', 'The name in a second language or script, if printed'],
  ['jobTitle', 'Job title as printed'],
  ['companyName', 'Company or organisation name'],
  ['emails', 'All emails, joined with "; "'],
  ['phones', 'Office and other non-mobile numbers with extensions, joined with "; "'],
  ['mobile', 'Mobile numbers, joined with "; "'],
  ['website', 'Website as printed'],
  ['addressLine', 'Street and number'],
  ['addressLine2', 'Building, floor, suite or P.O. box'],
  ['city', 'City'],
  ['postcode', 'Postal code'],
  ['state', 'State, region or province, if printed'],
  ['country', 'Country, full English name'],
  ['linkedin', 'LinkedIn URL or handle, if printed'],
  ['otherNotes', 'Logos of parent groups, slogans, social handles, anything else useful'],
  ['unclear', 'Names of fields that were hard to read, joined with "; "'],
] as const;

export const CARD_READ_SCHEMA = {
  type: 'object' as const,
  additionalProperties: false as const,
  properties: {
    isBusinessCard: { type: 'boolean' as const, description: 'False if the photo is not a business card' },
    cardLeft: { type: 'number' as const, description: 'Left edge of the card, 0 to 1 of the photo width' },
    cardTop: { type: 'number' as const, description: 'Top edge of the card, 0 to 1 of the photo height' },
    cardRight: { type: 'number' as const, description: 'Right edge of the card, 0 to 1 of the photo width' },
    cardBottom: { type: 'number' as const, description: 'Bottom edge of the card, 0 to 1 of the photo height' },
    ...Object.fromEntries(STRING_FIELDS.map(([key, description]) => [key, field(description)])),
  },
  required: ['isBusinessCard', 'cardLeft', 'cardTop', 'cardRight', 'cardBottom', ...STRING_FIELDS.map(([key]) => key)],
};

// Where the card sits in the first photo (fractions), plus the photo's size in pixels.
export type CardBox = { left: number; top: number; right: number; bottom: number; photoWidth?: number; photoHeight?: number };

export type CardRead = {
  isBusinessCard: boolean;
  cardBox?: CardBox | null;
  cardType: string;
  firstName: string;
  lastName: string;
  nameOtherLanguage: string;
  jobTitle: string;
  companyName: string;
  emails: string;
  phones: string;
  mobile: string;
  website: string;
  addressLine: string;
  addressLine2: string;
  city: string;
  postcode: string;
  state: string;
  country: string;
  linkedin: string;
  otherNotes: string;
  unclear: string;
};

// The model's answer, made safe: every field present and a string (or boolean), whatever came back.
export const normalizeCardRead = (value: unknown): CardRead => {
  const raw = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  const text = (key: string) => (typeof raw[key] === 'string' ? (raw[key] as string).trim() : '');

  const fraction = (key: string) => {
    const n = Number(raw[key]);

    return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : null;
  };
  const [left, top, right, bottom] = ['cardLeft', 'cardTop', 'cardRight', 'cardBottom'].map(fraction);
  const cardBox =
    left !== null && top !== null && right !== null && bottom !== null && right - left > 0.15 && bottom - top > 0.1
      ? { left, top, right, bottom }
      : null;

  return {
    isBusinessCard: raw.isBusinessCard !== false,
    cardBox,
    ...(Object.fromEntries(STRING_FIELDS.map(([key]) => [key, text(key)])) as Omit<CardRead, 'isBusinessCard' | 'cardBox'>),
  };
};

export const splitList = (value: string | undefined | null): string[] =>
  (value ?? '')
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean);
