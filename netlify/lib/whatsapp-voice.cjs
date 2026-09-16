const { Blob } = require('buffer');

const GRAPH_VERSION = process.env.META_GRAPH_API_VERSION || 'v21.0';

function mediaIdFromMessage(msg) {
  if (!msg) return '';
  return (
    msg.audio?.id ||
    msg.voice?.id ||
    msg.image?.id ||
    msg.video?.id ||
    msg.document?.id ||
    msg.sticker?.id ||
    msg.ptt?.id ||
    (msg.type === 'audio' && msg.id) ||
    ''
  );
}

async function downloadWhatsAppMedia({ mediaId, accessToken }) {
  const token = String(accessToken || '').trim();
  const id = String(mediaId || '').trim();
  if (!token || !id) return null;

  const metaRes = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const meta = await metaRes.json().catch(() => ({}));
  const fileUrl = meta?.url;
  if (!metaRes.ok || !fileUrl) {
    console.warn('[Voice] media lookup failed', meta?.error?.message || metaRes.status);
    return null;
  }

  const fileRes = await fetch(fileUrl, { headers: { Authorization: `Bearer ${token}` } });
  if (!fileRes.ok) {
    console.warn('[Voice] media download failed', fileRes.status);
    return null;
  }
  const buffer = Buffer.from(await fileRes.arrayBuffer());
  return {
    buffer,
    mime: meta.mime_type || fileRes.headers.get('content-type') || 'audio/ogg',
    filename: `voice.${String(meta.mime_type || '').includes('mpeg') ? 'mp3' : 'ogg'}`
  };
}

async function transcribeAudio({ buffer, mime, filename }) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey || !buffer?.length) return '';

  const form = new FormData();
  form.append('file', new Blob([buffer], { type: mime || 'audio/ogg' }), filename || 'voice.ogg');
  form.append('model', process.env.GROQ_WHISPER_MODEL || 'whisper-large-v3');
  form.append('response_format', 'text');

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);
  try {
    const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
      signal: ctrl.signal
    });
    const raw = await res.text();
    if (!res.ok) {
      console.warn('[Voice] transcribe failed', raw.slice(0, 200));
      return '';
    }
    const text = String(raw || '').replace(/^"|"$/g, '').trim();
    return text;
  } catch (err) {
    console.warn('[Voice] transcribe error', err?.name || err?.message || err);
    return '';
  } finally {
    clearTimeout(timer);
  }
}

async function voiceToText(msg, accessToken) {
  const mediaId = mediaIdFromMessage(msg);
  if (!mediaId) return '';
  const file = await downloadWhatsAppMedia({ mediaId, accessToken });
  if (!file) return '';
  return transcribeAudio(file);
}

module.exports = { mediaIdFromMessage, downloadWhatsAppMedia, transcribeAudio, voiceToText };
