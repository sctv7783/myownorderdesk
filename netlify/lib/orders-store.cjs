const { getSupabaseConfig, isUuid, sbSelect, sbInsert, sbUpdate } = require('./supabase-rest.cjs');
const { adjustStock } = require('./products-store.cjs');

async function getBlobStore() {
  try {
    const { getStore } = require('@netlify/blobs');
    return getStore('orderdesk-orders');
  } catch {
    return null;
  }
}

async function loadBlobOrders(tenantId) {
  const store = await getBlobStore();
  if (!store || !tenantId) return [];
  try {
    const data = await store.get(`tenant:${tenantId}`, { type: 'json' });
    return Array.isArray(data?.orders) ? data.orders : [];
  } catch {
    return [];
  }
}

async function saveBlobOrders(tenantId, orders) {
  const store = await getBlobStore();
  if (!store || !tenantId) return false;
  await store.setJSON(`tenant:${tenantId}`, { orders, updatedAt: new Date().toISOString() });
  return true;
}

function normalizePhone(phone) {
  return String(phone || '').replace(/\D/g, '');
}

function mapItem(row, orderId) {
  if (!row) return null;
  const qty = Number(row.quantity || 1);
  const unit = Number(row.unit_price ?? row.unitPrice ?? 0);
  return {
    id: row.id || `item_${orderId}_${Math.random().toString(36).slice(2, 7)}`,
    orderId: row.order_id || orderId,
    productId: row.product_id || row.productId || '',
    productName: row.product_name || row.productName || 'Item',
    sku: row.sku || '',
    unitPrice: unit,
    quantity: qty,
    subtotal: Number(row.subtotal != null ? row.subtotal : unit * qty),
    variantDetails: row.variant_details || row.variantDetails || row.variant || ''
  };
}

function mapOrder(row, tenantId, items) {
  if (!row) return null;
  const status = String(row.status || row.order_status || 'CONFIRMED').toUpperCase();
  return {
    id: row.id,
    tenantId: row.business_id || tenantId,
    customerId: row.customer_id || `cust_${normalizePhone(row.customer_phone).slice(-8)}`,
    customerName: row.customer_name || 'Customer',
    customerPhone: row.customer_phone || '',
    orderNumber: row.order_number || `ORD-${String(row.id || '').slice(0, 8)}`,
    status: status === 'CONFIRMED' || status === 'PENDING_CONFIRMATION' || status === 'PREPARING' || status === 'SHIPPED' || status === 'DELIVERED' || status === 'CANCELLED'
      ? status
      : 'CONFIRMED',
    items: (items || []).filter(Boolean),
    subtotal: Number(row.subtotal || 0),
    deliveryFee: Number(row.delivery_fee || 0),
    discount: Number(row.discount || 0),
    total: Number(row.total || 0),
    paymentMethod: String(row.payment_method || 'COD').toUpperCase(),
    paymentStatus: String(row.payment_status || 'PENDING').toUpperCase(),
    deliveryAddress: row.delivery_address || '',
    notes: row.notes || row.customer_note || '',
    source: row.source === 'whatsapp_ai' || row.source === 'whatsapp' ? 'whatsapp_ai' : row.source || 'whatsapp_ai',
    createdAt: row.created_at || new Date().toISOString(),
    updatedAt: row.updated_at || row.created_at || new Date().toISOString()
  };
}

async function insertVariants(table, variants) {
  for (const body of variants) {
    const result = await sbInsert(table, body);
    if (result.ok) {
      const row = Array.isArray(result.data) ? result.data[0] : result.data;
      if (row) return { ok: true, row };
    }
  }
  return { ok: false, row: null };
}

function nextOrderNumber() {
  const now = new Date();
  const y = now.getFullYear();
  const stamp = String(now.getTime()).slice(-6);
  return `ORD-${y}-${stamp}`;
}

async function listOrderItems(orderId, tenantId) {
  if (!getSupabaseConfig() || !isUuid(orderId)) return [];
  const { ok, rows } = await sbSelect('order_items', {
    select: '*',
    order_id: `eq.${orderId}`
  });
  if (!ok) return [];
  return rows.map((row) => mapItem(row, orderId));
}

