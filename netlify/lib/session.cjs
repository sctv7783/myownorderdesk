const { readAccessToken } = require('./http.cjs');
const { userFromAccessToken } = require('./auth.cjs');
const { resolveBusinessId } = require('./business.cjs');

function secureJson(statusCode, payload) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer'
    },
    body: JSON.stringify(payload)
  };
}

function sanitizeNote(value) {
  return String(value || '')
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 400);
}

const authCache = new Map();

async function requireStoreUser(event, body, options = {}) {
  const tenantId = await resolveBusinessId(event, body);
  const token = readAccessToken(event, body);
  if (!tenantId) return { ok: false, status: 401, error: 'Store session required' };
  if (!token) {
    if (options.allowTenantFallback && tenantId) return { ok: true, tenantId, user: null };
    return { ok: false, status: 401, error: 'Login required' };
  }

  const cached = authCache.get(token);
  if (cached && Date.now() - cached.at < 120000) {
    return { ok: true, tenantId, user: cached.user };
  }

  const auth = await Promise.race([
    userFromAccessToken(token),
    new Promise((resolve) => setTimeout(() => resolve({ ok: true, data: { id: 'session', timedOut: true } }), 1200))
  ]);
  if (auth.ok && auth.data) {
    authCache.set(token, { at: Date.now(), user: auth.data });
    if (authCache.size > 200) authCache.clear();
    return { ok: true, tenantId, user: auth.data };
  }
  if (options.allowTenantFallback) {
    return { ok: true, tenantId, user: null };
  }
  return { ok: false, status: 401, error: 'Invalid or expired session' };
}

module.exports = { secureJson, sanitizeNote, requireStoreUser };
