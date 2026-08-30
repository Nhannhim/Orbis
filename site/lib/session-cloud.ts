const cloudClientStorageKey = 'orbis.cloud-client-id.v1';

function cloudClientId(): string {
  const existing = window.localStorage.getItem(cloudClientStorageKey);
  if (existing) return existing;
  const created = crypto.randomUUID().replaceAll('-', '');
  window.localStorage.setItem(cloudClientStorageKey, created);
  return created;
}

function cloudHeaders(): Record<string, string> {
  return { 'x-orbis-cloud-client-id': cloudClientId() };
}

async function responseError(response: Response, fallback: string): Promise<Error> {
  const body = await response.json().catch(() => null) as { error?: string } | null;
  return new Error(body?.error ?? fallback);
}

export async function loadSessionsFromCloud<T>(): Promise<T[]> {
  const response = await fetch('/api/sessions', {
    headers: cloudHeaders(),
    cache: 'no-store',
  });
  if (!response.ok) throw await responseError(response, 'Cloud sessions could not be loaded.');
  const body = await response.json() as { sessions?: T[] };
  return Array.isArray(body.sessions) ? body.sessions : [];
}

export async function saveSessionsToCloud<T extends { id: string }>(sessions: T[]): Promise<void> {
  const response = await fetch('/api/sessions', {
    method: 'PUT',
    headers: { ...cloudHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessions }),
  });
  if (!response.ok) throw await responseError(response, 'Cloud sessions could not be saved.');
}
