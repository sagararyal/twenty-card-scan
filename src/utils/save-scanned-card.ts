import { splitLists } from 'src/utils/lists';
import { findPersonByEmails } from 'src/utils/person-match';
import { countryCodeFromName, type ParsedPhone, parsePhone } from 'src/utils/phone';
import { CoreApiClient } from 'twenty-client-sdk/core';

import { CARD_STATUS } from 'src/objects/scanned-card.object';
import { splitList } from 'src/logic-functions/card-schema';

// Turns a reviewed Scanned card into a Person (and Company), or skips it.
// Dedupe: a person by email, a company by web domain, then by exact name.
// Existing records are only filled in, never overwritten.

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Email domains that say nothing about the company.
const FREE_MAIL_DOMAINS = new Set([
  'gmail.com', 'googlemail.com', 'outlook.com', 'hotmail.com', 'live.com',
  'yahoo.com', 'icloud.com', 'me.com', 'gmx.de', 'gmx.net', 'web.de',
  'proton.me', 'protonmail.com', 'aol.com', 'mail.com', 'yandex.com',
]);

export type SaveCardInput = {
  recordId: string;
  skip?: boolean;
  person: {
    firstName: string;
    lastName: string;
    jobTitle: string;
    emails: string;
    phones: string;
    mobile?: string;
    linkedin: string;
  };
  company: {
    name: string;
    website: string;
    addressLine: string;
    addressLine2?: string;
    postcode?: string;
    state?: string;
    city: string;
    country: string;
    // From Enrich, when the person kept it
    linkedin?: string;
    description?: string;
    industry?: string;
    employees?: string;
    sourceUrl?: string;
  };
  note: string;
  // The Twenty List to put the person on (defaults to the card's own list)
  list?: string;
  // Only from the review screen, when the person ticks it: a deal to follow up
  createOpportunity?: boolean;
  // Set by auto-save, shown in the card's check line
  savedAutomatically?: boolean;
  // From review: the card is someone already in Twenty with another email (same name)
  mergeIntoPersonId?: string;
};

export type SaveCardResult = {
  success: boolean;
  error?: string;
  personId?: string | null;
  personWasNew?: boolean;
  companyId?: string | null;
  companyWasNew?: boolean;
  companyOnly?: boolean;
  opportunityId?: string | null;
};

