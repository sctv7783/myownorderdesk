const { createOrder } = require('./orders-store.cjs');

async function getCartStore() {
  try {
    const { getStore } = require('@netlify/blobs');
    return getStore('orderdesk-carts');
  } catch {
    return null;
  }
}

function cartKey(tenantId, phone) {
  return `tenant:${tenantId}:${String(phone || '').replace(/\D/g, '') || 'unknown'}`;
}

function emptyCart() {
  return {
    items: [],
    address: '',
    notes: '',
    paymentMethod: 'COD',
    awaitingConfirm: false,
    updatedAt: new Date().toISOString()
  };
}

async function loadCart(tenantId, phone) {
  const store = await getCartStore();
  if (!store) return emptyCart();
  try {
    return (await store.get(cartKey(tenantId, phone), { type: 'json' })) || emptyCart();
  } catch {
    return emptyCart();
  }
}

async function saveCart(tenantId, phone, cart) {
  const store = await getCartStore();
  if (!store) return false;
  await store.setJSON(cartKey(tenantId, phone), { ...cart, updatedAt: new Date().toISOString() });
  return true;
}

async function clearCart(tenantId, phone) {
  return saveCart(tenantId, phone, emptyCart());
}

const URDU_QTY = {
  aik: 1,
  ek: 1,
  one: 1,
  do: 2,
  two: 2,
  teen: 3,
  three: 3,
  char: 4,
  four: 4,
  panch: 5,
  five: 5,
  che: 6,
  six: 6
};

function extractQuantity(text, fallback = 1) {
  const raw = String(text || '');
  const explicit = raw.match(/(\d+)\s*(?:x|pcs?|pieces?|pair|pairs|qty|quantity|adad|dane)?/i);
  if (explicit) {
    const qty = Number(explicit[1]);
    if (qty >= 1 && qty <= 50) return qty;
  }
  const lower = raw.toLowerCase();
  for (const [word, qty] of Object.entries(URDU_QTY)) {
    if (new RegExp(`\\b${word}\\b`, 'i').test(lower)) return qty;
  }
  return fallback;
}

function isConfirm(text) {
  const t = String(text || '').toLowerCase().trim();
  return /^(haan+|han+|ha+|yes+|ok+|okay+|ji+|g)\b/.test(t) ||
    /\b(confirm|confirmed|order confirm|confirm kar|kar do|kardo|theek hai|bilkul|place order|order kar do|order kardo|done)\b/.test(t);
}

function isCancel(text) {
  return /\b(cancel|rakh do|mat bhejo|don't|dont order|order cancel)\b/i.test(String(text || ''));
}

function looksLikeAddress(text) {
  const raw = String(text || '').trim();
  if (raw.length < 8) return false;
  const lower = raw.toLowerCase();
  if (/(?:address|pata|location)\s*[:=-]/i.test(raw) && raw.length >= 12) return true;
  const keywords = [
    'house', 'h#', 'h no', 'street', 'st#', 'gali', 'mohallah', 'block', 'phase',
    'sector', 'flat', 'apartment', 'road', 'chowk', 'colony', 'town', 'lahore',
    'karachi', 'islamabad', 'rawalpindi', 'faisalabad', 'multan', 'peshawar',
    'sialkot', 'gujranwala', 'quetta', 'hyderabad', 'near', 'bazar', 'dha',
    'bahria', 'gulberg', 'johar', 'township', 'cantt'
  ];
  return keywords.some((k) => lower.includes(k)) && raw.length >= 10;
}

function extractAddress(text) {
  const raw = String(text || '').trim();
  const explicit = raw.match(/(?:address|pata|location)\s*[:=-]?\s*(.+)/i);
  if (explicit && explicit[1].trim().length >= 8) return explicit[1].trim();
  if (looksLikeAddress(raw)) return raw;
  return '';
}

function productPrice(product) {
  return Number(product.salePrice || product.price || 0);
}

function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\u0600-\u06ff\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3);
}

