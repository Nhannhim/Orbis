type FirestoreValue =
  | { nullValue: null }
  | { booleanValue: boolean }
  | { integerValue: string }
  | { doubleValue: number }
  | { stringValue: string }
  | { timestampValue: string }
  | { arrayValue: { values?: FirestoreValue[] } }
  | { mapValue: { fields?: Record<string, FirestoreValue> } };

type FirestoreDocument = {
  fields?: Record<string, FirestoreValue>;
};

type FirebaseConfig = {
  projectId: string;
  clientEmail: string;
  privateKey: string;
};

let cachedAccessToken: { token: string; expiresAt: number } | null = null;

function firebaseConfig(): FirebaseConfig {
  const projectId = process.env.FIREBASE_PROJECT_ID?.trim();
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL?.trim();
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n').trim();

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error('Firebase session storage is not configured.');
  }

  return { projectId, clientEmail, privateKey };
}

function base64Url(value: string | ArrayBuffer): string {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : new Uint8Array(value);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
}

function privateKeyBytes(pem: string): ArrayBuffer {
  const encoded = pem
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s+/gu, '');
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes.buffer;
}

async function firebaseAccessToken(): Promise<string> {
  if (cachedAccessToken && cachedAccessToken.expiresAt > Date.now() + 60_000) {
    return cachedAccessToken.token;
  }

  const config = firebaseConfig();
  const issuedAt = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = base64Url(JSON.stringify({
    iss: config.clientEmail,
    sub: config.clientEmail,
    aud: 'https://oauth2.googleapis.com/token',
    scope: 'https://www.googleapis.com/auth/datastore',
    iat: issuedAt,
    exp: issuedAt + 3600,
  }));
  const unsignedToken = `${header}.${payload}`;
  const key = await crypto.subtle.importKey(
    'pkcs8',
    privateKeyBytes(config.privateKey),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(unsignedToken),
  );
  const assertion = `${unsignedToken}.${base64Url(signature)}`;
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });
  const body = await response.json().catch(() => null) as {
    access_token?: string;
    expires_in?: number;
    error_description?: string;
  } | null;

  if (!response.ok || !body?.access_token) {
    throw new Error(body?.error_description ?? 'Firebase authentication failed.');
  }

  cachedAccessToken = {
    token: body.access_token,
    expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000,
  };
  return body.access_token;
}

function toFirestoreValue(value: unknown): FirestoreValue {
  if (value === null) return { nullValue: null };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Session data contains an invalid number.');
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  }
  if (typeof value === 'string') return { stringValue: value };
  if (Array.isArray(value)) return {
    arrayValue: { values: value.map((item) => toFirestoreValue(item)) },
  };
  if (typeof value === 'object') {
    const fields = Object.fromEntries(
      Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .map(([key, item]) => [key, toFirestoreValue(item)]),
    );
    return { mapValue: { fields } };
  }
  throw new Error('Session data contains an unsupported value.');
}

function fromFirestoreValue(value: FirestoreValue): unknown {
  if ('nullValue' in value) return null;
  if ('booleanValue' in value) return value.booleanValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return value.doubleValue;
  if ('stringValue' in value) return value.stringValue;
  if ('timestampValue' in value) return value.timestampValue;
  if ('arrayValue' in value) return (value.arrayValue.values ?? []).map(fromFirestoreValue);
  if ('mapValue' in value) {
    return Object.fromEntries(
      Object.entries(value.mapValue.fields ?? {}).map(([key, item]) => [key, fromFirestoreValue(item)]),
    );
  }
  return null;
}

function documentUrl(ownerId: string, sessionId?: string): string {
  const { projectId } = firebaseConfig();
  const root = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents/orbisUsers/${encodeURIComponent(ownerId)}/sessions`;
  return sessionId ? `${root}/${encodeURIComponent(sessionId)}` : root;
}

async function firebaseRequest(url: string, init?: RequestInit): Promise<Response> {
  const accessToken = await firebaseAccessToken();
  const headers = new Headers(init?.headers);
  headers.set('Authorization', `Bearer ${accessToken}`);
  if (init?.body) headers.set('Content-Type', 'application/json');
  return fetch(url, {
    ...init,
    headers,
  });
}

export async function firebaseOwnerId(identity: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(identity));
  return base64Url(digest);
}

export async function listFirebaseSessions(ownerId: string): Promise<Record<string, unknown>[]> {
  const url = new URL(documentUrl(ownerId));
  url.searchParams.set('pageSize', '8');
  url.searchParams.set('orderBy', 'updatedAt desc');
  const response = await firebaseRequest(url.toString(), { cache: 'no-store' });
  const body = await response.json().catch(() => null) as {
    documents?: FirestoreDocument[];
    error?: { message?: string };
  } | null;

  if (!response.ok) throw new Error(body?.error?.message ?? 'Firebase sessions could not be loaded.');
  return (body?.documents ?? []).flatMap((document) => {
    const payload = document.fields?.payload;
    if (!payload) return [];
    const session = fromFirestoreValue(payload);
    return session && typeof session === 'object' && !Array.isArray(session)
      ? [session as Record<string, unknown>]
      : [];
  });
}

export async function saveFirebaseSessions(ownerId: string, sessions: Record<string, unknown>[]): Promise<void> {
  await Promise.all(sessions.map(async (session) => {
    const sessionId = typeof session.id === 'string' ? session.id : '';
    if (!sessionId) throw new Error('A session id is required.');
    const fields: Record<string, FirestoreValue> = {
      ownerId: { stringValue: ownerId },
      payload: toFirestoreValue(session),
      updatedAt: { timestampValue: new Date().toISOString() },
    };
    const response = await firebaseRequest(documentUrl(ownerId, sessionId), {
      method: 'PATCH',
      body: JSON.stringify({ fields }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => null) as { error?: { message?: string } } | null;
      throw new Error(body?.error?.message ?? `Firebase could not save ${sessionId}.`);
    }
  }));
}
