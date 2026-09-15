const { createAuthUser, passwordLogin, userFromAccessToken } = require('../lib/auth.cjs');
const { getSupabaseConfig, isUuid, sbSelect, sbInsert } = require('../lib/supabase-rest.cjs');
const { mapBusiness } = require('../lib/business.cjs');
const { seedAgentSettings } = require('../lib/ai-settings-store.cjs');

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

function pathName(event) {
  const path = event.path || '';
  const parts = path.split('/').filter(Boolean);
  const idx = parts.lastIndexOf('auth');
  return (idx >= 0 ? parts[idx + 1] : '') || '';
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

async function createStoreForUser(user, { fullName, businessName, businessType, email }) {
  const name = String(businessName || `${fullName || email}'s Store`).trim();
  const created = await sbInsert('businesses', {
    name,
    slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
    business_type: businessType || 'E-Commerce',
    currency: 'PKR',
    timezone: 'Asia/Karachi',
    email
  });
  const business = Array.isArray(created.data) ? created.data[0] : created.data;
  if (!created.ok || !business?.id) {
    return { ok: false, error: created.error || 'Could not create store.' };
  }

  await sbInsert('profiles', {
    id: user.id,
    email,
    full_name: fullName || email.split('@')[0]
  });
  await sbInsert('business_members', {
    business_id: business.id,
    user_id: user.id,
    role: 'OWNER',
    status: 'ACTIVE'
  });
  await sbInsert('business_profiles', {
    business_id: business.id,
    business_name: name,
    business_type: businessType || 'E-Commerce',
    email,
    currency: 'PKR',
    delivery_fee: 150,
    estimated_delivery_time: '2-4 business days'
  });
  await seedAgentSettings(business.id);
  return { ok: true, tenant: mapBusiness(business) };
}

function sessionPayload({ session, user, tenant, tenants }) {
  return {
    success: true,
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
    user: {
      id: user.id,
      email: user.email,
      fullName: user.user_metadata?.full_name || user.email
    },
    tenant,
    tenants: tenants || (tenant ? [tenant] : [])
  };
}

exports.handler = async function handler(event) {
  const method = (event.httpMethod || 'POST').toUpperCase();
  if (method === 'OPTIONS') return { statusCode: 204, body: '' };
  if (!getSupabaseConfig()) {
    return json(503, {
      success: false,
      error: 'Supabase connected nahi hai. Netlify env mein SUPABASE_URL aur SUPABASE_SERVICE_ROLE_KEY set karein.'
    });
  }

  const body = parseBody(event);
  const action = pathName(event) || body.action || (method === 'GET' ? 'me' : 'login');

  if (method === 'POST' && (action === 'register' || action === 'signup')) {
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    const fullName = String(body.fullName || body.name || '').trim();
    const businessName = String(body.businessName || body.storeName || '').trim();
    const businessType = String(body.businessType || 'E-Commerce').trim();
    if (!email || !password || password.length < 6) {
      return json(400, { success: false, error: 'Valid email aur kam az kam 6 character ka password zaroori hai.' });
    }
    if (!businessName) {
      return json(400, { success: false, error: 'Store / business name zaroori hai.' });
    }

    const created = await createAuthUser({ email, password, fullName: fullName || businessName });
    if (!created.ok) {
      const exists = /already|registered|exists/i.test(String(created.error || ''));
      return json(exists ? 409 : 400, {
        success: false,
        error: exists ? 'Yeh email pehle se registered hai. Login karein.' : created.error
      });
    }

    const login = await passwordLogin(email, password);
    if (!login.ok) return json(400, { success: false, error: login.error });
    const user = login.data.user || created.data;
    const store = await createStoreForUser(user, { fullName, businessName, businessType, email });
    if (!store.ok) return json(400, { success: false, error: store.error });
    return json(200, sessionPayload({ session: login.data, user, tenant: store.tenant }));
  }

  if (method === 'POST' && action === 'login') {
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    if (!email || !password) return json(400, { success: false, error: 'Email aur password zaroori hain.' });
    const login = await passwordLogin(email, password);
    if (!login.ok) return json(401, { success: false, error: 'Email ya password ghalat hai.' });
    const user = login.data.user;
    let tenants = await businessesForUser(user.id);
    if (!tenants.length) {
      const store = await createStoreForUser(user, {
        fullName: user.user_metadata?.full_name || '',
        businessName: `${(user.email || 'My').split('@')[0]} Store`,
        businessType: 'E-Commerce',
        email: user.email
      });
      if (store.ok) tenants = [store.tenant];
    }
    return json(200, sessionPayload({ session: login.data, user, tenant: tenants[0], tenants }));
  }

  if (method === 'GET' || action === 'me') {
    const token = bearer(event);
    if (!token) return json(401, { success: false, error: 'Login required.' });
    const me = await userFromAccessToken(token);
    if (!me.ok || !me.data) return json(401, { success: false, error: 'Session expire ho gayi. Dobara login karein.' });
    const tenants = await businessesForUser(me.data.id);
    return json(200, {
      success: true,
      user: {
        id: me.data.id,
        email: me.data.email,
        fullName: me.data.user_metadata?.full_name || me.data.email
      },
      tenant: tenants[0] || null,
      tenants
    });
  }

  return json(405, { success: false, error: 'Method Not Allowed' });
};
