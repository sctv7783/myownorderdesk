const { listConversations, listMessages, appendMessage, setConversationStatus } = require('../lib/conversations.cjs');
const { resolveBusinessId } = require('../lib/business.cjs');
const { loadConfig } = require('../lib/whatsapp-store.cjs');
const { sendWhatsAppText } = require('../lib/meta-graph.cjs');
const { listProducts } = require('../lib/products-store.cjs');
const { applyCustomerTurn, clearDraft } = require('../lib/order-engine.cjs');
const { getBusiness } = require('../lib/business.cjs');

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

async function processStoredChats(tenantId) {
  const [conversations, products, business] = await Promise.all([
    listConversations(tenantId),
    listProducts(tenantId),
    getBusiness(tenantId)
  ]);
  const created = [];
  for (const conv of conversations.slice(0, 25)) {
    const messages = await listMessages(tenantId, conv.id);
    const orderish = /order|chahiye|address|pata|confirm|haan|han |delivery|bhej|quantity|pcs|rs\.?|price/i;
    if (!messages.some((msg) => msg.sender === 'CUSTOMER' && orderish.test(String(msg.text || '')))) {
      continue;
    }
    await clearDraft(tenantId, { customerPhone: conv.customerPhone, conversationId: conv.id });
    for (const msg of messages) {
      if (msg.sender !== 'CUSTOMER' || !msg.text || String(msg.text).startsWith('[')) continue;
      const result = await applyCustomerTurn({
        tenantId,
        customerPhone: conv.customerPhone,
        customerName: conv.customerName,
        text: msg.text,
        products,
        businessName: business?.name || '',
        conversationId: conv.id,
        persistOrder: true
      });
      if (result.order) created.push(result.order);
    }
  }
  return {
    conversations: conversations.length,
    ordersCreated: created.length,
    orders: created
  };
}

exports.handler = async function handler(event) {
  const method = (event.httpMethod || 'GET').toUpperCase();
  if (method === 'OPTIONS') return { statusCode: 204, body: '' };

  const body = parseBody(event);
  const tenantId =
    (await resolveBusinessId(event, body)) ||
    event.queryStringParameters?.tenantId ||
    event.queryStringParameters?.tenant_id;
  if (!tenantId) return json(200, { conversations: [], messages: [], error: 'Store session required' });

  const path = event.path || '';
  const parts = path.split('/').filter(Boolean);
  const convIdx = parts.lastIndexOf('conversations');
  const nextPart = convIdx >= 0 ? parts[convIdx + 1] : null;
  const convId = nextPart && nextPart !== 'messages' && nextPart !== 'sync' ? nextPart : null;
  const wantsMessages = path.includes('/messages');
  const wantsSync = path.includes('/sync') || nextPart === 'sync';

  if (method === 'POST' && wantsSync) {
    const processed = await processStoredChats(tenantId);
    const conversations = await listConversations(tenantId);
    return json(200, { success: true, ...processed, conversations });
  }

  if (method === 'GET' && wantsMessages && convId) {
    const messages = await listMessages(tenantId, convId);
    return json(200, { messages, conversation: { id: convId } });
  }

  if (method === 'GET') {
    const conversations = await listConversations(tenantId);
    return json(200, { conversations });
  }

  if (method === 'POST' && wantsMessages && convId) {
    const text = String(body.text || '').trim();
    if (!text) return json(400, { error: 'Message text is required' });
    const convs = await listConversations(tenantId);
    const conv = convs.find((c) => c.id === convId);
    const saved = await appendMessage(tenantId, {
      conversationId: convId,
      customerPhone: conv?.customerPhone,
      customerName: conv?.customerName,
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
