import { CoreApiClient } from 'twenty-client-sdk/core';
import { MetadataApiClient } from 'twenty-client-sdk/metadata';
import { defineLogicFunction, type RoutePayload } from 'twenty-sdk/define';
import { Response } from 'twenty-sdk/logic-function';

import { CARD_PHOTO_FIELD_UNIVERSAL_IDENTIFIER } from 'src/objects/scanned-card.object';
import { readCameraSession } from 'src/utils/camera-session';
import { joinLists } from 'src/utils/lists';
import { MAX_OCR_TEXT } from 'src/utils/ocr-read';

const MAX_PHOTO_BYTES = 6 * 1024 * 1024;

const respond = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      // The camera page runs in Twenty's sandboxed (null-origin) page context.
      'Access-Control-Allow-Origin': '*',
    },
  });

const decodePhoto = (value: unknown): Uint8Array | null => {
  if (typeof value !== 'string' || value.length === 0) {
    return null;
  }

  const bytes = Uint8Array.from(Buffer.from(value, 'base64'));

  // JPEG files start with FF D8 FF.
  if (bytes.byteLength > MAX_PHOTO_BYTES || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) {
    return null;
  }

  return bytes;
};

// The camera page sends one card (front, optional back). It becomes a Scanned card,
// which read-card-on-create then reads on the server.
const handler = async (event: RoutePayload): Promise<Response> => {
  // Sent as text/plain (no CORS preflight from the sandboxed page), so the body may arrive as a string.
  type UploadBody = { code?: unknown; collectedAt?: unknown; lists?: unknown; ocrText?: unknown; front?: unknown; back?: unknown };
  let body: UploadBody | null = null;

  try {
    const raw = typeof event.body === 'string' ? event.body : event.rawBody;

    body = raw ? (JSON.parse(event.isBase64Encoded ? Buffer.from(raw, 'base64').toString('utf8') : raw) as UploadBody)
      : (event.body as UploadBody | null);
  } catch {
    body = null;
  }
  const session = await readCameraSession(body?.code);

  if (!session) {
    return respond({ success: false, error: 'Camera link expired' }, 401);
  }

  const front = decodePhoto(body?.front);

  if (!front) {
    return respond({ success: false, error: 'The photo is missing or not a JPEG under 6 MB' }, 400);
  }

  const back = body?.back === undefined ? null : decodePhoto(body.back);

  if (body?.back !== undefined && !back) {
    return respond({ success: false, error: 'The back photo is not a JPEG under 6 MB' }, 400);
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const metadata = new MetadataApiClient();
  const photos: { fileId: string; label: string }[] = [];

  for (const [side, bytes] of [['front', front], ['back', back]] as const) {
    if (!bytes) {
      continue;
    }

    const label = `card-${stamp}-${side}.jpg`;
    const uploaded = await metadata.uploadFile({
      fileBuffer: bytes,
      filename: label,
      fieldMetadataUniversalIdentifier: CARD_PHOTO_FIELD_UNIVERSAL_IDENTIFIER,
    });

    photos.push({ fileId: uploaded.id, label });
  }

  // Lists come as an array of names (several lists per card), or as one text from older pages.
  const collectedAt = Array.isArray(body?.lists)
    ? joinLists(body.lists.filter((name): name is string => typeof name === 'string'))
    : typeof body?.collectedAt === 'string'
      ? joinLists([body.collectedAt])
      : session.collectedAt;
  // OCR only: text read on the phone, used when this Twenty has no AI model.
  const ocrText = typeof body?.ocrText === 'string' ? body.ocrText.slice(0, MAX_OCR_TEXT) : '';

  const created = (await new CoreApiClient().mutation({
    createScannedCard: {
      __args: { data: { name: 'Reading…', collectedAt, photo: photos, ...(ocrText ? { extracted: { ocrText } } : {}) } },
      id: true,
    },
  })) as { createScannedCard: { id: string } };

  return respond({ success: true, recordId: created.createScannedCard.id });
};

export default defineLogicFunction({
  universalIdentifier: 'e7fb914b-713e-4dde-a845-37fec58ae562',
  name: 'camera-upload',
  description: 'Receives one card (front, optional back) from the camera page.',
  timeoutSeconds: 60,
  handler,
  httpRouteTriggerSettings: {
    path: '/cards/upload',
    httpMethod: 'POST',
    isAuthRequired: false,
  },
});
