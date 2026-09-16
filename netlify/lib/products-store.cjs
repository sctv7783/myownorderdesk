const { getSupabaseConfig, isUuid, sbSelect, sbInsert, sbUpdate, sbDelete } = require('./supabase-rest.cjs');
const { persistProductImages, parseImageList, publicImageUrls } = require('./product-media.cjs');

async function getBlobStore() {
  try {
    const { getStore } = require('@netlify/blobs');
    return getStore('orderdesk-products');
  } catch {
    return null;
  }
}

async function loadBlobProducts(tenantId) {
  const store = await getBlobStore();
  if (!store || !tenantId) return [];
  try {
    const data = await store.get(`tenant:${tenantId}`, { type: 'json' });
    return Array.isArray(data?.products) ? data.products : [];
  } catch {
    return [];
  }
}

async function saveBlobProducts(tenantId, products) {
  const store = await getBlobStore();
  if (!store || !tenantId) return false;
  await store.setJSON(`tenant:${tenantId}`, { products, updatedAt: new Date().toISOString() });
  return true;
}

function mapProduct(row, tenantId) {
  if (!row) return null;
  const stock = Number(row.stock_quantity ?? row.stock ?? row.stockQuantity ?? 0);
  const reserved = Number(row.reserved_quantity ?? row.reservedQuantity ?? 0);
  return {
    id: row.id,
    tenantId: row.business_id || row.tenantId || tenantId,
    categoryId: row.category_id || undefined,
    categoryName: row.category || row.categoryName || 'General',
    name: row.name,
    sku: row.sku || '',
    description: row.description || '',
    price: Number(row.price || 0),
    salePrice: row.sale_price != null ? Number(row.sale_price) : row.salePrice,
    imageUrl: row.image_url || row.imageUrl || parseImageList(row.image_urls)[0] || undefined,
    imageUrls: publicImageUrls({
      imageUrl: row.image_url || row.imageUrl,
      imageUrls: row.image_urls || row.imageUrls
    }),
    stockQuantity: stock,
    reservedQuantity: reserved,
    availableQuantity: Math.max(0, stock - reserved),
    lowStockThreshold: Number(row.low_stock_threshold ?? row.lowStockThreshold ?? 5),
    isActive: row.is_active !== false && row.isActive !== false,
    variants: row.variants || [],
    createdAt: row.created_at || row.createdAt || new Date().toISOString(),
    updatedAt: row.updated_at || row.updatedAt || new Date().toISOString()
  };
}

function variants(full) {
  const stock = Number(full.stock_quantity ?? 0);
  return [
    full,
    {
      business_id: full.business_id,
      name: full.name,
      sku: full.sku,
      description: full.description,
      price: full.price,
      sale_price: full.sale_price,
      image_url: full.image_url,
      stock,
      is_active: full.is_active,
      category: full.category
    },
    {
      business_id: full.business_id,
      name: full.name,
      sku: full.sku,
      description: full.description,
      price: full.price,
      image_url: full.image_url,
      stock,
      is_active: full.is_active
    },
    {
      business_id: full.business_id,
      name: full.name,
      price: full.price,
      stock
    }
  ];
}

function toFullRow(tenantId, data) {
  const stock = Number(data.stockQuantity ?? data.stock ?? 0);
  const row = {
    business_id: tenantId,
    name: String(data.name || '').trim(),
    sku: data.sku || null,
    description: data.description || '',
    price: Number(data.price || 0),
    sale_price: data.salePrice != null && data.salePrice !== '' ? Number(data.salePrice) : null,
    image_url: parseImageList(data.imageUrls || data.imageUrl)[0] || data.imageUrl || null,
    image_urls: parseImageList(data.imageUrls || data.imageUrl),
    stock,
    stock_quantity: stock,
    reserved_quantity: Number(data.reservedQuantity || 0),
    low_stock_threshold: Number(data.lowStockThreshold || 5),
    is_active: data.isActive !== false,
    category: data.categoryName || data.category || 'General',
    updated_at: new Date().toISOString()
  };
  if (data.id && isUuid(data.id)) row.id = data.id;
  return row;
}

function mergeById(primary, secondary) {
  const map = new Map();
  for (const item of [...secondary, ...primary]) {
    if (!item?.id && !item?.name) continue;
    map.set(item.id || item.name, item);
  }
  return [...map.values()].sort(
    (a, b) => new Date(b.updatedAt || b.createdAt || 0).getTime() - new Date(a.updatedAt || a.createdAt || 0).getTime()
  );
}

async function listProducts(tenantId) {
  const [blob, dbRes] = await Promise.all([
    loadBlobProducts(tenantId),
    getSupabaseConfig() && tenantId
      ? sbSelect('products', {
          select: '*',
          business_id: `eq.${tenantId}`,
          order: 'created_at.desc'
        })
      : Promise.resolve({ ok: false, rows: [] })
  ]);
  const fromDb = dbRes.ok ? dbRes.rows.map((row) => mapProduct(row, tenantId)).filter(Boolean) : [];
  return mergeById(fromDb, blob);
}

