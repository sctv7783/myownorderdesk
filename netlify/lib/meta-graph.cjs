const GRAPH_VERSION = process.env.META_GRAPH_API_VERSION || 'v21.0';

function isPlaceholderToken(token) {
  const value = String(token || '').trim();
  if (!value) return true;
  if (value.includes('...')) return true;
  if (/meta_system_user_token/i.test(value)) return true;
  if (value === 'mock_token') return true;
  return false;
}

function normalizePhone(phone) {
  let cleaned = String(phone || '').replace(/\D/g, '');
  if (cleaned.startsWith('0092')) cleaned = cleaned.slice(2);
  else if (cleaned.startsWith('03') && cleaned.length === 11) cleaned = '92' + cleaned.slice(1);
  else if (cleaned.length === 10 && cleaned.startsWith('3')) cleaned = '92' + cleaned;
  return cleaned;
}

async function verifyMetaCredentials({ phoneNumberId, accessToken, wabaId }) {
  const token = String(accessToken || '').trim();
  const phoneId = String(phoneNumberId || '').trim();

  if (!phoneId) {
    return { ok: false, error: 'Phone Number ID is required.' };
  }
  if (isPlaceholderToken(token)) {
    return { ok: false, error: 'Paste a real Meta System User access token (starts with EAA).' };
  }

  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(phoneId)}?fields=id,display_phone_number,verified_name,quality_rating,code_verification_status`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    return {
      ok: false,
      error: data.error?.message || 'Meta rejected this Phone Number ID or access token.'
    };
  }

  let wabaName = '';
  if (wabaId) {
    try {
      const wabaRes = await fetch(
        `https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(wabaId)}?fields=id,name`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const wabaData = await wabaRes.json().catch(() => ({}));
      if (wabaRes.ok) wabaName = wabaData.name || '';
    } catch {
      // Phone credentials can still be valid even if WABA lookup fails.
    }
  }

  return {
    ok: true,
    phoneNumberId: data.id || phoneId,
    displayPhoneNumber: data.display_phone_number,
    verifiedName: data.verified_name || wabaName,
    qualityRating: data.quality_rating,
    wabaName
  };
}

async function graphMessage(phoneNumberId, accessToken, payload) {
  const token = String(accessToken || '').trim();
  const phoneId = String(phoneNumberId || '').trim();
  if (!phoneId || isPlaceholderToken(token)) {
    return { success: false, error: 'WhatsApp credentials are missing. Save Meta credentials first.' };
  }
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(phoneId)}/messages`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      ...payload
    })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = data.error?.message || `Failed to send WhatsApp ${payload.type || 'message'}.`;
    console.warn('[Meta send]', payload.type, error);
    return { success: false, error, data };
  }
  return { success: true, messageId: data.messages?.[0]?.id };
}

