import { defineLogicFunction, type RoutePayload } from 'twenty-sdk/define';
import { Response } from 'twenty-sdk/logic-function';

import { saveScannedCard, type SaveCardResult } from 'src/utils/save-scanned-card';

export type { SaveCardInput, SaveCardResult } from 'src/utils/save-scanned-card';

const respond = (body: SaveCardResult, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

// "Create" and "Skip" on the review screen.
const handler = async (event: RoutePayload): Promise<Response> => {
  try {
    const result = await saveScannedCard(event.body as Parameters<typeof saveScannedCard>[0]);

    return respond(result, result.success ? 200 : 400);
  } catch (error) {
    return respond({ success: false, error: error instanceof Error ? error.message : 'Saving failed' }, 400);
  }
};

export default defineLogicFunction({
  universalIdentifier: '5ac42859-8897-4552-8684-3402f0880f87',
  name: 'save-card',
  description: 'Creates or updates the person and company (or only the company) from a reviewed scanned card.',
  timeoutSeconds: 60,
  handler,
  httpRouteTriggerSettings: {
    path: '/cards/save',
    httpMethod: 'POST',
    isAuthRequired: true,
  },
});
