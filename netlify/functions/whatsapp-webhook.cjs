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
const { markMessageAsRead, sendWhatsAppText, sendWhatsAppImage } = require('../lib/meta-graph.cjs');
const { generateAgentReply } = require('../lib/groq-agent.cjs');
const { appendMessage } = require('../lib/conversations.cjs');
const { getBusiness, findBusinessIdByPhone, listBusinesses } = require('../lib/business.cjs');
const { voiceToText, mediaIdFromMessage, downloadWhatsAppMedia } = require('../lib/whatsapp-voice.cjs');
const { persistChatMedia } = require('../lib/product-media.cjs');

async function incomingFromMessage(msg, accessToken) {
  if (msg.type === 'location' && msg.location) {
    const loc = msg.location;
    return {
      text: `Delivery location: ${[loc.name, loc.address].filter(Boolean).join(', ')} (lat ${loc.latitude}, lng ${loc.longitude})`.trim(),
      mediaType: 'location'
    };
  }
  if (msg.type === 'contacts' && Array.isArray(msg.contacts)) {
    return {
      text: `Customer shared contact: ${msg.contacts.map((c) => c.name?.formatted_name || '').join(', ')}`,
      mediaType: 'contacts'
    };
  }
  if (msg.type === 'audio' || msg.type === 'voice' || msg.audio) {
    const spoken = await voiceToText(msg, accessToken);
    return {
      text: spoken || '[media:audio]',
      mediaType: 'audio',
      mediaId: mediaIdFromMessage(msg)
    };
  }
  if (msg.type === 'image' || msg.image) {
    return {
      text: msg.image?.caption || '[media:image]',
      mediaType: 'image',
      mediaId: msg.image?.id
    };
  }
  if (msg.type === 'video' || msg.video) {
    return {
      text: msg.video?.caption || '[media:video]',
      mediaType: 'video',
      mediaId: msg.video?.id
    };
  }
  return {
    text:
      msg.text?.body ||
      msg.button?.text ||
      msg.interactive?.button_reply?.title ||
      msg.document?.caption ||
      (msg.type && msg.type !== 'text' ? `[${msg.type}]` : ''),
    mediaType: msg.type === 'text' ? 'text' : msg.type || 'text',
    mediaId: mediaIdFromMessage(msg)
  };
}

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
      let tenantId =
        creds?.tenantId ||
        (await findBusinessIdByPhone(phoneNumberId)) ||
        (await findBusinessIdByPhone(creds?.phoneNumberId)) ||
        '';
      if (!tenantId || tenantId === 'unmapped') {
        const stores = await listBusinesses();
        if (stores.length === 1) tenantId = stores[0].id;
        else tenantId = 'unmapped';
      }
      if (tenantId === 'unmapped') {
        console.warn('[Webhook] No store mapped for WhatsApp phone', phoneNumberId, '- saving to WABA inbox anyway');
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
        const incoming = await incomingFromMessage(msg, token);
        const incomingText = incoming.text || '';
        let mediaUrl = '';
        if (incoming.mediaId && token && (incoming.mediaType === 'image' || incoming.mediaType === 'video')) {
          const file = await downloadWhatsAppMedia({ mediaId: incoming.mediaId, accessToken: token });
          if (file?.buffer) {
            const uploaded = await persistChatMedia(
              tenantId || 'unmapped',
              `chat_${senderPhone.slice(-8)}`,
              `data:${file.mime};base64,${file.buffer.toString('base64')}`
            );
            mediaUrl = uploaded || '';
          }
        }

        if (token && phoneId) {
          markMessageAsRead({
            phoneNumberId: phoneId,
            accessToken: token,
            messageId: msg.id
          }).catch(() => {});
        }

        const savedIn = await appendMessage(tenantId, {
          customerPhone: senderPhone,
          customerName: contactName,
          phoneNumberId: phoneId || phoneNumberId,
          sender: 'CUSTOMER',
          text: incomingText,
          whatsappMessageId: msg.id,
          mediaUrl,
          mediaType: incoming.mediaType || 'text'
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
          conversationId: savedIn?.conversation?.id,
          conversationStatus: savedIn?.conversation?.status,
          phoneNumberId: phoneId
        });

        if (result.skipped) {
          continue;
        }

        let sentPhotos = 0;
        const photoErrors = [];
        for (const image of result.images || []) {
          const sent = await sendWhatsAppImage({
            phoneNumberId: phoneId,
            accessToken: token,
            to: msg.from,
            imageUrl: image.imageUrl,
            caption: image.caption
          });
          if (sent.success) {
            sentPhotos += 1;
            await appendMessage(tenantId, {
              customerPhone: senderPhone,
              customerName: contactName,
              phoneNumberId: phoneId,
              sender: 'AI',
              text: image.caption || 'Photo',
              mediaUrl: image.imageUrl,
              mediaType: 'image',
              whatsappMessageId: sent.messageId
            });
          } else {
            photoErrors.push(sent.error || 'image send failed');
            console.warn('[Webhook] photo send failed', sent.error, image.imageUrl);
          }
        }

        let reply = result.reply || '';
        if ((result.images || []).length && !sentPhotos) {
          reply = `${reply || 'Photos bhejni thin.'}\n\nPhotos WhatsApp par deliver nahi ho sakin. Dashboard mein product images public HTTPS honi chahiye.`;
        }
        const photoOnly = sentPhotos > 0 && /^[^\n]*ki photos\.?$/i.test(String(reply || '').trim());
        if (reply && !photoOnly) {
          await sendWhatsAppText({
            phoneNumberId: phoneId,
            accessToken: token,
            to: msg.from,
            text: reply
          });

          await appendMessage(tenantId, {
            customerPhone: senderPhone,
            customerName: contactName,
            phoneNumberId: phoneId,
            sender: 'AI',
            text: reply
          });
        }
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
