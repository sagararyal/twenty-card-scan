import { CoreApiClient } from 'twenty-client-sdk/core';
import { MetadataApiClient } from 'twenty-client-sdk/metadata';
import { ai, kv } from 'twenty-sdk/logic-function';

import { isAiAvailable } from 'src/utils/ai-available';
import { findPersonByEmails, findPersonByName, type PersonMatch } from 'src/utils/person-match';
import { readFromOcr } from 'src/utils/ocr-read';
import { applyQr, decodeQr, jpegSize, parseQr } from 'src/utils/qr';
import { companyNameFromWebsite } from 'src/utils/website';
import { saveScannedCard } from 'src/utils/save-scanned-card';

import { CARD_STATUS } from 'src/objects/scanned-card.object';
import {
  CARD_READ_INSTRUCTIONS,
  CARD_READ_SCHEMA,
  type CardRead,
  normalizeCardRead,
  splitList,
} from 'src/logic-functions/card-schema';

type PhotoFile = {
  fileId: string;
  label?: string | null;
  extension?: string | null;
  url?: string | null;
};

export type ReadScannedCardResult =
  | { success: true; read: CardRead; checks: string }
  | { success: false; error: string };

const downloadPhoto = async (photo: PhotoFile): Promise<Uint8Array> => {
  if (!photo.url) {
    throw new Error('the card photo has no download URL');
  }

  const download = await fetch(photo.url);

  if (!download.ok) {
    throw new Error(`could not download the card photo (${download.status})`);
  }

  return new Uint8Array(await download.arrayBuffer());
};

// The AI only accepts files uploaded to the AgentChat folder, so copy each card photo there.
const uploadForAgentChat = async (bytes: Uint8Array, filename: string): Promise<string> => {
  const metadata = new MetadataApiClient();

  const target = (await metadata.mutation({
    createFileUpload: {
      __args: { fileFolder: 'AgentChat', filename, size: bytes.byteLength },
      fileId: true,
      uploadUrl: true,
      contentType: true,
    },
  })) as {
    createFileUpload: { fileId: string; uploadUrl: string; contentType: string };
  };

  const put = await fetch(target.createFileUpload.uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': target.createFileUpload.contentType },
    body: bytes as unknown as BodyInit,
  });

  if (!put.ok) {
    throw new Error(`could not upload the card photo for reading (${put.status})`);
  }

  await metadata.mutation({
    completeFileUpload: {
      __args: { fileId: target.createFileUpload.fileId },
      id: true,
    },
  });

  return target.createFileUpload.fileId;
};

const emailDomain = (emails: string): string | null =>
  splitList(emails)[0]?.split('@')[1]?.trim().toLowerCase() ?? null;

