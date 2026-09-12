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

function tenantIdFrom(event, body) {
  return (
    event.headers?.['x-tenant-id'] ||
    event.headers?.['X-Tenant-Id'] ||
    (event.pathParameters && event.pathParameters.id) ||
    body?.tenantId ||
    'tenant_khyber_001'
  );
}

async function getStore() {
  try {
    const { getStore } = require('@netlify/blobs');
    return getStore('store-profile');
  } catch {
    return null;
  }
}

exports.handler = async function handler(event) {
  const method = (event.httpMethod || 'GET').toUpperCase();
  if (method === 'OPTIONS') return { statusCode: 204, body: '' };

  const body = parseBody(event);
  const tenantId = tenantIdFrom(event, body);
  const store = await getStore();

  if (method === 'GET') {
    let record = null;
    if (store) {
      try {
        record = await store.get(`tenant:${tenantId}`, { type: 'json' });
      } catch {
        record = null;
      }
    }
    return json(200, { success: true, tenant: record });
  }

  if (method === 'PATCH' || method === 'POST' || method === 'PUT') {
    const name = String(body.name || '').trim();
    const businessType = String(body.businessType || '').trim();
    if (!name) {
      return json(400, { success: false, error: 'Store name is required.' });
    }
    const tenant = {
      id: tenantId,
      name,
      slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
      businessType: businessType || 'E-Commerce',
      updatedAt: new Date().toISOString()
    };
    if (store) {
      await store.setJSON(`tenant:${tenantId}`, tenant);
    }
    return json(200, { success: true, persisted: Boolean(store), tenant });
  }

  return json(405, { success: false, error: 'Method Not Allowed' });
};
