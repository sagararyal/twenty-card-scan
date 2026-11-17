import { kv } from 'twenty-sdk/logic-function';

// A camera session lets the camera page (a plain web page, outside Twenty's app sandbox)
// upload cards without holding the user's login: the Scan screen, signed in, asks for a
// short-lived random code, and the page sends only that code.

export const CAMERA_SESSION_TTL_MS = 2 * 60 * 60 * 1000;

export type CameraSession = {
  expiresAt: number;
  collectedAt: string;
  userWorkspaceId: string | null;
};

const keyFor = (code: string) => `camera-session:${code}`;

export const CODE_PATTERN = /^[0-9a-f]{64}$/;

export const createCameraSession = async (
  session: Omit<CameraSession, 'expiresAt'>,
): Promise<{ code: string; expiresAt: number }> => {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const code = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  const expiresAt = Date.now() + CAMERA_SESSION_TTL_MS;

  await kv.set<CameraSession>(keyFor(code), { ...session, expiresAt });

  return { code, expiresAt };
};

export const readCameraSession = async (code: unknown): Promise<CameraSession | null> => {
  if (typeof code !== 'string' || !CODE_PATTERN.test(code)) {
    return null;
  }

  const session = await kv.get<CameraSession>(keyFor(code));

  if (!session) {
    return null;
  }

  if (session.expiresAt < Date.now()) {
    await kv.delete(keyFor(code));

    return null;
  }

  return session;
};

// "Don't show again" on the camera page's intro, kept per person in Twenty (a browser can
// forget its own storage: Safari clears it after a week without a visit).
const introKey = (userWorkspaceId: string) => `camera-intro-seen:${userWorkspaceId}`;

export const isIntroSeen = async (session: CameraSession): Promise<boolean> =>
  session.userWorkspaceId ? Boolean(await kv.get<boolean>(introKey(session.userWorkspaceId))) : false;

export const markIntroSeen = async (session: CameraSession): Promise<void> => {
  if (session.userWorkspaceId) await kv.set<boolean>(introKey(session.userWorkspaceId), true);
};
