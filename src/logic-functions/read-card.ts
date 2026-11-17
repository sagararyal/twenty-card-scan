import { defineLogicFunction, type RoutePayload } from 'twenty-sdk/define';
import { Response } from 'twenty-sdk/logic-function';

import { readScannedCard } from 'src/utils/read-scanned-card';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const respond = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

// "Read again" from the review screen. New cards are read by read-card-on-create.
const handler = async (event: RoutePayload): Promise<Response> => {
  const recordId = (event.body as { recordId?: unknown } | null)?.recordId;

  if (typeof recordId !== 'string' || !UUID_PATTERN.test(recordId)) {
    return respond({ success: false, error: 'recordId must be a UUID' }, 400);
  }

  const result = await readScannedCard(recordId, { fresh: true });

  return respond(result, result.success ? 200 : 422);
};

export default defineLogicFunction({
  universalIdentifier: 'fd321b46-7315-47a6-bccd-6f41dccb16b6',
  name: 'read-card',
  description: 'Reads (again) a scanned business card photo with the workspace AI model.',
  timeoutSeconds: 120,
  handler,
  httpRouteTriggerSettings: {
    path: '/cards/read',
    httpMethod: 'POST',
    isAuthRequired: true,
  },
});