async function uploadWhatsAppMedia({ phoneNumberId, accessToken, buffer, mime, filename }) {
  const token = String(accessToken || '').trim();
  const phoneId = String(phoneNumberId || '').trim();
  if (!phoneId || isPlaceholderToken(token) || !buffer?.length) {
    return { success: false, error: 'Media upload credentials or file missing.' };
  }
  const { Blob } = require('buffer');
  const type = String(mime || 'image/jpeg');
  const kind = type.startsWith('video') ? 'video' : type.startsWith('audio') ? 'audio' : 'image';
  const form = new FormData();
  form.append('messaging_product', 'whatsapp');
  form.append('type', kind);
  form.append('file', new Blob([buffer], { type }), filename || `upload.${kind}`);
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(phoneId)}/media`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.id) {
    const error = data.error?.message || 'Meta media upload failed.';
    console.warn('[Meta media upload]', error);
    return { success: false, error };
  }
  return { success: true, mediaId: data.id };
}

async function bufferFromUrl(imageUrl) {
  const link = String(imageUrl || '').trim();
  if (!/^https?:\/\//i.test(link)) return null;
  try {
    const res = await fetch(link, { redirect: 'follow' });
    if (!res.ok) {
      console.warn('[Meta media fetch]', res.status, link.slice(0, 120));
      return null;
    }
    const mime = String(res.headers.get('content-type') || 'image/jpeg').split(';')[0];
    const buffer = Buffer.from(await res.arrayBuffer());
    if (!buffer.length) return null;
    const ext = mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' : mime.includes('mp4') ? 'mp4' : 'jpg';
    return { buffer, mime, filename: `catalog.${ext}` };
  } catch (err) {
    console.warn('[Meta media fetch]', err?.message || err);
    return null;
  }
}

function decodeDataUrl(dataUrl) {
  const match = String(dataUrl || '').match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  return {
    mime: match[1],
    buffer: Buffer.from(match[2], 'base64')
  };
}

async function sendWhatsAppText({ phoneNumberId, accessToken, to, text }) {
  const cleanedTo = normalizePhone(to);
  const bodyText = String(text || '').trim();
  if (!cleanedTo) return { success: false, error: 'Destination phone number is required.' };
  return graphMessage(phoneNumberId, accessToken, {
    to: cleanedTo,
    type: 'text',
    text: { body: bodyText || 'Test message from WhatsApp OrderDesk' }
  });
}

async function sendWhatsAppImage({ phoneNumberId, accessToken, to, imageUrl, caption }) {
  return sendWhatsAppMedia({
    phoneNumberId,
    accessToken,
    to,
    mediaUrl: imageUrl,
    mediaType: 'image',
    caption
  });
}

async function sendWhatsAppMedia({ phoneNumberId, accessToken, to, mediaUrl, mediaType, caption, mime, buffer, filename }) {
  const cleanedTo = normalizePhone(to);
  if (!cleanedTo) return { success: false, error: 'Destination phone number is required.' };
  const kindRaw = String(mediaType || mime || 'image').toLowerCase();
  const type = kindRaw.startsWith('video') ? 'video' : kindRaw.startsWith('audio') ? 'audio' : 'image';
  const cap = String(caption || '').slice(0, 1024);
  const link = String(mediaUrl || '').trim();

  const sendWithBuffer = async (fileBuffer, fileMime, fileName) => {
    const uploaded = await uploadWhatsAppMedia({
      phoneNumberId,
      accessToken,
      buffer: fileBuffer,
      mime: fileMime || (type === 'video' ? 'video/mp4' : type === 'audio' ? 'audio/ogg' : 'image/jpeg'),
      filename: fileName || `staff.${type}`
    });
    if (!uploaded.success) return uploaded;
    const payload = { id: uploaded.mediaId };
    if (type !== 'audio' && cap) payload.caption = cap;
    return graphMessage(phoneNumberId, accessToken, { to: cleanedTo, type, [type]: payload });
  };

  if (buffer?.length) {
    return sendWithBuffer(buffer, mime, filename);
  }

  const decoded = decodeDataUrl(link);
  if (decoded) {
    return sendWithBuffer(decoded.buffer, decoded.mime);
  }

  if (/^https?:\/\//i.test(link) && type !== 'audio') {
    const viaLink = await graphMessage(phoneNumberId, accessToken, {
      to: cleanedTo,
      type,
      [type]: { link, caption: cap }
    });
    if (viaLink.success) return viaLink;
  }

  const file = await bufferFromUrl(link);
  if (!file) return { success: false, error: 'Media file missing or not publicly reachable.' };
  return sendWithBuffer(file.buffer, file.mime, file.filename);
}

async function markMessageAsRead({ phoneNumberId, accessToken, messageId }) {
  const token = String(accessToken || '').trim();
  const phoneId = String(phoneNumberId || '').trim();
  const wamid = String(messageId || '').trim();
  if (!phoneId || !wamid || isPlaceholderToken(token)) {
    return { success: false, error: 'Missing credentials or message id' };
  }

  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(phoneId)}/messages`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      status: 'read',
      message_id: wamid
    })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { success: false, error: data.error?.message || 'Failed to mark message as read' };
  }
  return { success: true };
}

module.exports = {
  GRAPH_VERSION,
  isPlaceholderToken,
  normalizePhone,
  verifyMetaCredentials,
  sendWhatsAppText,
  sendWhatsAppImage,
  sendWhatsAppMedia,
  uploadWhatsAppMedia,
  markMessageAsRead
};