const domainFromWebsite = (website: string): string | null => {
  const trimmed = website.trim();

  if (!trimmed) {
    return null;
  }

  try {
    const url = new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`);

    return url.hostname.replace(/^www\./i, '').toLowerCase() || null;
  } catch {
    return null;
  }
};

const domainFromEmail = (email: string): string | null => {
  const domain = email.split('@')[1]?.trim().toLowerCase();

  return domain && !FREE_MAIL_DOMAINS.has(domain) ? domain : null;
};

// An existing person is only added to: an empty job title, company or LinkedIn is filled,
// and emails and phone numbers from the card that the record lacks are added as extra ones.
// Nothing already on the record is changed.
const fillPerson = async (
  client: CoreApiClient,
  personId: string,
  card: { jobTitle: string; companyId: string | null; emails: string[]; phones: ParsedPhone[]; linkedin: string },
) => {
  const found = (await client.query({
    person: {
      __args: { filter: { id: { eq: personId } } },
      jobTitle: true,
      companyId: true,
      emails: { primaryEmail: true, additionalEmails: true },
      phones: {
        primaryPhoneNumber: true,
        primaryPhoneCallingCode: true,
        primaryPhoneCountryCode: true,
        additionalPhones: { number: true, callingCode: true, countryCode: true },
      },
      linkedinLink: { primaryLinkUrl: true },
    },
  })) as unknown as {
    person: {
      jobTitle: string | null;
      companyId: string | null;
      emails: { primaryEmail: string | null; additionalEmails: string[] | null } | null;
      phones: {
        primaryPhoneNumber: string | null;
        primaryPhoneCallingCode: string | null;
        primaryPhoneCountryCode: string | null;
        additionalPhones: { number: string; callingCode: string; countryCode?: string }[] | null;
      } | null;
      linkedinLink: { primaryLinkUrl: string | null } | null;
    } | null;
  };

  const current = found.person;

  if (!current) return;

  const fill: Record<string, unknown> = {};

  if (!current.jobTitle && card.jobTitle.trim()) fill.jobTitle = card.jobTitle.trim();
  if (!current.companyId && card.companyId) fill.companyId = card.companyId;
  if (!current.linkedinLink?.primaryLinkUrl && card.linkedin.trim()) {
    fill.linkedinLink = { primaryLinkUrl: card.linkedin.trim() };
  }

  const knownEmails = [current.emails?.primaryEmail ?? '', ...(current.emails?.additionalEmails ?? [])].filter(Boolean);
  const newEmails = card.emails.filter((email) => !knownEmails.some((known) => known.toLowerCase() === email.toLowerCase()));

  if (newEmails.length > 0) {
    fill.emails = current.emails?.primaryEmail
      ? { primaryEmail: current.emails.primaryEmail, additionalEmails: [...(current.emails.additionalEmails ?? []), ...newEmails] }
      : { primaryEmail: newEmails[0], additionalEmails: [...(current.emails?.additionalEmails ?? []), ...newEmails.slice(1)] };
  }

  const digits = (value: string | null | undefined) => (value ?? '').replace(/\D/g, '');
  const knownPhones = [
    digits(current.phones?.primaryPhoneCallingCode) + digits(current.phones?.primaryPhoneNumber),
    ...(current.phones?.additionalPhones ?? []).map((phone) => digits(phone.callingCode) + digits(phone.number)),
  ].filter(Boolean);
  const newPhones = card.phones.filter((phone) => !knownPhones.includes(digits(phone.callingCode) + digits(phone.number)));

  if (newPhones.length > 0) {
    const asExtra = (phone: ParsedPhone) => ({
      number: phone.number,
      callingCode: phone.callingCode,
      ...(phone.countryCode ? { countryCode: phone.countryCode } : {}),
    });

    fill.phones = current.phones?.primaryPhoneNumber
      ? {
          primaryPhoneNumber: current.phones.primaryPhoneNumber,
          primaryPhoneCallingCode: current.phones.primaryPhoneCallingCode,
          ...(current.phones.primaryPhoneCountryCode ? { primaryPhoneCountryCode: current.phones.primaryPhoneCountryCode } : {}),
          additionalPhones: [...(current.phones.additionalPhones ?? []), ...newPhones.map(asExtra)],
        }
      : {
          primaryPhoneNumber: newPhones[0].number,
          primaryPhoneCallingCode: newPhones[0].callingCode,
          ...(newPhones[0].countryCode ? { primaryPhoneCountryCode: newPhones[0].countryCode } : {}),
          additionalPhones: [...(current.phones?.additionalPhones ?? []), ...newPhones.slice(1).map(asExtra)],
        };
  }

  if (Object.keys(fill).length > 0) {
    await client.mutation({ updatePerson: { __args: { id: personId, data: fill }, id: true } });
  }
};

// Puts the person on a Twenty List (created if it does not exist yet). Twenty's own
// Campaigns can then mail that list.
const addToList = async (client: CoreApiClient, listName: string, personId: string) => {
  const name = listName.trim().slice(0, 200);

  if (!name) return;

  const found = (await client.query({
    messageLists: { __args: { filter: { name: { ilike: name } }, first: 1 }, edges: { node: { id: true } } },
  })) as { messageLists: { edges: { node: { id: string } }[] } };

  let listId = found.messageLists.edges[0]?.node.id;

  if (!listId) {
    const created = (await client.mutation({
      createMessageList: { __args: { data: { name, description: 'Made by Card Scan' } }, id: true },
    })) as { createMessageList: { id: string } };

    listId = created.createMessageList.id;
  }

  const member = (await client.query({
    messageListMembers: {
      __args: { filter: { listId: { eq: listId }, personId: { eq: personId } }, first: 1 },
      edges: { node: { id: true } },
    },
  })) as { messageListMembers: { edges: unknown[] } };

  if (member.messageListMembers.edges.length === 0) {
    await client.mutation({ createMessageListMember: { __args: { data: { listId, personId } }, id: true } });
  }
};

const companyAddress = (company: SaveCardInput['company']) => ({
  addressStreet1: company.addressLine.trim(),
  addressStreet2: (company.addressLine2 ?? '').trim(),
  addressCity: company.city.trim(),
  addressPostcode: (company.postcode ?? '').trim(),
  addressState: (company.state ?? '').trim(),
  addressCountry: company.country.trim(),
});

// "50-200" or "about 120" -> the first number, as Twenty stores one employee count.
const employeeCount = (value?: string): number | null => {
  const match = (value ?? '').replace(/[,.\s](?=\d{3}\b)/g, '').match(/\d+/);
  const count = match ? Number.parseInt(match[0], 10) : NaN;

  return Number.isFinite(count) && count > 0 ? count : null;
};

export const saveScannedCard = async (input: SaveCardInput | null): Promise<SaveCardResult> => {

  if (!input || typeof input.recordId !== 'string' || !UUID_PATTERN.test(input.recordId)) {
    return { success: false, error: 'recordId must be a UUID' };
  }

  const client = new CoreApiClient();

  if (input.skip) {
    await client.mutation({
      updateScannedCard: {
        __args: { id: input.recordId, data: { status: CARD_STATUS.SKIPPED } },
        id: true,
      },
    });

    return { success: true };
  }

  const { person, company } = input;
  const emails = splitList(person.emails);
  // Mobile first: it is the number that reaches the person.
  const cardCountry = countryCodeFromName(company.country);
  const allNumbers = [...splitList(person.mobile ?? ''), ...splitList(person.phones)];
  // Fax numbers are not ways to reach the person: kept in the note only.
  const faxes = allNumbers.filter((raw) => /^\s*fax\b/i.test(raw));
  const parsedPhones = allNumbers.filter((raw) => !faxes.includes(raw)).map((raw) => parsePhone(raw, cardCountry));
  const phones = parsedPhones.filter((phone, index, all) => phone.valid && all.findIndex((other) => other.callingCode + other.number === phone.callingCode + phone.number) === index);
  const unreadablePhones = parsedPhones.filter((phone) => !phone.valid);
  const primaryEmail = emails[0] ?? '';

  // Company: by domain, then by exact name, else create.
  let companyId: string | null = null;
  let companyWasNew = false;
  const domain = domainFromWebsite(company.website) ?? domainFromEmail(primaryEmail);

  if (domain) {
    const byDomain = (await client.query({
      companies: {
        __args: { filter: { domainName: { primaryLinkUrl: { ilike: `%${domain}%` } } }, first: 1 },
        edges: { node: { id: true } },
      },
    })) as { companies: { edges: { node: { id: string } }[] } };

    companyId = byDomain.companies.edges[0]?.node.id ?? null;
  }

  if (!companyId && company.name.trim()) {
    const byName = (await client.query({
      companies: {
        __args: { filter: { name: { ilike: company.name.trim() } }, first: 1 },
        edges: { node: { id: true } },
      },
    })) as { companies: { edges: { node: { id: string } }[] } };

    companyId = byName.companies.edges[0]?.node.id ?? null;
  }

  if (!companyId && company.name.trim()) {
    const created = (await client.mutation({
      createCompany: {
        __args: {
          data: {
            name: company.name.trim(),
            ...(domain ? { domainName: { primaryLinkUrl: `https://${domain}` } } : {}),
            address: companyAddress(company),
            ...(company.linkedin?.trim() ? { linkedinLink: { primaryLinkUrl: company.linkedin.trim() } } : {}),
            ...(employeeCount(company.employees) ? { employees: employeeCount(company.employees) } : {}),
          },
        },
        id: true,
      },
    })) as { createCompany: { id: string } };

    companyId = created.createCompany.id;
    companyWasNew = true;
  }

  // An existing company is only filled in where it is empty, never overwritten.
  if (companyId && !companyWasNew) {
    const existing = (await client.query({
      company: {
        __args: { filter: { id: { eq: companyId } } },
        employees: true,
        linkedinLink: { primaryLinkUrl: true },
        domainName: { primaryLinkUrl: true },
        address: { addressStreet1: true, addressCity: true, addressCountry: true },
      },
    })) as {
      company: {
        employees: number | null;
        linkedinLink: { primaryLinkUrl: string | null } | null;
        domainName: { primaryLinkUrl: string | null } | null;
        address: { addressStreet1: string | null; addressCity: string | null; addressCountry: string | null } | null;
      } | null;
    };

    const current = existing.company;
    const fill: Record<string, unknown> = {};

    if (!current?.linkedinLink?.primaryLinkUrl && company.linkedin?.trim()) {
      fill.linkedinLink = { primaryLinkUrl: company.linkedin.trim() };
    }

    if (!current?.employees && employeeCount(company.employees)) {
      fill.employees = employeeCount(company.employees);
    }

    if (!current?.domainName?.primaryLinkUrl && domain) {
      fill.domainName = { primaryLinkUrl: `https://${domain}` };
    }

    const hasAddress = Boolean(current?.address?.addressStreet1 || current?.address?.addressCity);

    if (!hasAddress && (company.addressLine.trim() || company.city.trim())) {
      fill.address = companyAddress(company);
    }

    if (Object.keys(fill).length > 0) {
      await client.mutation({ updateCompany: { __args: { id: companyId, data: fill }, id: true } });
    }
  }

  if (companyId && company.description?.trim()) {
    const about = [
      company.description.trim(),
      company.industry?.trim() ? `Sector: ${company.industry.trim()}` : '',
      company.employees?.trim() ? `Size: ${company.employees.trim()}` : '',
      company.sourceUrl?.trim() ? `Source: ${company.sourceUrl.trim()}` : '',
    ].filter(Boolean).join('\n\n');

    const companyNote = (await client.mutation({
      createNote: { __args: { data: { title: 'About (from their website)', bodyV2: { markdown: about } } }, id: true },
    })) as { createNote: { id: string } };

    await client.mutation({
      createNoteTarget: { __args: { data: { noteId: companyNote.createNote.id, targetCompanyId: companyId } }, id: true },
    });
  }

  // Person: by primary email, else create. An existing person is only filled in.
  // An organisation card (no person on it) saves the company only.
  const hasPerson = Boolean(person.firstName.trim() || person.lastName.trim());

  if (!hasPerson && !companyId) {
    return { success: false, error: 'Add a person or a company name first' };
  }

  let personId: string | null = null;
  let personWasNew = false;

  if (hasPerson) {
    // Review's "same person" choice wins; else any email on the card, main or extra.
    const match = input.mergeIntoPersonId?.trim()
      ? { id: input.mergeIntoPersonId.trim() }
      : await findPersonByEmails(client, emails);

    if (match) {
      personId = match.id;
      await fillPerson(client, personId, { jobTitle: person.jobTitle, companyId, emails, phones, linkedin: person.linkedin });
    }
  }
  if (hasPerson && !personId) {
    const [firstPhone, ...otherPhones] = phones;

    const created = (await client.mutation({
      createPerson: {
        __args: {
          data: {
            name: { firstName: person.firstName.trim(), lastName: person.lastName.trim() },
            jobTitle: person.jobTitle.trim(),
            ...(primaryEmail
              ? { emails: { primaryEmail, additionalEmails: emails.slice(1) } }
              : {}),
            ...(firstPhone
              ? {
                  phones: {
                    primaryPhoneNumber: firstPhone.number,
                    primaryPhoneCallingCode: firstPhone.callingCode,
                    ...(firstPhone.countryCode ? { primaryPhoneCountryCode: firstPhone.countryCode } : {}),
                    additionalPhones: otherPhones.map((phone) => ({
                      number: phone.number,
                      callingCode: phone.callingCode,
                      ...(phone.countryCode ? { countryCode: phone.countryCode } : {}),
                    })),
                  },
                }
              : {}),
            ...(person.linkedin.trim()
              ? { linkedinLink: { primaryLinkUrl: person.linkedin.trim() } }
              : {}),
            ...(companyId ? { companyId } : {}),
          },
        },
        id: true,
      },
    })) as { createPerson: { id: string } };

    personId = created.createPerson.id;
    personWasNew = true;
  }

  const extensions = phones
    .filter((phone) => phone.extension)
    .map((phone) => `Phone ${phone.raw}`)
    .concat(unreadablePhones.map((phone) => `Phone (check, not saved as a number): ${phone.raw}`))
    .concat(faxes);
  const noteText = [input.note.trim(), ...extensions].filter(Boolean).join('\n\n');

  if (noteText) {
    const note = (await client.mutation({
      createNote: {
        __args: {
          data: {
            title: 'Business card',
            bodyV2: { markdown: noteText },
          },
        },
        id: true,
      },
    })) as { createNote: { id: string } };

    await client.mutation({
      createNoteTarget: {
        __args: {
          data: personId
            ? { noteId: note.createNote.id, targetPersonId: personId }
            : { noteId: note.createNote.id, targetCompanyId: companyId },
        },
        id: true,
      },
    });
  }

  const card = (await client.query({
    scannedCard: { __args: { filter: { id: { eq: input.recordId } } }, collectedAt: true },
  })) as { scannedCard: { collectedAt: string | null } | null };
  const listNames = splitLists(input.list ?? card.scannedCard?.collectedAt ?? '');

  if (personId) {
    for (const listName of listNames) {
      await addToList(client, listName, personId);
    }
  }

  let opportunityId: string | null = null;

  if (input.createOpportunity && (personId || companyId)) {
    const title = [company.name.trim(), `${person.firstName} ${person.lastName}`.trim()].filter(Boolean).join(': ');
    const opportunity = (await client.mutation({
      createOpportunity: {
        __args: {
          data: {
            name: title || 'New opportunity',
            stage: 'NEW',
            ...(companyId ? { companyId } : {}),
            ...(personId ? { pointOfContactId: personId } : {}),
          },
        },
        id: true,
      },
    })) as { createOpportunity: { id: string } };

    opportunityId = opportunity.createOpportunity.id;
  }

  await client.mutation({
    updateScannedCard: {
      __args: {
        id: input.recordId,
        data: {
          status: CARD_STATUS.CREATED,
          collectedAt: listNames.join("; "),
          personId,
          name: `${person.firstName} ${person.lastName}`.trim() || company.name.trim() || '(no name)',
        },
      },
      id: true,
    },
  });

  return { success: true, personId, personWasNew, companyId, companyWasNew, companyOnly: !hasPerson, opportunityId };
};

