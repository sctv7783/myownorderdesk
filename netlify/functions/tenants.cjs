const { getBusiness, resolveBusinessId } = require('../lib/business.cjs');
const { getSupabaseConfig, sbUpdate } = require('../lib/supabase-rest.cjs');
const { userFromAccessToken } = require('../lib/auth.cjs');
const { sbSelect } = require('../lib/supabase-rest.cjs');
const { mapBusiness } = require('../lib/business.cjs');

function json(statusCode, payload) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    body: JSON.stringify(payload)
  };
}

function parseBody(event) {
  if (!event.body) return {};
  try {
    const raw = event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body;
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function bearer(event) {
  const header = event.headers?.authorization || event.headers?.Authorization || '';
  const match = String(header).match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : '';
}

async function businessesForUser(userId) {
  const members = await sbSelect('business_members', {
    select: '*',
    user_id: `eq.${userId}`,
    status: 'eq.ACTIVE'
  });
  const ids = (members.rows || []).map((row) => row.business_id).filter(Boolean);
  if (!ids.length) return [];
  const listed = await sbSelect('businesses', { select: '*', id: `in.(${ids.join(',')})` });
  return (listed.rows || []).map(mapBusiness).filter(Boolean);
}

exports.handler = async function handler(event) {
  const method = (event.httpMethod || 'GET').toUpperCase();
  if (method === 'OPTIONS') return { statusCode: 204, body: '' };

  const body = parseBody(event);
  const path = event.path || '';
  const parts = path.split('/').filter(Boolean);
  const idPart = parts[parts.length - 1] !== 'tenants' ? parts[parts.length - 1] : '';

  if (!getSupabaseConfig()) {
    return json(503, {
      success: false,
      tenants: [],
      error: 'Supabase connected nahi hai. Netlify env mein SUPABASE_URL aur SUPABASE_SERVICE_ROLE_KEY set karein.'
    });
  }

  const token = bearer(event);
  if (method === 'GET' && (!idPart || idPart === 'tenants')) {
    if (!token) return json(401, { success: false, tenants: [], error: 'Login required.' });
    const me = await userFromAccessToken(token);
    if (!me.ok || !me.data) return json(401, { success: false, tenants: [], error: 'Session expired.' });
    const tenants = await businessesForUser(me.data.id);
    return json(200, { success: true, tenants, supabase: true });
  }

  if (method === 'GET' && idPart) {
    const tenant = await getBusiness(idPart);
    if (!tenant) return json(404, { success: false, error: 'Store not found' });
    return json(200, { success: true, tenant });
  }

  if (method === 'PATCH' || method === 'PUT' || method === 'POST') {
    const tenantId = idPart || (await resolveBusinessId(event, body));
    const name = String(body.name || '').trim();
    if (!name) return json(400, { success: false, error: 'Store name is required.' });
    const payload = {
      name,
      business_type: body.businessType || undefined,
      updated_at: new Date().toISOString()
    };
    const result = await sbUpdate('businesses', { id: `eq.${tenantId}` }, payload);
    if (!result.ok) return json(400, { success: false, error: result.error });
    const tenant = await getBusiness(tenantId);
    return json(200, { success: true, persisted: true, tenant });
  }

  return json(405, { success: false, error: 'Method Not Allowed' });
};
