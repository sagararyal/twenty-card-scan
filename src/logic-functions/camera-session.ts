import { defineLogicFunction, type RoutePayload } from 'twenty-sdk/define';
import { Response } from 'twenty-sdk/logic-function';

import { createCameraSession } from 'src/utils/camera-session';

const respond = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

// Called by the signed-in Scan screen. Returns a code for the camera page.
const handler = async (event: RoutePayload): Promise<Response> => {
  if (!event.userWorkspaceId) {
    return respond({ success: false, error: 'Only a workspace member can open the camera' }, 403);
  }

  const collectedAt = (event.body as { collectedAt?: unknown } | null)?.collectedAt;

  const { code, expiresAt } = await createCameraSession({
    collectedAt: typeof collectedAt === 'string' ? collectedAt.slice(0, 200) : '',
    userWorkspaceId: event.userWorkspaceId,
  });

  // The camera page lives on its own address (Twenty's app pages cannot use the camera).
  const pageUrl = (process.env.CAMERA_PAGE_URL ?? '').trim();
  const apiUrl = (process.env.TWENTY_API_URL ?? '').replace(/\/+$/, '');
  const cameraUrl =
    pageUrl && apiUrl
      ? // After "#": browsers never send this part to the camera page's host.
        `${pageUrl.split('#')[0]}#api=${encodeURIComponent(apiUrl)}&code=${code}`
      : null;

  return respond({ success: true, cameraUrl, expiresAt });
};

export default defineLogicFunction({
  universalIdentifier: '844338e8-cf49-463b-b64f-b6e3d3bf7112',
  name: 'camera-session',
  description: 'Gives the signed-in Scan screen a short-lived code for the camera page.',
  timeoutSeconds: 15,
  handler,
  httpRouteTriggerSettings: {
    path: '/cards/camera-session',
    httpMethod: 'POST',
    isAuthRequired: true,
  },
});
