const { getSupabaseConfig, isUuid, sbSelect, sbInsert } = require('./supabase-rest.cjs');

const { readHeader } = require('./http.cjs');

function tenantFromEvent(event, body) {
  return (
    readHeader(event, 'x-tenant-id') ||
    readHeader(event, 'x-orderdesk-tenant') ||
    body?.tenantId ||
    body?.businessId ||
    ''
  );
}

function mapBusiness(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name || 'OrderDesk Store',
    slug: row.slug || 'orderdesk-store',
    businessType: row.business_type || 'E-Commerce',
    currency: row.currency || 'PKR',
    timezone: row.timezone || 'Asia/Karachi',
    createdAt: row.created_at || new Date().toISOString(),
    updatedAt: row.updated_at || row.created_at || new Date().toISOString()
  };
}

async function listBusinesses() {
  if (!getSupabaseConfig()) return [];
  const { rows } = await sbSelect('businesses', {
    select: '*',
    order: 'created_at.asc'
  });
  return rows.map(mapBusiness).filter(Boolean);
}

async function ensureBusiness(hint) {
  if (!getSupabaseConfig()) {
    return hint && isUuid(hint) ? hint : hint || 'tenant_khyber_001';
  }

  if (hint && isUuid(hint)) {
    const existing = await sbSelect('businesses', { select: '*', id: `eq.${hint}` });
    if (existing.rows[0]) return existing.rows[0].id;
  }

  const listed = await sbSelect('businesses', {
    select: '*',
    order: 'created_at.asc',
    limit: '1'
  });
  if (listed.rows[0]) return listed.rows[0].id;

  const created = await sbInsert('businesses', {
    name: 'OrderDesk Store',
    slug: 'orderdesk-store',
    business_type: 'E-Commerce',
    currency: 'PKR',
    timezone: 'Asia/Karachi'
  });
  if (created.ok && Array.isArray(created.data) && created.data[0]?.id) {
    return created.data[0].id;
  }

  return hint || null;
}

async function findBusinessIdByPhone(phoneNumberId) {
  if (!phoneNumberId || !getSupabaseConfig()) return null;
  const wanted = String(phoneNumberId).trim();
  const exact = await sbSelect('whatsapp_configs', {
    select: 'business_id,phone_number_id',
    phone_number_id: `eq.${wanted}`
  });
  if (exact.rows[0]?.business_id) return exact.rows[0].business_id;
  const all = await sbSelect('whatsapp_configs', {
    select: 'business_id,phone_number_id'
  });
  const match = (all.rows || []).find((row) => String(row.phone_number_id || '').trim() === wanted);
  return match?.business_id || null;
}

async function resolveBusinessId(event, body) {
  const q = event?.queryStringParameters || {};
  const hint =
    tenantFromEvent(event, body) ||
    String(q.tenantId || q.tenant_id || q.businessId || '').trim();
  if (hint && isUuid(hint)) {
    if (!getSupabaseConfig()) return hint;
    const existing = await sbSelect('businesses', { select: 'id', id: `eq.${hint}` });
    if (existing.rows[0]) return existing.rows[0].id;
    return hint;
  }
  return hint || null;
}

async function getBusiness(businessId) {
  if (!businessId || !getSupabaseConfig()) return null;
  const { rows } = await sbSelect('businesses', { select: '*', id: `eq.${businessId}` });
  return mapBusiness(rows[0]);
}

module.exports = {
  tenantFromEvent,
  mapBusiness,
  listBusinesses,
  ensureBusiness,
  resolveBusinessId,
  getBusiness,
  findBusinessIdByPhone
};