function findProductsInText(products, text) {
  const active = (products || []).filter((p) => p.isActive !== false);
  const lower = String(text || '').toLowerCase();
  const qty = extractQuantity(text, 1);
  const found = [];

  const numbered = lower.match(/\b(?:no\.?|number|#)?\s*([1-9]|1[0-9]|20)\b/);
  if (numbered && /(?:number|no\b|#|pehla|doosra|list|menu|option)/.test(lower)) {
    const idx = Number(numbered[1]) - 1;
    if (active[idx]) found.push({ product: active[idx], quantity: qty });
  }

  for (const product of active) {
    const name = String(product.name || '').toLowerCase();
    const sku = String(product.sku || '').toLowerCase();
    if (name && name.length >= 3 && lower.includes(name)) {
      found.push({ product, quantity: qty });
      continue;
    }
    if (sku && sku.length >= 3 && lower.includes(sku)) {
      found.push({ product, quantity: qty });
    }
  }

  if (!found.length) {
    const stop = new Set([
      'kya', 'hai', 'hain', 'mujhe', 'chahiye', 'order', 'karna', 'kardo', 'bhej',
      'please', 'price', 'kitne', 'available', 'stock', 'delivery', 'address',
      'pata', 'confirm', 'haan', 'yes', 'product', 'list', 'menu', 'catalog'
    ]);
    const words = tokenize(text).filter((w) => !stop.has(w));
    let best = null;
    let bestScore = 0;
    for (const product of active) {
      const hay = `${product.name} ${product.description || ''} ${product.sku || ''}`.toLowerCase();
      let score = 0;
      for (const word of words) {
        if (hay.includes(word)) score += word.length >= 5 ? 3 : 1;
      }
      if (score > bestScore) {
        bestScore = score;
        best = product;
      }
    }
    if (best && bestScore >= 3) found.push({ product: best, quantity: qty });
  }

  const unique = [];
  const seen = new Set();
  for (const row of found) {
    if (seen.has(row.product.id)) continue;
    seen.add(row.product.id);
    unique.push(row);
  }
  return unique;
}

function mergeItems(cart, additions) {
  const items = [...(cart.items || [])];
  for (const add of additions) {
    const price = productPrice(add.product);
    const existing = items.find((item) => item.productId === add.product.id);
    if (existing) {
      existing.quantity = add.quantity || existing.quantity;
      existing.subtotal = existing.quantity * existing.unitPrice;
    } else {
      items.push({
        productId: add.product.id,
        productName: add.product.name,
        sku: add.product.sku || '',
        unitPrice: price,
        quantity: add.quantity || 1,
        subtotal: price * (add.quantity || 1)
      });
    }
  }
  return items;
}

function cartTotals(cart) {
  const subtotal = (cart.items || []).reduce((sum, item) => sum + Number(item.subtotal || 0), 0);
  return { subtotal, deliveryFee: 0, total: subtotal };
}

function formatOrderTemplate({
  businessName,
  orderNumber,
  customerName,
  customerPhone,
  items,
  address,
  paymentMethod,
  status,
  headline
}) {
  const totals = cartTotals({ items });
  const lines = (items || []).map(
    (item, idx) => `${idx + 1}) ${item.quantity}x ${item.productName} — Rs. ${Number(item.subtotal).toLocaleString()}`
  );
  return [
    headline || '🧾 *ORDER DETAILS*',
    '━━━━━━━━━━━━━━',
    `Store: ${businessName || 'OrderDesk'}`,
    orderNumber ? `Order #: *${orderNumber}*` : 'Order #: pending confirm',
    `Customer: ${customerName || 'Customer'}`,
    `Phone: ${customerPhone || '-'}`,
    '',
    '*Items*',
    lines.join('\n') || '(no items)',
    '',
    `Subtotal: Rs. ${totals.subtotal.toLocaleString()}`,
    'Delivery: Rs. 0',
    `*Total: Rs. ${totals.total.toLocaleString()}*`,
    `Payment: ${paymentMethod || 'Cash on Delivery'}`,
    '',
    '📍 *Delivery address*',
    address || '(address needed)',
    '',
    `Status: *${status || 'PENDING CONFIRMATION'}*`
  ].join('\n');
}

function applyGroqAction(cart, action, products) {
  if (!action || typeof action !== 'object') return cart;
  const next = { ...cart, items: [...(cart.items || [])] };
  if (Array.isArray(action.items) && action.items.length) {
    const additions = [];
    for (const item of action.items) {
      const name = String(item.name || item.productName || '').toLowerCase();
      const product =
        (products || []).find((p) => p.id === item.product_id || p.id === item.productId) ||
        (products || []).find((p) => String(p.name || '').toLowerCase() === name) ||
        findProductsInText(products, name)[0]?.product;
      if (product) {
        additions.push({ product, quantity: Number(item.qty || item.quantity || 1) });
      }
    }
    next.items = mergeItems(next, additions);
  }
  if (action.address) next.address = String(action.address).trim();
  if (action.notes) next.notes = String(action.notes).trim();
  if (action.confirmed) next.awaitingConfirm = true;
  return next;
}

async function applyCustomerTurn({
  tenantId,
  customerPhone,
  customerName,
  text,
  products,
  businessName,
  groqAction,
  persistOrder = true
}) {
  let cart = await loadCart(tenantId, customerPhone);
  const message = String(text || '').trim();

  if (isCancel(message)) {
    await clearCart(tenantId, customerPhone);
    return {
      cart: emptyCart(),
      next: 'ask_product',
      reply:
        'Order cancel kar diya. Naya item choose karein — catalog ke liye "products" likhein.',
      order: null,
      template: null
    };
  }

  const matched = findProductsInText(products, message);
  if (matched.length) cart.items = mergeItems(cart, matched);

  const address = extractAddress(message);
  if (address) cart.address = address;

  cart = applyGroqAction(cart, groqAction, products);

  const hasItems = cart.items.length > 0;
  const hasAddress = String(cart.address || '').trim().length >= 8;
  const confirmed = isConfirm(message) || groqAction?.action === 'confirm' || groqAction?.confirmed === true;

  if (hasItems && hasAddress && confirmed && persistOrder) {
    const created = await createOrder(tenantId, {
      customerName,
      customerPhone,
      items: cart.items,
      deliveryAddress: cart.address,
      notes: cart.notes,
      paymentMethod: 'COD',
      status: 'CONFIRMED',
      source: 'whatsapp_ai'
    });
    await clearCart(tenantId, customerPhone);
    const template = formatOrderTemplate({
      businessName,
      orderNumber: created.order.orderNumber,
      customerName,
      customerPhone,
      items: created.order.items,
      address: created.order.deliveryAddress,
      paymentMethod: 'Cash on Delivery',
      status: 'CONFIRMED',
      headline: created.duplicate ? '🧾 *ORDER ALREADY CONFIRMED*' : '✅ *ORDER CONFIRMED*'
    });
    const extra = created.duplicate
      ? `\n\nYeh order pehle se confirm hai. Staff jaldi process karega.`
      : `\n\nShukriya! Aapka order lock ho gaya. Staff dashboard par dekh sakta hai. Kuch aur chahiye?`;
    return {
      cart: emptyCart(),
      next: 'done',
      reply: `${template}${extra}`,
      order: created.order,
      template
    };
  }

  if (hasItems && hasAddress) {
    cart.awaitingConfirm = true;
    await saveCart(tenantId, customerPhone, cart);
    const template = formatOrderTemplate({
      businessName,
      customerName,
      customerPhone,
      items: cart.items,
      address: cart.address,
      paymentMethod: 'Cash on Delivery',
      status: 'PENDING CONFIRMATION',
      headline: '🧾 *ORDER DETAILS — CONFIRM KAREIN*'
    });
    return {
      cart,
      next: 'ask_confirm',
      reply: `${template}\n\nAgar sab theek hai to *HAAN* likhein. Change ke liye item ya address dubara bhejein.`,
      order: null,
      template
    };
  }

  await saveCart(tenantId, customerPhone, cart);

  if (!hasItems) {
    return {
      cart,
      next: 'ask_product',
      reply: null,
      order: null,
      template: null
    };
  }
  if (!hasAddress) {
    return {
      cart,
      next: 'ask_address',
      reply: `${cart.items.map((i) => `${i.quantity}x ${i.productName}`).join(', ')} cart mein hai.\nAb complete delivery address bhejein (house, street, area, city).`,
      order: null,
      template: null
    };
  }
  return { cart, next: 'none', reply: null, order: null, template: null };
}

function parseGroqAction(reply) {
  const raw = String(reply || '');
  const fenced = raw.match(/<<<ORDER([\s\S]*?)ORDER>>>/i) || raw.match(/```orderjson\s*([\s\S]*?)```/i);
  if (!fenced) return { action: null, clean: raw.trim() };
  let action = null;
  try {
    action = JSON.parse(fenced[1].trim());
  } catch {
    action = null;
  }
  const clean = raw.replace(fenced[0], '').trim();
  return { action, clean };
}

module.exports = {
  loadCart,
  saveCart,
  clearCart,
  applyCustomerTurn,
  formatOrderTemplate,
  parseGroqAction,
  findProductsInText,
  isConfirm
};