async function getProduct(tenantId, productId) {
  const all = await listProducts(tenantId);
  return all.find((p) => p.id === productId) || null;
}

async function createProduct(tenantId, data) {
  const imageUrls = await persistProductImages(
    tenantId,
    String(data.sku || data.name || 'product').replace(/[^\w-]+/g, '-').slice(0, 40),
    data.imageUrls || data.imageUrl
  );
  const mapped = mapProduct(
    {
      ...data,
      imageUrl: imageUrls[0] || data.imageUrl,
      imageUrls,
      id: data.id && isUuid(data.id) ? data.id : undefined,
      tenantId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    },
    tenantId
  );
  if (!mapped?.name) return { ok: false, error: 'Product name is required.' };

  let saved = null;
  let lastError = 'Supabase insert failed.';
  if (getSupabaseConfig() && tenantId) {
    const full = toFullRow(tenantId, mapped);
    for (const payload of variants(full)) {
      const result = await sbInsert('products', payload);
      if (result.ok) {
        const row = Array.isArray(result.data) ? result.data[0] : result.data;
        saved = mapProduct(row, tenantId) || mapped;
        break;
      }
      lastError = result.error || lastError;
    }
  }

  const product = saved || {
    ...mapped,
    id: mapped.id || `prod_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  };
  const existing = await loadBlobProducts(tenantId);
  await saveBlobProducts(tenantId, [product, ...existing.filter((p) => p.id !== product.id && p.name !== product.name)]);
  if (!saved && !getSupabaseConfig()) {
    return { ok: false, error: 'Supabase is not configured on Netlify.' };
  }
  if (!saved) {
    return { ok: true, product, warning: lastError, persisted: 'blob' };
  }
  return { ok: true, product, persisted: 'supabase' };
}

async function createProducts(tenantId, items) {
  const created = [];
  let lastError = '';
  for (const item of items || []) {
    const result = await createProduct(tenantId, item);
    if (result.ok && result.product) created.push(result.product);
    else lastError = result.error || lastError;
  }
  return { products: created, error: lastError };
}

async function updateProduct(tenantId, productId, data) {
  const current = await getProduct(tenantId, productId);
  if (!current) return { ok: false, error: 'Product not found.' };
  const imageUrls = await persistProductImages(
    tenantId,
    productId,
    data.imageUrls || data.imageUrl || current.imageUrls
  );
  const next = {
    ...current,
    ...data,
    id: productId,
    imageUrl: imageUrls[0] || data.imageUrl || current.imageUrl,
    imageUrls: imageUrls.length ? imageUrls : current.imageUrls || [],
    updatedAt: new Date().toISOString()
  };
  if (getSupabaseConfig() && isUuid(productId)) {
    const row = toFullRow(tenantId, next);
    delete row.id;
    delete row.business_id;
    await sbUpdate('products', { id: `eq.${productId}`, business_id: `eq.${tenantId}` }, row);
  }
  const all = await loadBlobProducts(tenantId);
  const updated = [next, ...all.filter((p) => p.id !== productId)];
  await saveBlobProducts(tenantId, updated);
  return { ok: true, product: next };
}

async function deleteProduct(tenantId, productId) {
  if (getSupabaseConfig() && isUuid(productId)) {
    await sbDelete('products', { id: `eq.${productId}`, business_id: `eq.${tenantId}` });
  }
  const all = (await loadBlobProducts(tenantId)).filter((p) => p.id !== productId);
  await saveBlobProducts(tenantId, all);
  return { ok: true };
}

async function adjustStock(tenantId, productId, changeQuantity) {
  const current = await getProduct(tenantId, productId);
  if (!current) return { ok: false, error: 'Product not found.' };
  const next = Math.max(0, Number(current.stockQuantity || 0) + Number(changeQuantity || 0));
  return updateProduct(tenantId, productId, { stockQuantity: next });
}

function catalogText(products) {
  if (!products || !products.length) return '';
  return products
    .filter((p) => p.isActive !== false)
    .slice(0, 60)
    .map((p, i) => {
      const price = p.salePrice || p.price;
      const hasPhoto = publicImageUrls(p).length > 0;
      const desc = p.description ? ` | ${String(p.description).slice(0, 80)}` : '';
      return `${i + 1}) ${p.name} | Rs. ${price} | stock ${p.stockQuantity} | photo ${hasPhoto ? 'yes' : 'none'}${desc}`;
    })
    .join('\n');
}

module.exports = {
  mapProduct,
  listProducts,
  getProduct,
  createProduct,
  createProducts,
  updateProduct,
  deleteProduct,
  adjustStock,
  catalogText
};
