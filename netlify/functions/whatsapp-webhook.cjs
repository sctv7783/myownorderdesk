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

const GROQ_MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-20b';
const { loadConfig, loadConfigByPhone } = require('../lib/whatsapp-store.cjs');
const { markMessageAsRead, sendWhatsAppText } = require('../lib/meta-graph.cjs');

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

  const envToken = process.env.META_ACCESS_TOKEN || '';
  if (envToken) {
    return {
      phoneNumberId: phoneNumberId || process.env.META_PHONE_NUMBER_ID || '',
      accessToken: envToken,
      verifiedName: process.env.META_VERIFIED_NAME || 'WhatsApp Business',
      agentGreeting: process.env.AGENT_GREETING || ''
    };
  }

  return await loadConfig(process.env.DEFAULT_TENANT_ID || 'tenant_khyber_001');
}

async function generateAgentReply(incomingText, creds) {
  const businessName = creds?.verifiedName || creds?.businessName || 'our store';
  const greeting =
    creds?.agentGreeting ||
    `Assalam o Alaikum! ${businessName} mein khush amdeed. Main aapka order assistant hoon.`;
  const apiKey = process.env.GROQ_API_KEY;

  if (!incomingText) {
    return 'Photo/media receive ho gayi. Barah-e-karam product ka naam ya order detail text mein likhein.';
  }

  if (!apiKey) {
    return `${greeting}\n\nAapka message: "${incomingText.slice(0, 80)}"\nHum yeh dekh rahe hain. Order ke liye product naam, quantity aur address bhejein.`;
  }

  try {
    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        temperature: 0.3,
        max_tokens: 400,
        messages: [
          {
            role: 'system',
            content: `You are the WhatsApp ordering agent for "${businessName}".
Reply in the customer's language (Urdu, Roman Urdu, or English). Keep replies short (2-6 sentences).
Help with products, prices, delivery, and taking orders. Ask for quantity and delivery address before confirming.
Do not invent prices. If catalog is unknown, ask what they want to order.
Optional greeting style: ${greeting}`
          },
          { role: 'user', content: incomingText }
        ]
      })
    });
    const groqData = await groqRes.json().catch(() => ({}));
    const reply = groqData.choices?.[0]?.message?.content?.trim();
    if (reply) return reply;
  } catch (err) {
    console.error('[Webhook Groq]', err);
  }

  return `${greeting}\nAapka message receive ho gaya. Order confirm karne ke liye product naam aur address bhejein.`;
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
      const token = creds?.accessToken;
      const phoneId = creds?.phoneNumberId || phoneNumberId;
      if (!token || !phoneId) {
        console.warn('[Webhook] No Meta token for phone', phoneNumberId);
        continue;
      }

      for (const msg of messages) {
        await markMessageAsRead({
          phoneNumberId: phoneId,
          accessToken: token,
          messageId: msg.id
        });

        const incomingText =
          msg.text?.body ||
          msg.button?.text ||
          msg.interactive?.button_reply?.title ||
          '';

        const reply = await generateAgentReply(incomingText, creds);
        await sendWhatsAppText({
          phoneNumberId: phoneId,
          accessToken: token,
          to: msg.from,
          text: reply
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
