const { listConversations, listMessages, appendMessage, setConversationStatus } = require('../lib/conversations.cjs');
const { requireStoreUser, secureJson } = require('../lib/session.cjs');
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

async function resolvePhoneNumberId(tenantId) {
  try {
    const creds = await loadConfig(tenantId);
    return creds?.phoneNumberId || process.env.META_PHONE_NUMBER_ID || '';
  } catch {
    return process.env.META_PHONE_NUMBER_ID || '';
  }
}

exports.handler = async function handler(event) {
  const method = (event.httpMethod || 'GET').toUpperCase();
  if (method === 'OPTIONS') return { statusCode: 204, body: '' };

  const body = parseBody(event);
  let session = await requireStoreUser(event, body, { allowTenantFallback: method === 'GET' });
  if (!session.ok && method === 'GET') {
    session = { ok: true, tenantId: 'unmapped', user: null };
  }
  if (!session.ok) return secureJson(session.status, { conversations: [], messages: [], error: session.error });
  const tenantId = session.tenantId;

  const path = event.path || '';
  const parts = path.split('/').filter(Boolean);
  const convIdx = Math.max(
    parts.lastIndexOf('conversations'),
    parts.lastIndexOf('inbox'),
    parts.lastIndexOf('chats')
  );
  const nextPart = convIdx >= 0 ? parts[convIdx + 1] : null;
  const convId = nextPart && nextPart !== 'messages' && nextPart !== 'sync' ? nextPart : null;
  const wantsMessages = path.includes('/messages');
  const wantsSync = path.includes('/sync') || nextPart === 'sync';
  const phoneNumberId = await resolvePhoneNumberId(tenantId);

  if ((method === 'POST' || method === 'GET') && wantsSync) {
    const conversations = await listConversations(tenantId, phoneNumberId);
    return json(200, {
      success: true,
      count: conversations.length,
      ordersCreated: 0,
      orders: [],
      conversations
    });
  }

  if (method === 'GET' && wantsMessages && convId) {
    const messages = await listMessages(tenantId, convId, phoneNumberId);
    return json(200, { messages, conversation: { id: convId } });
  }

  if (method === 'GET') {
    const conversations = await listConversations(tenantId, phoneNumberId);
    return json(200, { conversations, count: conversations.length, phoneNumberId: phoneNumberId || null });
  }

  if (method === 'POST' && wantsMessages && convId) {
    const text = String(body.text || '').trim();
    if (!text) return json(400, { error: 'Message text is required' });
    const convs = await listConversations(tenantId, phoneNumberId);
    const conv = convs.find((c) => c.id === convId);
    const saved = await appendMessage(tenantId, {
      conversationId: convId,
      customerPhone: conv?.customerPhone,
      customerName: conv?.customerName,
      phoneNumberId: phoneNumberId || conv?.phoneNumberId,
      sender: 'STAFF',
      text
    });

    let whatsapp = { success: false };
    try {
      const creds = await loadConfig(tenantId);
      if (creds?.accessToken && (creds.phoneNumberId || conv?.phoneNumberId) && conv?.customerPhone) {
        whatsapp = await sendWhatsAppText({
          phoneNumberId: creds.phoneNumberId || conv.phoneNumberId,
          accessToken: creds.accessToken,
          to: conv.customerPhone,
          text
        });
      }
    } catch (err) {
      console.warn('[Inbox] WhatsApp staff send failed', err?.message || err);
    }

    return json(201, { message: saved.message, whatsapp });
  }

  if ((method === 'PATCH' || method === 'PUT') && convId && path.includes('/status')) {
    const status = body.status || 'AI_ACTIVE';
    const conversation = await setConversationStatus(tenantId, convId, status);
    if (!conversation) return json(404, { error: 'Conversation not found' });
    return json(200, { conversation });
  }

  return json(405, { error: 'Method Not Allowed' });
};