async function listOrders(tenantId) {
  const blob = await loadBlobOrders(tenantId);
  let remote = [];
  if (getSupabaseConfig() && isUuid(tenantId)) {
    const { ok, rows } = await sbSelect('orders', {
      select: '*',
      business_id: `eq.${tenantId}`,
      order: 'created_at.desc'
    });
    if (ok) {
      remote = await Promise.all(
        rows.map(async (row) => {
          const items = await listOrderItems(row.id, tenantId);
          const parsedNotes = !items.length && row.notes ? safeParseItems(row.notes) : null;
          return mapOrder(row, tenantId, items.length ? items : parsedNotes || []);
        })
      );
    }
  }
  const map = new Map();
  for (const order of [...blob, ...remote]) {
    if (!order?.id) continue;
    map.set(order.id, order);
  }
  return [...map.values()].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

function safeParseItems(notes) {
  try {
    const parsed = JSON.parse(notes);
    if (Array.isArray(parsed?.items)) return parsed.items;
  } catch {
    /* ignore */
  }
  return null;
}

function fingerprint(order) {
  const items = (order.items || [])
    .map((i) => `${i.productId || i.productName}:${i.quantity}`)
    .sort()
    .join('|');
  return `${normalizePhone(order.customerPhone)}|${items}|${String(order.deliveryAddress || '').toLowerCase()}`;
}

async function findRecentDuplicate(tenantId, draft) {
  const orders = await listOrders(tenantId);
  const fp = fingerprint(draft);
  const cutoff = Date.now() - 12 * 60 * 60 * 1000;
  return orders.find((order) => {
    if (order.status === 'CANCELLED') return false;
    if (new Date(order.createdAt).getTime() < cutoff) return false;
    return fingerprint(order) === fp;
  });
}

async function upsertCustomer(tenantId, { name, phone, address }) {
  if (!getSupabaseConfig() || !isUuid(tenantId) || !phone) return null;
  const digits = normalizePhone(phone);
  const existing = await sbSelect('customers', {
    select: '*',
    business_id: `eq.${tenantId}`
  });
  const match = (existing.rows || []).find((row) => normalizePhone(row.phone) === digits);
  if (match) {
    await sbUpdate(
      'customers',
      { id: `eq.${match.id}` },
      {
        name: name || match.name,
        address: address || match.address,
        last_contact: new Date().toISOString()
      }
    );
    return match.id;
  }
  const created = await insertVariants('customers', [
    {
      business_id: tenantId,
      phone,
      name: name || 'Customer',
      address: address || '',
      status: 'ACTIVE'
    },
    {
      business_id: tenantId,
      phone,
      name: name || 'Customer'
    }
  ]);
  return created.row?.id || null;
}

async function createOrder(tenantId, data) {
  const now = new Date().toISOString();
  const items = (data.items || []).map((item, idx) => {
    const qty = Math.max(1, Number(item.quantity || 1));
    const unit = Number(item.unitPrice ?? item.price ?? 0);
    return {
      id: item.id || `item_${idx}_${Date.now()}`,
      orderId: '',
      productId: item.productId || item.id || '',
      productName: item.productName || item.name || 'Item',
      sku: item.sku || '',
      unitPrice: unit,
      quantity: qty,
      subtotal: unit * qty
    };
  });
  const subtotal = items.reduce((sum, item) => sum + item.subtotal, 0);
  const deliveryFee = Number(data.deliveryFee || 0);
  const discount = Number(data.discount || 0);
  const total = Math.max(0, subtotal + deliveryFee - discount);
  const orderNumber = data.orderNumber || nextOrderNumber();

  const draft = {
    id: data.id,
    tenantId,
    customerId: data.customerId,
    customerName: data.customerName || 'Customer',
    customerPhone: data.customerPhone || '',
    orderNumber,
    status: data.status || 'CONFIRMED',
    items,
    subtotal,
    deliveryFee,
    discount,
    total,
    paymentMethod: data.paymentMethod || 'COD',
    paymentStatus: data.paymentStatus || 'PENDING',
    deliveryAddress: data.deliveryAddress || '',
    notes: data.notes || '',
    source: data.source || 'whatsapp_ai',
    createdAt: now,
    updatedAt: now
  };

  const duplicate = await findRecentDuplicate(tenantId, draft);
  if (duplicate) return { ok: true, order: duplicate, duplicate: true };

  const customerId = await upsertCustomer(tenantId, {
    name: draft.customerName,
    phone: draft.customerPhone,
    address: draft.deliveryAddress
  });
  draft.customerId = customerId || draft.customerId || `cust_${normalizePhone(draft.customerPhone).slice(-8)}`;

  let persisted = draft;
  if (getSupabaseConfig() && isUuid(tenantId)) {
    const header = await insertVariants('orders', [
      {
        business_id: tenantId,
        customer_id: isUuid(draft.customerId) ? draft.customerId : null,
        customer_name: draft.customerName,
        customer_phone: draft.customerPhone,
        order_number: draft.orderNumber,
        status: draft.status,
        order_status: String(draft.status).toLowerCase(),
        subtotal,
        delivery_fee: deliveryFee,
        discount,
        total,
        payment_method: 'cod',
        payment_status: 'pending',
        delivery_address: draft.deliveryAddress,
        notes: JSON.stringify({ items }),
        customer_note: draft.notes || '',
        source: 'whatsapp_ai',
        created_at: now,
        updated_at: now
      },
      {
        business_id: tenantId,
        customer_name: draft.customerName,
        customer_phone: draft.customerPhone,
        order_number: draft.orderNumber,
        status: draft.status,
        total,
        delivery_address: draft.deliveryAddress,
        source: 'whatsapp'
      }
    ]);
    if (header.ok && header.row?.id) {
      persisted = mapOrder(header.row, tenantId, items.map((item) => ({ ...item, orderId: header.row.id })));
      persisted.items = items.map((item) => ({ ...item, orderId: header.row.id }));
      for (const item of persisted.items) {
        await insertVariants('order_items', [
          {
            order_id: header.row.id,
            business_id: tenantId,
            product_id: isUuid(item.productId) ? item.productId : null,
            product_name: item.productName,
            sku: item.sku || null,
            unit_price: item.unitPrice,
            quantity: item.quantity,
            subtotal: item.subtotal
          },
          {
            order_id: header.row.id,
            product_name: item.productName,
            unit_price: item.unitPrice,
            quantity: item.quantity
          }
        ]);
      }
    }
  }

  const all = await loadBlobOrders(tenantId);
  const next = [persisted, ...all.filter((order) => order.id !== persisted.id)];
  await saveBlobOrders(tenantId, next);

  for (const item of persisted.items) {
    if (item.productId) {
      try {
        await adjustStock(tenantId, item.productId, -item.quantity);
      } catch {
        /* stock is best-effort */
      }
    }
  }

  return { ok: true, order: persisted, duplicate: false };
}

async function updateOrderStatus(tenantId, orderId, status, note) {
  const orders = await listOrders(tenantId);
  const current = orders.find((order) => order.id === orderId);
  if (!current) return { ok: false, error: 'Order not found' };
  const next = {
    ...current,
    status,
    notes: note || current.notes,
    updatedAt: new Date().toISOString()
  };
  if (getSupabaseConfig() && isUuid(orderId)) {
    await sbUpdate(
      'orders',
      { id: `eq.${orderId}`, business_id: `eq.${tenantId}` },
      {
        status,
        order_status: String(status).toLowerCase(),
        notes: note || current.notes,
        updated_at: next.updatedAt
      }
    );
  }
  const all = await loadBlobOrders(tenantId);
  await saveBlobOrders(tenantId, [next, ...all.filter((order) => order.id !== orderId)]);
  return { ok: true, order: next };
}

module.exports = {
  listOrders,
  createOrder,
  updateOrderStatus,
  findRecentDuplicate,
  nextOrderNumber
};
