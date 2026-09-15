const { listOrders, updateOrderStatus } = require('../lib/orders-store.cjs');
const { resolveBusinessId } = require('../lib/business.cjs');

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

exports.handler = async function handler(event) {
  const method = (event.httpMethod || 'GET').toUpperCase();
  if (method === 'OPTIONS') return { statusCode: 204, body: '' };

  const body = parseBody(event);
  const tenantId = await resolveBusinessId(event, body);
  if (!tenantId) return json(401, { error: 'Store session required' });

  const path = event.path || '';
  const parts = path.split('/').filter(Boolean);
  const orderIdx = parts.lastIndexOf('orders');
  const orderId = orderIdx >= 0 && parts[orderIdx + 1] && parts[orderIdx + 1] !== 'status'
    ? parts[orderIdx + 1]
    : null;

  if (method === 'GET') {
    const orders = await listOrders(tenantId);
    if (orderId) {
      const order = orders.find((row) => row.id === orderId);
      if (!order) return json(404, { error: 'Order not found' });
      return json(200, { order });
    }
    return json(200, { orders });
  }

  if ((method === 'PATCH' || method === 'PUT') && orderId) {
    const status = String(body.status || '').toUpperCase();
    if (!status) return json(400, { error: 'status is required' });
    const result = await updateOrderStatus(tenantId, orderId, status, body.note);
    if (!result.ok) return json(404, { error: result.error || 'Order not found' });
    return json(200, { order: result.order });
  }

  return json(405, { error: 'Method Not Allowed' });
};
