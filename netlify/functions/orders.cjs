const { listOrders, updateOrderStatus } = require('../lib/orders-store.cjs');
const { requireStoreUser, secureJson, sanitizeNote } = require('../lib/session.cjs');
const { ALLOWED_STATUSES, customerStatusText } = require('../lib/order-notify.cjs');
const { loadConfig } = require('../lib/whatsapp-store.cjs');
const { sendWhatsAppText } = require('../lib/meta-graph.cjs');
const { appendMessage } = require('../lib/conversations.cjs');

function parseBody(event) {
  if (!event.body) return {};
  try {
    const raw = event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body;
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function notifyCustomer(tenantId, order, status, note) {
  const text = customerStatusText(order, status, note);
  let whatsapp = { success: false };
  try {
    const creds = await loadConfig(tenantId);
    if (creds?.accessToken && creds.phoneNumberId && order.customerPhone) {
      whatsapp = await sendWhatsAppText({
        phoneNumberId: creds.phoneNumberId,
        accessToken: creds.accessToken,
        to: order.customerPhone,
        text
      });
      await appendMessage(tenantId, {
        customerPhone: order.customerPhone,
        customerName: order.customerName,
        phoneNumberId: creds.phoneNumberId,
        sender: 'AI',
        text
      });
    }
  } catch (err) {
    console.warn('[Orders] WhatsApp status notify failed', err?.message || err);
  }
  return { ...whatsapp, text };
}

exports.handler = async function handler(event) {
  const method = (event.httpMethod || 'GET').toUpperCase();
  if (method === 'OPTIONS') return { statusCode: 204, body: '' };

  const body = parseBody(event);
  const session = await requireStoreUser(event, body);
  if (!session.ok) return secureJson(session.status, { error: session.error });
  const tenantId = session.tenantId;

  const path = event.path || '';
  const parts = path.split('/').filter(Boolean);
  const orderIdx = parts.lastIndexOf('orders');
  const orderId =
    orderIdx >= 0 && parts[orderIdx + 1] && parts[orderIdx + 1] !== 'status'
      ? parts[orderIdx + 1]
      : null;

  if (method === 'GET') {
    const orders = await listOrders(tenantId);
    if (orderId) {
      const order = orders.find((row) => row.id === orderId);
      if (!order) return secureJson(404, { error: 'Order not found' });
      return secureJson(200, { order });
    }
    return secureJson(200, { orders });
  }

  if ((method === 'PATCH' || method === 'PUT') && orderId) {
    const status = String(body.status || '').toUpperCase();
    if (!ALLOWED_STATUSES.has(status)) {
      return secureJson(400, { error: 'Invalid order status' });
    }
    const note = sanitizeNote(body.note || body.notes || body.message);
    const result = await updateOrderStatus(tenantId, orderId, status, note);
    if (!result.ok) return secureJson(404, { error: result.error || 'Order not found' });
    const whatsapp = await notifyCustomer(tenantId, result.order, status, note);
    return secureJson(200, { order: result.order, whatsapp, notified: Boolean(whatsapp.success) });
  }

  return secureJson(405, { error: 'Method Not Allowed' });
};
