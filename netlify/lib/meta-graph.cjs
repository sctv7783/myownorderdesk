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

async function sendWhatsAppText({ phoneNumberId, accessToken, to, text }) {
  const token = String(accessToken || '').trim();
  const phoneId = String(phoneNumberId || '').trim();
  const cleanedTo = normalizePhone(to);
  const bodyText = String(text || '').trim();

  if (!phoneId || isPlaceholderToken(token)) {
    return { success: false, error: 'WhatsApp credentials are missing. Save Meta credentials first.' };
  }
  if (!cleanedTo) {
    return { success: false, error: 'Destination phone number is required.' };
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
      to: cleanedTo,
      type: 'text',
      text: { body: bodyText || 'Test message from WhatsApp OrderDesk' }
    })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { success: false, error: data.error?.message || 'Failed to send WhatsApp message.' };
  }
  return { success: true, messageId: data.messages?.[0]?.id };
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
  markMessageAsRead
};
