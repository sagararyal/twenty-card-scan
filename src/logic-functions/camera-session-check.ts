import { defineLogicFunction, type RoutePayload } from 'twenty-sdk/define';
import { Response } from 'twenty-sdk/logic-function';

import { isAiAvailable } from 'src/utils/ai-available';
import { isIntroSeen, readCameraSession } from 'src/utils/camera-session';
import { recentListNames } from 'src/utils/lists';

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

// The camera page checks its code on start. It gets back the lists picked in Twenty, the
// recent list names (names only) and whether an AI model reads the cards (else OCR only).
const handler = async (event: RoutePayload): Promise<Response> => {
  const session = await readCameraSession(event.queryStringParameters?.code);

  if (!session) {
    return respond({ success: false, error: 'Camera link expired' }, 401);
  }

  const [recentLists, aiAvailable, introSeen] = await Promise.all([
    recentListNames(6).catch(() => []),
    isAiAvailable(),
    isIntroSeen(session).catch(() => false),
  ]);

  return respond({ success: true, collectedAt: session.collectedAt, recentLists, aiAvailable, introSeen, expiresAt: session.expiresAt });
};

export default defineLogicFunction({
  universalIdentifier: '4cfeffb3-d110-401a-9cf7-60d78f35462e',
  name: 'camera-session-check',
  description: 'Lets the camera page check its session code.',
  timeoutSeconds: 10,
  handler,
  httpRouteTriggerSettings: {
    path: '/cards/session',
    httpMethod: 'GET',
    isAuthRequired: false,
  },
});
