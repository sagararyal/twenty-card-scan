import type { CardRead } from 'src/logic-functions/card-schema';

// OCR only: the camera page read the card's text on the phone (no AI model in this
// Twenty). Here the lines become fields where a pattern is certain (email, phone,
// website, LinkedIn). Name, job title and company stay for the person to fill in Review;
// every other line is kept in "otherNotes" so nothing on the card is lost.

const EMAIL = /[\w.+-]+@[\w-]+(\.[\w-]+)+/g;
const URL_LIKE = /\b(?:https?:\/\/)?(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}(?:\/[^\s]*)?/gi;
const MOBILE_LABEL = /\b(m|mob|mobile|cell|handy|whatsapp)\b\.?:?/i;

const phonesIn = (line: string) =>
  (line.match(/\+?[\d][\d\s().\-/]{6,}\d/g) ?? []).filter((match) => match.replace(/\D/g, '').length >= 7);

export const MAX_OCR_TEXT = 20_000;

export const readFromOcr = (text: string): CardRead => {
  const emails: string[] = [];
  const phones: string[] = [];
  const mobiles: string[] = [];
  const rest: string[] = [];
  let website = '';
  let linkedin = '';

  for (const raw of text.slice(0, MAX_OCR_TEXT).split(/\r?\n/)) {
    let line = raw.replace(/\s+/g, ' ').trim();

    if (line.length < 2) continue;

    for (const email of line.match(EMAIL) ?? []) {
      emails.push(email);
      line = line.replace(email, ' ');
    }

    for (const phone of phonesIn(line)) {
      (MOBILE_LABEL.test(line) ? mobiles : phones).push(phone.trim());
      line = line.replace(phone, ' ');
    }

    for (const url of line.match(URL_LIKE) ?? []) {
      if (/linkedin\.com/i.test(url)) linkedin ||= url;
      else website ||= url;
      line = line.replace(url, ' ');
    }

    line = line.replace(/\b(tel|phone|fax|email|e-mail|web|mobile|m|t|f|e|w)\b\.?:?/gi, ' ').replace(/\s+/g, ' ').trim();

    if (line.length >= 2) rest.push(line);
  }

  return {
    isBusinessCard: true,
    cardBox: null,
    cardType: 'person',
    firstName: '',
    lastName: '',
    nameOtherLanguage: '',
    jobTitle: '',
    companyName: '',
    emails: emails.join('; '),
    phones: phones.join('; '),
    mobile: mobiles.join('; '),
    website,
    addressLine: '',
    addressLine2: '',
    city: '',
    postcode: '',
    state: '',
    country: '',
    linkedin,
    otherNotes: rest.join('; '),
    unclear: 'firstName; lastName; jobTitle; companyName',
  };
};
