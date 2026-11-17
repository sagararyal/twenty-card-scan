import { type CountryCode, getCountries, parsePhoneNumberFromString } from 'libphonenumber-js/min';

// Card numbers come in every shape: "+1(202) 961-8092", "+41(0)78 658 96 74",
// "(977-1) 5253571", or local ones with no country code at all. The card's country fills
// in the missing code. A number that still is not valid never blocks the save: it goes
// into the note instead, since Twenty rejects invalid numbers.

const EXTENSION_PATTERN = /\s*(?:ext\.?|extn\.?|extension|x|durchwahl|dw\.?)\s*(\d+)\s*$/i;
const LABEL_PATTERN = /^\s*(?:mobile|mob|cell|handy|office|tel|phone|direct|m|t|o|p)\s*[:.]?\s*/i;

const ALIASES: Record<string, CountryCode> = {
  usa: 'US', 'united states of america': 'US', us: 'US', uk: 'GB', 'great britain': 'GB', england: 'GB',
  scotland: 'GB', wales: 'GB', uae: 'AE', 'south korea': 'KR', korea: 'KR', russia: 'RU',
  'czech republic': 'CZ', 'ivory coast': 'CI', "côte d'ivoire": 'CI', vietnam: 'VN', laos: 'LA',
  'drc': 'CD', 'dr congo': 'CD', 'democratic republic of the congo': 'CD', 'republic of the congo': 'CG',
};

let byName: Map<string, CountryCode> | null = null;

const countryNames = () => {
  if (byName) return byName;

  const display = new Intl.DisplayNames(['en'], { type: 'region' });

  byName = new Map(getCountries().map((code) => [(display.of(code) ?? code).toLowerCase(), code]));

  return byName;
};

// "Republic of Armenia", "Juba South Sudan", "United States" -> ISO code.
export const countryCodeFromName = (country: string | null | undefined): CountryCode | undefined => {
  const name = (country ?? '').trim().toLowerCase();

  if (!name) return undefined;
  if (ALIASES[name]) return ALIASES[name];

  const names = countryNames();

  if (names.has(name)) return names.get(name);

  // Longest country name inside the text wins ("south sudan" before "sudan").
  let best: [string, CountryCode] | null = null;

  for (const [known, code] of names) {
    if (name.includes(known) && (!best || known.length > best[0].length)) best = [known, code];
  }

  return best?.[1] ?? Object.entries(ALIASES).find(([alias]) => name.includes(alias))?.[1];
};

export type ParsedPhone = {
  raw: string;
  valid: boolean;
  callingCode: string;
  countryCode: string;
  number: string;
  extension: string;
};

export const parsePhone = (raw: string, defaultCountry?: CountryCode): ParsedPhone => {
  const extension = raw.match(EXTENSION_PATTERN)?.[1] ?? '';
  const cleaned = raw
    .replace(EXTENSION_PATTERN, '')
    .replace(LABEL_PATTERN, '')
    .replace(/\(0\)/g, '') // "+41 (0)78": the trunk zero is dropped after a country code
    .replace(/^\(\s*\+/, '+') // "(+61) 0437 ..."
    .trim();
  const parsed = parsePhoneNumberFromString(cleaned, defaultCountry);

  if (parsed?.isValid()) {
    return {
      raw: raw.trim(),
      valid: true,
      callingCode: `+${parsed.countryCallingCode}`,
      countryCode: parsed.country ?? '',
      number: parsed.nationalNumber,
      extension,
    };
  }

  return { raw: raw.trim(), valid: false, callingCode: '', countryCode: '', number: '', extension };
};
