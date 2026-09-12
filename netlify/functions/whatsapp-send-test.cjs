const { loadConfig } = require('../lib/whatsapp-store.cjs');
const { sendWhatsAppText } = require('../lib/meta-graph.cjs');

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

exports.handler = async function handler(event) {
  const method = (event.httpMethod || 'POST').toUpperCase();
  if (method !== 'POST') return json(405, { success: false, error: 'Method Not Allowed' });

  const body = parseBody(event);
  const tenantId =
    event.headers?.['x-tenant-id'] || event.headers?.['X-Tenant-Id'] || body.tenantId || 'tenant_khyber_001';

  const stored = await loadConfig(tenantId);
  const phoneNumberId = String(body.phoneNumberId || stored?.phoneNumberId || '').trim();
  const accessToken = String(body.accessToken || stored?.accessToken || '').trim();

  const result = await sendWhatsAppText({
    phoneNumberId,
    accessToken,
    to: body.phoneNumber,
    text: body.text
  });

  return json(result.success ? 200 : 400, {
    success: result.success,
    result,
    error: result.error
  });
};
