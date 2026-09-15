/**
 * Meta WhatsApp Cloud API webhook.
 * GET: hub.challenge as raw text.
 * POST: mark read, generate Groq agent reply, send WhatsApp message.
 */
const VERIFY_TOKENS = new Set(
  [process.env.META_VERIFY_TOKEN, 'orderdesk_webhook_verify_token_secure', 'my_whatsapp_verify_token_123']
    .filter(Boolean)
    .map((t) => String(t).trim())
);

const { loadConfig, loadConfigByPhone } = require('../lib/whatsapp-store.cjs');
const { markMessageAsRead, sendWhatsAppText } = require('../lib/meta-graph.cjs');
const { generateAgentReply } = require('../lib/groq-agent.cjs');
const { appendMessage } = require('../lib/conversations.cjs');
const { getBusiness, findBusinessIdByPhone } = require('../lib/business.cjs');
const { isUuid } = require('../lib/supabase-rest.cjs');

function firstValue(value) {
  if (Array.isArray(value)) return value[0];
  return value;
}

function readHubParams(event) {
  const q = event.queryStringParameters || {};
  const multi = event.multiValueQueryStringParameters || {};
  let raw = {};
  try {
    raw = Object.fromEntries(new URLSearchParams(event.rawQuery || ''));
  } catch {
    raw = {};
  }

  const pick = (...keys) => {
    for (const key of keys) {
      const value = firstValue(q[key]) || firstValue(multi[key]) || firstValue(raw[key]);
      if (value !== undefined && value !== null && String(value).length > 0) {
        return String(value);
      }
    }
    return '';
  };

  return {
    mode: pick('hub.mode', 'hub_mode', 'mode'),
    token: pick('hub.verify_token', 'hub_verify_token', 'verify_token'),
    challenge: pick('hub.challenge', 'hub_challenge', 'challenge')
  };
}

function text(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store'
    },
    body: body == null ? '' : String(body)
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

async function resolveCreds(phoneNumberId) {
  const byPhone = await loadConfigByPhone(phoneNumberId);
  if (byPhone?.accessToken) return byPhone;

  const mappedTenantId = await findBusinessIdByPhone(phoneNumberId);
  if (mappedTenantId) {
    const stored = await loadConfig(mappedTenantId);
    if (stored?.accessToken) return stored;
  }

  const envToken = process.env.META_ACCESS_TOKEN || '';
  if (envToken) {
    return {
      tenantId: mappedTenantId || '',
      phoneNumberId: phoneNumberId || process.env.META_PHONE_NUMBER_ID || '',
      accessToken: envToken,
      verifiedName: process.env.META_VERIFIED_NAME || '',
      agentGreeting: process.env.AGENT_GREETING || ''
    };
  }

  return mappedTenantId ? await loadConfig(mappedTenantId) : null;
}

async function handleIncoming(payload) {
  if (!payload || !Array.isArray(payload.entry)) {
    if (payload && payload.object && payload.object !== 'whatsapp_business_account') return;
    if (!payload?.entry) return;
  }

  for (const entry of payload.entry || []) {
    for (const change of entry.changes || []) {
      const val = change.value;
      const phoneNumberId = val?.metadata?.phone_number_id;
      const messages = val?.messages || [];
      if (!messages.length) continue;

      const creds = await resolveCreds(phoneNumberId);
      const tenantId =
        (creds?.tenantId && isUuid(creds.tenantId) && creds.tenantId) ||
        (await findBusinessIdByPhone(phoneNumberId)) ||
        (await findBusinessIdByPhone(creds?.phoneNumberId));
      if (!tenantId) {
        console.warn('[Webhook] No store mapped for WhatsApp phone', phoneNumberId);
        continue;
      }
      const stored = (await loadConfig(tenantId)) || creds;
      const token = stored?.accessToken || creds?.accessToken;
      const phoneId = stored?.phoneNumberId || creds?.phoneNumberId || phoneNumberId;
      const store = await getBusiness(tenantId);

      for (const msg of messages) {
        const senderPhone = msg.from ? `+${String(msg.from).replace(/\D/g, '')}` : '';
        const contactName =
          val.contacts?.find((c) => c.wa_id === msg.from)?.profile?.name ||
          `Customer ${senderPhone.slice(-4)}`;
        const incomingText =
          msg.text?.body ||
          msg.button?.text ||
          msg.interactive?.button_reply?.title ||
          (msg.type && msg.type !== 'text' ? `[${msg.type}]` : '');

        if (token && phoneId) {
          await markMessageAsRead({
            phoneNumberId: phoneId,
            accessToken: token,
            messageId: msg.id
          });
        }

        const savedIn = await appendMessage(tenantId, {
          customerPhone: senderPhone,
          customerName: contactName,
          phoneNumberId: phoneId || phoneNumberId,
          sender: 'CUSTOMER',
          text: incomingText,
          whatsappMessageId: msg.id
        });

        if (!token || !phoneId) {
          console.warn('[Webhook] Saved inbox message but Meta token missing for', phoneNumberId);
          continue;
        }

        const result = await generateAgentReply(incomingText, {
          tenantId,
          customerName: contactName,
          customerPhone: senderPhone,
          businessName: store?.name || stored?.verifiedName || stored?.businessName,
          conversationId: savedIn?.conversation?.id
        });

        if (result.skipped || !result.reply) {
          continue;
        }

        await sendWhatsAppText({
          phoneNumberId: phoneId,
          accessToken: token,
          to: msg.from,
          text: result.reply
        });

        await appendMessage(tenantId, {
          customerPhone: senderPhone,
          customerName: contactName,
          phoneNumberId: phoneId,
          sender: 'AI',
          text: result.reply
        });
      }
    }
  }
}

exports.handler = async function handler(event) {
  const method = (event.httpMethod || 'GET').toUpperCase();

  if (method === 'GET' || method === 'HEAD') {
    const { mode, token, challenge } = readHubParams(event);

    if (mode === 'subscribe' && VERIFY_TOKENS.has(token.trim()) && challenge) {
      return text(200, challenge);
    }

    if (!mode && !token) {
      return text(200, 'webhook_ready');
    }

    return text(403, 'Forbidden');
  }

  if (method === 'POST') {
    try {
      await handleIncoming(parseBody(event));
    } catch (err) {
      console.error('[Webhook POST]', err);
    }
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'EVENT_RECEIVED' })
    };
  }

  return text(405, 'Method Not Allowed');
};
