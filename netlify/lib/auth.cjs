const { getSupabaseConfig } = require('./supabase-rest.cjs');

function authHeaders(extra) {
  const cfg = getSupabaseConfig();
  if (!cfg) return null;
  return {
    apikey: cfg.key,
    Authorization: `Bearer ${cfg.key}`,
    'Content-Type': 'application/json',
    ...extra
  };
}

async function authJson(path, { method, body, accessToken } = {}) {
  const cfg = getSupabaseConfig();
  if (!cfg) return { ok: false, error: 'Supabase is not configured.', data: null, status: 0 };
  const headers = {
    apikey: cfg.key,
    Authorization: `Bearer ${accessToken || cfg.key}`,
    'Content-Type': 'application/json'
  };
  const res = await fetch(`${cfg.url}/auth/v1/${path}`, {
    method: method || 'GET',
    headers,
    body: body ? JSON.stringify(body) : undefined
  });
  const raw = await res.text();
  let data = null;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    data = raw;
  }
  if (!res.ok) {
    const message = data?.msg || data?.error_description || data?.error || data?.message || raw || `Auth ${res.status}`;
    return { ok: false, error: message, data, status: res.status };
  }
  return { ok: true, data, status: res.status };
}

async function createAuthUser({ email, password, fullName }) {
  return authJson('admin/users', {
    method: 'POST',
    body: {
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName || '' }
    }
  });
}

async function passwordLogin(email, password) {
  const cfg = getSupabaseConfig();
  if (!cfg) return { ok: false, error: 'Supabase is not configured.', data: null };
  const res = await fetch(`${cfg.url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ email, password })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return {
      ok: false,
      error: data.error_description || data.msg || data.error || 'Invalid email or password.',
      data
    };
  }
  return { ok: true, data };
}

async function userFromAccessToken(accessToken) {
  return authJson('user', { method: 'GET', accessToken });
}

module.exports = {
  createAuthUser,
  passwordLogin,
  userFromAccessToken
};
