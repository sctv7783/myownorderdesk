const { generateAgentReply, GROQ_MODEL } = require('../lib/groq-agent.cjs');
const { appendMessage } = require('../lib/inbox-store.cjs');

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
  if (method === 'OPTIONS') return { statusCode: 204, body: '' };
  if (method !== 'POST') return json(405, { success: false, error: 'Method Not Allowed' });

  const body = parseBody(event);
  const tenantId =
    event.headers?.['x-tenant-id'] || event.headers?.['X-Tenant-Id'] || body.tenantId || 'tenant_khyber_001';
  const message = String(body.message || '').trim();
  if (!message) return json(400, { success: false, error: 'Message text is required.' });

  const customerName = body.customerName || 'Simulated Customer';
  const customerPhone = body.customerPhone || '+92 300 0000000';

  const savedIn = await appendMessage(tenantId, {
    customerPhone,
    customerName,
    sender: 'CUSTOMER',
    text: message
  });

  const result = await generateAgentReply(message, {
    tenantId,
    customerName,
    customerPhone,
    businessName: body.businessName,
    conversationId: savedIn?.conversation?.id
  });

  const aiResponse =
    result.reply ||
    'Staff mode active hai — AI auto-reply band hai. Inbox se human reply bhejein.';

  await appendMessage(tenantId, {
    customerPhone,
    customerName,
    sender: 'AI',
    text: aiResponse
  });

  return json(200, {
    success: true,
    conversationId: savedIn?.conversation?.id || null,
    userMessage: message,
    aiResponse,
    model: GROQ_MODEL,
    groqConfigured: Boolean(process.env.GROQ_API_KEY),
    handoff: Boolean(result.handoff),
    skipped: Boolean(result.skipped)
  });
};
