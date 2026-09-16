const ALLOWED_STATUSES = new Set([
  'PENDING_CONFIRMATION',
  'CONFIRMED',
  'PREPARING',
  'SHIPPED',
  'DELIVERED',
  'CANCELLED'
]);

function customerStatusText(order, status, note) {
  const name = order.customerName && !/\[name\]/i.test(order.customerName) ? order.customerName : 'Customer';
  const items = (order.items || []).map((item) => `${item.quantity}x ${item.productName}`).join(', ');
  const lines = {
    CONFIRMED: `Aapka order #${order.orderNumber} confirm ho gaya hai.`,
    PREPARING: `Aapka order #${order.orderNumber} pack/prepare ho raha hai.`,
    SHIPPED: `Aapka order #${order.orderNumber} rider ke paas nikal chuka hai (on the way).`,
    DELIVERED: `Aapka order #${order.orderNumber} deliver ho gaya. Shukriya!`,
    CANCELLED: `Aapka order #${order.orderNumber} cancel kar diya gaya.`,
    PENDING_CONFIRMATION: `Aapka order #${order.orderNumber} confirmation ka wait kar raha hai.`
  };
  const parts = [
    `Assalam o Alaikum ${name}!`,
    lines[status] || `Aapke order #${order.orderNumber} ka status: ${status}.`,
    items ? `Items: ${items}` : '',
    order.total != null ? `Total: Rs. ${Number(order.total).toLocaleString()}` : '',
    note ? `Note: ${note}` : ''
  ];
  return parts.filter(Boolean).join('\n');
}

module.exports = { ALLOWED_STATUSES, customerStatusText };
