const SESSION_KEY = 'orderdesk_auth_session';

export type AuthUser = {
  id: string;
  email: string;
  fullName: string;
};

export type AuthSession = {
  accessToken: string;
  refreshToken?: string;
  user: AuthUser;
  tenantId?: string;
};

export function loadSession(): AuthSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.accessToken || !parsed?.user?.email) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveSession(session: AuthSession) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

export function authHeaders(tenantId?: string): Record<string, string> {
  const session = loadSession();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };
  const tid = tenantId || session?.tenantId;
  if (tid) headers['x-tenant-id'] = tid;
  if (session?.accessToken) headers.Authorization = `Bearer ${session.accessToken}`;
  return headers;
}
