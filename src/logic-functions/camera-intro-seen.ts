import { defineLogicFunction, type RoutePayload } from 'twenty-sdk/define';
import { Response } from 'twenty-sdk/logic-function';

import { markIntroSeen, readCameraSession } from 'src/utils/camera-session';

const respond = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' },
  });

// The camera page's "Don't show again", saved for the person who opened the camera.
const handler = async (event: RoutePayload): Promise<Response> => {
  let code: unknown = null;

  try {
    const raw = typeof event.body === 'string' ? event.body : event.rawBody;

    code = (raw ? JSON.parse(event.isBase64Encoded ? Buffer.from(raw, 'base64').toString('utf8') : raw) : event.body)?.code;
  } catch {
    code = null;
  }

  const session = await readCameraSession(code);

  if (!session) return respond({ success: false, error: 'Camera link expired' }, 401);

  await markIntroSeen(session);

  return respond({ success: true });
};

export default defineLogicFunction({
  universalIdentifier: '73556c07-e0c4-4e89-81ee-5f8979ddab16',
  name: 'camera-intro-seen',
  description: "Saves the camera page's Don't show again for the person.",
  timeoutSeconds: 10,
  handler,
  httpRouteTriggerSettings: {
    path: '/cards/intro-seen',
    httpMethod: 'POST',
    isAuthRequired: false,
  },
});
