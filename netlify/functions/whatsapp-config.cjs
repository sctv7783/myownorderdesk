const { loadConfig, saveConfig, configResponse } = require('../lib/whatsapp-store.cjs');
const { verifyMetaCredentials } = require('../lib/meta-graph.cjs');
const { resolveBusinessId } = require('../lib/business.cjs');
const { isUuid, sbSelect, sbInsert, sbUpdate } = require('../lib/supabase-rest.cjs');

function json(statusCode, payload) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store'
    },
    body: JSON.stringify(payload)
  };
}

function tenantIdFrom(event, body) {
  return (
    event.headers?.['x-tenant-id'] ||
    event.headers?.['X-Tenant-Id'] ||
    body?.tenantId ||
    'tenant_khyber_001'
  );
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

exports.handler = async function handler(event) {
  const method = (event.httpMethod || 'GET').toUpperCase();

  if (method === 'OPTIONS') {
    return { statusCode: 204, body: '' };
  }

  if (method === 'GET') {
    const tenantId = await resolveBusinessId(event, {});
    const record = await loadConfig(tenantId);
    return json(200, configResponse(record, { persisted: Boolean(record) }));
  }

  if (method === 'POST') {
    const body = parseBody(event);
    const tenantId = await resolveBusinessId(event, body);
    const wabaId = String(body.wabaId || '').trim();
    const phoneNumberId = String(body.phoneNumberId || '').trim();
    const accessToken = String(body.accessToken || body.accessTokenEncrypted || '').trim();
    const displayNumber = String(body.displayNumber || body.displayPhoneNumber || '').trim();
    const businessName = String(body.businessName || body.verifiedName || '').trim();

    if (!wabaId || !phoneNumberId || !accessToken) {
      return json(400, {
        success: false,
        error: 'WABA ID, Phone Number ID, and Access Token are required.'
      });
    }

    const verified = await verifyMetaCredentials({ wabaId, phoneNumberId, accessToken });
    if (!verified.ok) {
      return json(400, { success: false, error: verified.error, connected: false });
    }

    const saved = await saveConfig(tenantId, {
      tenantId,
      wabaId,
      phoneNumberId: verified.phoneNumberId || phoneNumberId,
      accessToken,
      displayPhoneNumber: verified.displayPhoneNumber || displayNumber,
      verifiedName: verified.verifiedName || businessName || 'WhatsApp Business',
      businessName: businessName || verified.wabaName || verified.verifiedName,
      qualityRating: verified.qualityRating
    });

    if (tenantId && isUuid(tenantId)) {
      const payload = {
        business_id: tenantId,
        waba_id: wabaId,
        phone_number_id: verified.phoneNumberId || phoneNumberId,
        display_phone_number: verified.displayPhoneNumber || displayNumber,
        verified_name: verified.verifiedName || businessName,
        access_token: accessToken,
        updated_at: new Date().toISOString()
      };
      const existing = await sbSelect('whatsapp_configs', { select: 'id', business_id: `eq.${tenantId}` });
      if (existing.rows[0]) await sbUpdate('whatsapp_configs', { business_id: `eq.${tenantId}` }, payload);
      else await sbInsert('whatsapp_configs', payload);
    }

    return json(200, {
      ...configResponse(saved.record, { persisted: saved.persisted }),
      connected: true,
      message: saved.persisted
        ? 'Meta WhatsApp Cloud API connected and credentials saved.'
        : 'Meta API verified. Redeploy on Netlify with Blobs enabled to persist across functions.'
    });
  }

  return json(405, { error: 'Method Not Allowed' });
};
