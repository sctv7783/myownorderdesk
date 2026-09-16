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

async function requireStoreUser(event, body) {
  const tenantId = await resolveBusinessId(event, body);
  const token = readAccessToken(event, body);
  if (!tenantId) return { ok: false, status: 401, error: 'Store session required' };
  if (!token) return { ok: false, status: 401, error: 'Login required' };
  const auth = await userFromAccessToken(token);
  if (!auth.ok || !auth.data) {
    return { ok: false, status: 401, error: 'Invalid or expired session' };
  }
  return { ok: true, tenantId, user: auth.data };
}

module.exports = { secureJson, sanitizeNote, requireStoreUser };
