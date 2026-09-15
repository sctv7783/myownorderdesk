const { getSupabaseConfig, isUuid, sbSelect, sbInsert, sbUpdate, sbDelete } = require('./supabase-rest.cjs');

function mapProduct(row, tenantId) {
  if (!row) return null;
  const stock = Number(row.stock_quantity ?? row.stock ?? 0);
  const reserved = Number(row.reserved_quantity || 0);
  return {
    id: row.id,
    tenantId: row.business_id || tenantId,
    categoryId: row.category_id || undefined,
    categoryName: row.category || 'General',
    name: row.name,
    sku: row.sku || '',
    description: row.description || '',
    price: Number(row.price || 0),
    salePrice: row.sale_price != null ? Number(row.sale_price) : undefined,
    imageUrl: row.image_url || undefined,
    stockQuantity: stock,
    reservedQuantity: reserved,
    availableQuantity: Math.max(0, stock - reserved),
    lowStockThreshold: Number(row.low_stock_threshold || 5),
    isActive: row.is_active !== false,
    variants: row.variants || [],
    createdAt: row.created_at || new Date().toISOString(),
    updatedAt: row.updated_at || row.created_at || new Date().toISOString()
  };
}

function toRow(tenantId, data) {
  const stock = Number(data.stockQuantity ?? data.stock ?? 0);
  const row = {
    business_id: tenantId,
    name: String(data.name || '').trim(),
    sku: data.sku || null,
    description: data.description || '',
    price: Number(data.price || 0),
    sale_price: data.salePrice != null && data.salePrice !== '' ? Number(data.salePrice) : null,
    image_url: data.imageUrl || null,
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

async function listProducts(tenantId) {
  if (!getSupabaseConfig() || !tenantId) return [];
  const { rows } = await sbSelect('products', {
    select: '*',
    business_id: `eq.${tenantId}`,
    order: 'created_at.desc'
  });
  return rows.map((row) => mapProduct(row, tenantId)).filter(Boolean);
}

async function getProduct(tenantId, productId) {
  const { rows } = await sbSelect('products', {
    select: '*',
    id: `eq.${productId}`,
    business_id: `eq.${tenantId}`
  });
  return mapProduct(rows[0], tenantId);
}

async function createProduct(tenantId, data) {
  if (!getSupabaseConfig()) {
    return { ok: false, error: 'Supabase is not configured on Netlify.' };
  }
  const row = toRow(tenantId, data);
  if (!row.name) return { ok: false, error: 'Product name is required.' };
  const result = await sbInsert('products', row);
  if (!result.ok) return { ok: false, error: result.error };
  const saved = Array.isArray(result.data) ? result.data[0] : result.data;
  return { ok: true, product: mapProduct(saved, tenantId) };
}

async function createProducts(tenantId, items) {
  const created = [];
  for (const item of items || []) {
    const result = await createProduct(tenantId, item);
    if (result.ok && result.product) created.push(result.product);
  }
  return created;
}

async function updateProduct(tenantId, productId, data) {
  const current = await getProduct(tenantId, productId);
  if (!current) return { ok: false, error: 'Product not found.' };
  const row = toRow(tenantId, { ...current, ...data, id: productId });
  delete row.id;
  delete row.business_id;
  const result = await sbUpdate(
    'products',
    { id: `eq.${productId}`, business_id: `eq.${tenantId}` },
    row
  );
  if (!result.ok) return { ok: false, error: result.error };
  const saved = Array.isArray(result.data) ? result.data[0] : result.data;
  return { ok: true, product: mapProduct(saved, tenantId) || { ...current, ...data } };
}

async function deleteProduct(tenantId, productId) {
  const result = await sbDelete('products', {
    id: `eq.${productId}`,
    business_id: `eq.${tenantId}`
  });
  return { ok: result.ok, error: result.error };
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
    .slice(0, 40)
    .map((p) => {
      const price = p.salePrice || p.price;
      return `- ${p.name} | Rs. ${price} | stock ${p.stockQuantity} | SKU ${p.sku || '-'}`;
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
