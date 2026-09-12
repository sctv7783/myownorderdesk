/**
 * Meta WhatsApp Cloud API webhook.
 * Must return hub.challenge as raw text/plain on GET — never HTML/JSON.
 */
const VERIFY_TOKENS = new Set(
  [
    process.env.META_VERIFY_TOKEN,
    'orderdesk_webhook_verify_token_secure',
    'my_whatsapp_verify_token_123'
  ]
    .filter(Boolean)
    .map((t) => String(t).trim())
);

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
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'EVENT_RECEIVED' })
    };
  }

  return text(405, 'Method Not Allowed');
};
