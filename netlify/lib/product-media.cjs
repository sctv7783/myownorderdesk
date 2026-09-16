const { getSupabaseConfig } = require('./supabase-rest.cjs');

const BUCKET = 'product-images';
const MAX_BYTES = 500 * 1024;

function parseImageList(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((item) => String(item || '').trim()).filter(Boolean);
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith('[')) {
      try {
        return parseImageList(JSON.parse(trimmed));
      } catch {
        return [trimmed];
      }
    }
    return [trimmed];
  }
  return [];
}

function publicImageUrls(product) {
  const extra = parseImageList(product?.imageUrls || product?.image_urls);
  const primary = product?.imageUrl || product?.image_url || '';
  const seen = new Set();
  const out = [];
  for (const url of [...extra, primary]) {
    const value = String(url || '').trim();
    if (!/^https?:\/\//i.test(value) || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

function decodeDataUrl(dataUrl) {
  const match = String(dataUrl || '').match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) return null;
  return {
    mime: match[1],
    buffer: Buffer.from(match[2], 'base64')
  };
}

async function ensureBucket() {
  const cfg = getSupabaseConfig();
  if (!cfg) return false;
  await fetch(`${cfg.url}/storage/v1/bucket`, {
    method: 'POST',
    headers: {
      apikey: cfg.key,
      Authorization: `Bearer ${cfg.key}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ id: BUCKET, name: BUCKET, public: true, fileSizeLimit: MAX_BYTES })
  }).catch(() => {});
  return true;
}

async function uploadBuffer(tenantId, productKey, buffer, mime, index) {
  const cfg = getSupabaseConfig();
  if (!cfg || !buffer?.length) return '';
  await ensureBucket();
  const ext = mime.includes('webp') ? 'webp' : mime.includes('png') ? 'png' : 'jpg';
  const path = `${tenantId}/${productKey}/${Date.now()}_${index}.${ext}`;
  const res = await fetch(`${cfg.url}/storage/v1/object/${BUCKET}/${path}`, {
    method: 'POST',
    headers: {
      apikey: cfg.key,
      Authorization: `Bearer ${cfg.key}`,
      'Content-Type': mime || 'image/jpeg',
      'x-upsert': 'true'
    },
    body: buffer
  });
  if (!res.ok) {
    const err = await res.text();
    console.warn('[Product media] upload failed', err.slice(0, 180));
    return '';
  }
  return `${cfg.url}/storage/v1/object/public/${BUCKET}/${path}`;
}

async function persistProductImages(tenantId, productKey, urls) {
  const list = parseImageList(urls).slice(0, 8);
  const out = [];
  let index = 0;
  for (const item of list) {
    if (/^https?:\/\//i.test(item) && !item.startsWith('data:')) {
      out.push(item);
      continue;
    }
    const decoded = decodeDataUrl(item);
    if (!decoded) continue;
    if (decoded.buffer.length > MAX_BYTES) {
      console.warn('[Product media] skip oversized image', decoded.buffer.length);
    }
    const uploaded = await uploadBuffer(
      tenantId,
      productKey || 'product',
      decoded.buffer,
      decoded.mime,
      index++
    );
    if (uploaded) out.push(uploaded);
  }
  return out;
}

async function persistChatMedia(tenantId, key, dataUrl) {
  const decoded = decodeDataUrl(dataUrl);
  if (!decoded?.buffer?.length) return '';
  if (decoded.buffer.length > 4 * 1024 * 1024) {
    console.warn('[Chat media] skip oversized file', decoded.buffer.length);
    return '';
  }
  return uploadBuffer(tenantId, key || 'chat', decoded.buffer, decoded.mime, 0);
}

module.exports = {
  parseImageList,
  publicImageUrls,
  persistProductImages,
  persistChatMedia,
  MAX_BYTES
};
