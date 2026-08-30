import { getChatGPTUser } from '@/app/chatgpt-auth';
import {
  firebaseOwnerId,
  listFirebaseSessions,
  saveFirebaseSessions,
} from '@/lib/firebase-firestore';

export const dynamic = 'force-dynamic';

const demoClientIdPattern = /^[a-zA-Z0-9_-]{20,80}$/u;
const sessionIdPattern = /^[a-zA-Z0-9_-]{4,100}$/u;

async function requestOwner(request: Request): Promise<string | null> {
  const user = await getChatGPTUser();
  if (user) return firebaseOwnerId(`chatgpt:${user.userId}`);

  const demoClientId = request.headers.get('x-orbis-cloud-client-id')?.trim() ?? '';
  if (!demoClientIdPattern.test(demoClientId)) return null;
  return firebaseOwnerId(`demo:${demoClientId}`);
}

function sessionRecords(value: unknown): Record<string, unknown>[] | null {
  if (!Array.isArray(value) || value.length > 12) return null;
  const records: Record<string, unknown>[] = [];
  for (const session of value) {
    if (!session || typeof session !== 'object' || Array.isArray(session)) return null;
    const record = session as Record<string, unknown>;
    if (typeof record.id !== 'string' || !sessionIdPattern.test(record.id)) return null;
    if (JSON.stringify(record).length > 750_000) return null;
    records.push(record);
  }
  return records;
}

function noStoreJson(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { 'Cache-Control': 'private, no-store, max-age=0' },
  });
}

export async function GET(request: Request) {
  const ownerId = await requestOwner(request);
  if (!ownerId) return noStoreJson({ error: 'A signed-in user or demo client id is required.' }, 401);

  try {
    const sessions = await listFirebaseSessions(ownerId);
    return noStoreJson({ sessions });
  } catch (reason) {
    const message = reason instanceof Error ? reason.message : 'Firebase sessions are unavailable.';
    return noStoreJson({ error: message }, 503);
  }
}

export async function PUT(request: Request) {
  const ownerId = await requestOwner(request);
  if (!ownerId) return noStoreJson({ error: 'A signed-in user or demo client id is required.' }, 401);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return noStoreJson({ error: 'Invalid JSON body.' }, 400);
  }
  const sessions = body && typeof body === 'object' && 'sessions' in body
    ? sessionRecords(body.sessions)
    : null;
  if (!sessions) return noStoreJson({ error: 'Invalid session data.' }, 400);

  try {
    await saveFirebaseSessions(ownerId, sessions);
    return noStoreJson({ saved: sessions.length });
  } catch (reason) {
    const message = reason instanceof Error ? reason.message : 'Firebase sessions could not be saved.';
    return noStoreJson({ error: message }, 503);
  }
}
