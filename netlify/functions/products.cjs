const { resolveBusinessId } = require('../lib/business.cjs');
const {
  listProducts,
  createProduct,
  updateProduct,
  deleteProduct,
  adjustStock
} = require('../lib/products-store.cjs');
const { getSupabaseConfig } = require('../lib/supabase-rest.cjs');

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

function parsePath(event) {
  const path = event.path || '';
  const parts = path.split('/').filter(Boolean);
  const idx = parts.lastIndexOf('products');
  const productId = idx >= 0 && parts[idx + 1] && parts[idx + 1] !== 'adjust' ? parts[idx + 1] : null;
  const wantsAdjust = path.includes('/adjust');
  return { productId, wantsAdjust };
}

exports.handler = async function handler(event) {
  const method = (event.httpMethod || 'GET').toUpperCase();
  if (method === 'OPTIONS') return { statusCode: 204, body: '' };

  if (!getSupabaseConfig()) {
    return json(503, {
      success: false,
      error: 'Supabase connected nahi hai. Netlify env mein SUPABASE_URL aur SUPABASE_SERVICE_ROLE_KEY set karein.'
    });
  }

  const body = parseBody(event);
  const tenantId = await resolveBusinessId(event, body);
  if (!tenantId) return json(400, { success: false, error: 'No business found.' });

  const { productId, wantsAdjust } = parsePath(event);

  if (method === 'GET' && !productId) {
    const products = await listProducts(tenantId);
    return json(200, { success: true, products, supabase: true });
  }

  if (method === 'POST' && !productId && !wantsAdjust) {
    const result = await createProduct(tenantId, body);
    if (!result.ok) return json(400, { success: false, error: result.error });
    return json(201, { success: true, product: result.product });
  }

  if (method === 'POST' && wantsAdjust && productId) {
    const result = await adjustStock(tenantId, productId, Number(body.changeQuantity || 0));
    if (!result.ok) return json(400, { success: false, error: result.error });
    return json(200, { success: true, product: result.product });
  }

  if ((method === 'PUT' || method === 'PATCH') && productId) {
    const result = await updateProduct(tenantId, productId, body);
    if (!result.ok) return json(400, { success: false, error: result.error });
    return json(200, { success: true, product: result.product });
  }

  if (method === 'DELETE' && productId) {
    const result = await deleteProduct(tenantId, productId);
    if (!result.ok) return json(400, { success: false, error: result.error });
    return json(200, { success: true });
  }

  return json(405, { success: false, error: 'Method Not Allowed' });
};