// Hints for the review list: is the company already there, is this person maybe a duplicate.
const findMatches = async (client: CoreApiClient, read: CardRead) => {
  const hints: string[] = [];
  let nameMatch: PersonMatch | null = null;
  const byEmail = await findPersonByEmails(client, splitList(read.emails));

  if (byEmail) {
    hints.push(`Person exists: ${byEmail.name} (same email)`);
  } else {
    // Same name, other email: maybe a second job. Review asks before merging.
    nameMatch = await findPersonByName(client, read.firstName, read.lastName);

    if (nameMatch) hints.push(`Same name in Twenty: ${nameMatch.name}${nameMatch.email ? ` (${nameMatch.email})` : ''}`);
  }

  const domain = read.website.trim()
    ? read.website.trim().replace(/^https?:\/\//i, '').replace(/^www\./i, '').split('/')[0].toLowerCase()
    : emailDomain(read.emails);

  if (domain || read.companyName.trim()) {
    const companies = (await client.query({
      companies: {
        __args: {
          filter: {
            or: [
              ...(domain
                ? [
                    { domainName: { primaryLinkUrl: { ilike: `%//${domain}` } } },
                    { domainName: { primaryLinkUrl: { ilike: `%//${domain}/%` } } },
                    { domainName: { primaryLinkUrl: { ilike: `%//www.${domain}` } } },
                    { domainName: { primaryLinkUrl: { ilike: `%//www.${domain}/%` } } },
                    { domainName: { primaryLinkUrl: { eq: domain } } },
                  ]
                : []),
              ...(read.companyName.trim() ? [{ name: { ilike: read.companyName.trim() } }] : []),
            ],
          },
          first: 1,
        },
        edges: { node: { id: true } },
      },
    })) as { companies: { edges: unknown[] } };

    hints.push(companies.companies.edges.length > 0 ? 'Company exists' : 'New company');
  }

  return { hints, nameMatch };
};

const markFailed = async (client: CoreApiClient, recordId: string, error: string) => {
  await client.mutation({
    updateScannedCard: {
      __args: { id: recordId, data: { status: CARD_STATUS.FAILED, readError: error } },
      id: true,
    },
  });
};

const MAX_ATTEMPTS = 3;
const FREE_MAIL = /^(gmail|googlemail|outlook|hotmail|live|yahoo|icloud|me|gmx|web|proton|protonmail|aol|mail|yandex)\./i;

// Reads one Scanned card's photo with the workspace's default model and stores the result.
// At most three tries per card (automatic retries included); any crash marks it Failed,
// so a bad answer can never loop and keep paying for model calls.
export const readScannedCard = async (
  recordId: string,
  { fresh = false }: { fresh?: boolean } = {},
): Promise<ReadScannedCardResult> => {
  const client = new CoreApiClient();
  const attemptsKey = `read-attempts:${recordId}`;
  const attempts = fresh ? 0 : ((await kv.get<number>(attemptsKey)) ?? 0);

  if (attempts >= MAX_ATTEMPTS) {
    const error = `Gave up after ${MAX_ATTEMPTS} tries. Use Read again`;

    await markFailed(client, recordId, error);

    return { success: false, error };
  }

  await kv.set(attemptsKey, attempts + 1);

  try {
    const result = await readOnce(client, recordId);

    if (result.success) await kv.delete(attemptsKey);

    return result;
  } catch (error) {
    const message = `Reading failed: ${error instanceof Error ? error.message : 'unknown error'}`;

    await markFailed(client, recordId, message).catch(() => undefined);

    return { success: false, error: message };
  }
};

// One model call, retried once after a short pause when the model fails (rate limit, outage).
const generateWithRetry = async (request: Parameters<typeof ai.generate>[0]) => {
  const first = await ai.generate(request);

  if (first.success && first.object) return first;
  await new Promise((resolve) => setTimeout(resolve, 3000));

  return ai.generate(request);
};

const readOnce = async (client: CoreApiClient, recordId: string): Promise<ReadScannedCardResult> => {

  const found = (await client.query({
    scannedCard: {
      __args: { filter: { id: { eq: recordId } } },
      id: true,
      collectedAt: true,
      extracted: true,
      photo: { fileId: true, label: true, extension: true, url: true },
    },
  })) as {
    scannedCard: { id: string; collectedAt: string | null; extracted: { ocrText?: unknown } | null; photo: PhotoFile[] | null } | null;
  };
  const ocrText = typeof found.scannedCard?.extracted?.ocrText === 'string' ? found.scannedCard.extracted.ocrText : '';
  const aiOn = await isAiAvailable();

  const photos = found.scannedCard?.photo ?? [];

  if (photos.length === 0) {
    const error = 'This card has no photo';

    await markFailed(client, recordId, error);

    return { success: false, error };
  }

  await client.mutation({
    updateScannedCard: {
      __args: { id: recordId, data: { status: CARD_STATUS.READING, readError: '' } },
      id: true,
    },
  });

  let agentChatFileIds: string[];
  let qrText: string | null = null;
  let firstPhotoSize: { width: number; height: number } | null = null;

  try {
    const downloaded = await Promise.all(photos.map(downloadPhoto));

    agentChatFileIds = !aiOn ? [] : await Promise.all(
      downloaded.map((bytes, index) =>
        uploadForAgentChat(bytes, photos[index].label || `card-${index + 1}.${photos[index].extension ?? 'jpg'}`),
      ),
    );
    qrText = downloaded.map(decodeQr).find((text): text is string => Boolean(text)) ?? null;
    firstPhotoSize = downloaded[0] ? jpegSize(downloaded[0]) : null;
  } catch (error) {
    const message = `Preparing the photo: ${error instanceof Error ? error.message : 'upload failed'}`;

    await markFailed(client, recordId, message);

    return { success: false, error: message };
  }

  // No AI model in this Twenty: use the text the camera page read on the phone (OCR only).
  if (!aiOn && !ocrText) {
    const message = 'No AI model is turned on in this CRM. Scan with the Card Scan camera (OCR only), or ask an admin to turn on an AI model';

    await markFailed(client, recordId, message);

    return { success: false, error: message };
  }

  const result = aiOn ? await generateWithRetry({
    instructions: CARD_READ_INSTRUCTIONS,
    input: [
      {
        role: 'user',
        content:
          photos.length > 1
            ? 'Read this business card. The photos are its front and back.'
            : 'Read this business card.',
        attachments: agentChatFileIds.map((fileId, index) => ({
          fileId,
          filename: photos[index].label ?? undefined,
        })),
      },
    ],
    responseFormat: { type: 'json', schema: CARD_READ_SCHEMA },
  }) : null;
  const ocrOnly = !result?.success || !result.object ? Boolean(ocrText) : false;

  if (!ocrOnly && (!result?.success || !result.object)) {
    const message = `Reading: ${result?.error ?? 'the model returned nothing'}`;

    await markFailed(client, recordId, message);

    return { success: false, error: message };
  }

  const qr = qrText ? parseQr(qrText) : null;
  const printed = ocrOnly ? readFromOcr(ocrText) : normalizeCardRead(result?.object);

  if (printed.cardBox && firstPhotoSize) {
    printed.cardBox = { ...printed.cardBox, photoWidth: firstPhotoSize.width, photoHeight: firstPhotoSize.height };
  }
  const { read, differences: qrDifferences } = qr ? applyQr(printed, qr) : { read: printed, differences: [] as string[] };

  // No website printed: a work email's domain is the company's site (marked, never silent).
  let websiteFromEmail = '';
  const workDomain = splitList(read.emails)[0]?.split('@')[1]?.trim().toLowerCase() ?? '';

  if (read.isBusinessCard && !read.website && workDomain && !FREE_MAIL.test(workDomain)) {
    read.website = workDomain;
    websiteFromEmail = 'Website from email';
  }

  // Company name missing or hard to read: take it from the company's own website.
  let companyFromWebsite = '';
  const companyUnclear = splitList(read.unclear).some((field) => /company/i.test(field));

  if (aiOn && read.isBusinessCard && (!read.companyName.trim() || companyUnclear)) {
    try {
      const found = await companyNameFromWebsite(read.website, read.emails, async (input) => {
        const pick = await generateWithRetry({
          instructions:
            'Give the name of the organisation this website belongs to, exactly as the site writes it. ' +
            'Use only the text given. Leave it empty if the text does not make it clear.',
          input,
          responseFormat: {
            type: 'json',
            schema: {
              type: 'object',
              additionalProperties: false,
              properties: { companyName: { type: 'string', description: 'Organisation name' } },
              required: ['companyName'],
            },
          },
        });

        return pick.success ? String((pick.object as { companyName?: string } | null)?.companyName ?? '').trim() : '';
      });

      if (found) {
        read.companyName = found.name;
        read.unclear = splitList(read.unclear).filter((field) => !/company/i.test(field)).join('; ');
        companyFromWebsite = `Company name from website: ${found.host}`;
      }
    } catch {
      // The card reads fine without it
    }
  }
  const name = [read.firstName, read.lastName].filter(Boolean).join(' ');
  const { hints: matches, nameMatch } = read.isBusinessCard ? await findMatches(client, read) : { hints: [] as string[], nameMatch: null };
  const checks = [
    read.isBusinessCard ? '' : 'Not a business card?',
    ocrOnly ? 'Read on the phone (OCR only): fill in name, job title and company' : '',
    qr ? (qr.kind === 'vcard' || qr.kind === 'mecard' ? 'QR contact read' : `QR: ${qr.kind}`) : '',
    ...qrDifferences,
    websiteFromEmail,
    companyFromWebsite,
    splitList(read.unclear).length > 0
      ? `Unclear: ${splitList(read.unclear).join(', ')}`
      : '',
    ...matches,
  ]
    .filter(Boolean)
    .join(' · ');

  await client.mutation({
    updateScannedCard: {
      __args: {
        id: recordId,
        data: {
          name: name || '(no name read)',
          companyName: read.companyName,
          extracted: { ...read, ...(qr ? { qr: { kind: qr.kind, text: qr.text.slice(0, 2000) } } : {}), nameMatch },
          checks,
          readError: '',
          status: CARD_STATUS.TO_REVIEW,
        },
      },
      id: true,
    },
  });

  // Auto when clear (the default): a complete, unambiguous card is saved right away.
  const clear =
    read.isBusinessCard &&
    read.cardType !== 'organization' &&
    Boolean(read.firstName && read.lastName && splitList(read.emails).length > 0) &&
    splitList(read.unclear).length === 0 &&
    qrDifferences.length === 0 &&
    !companyFromWebsite &&
    !nameMatch;

  if (clear && (process.env.REVIEW_MODE ?? 'auto') !== 'manual') {
    const list = found.scannedCard?.collectedAt ?? '';
    const saved = await saveScannedCard({
      recordId,
      savedAutomatically: true,
      person: {
        firstName: read.firstName, lastName: read.lastName, jobTitle: read.jobTitle,
        emails: read.emails, phones: read.phones, mobile: read.mobile, linkedin: read.linkedin,
      },
      company: {
        name: read.companyName, website: read.website, addressLine: read.addressLine,
        addressLine2: read.addressLine2, postcode: read.postcode, state: read.state,
        city: read.city, country: read.country,
      },
      note: [
        list ? `Met at ${list}` : '',
        read.nameOtherLanguage ? `Name on card: ${read.nameOtherLanguage}` : '',
        read.otherNotes,
      ].filter(Boolean).join('\n'),
      list,
    });

    if (saved.success) {
      await client.mutation({
        updateScannedCard: {
          __args: { id: recordId, data: { checks: ['Saved automatically', checks].filter(Boolean).join(' · ') } },
          id: true,
        },
      });
    }
  }

  return { success: true, read, checks };
};
