const { createOrder } = require('./orders-store.cjs');
const { getSupabaseConfig, isUuid, sbSelect, sbInsert, sbUpdate } = require('./supabase-rest.cjs');

async function getDraftStore() {
  try {
    const { getStore } = require('@netlify/blobs');
    return getStore('orderdesk-drafts');
  } catch {
    return null;
  }
}

function phoneKey(tenantId, phone) {
  return `tenant:${tenantId}:phone:${String(phone || '').replace(/\D/g, '') || 'unknown'}`;
}

function convKey(tenantId, conversationId) {
  return `tenant:${tenantId}:conv:${conversationId}`;
}

function emptyDraft() {
  return {
    items: [],
    selectedProductId: null,
    selectedProductName: null,
    pendingQuantity: null,
    deliveryAddress: '',
    paymentMethod: 'COD',
    notes: '',
    subtotal: 0,
    deliveryFee: 0,
    total: 0,
    awaiting: 'PRODUCT',
    confirmed: false,
    greeted: false,
    summaryPresented: false,
    lastOrderNumber: null,
    updatedAt: new Date().toISOString()
  };
}

function normalizeDraft(raw) {
  return { ...emptyDraft(), ...(raw || {}) };
}

async function loadDraft(tenantId, { customerPhone, conversationId } = {}) {
  const store = await getDraftStore();
  if (store) {
    try {
      if (conversationId) {
        const byConv = await store.get(convKey(tenantId, conversationId), { type: 'json' });
        if (byConv) return normalizeDraft(byConv);
      }
      const byPhone = await store.get(phoneKey(tenantId, customerPhone), { type: 'json' });
      if (byPhone) return normalizeDraft(byPhone);
    } catch {
      /* continue */
    }
  }
  if (getSupabaseConfig() && isUuid(tenantId)) {
    const { rows } = await sbSelect('order_drafts', {
      select: '*',
      business_id: `eq.${tenantId}`,
      customer_phone: `eq.${String(customerPhone || '')}`
    });
    if (rows[0]?.state) return normalizeDraft(rows[0].state);
    if (rows[0] && rows[0].items) return normalizeDraft(rows[0]);
  }
  return emptyDraft();
}

async function saveDraft(tenantId, draft, { customerPhone, conversationId } = {}) {
  const next = { ...normalizeDraft(draft), updatedAt: new Date().toISOString() };
  const store = await getDraftStore();
  if (store) {
    await store.setJSON(phoneKey(tenantId, customerPhone), next);
    if (conversationId) await store.setJSON(convKey(tenantId, conversationId), next);
  }
  if (getSupabaseConfig() && isUuid(tenantId) && customerPhone) {
    const payload = {
      business_id: tenantId,
      customer_phone: customerPhone,
      conversation_id: isUuid(conversationId) ? conversationId : null,
      state: next,
      awaiting: next.awaiting,
      updated_at: next.updatedAt
    };
    const existing = await sbSelect('order_drafts', {
      select: 'id',
      business_id: `eq.${tenantId}`,
      customer_phone: `eq.${customerPhone}`
    });
    if (existing.rows[0]) {
      await sbUpdate('order_drafts', { id: `eq.${existing.rows[0].id}` }, payload);
    } else {
      await sbInsert('order_drafts', payload);
    }
  }
  return next;
}

async function clearDraft(tenantId, refs) {
  const kept = { ...emptyDraft(), greeted: true };
  return saveDraft(tenantId, kept, refs);
}

const QTY_WORDS = {
  aik: 1, ek: 1, one: 1, do: 2, two: 2, teen: 3, three: 3,
  char: 4, chaar: 4, four: 4, panch: 5, paanch: 5, five: 5,
  che: 6, chhe: 6, six: 6, saat: 7, seven: 7, aath: 8, eight: 8,
  nau: 9, nine: 9, das: 10, ten: 10
};

function extractQuantity(text) {
  const raw = String(text || '').trim();
  if (!raw) return null;
  const explicit = raw.match(/(\d+)\s*(?:x|pcs?|pieces?|pair|pairs|qty|quantity|adad|dane)?/i);
  if (explicit) {
    const qty = Number(explicit[1]);
    if (qty >= 1 && qty <= 50) return qty;
  }
  const lower = raw.toLowerCase();
  for (const [word, qty] of Object.entries(QTY_WORDS)) {
    if (new RegExp(`(^|\\s)${word}(\\s|$)`, 'i').test(lower)) return qty;
  }
  return null;
}

function isGreetingOnly(text) {
  return /^(assalamu?[\s-]*alaikum|assalam[- ]?o[- ]?alaikum|salam|aoa|hello|hi|hey|slm)[\s!.,]*$/i.test(
    String(text || '').trim()
  );
}

function hasGreeting(text) {
  return /assalam|salaam|salam\b|aoa\b|hello\b|hi\b/i.test(String(text || ''));
}

function wantsCatalog(text) {
  const t = String(text || '').toLowerCase();
  return /catalog|menu bhejo|products dikhao|product list|kya kya hai|tumhare paas kya|saare product|sari list|poori list/.test(
    t
  );
}

function isPriceQuery(text) {
  const t = String(text || '').toLowerCase();
  const price = /kitne|kitna|price|rate|cost|how much|kya rate/.test(t);
  const buy = isPurchaseIntent(t);
  return price && !buy;
}

function isStockQuery(text) {
  const t = String(text || '').toLowerCase();
  return /\bstock\b|available hai|available hain|hai kya\b/.test(t) && !isPurchaseIntent(t);
}

function isPurchaseIntent(text) {
  return /\b(chahiye|chahiyein|lena hai|order kar|mangwana|bhej do|bhej dein|de dein|buy|i want|ye wala|order kardo|order kar do)\b/i.test(
    String(text || '')
  );
}

function isConfirmText(text) {
  const t = String(text || '').toLowerCase().trim();
  return /^(haan+|han+|ha+|yes+|ok+|okay+|ji+|jee+|g|theek|done|bilkul)(\s|$)/.test(t) ||
    /\b(confirm|confirm kar|order kar do|order kardo|kar dein|bhej dein|yes please|theek hai)\b/.test(t);
}

function isCancel(text) {
  return /\b(cancel|rakh do|mat bhejo|order cancel|don't want)\b/i.test(String(text || ''));
}

function isQuantityOnly(text) {
  const raw = String(text || '').trim();
  if (!raw) return false;
  if (/^(do|teen|char|chaar|aik|ek|panch|paanch|che|das)\s*(pcs?|pieces?|adad|dane)?$/i.test(raw)) {
    return true;
  }
  return /^\d+\s*(x|pcs?|pieces?|adad|dane|chahiye|chahiyein)?$/i.test(raw);
}

function looksLikeAddress(text) {
  const raw = String(text || '').trim();
  if (raw.length < 8) return false;
  const lower = raw.toLowerCase();
  if (/(?:address|pata|location|yahan bhej)\s*[:=-]/i.test(raw)) return true;
  const keywords = [
    'house', 'h#', 'street', 'gali', 'mohallah', 'block', 'phase', 'sector', 'flat',
    'apartment', 'road', 'chowk', 'colony', 'town', 'lahore', 'karachi', 'islamabad',
    'rawalpindi', 'faisalabad', 'multan', 'peshawar', 'sialkot', 'gujranwala', 'quetta',
    'hyderabad', 'near', 'bazar', 'dha', 'bahria', 'gulberg', 'johar', 'township',
    'cantt', 'kashmir', 'iqbal', 'model town', 'expo'
  ];
  return keywords.some((k) => lower.includes(k));
}

function extractAddress(text, awaitingAddress) {
  const raw = String(text || '').trim();
  const explicit = raw.match(/(?:address|pata|location|yahan bhej(?:\s*dein)?)\s*[:=-]?\s*(.+)/i);
  if (explicit && explicit[1].trim().length >= 6) return explicit[1].trim();
  if (looksLikeAddress(raw)) return raw;
  if (awaitingAddress && raw.length >= 8 && !isConfirmText(raw) && !isQuantityOnly(raw) && !isCancel(raw)) {
    return raw;
  }
  return '';
}

function unitPrice(product) {
  return Number(product.salePrice || product.price || 0);
}

function stockOf(product) {
  return Number(product.availableQuantity ?? product.stockQuantity ?? 0);
}

function distinctiveTokens(name) {
  return String(name || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 2 && !['the', 'and', 'for', 'with', 'black', 'white'].includes(t));
}

function searchProducts(products, query) {
  const active = (products || []).filter((p) => p.isActive !== false);
  const q = String(query || '').toLowerCase();
  if (!q.trim()) return [];
  const scored = [];
  for (const product of active) {
    const name = String(product.name || '').toLowerCase();
    const sku = String(product.sku || '').toLowerCase();
    let score = 0;
    if (name && q.includes(name)) score += 20;
    if (sku && sku.length >= 2 && q.includes(sku)) score += 18;
    for (const token of distinctiveTokens(product.name)) {
      if (token.length >= 3 && q.includes(token)) score += token.length >= 5 ? 4 : 2;
    }
    if (score > 0) scored.push({ product, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored;
}

function resolveProductMention(products, text) {
  const scored = searchProducts(products, text);
  if (!scored.length) return { matches: [], ambiguous: false };
  const top = scored[0];
  const close = scored.filter((row) => row.score >= Math.max(4, top.score - 2));
  if (close.length > 1 && close[0].score === close[1].score) {
    return { matches: close.map((r) => r.product), ambiguous: true };
  }
  if (top.score < 4) return { matches: [], ambiguous: false };
  return { matches: [top.product], ambiguous: false };
}

function findMultipleItems(products, text) {
  const parts = String(text || '').split(/\s+aur\s+|\s+and\s+|,\s*/i);
  if (parts.length < 2) return [];
  const items = [];
  for (const part of parts) {
    const resolved = resolveProductMention(products, part);
    if (resolved.matches.length === 1) {
      items.push({
        product: resolved.matches[0],
        quantity: extractQuantity(part)
      });
    }
  }
  return items.length >= 2 ? items : [];
}

function itemFromProduct(product, quantity) {
  const qty = Math.max(1, Number(quantity || 1));
  const price = unitPrice(product);
  return {
    productId: product.id,
    productName: product.name,
    sku: product.sku || '',
    unitPrice: price,
    quantity: qty,
    subtotal: price * qty
  };
}

function upsertItem(draft, product, quantity) {
  const items = [...(draft.items || [])];
  const existing = items.find((item) => item.productId === product.id);
  const qty = Math.max(1, Number(quantity || existing?.quantity || 1));
  if (existing) {
    existing.quantity = qty;
    existing.unitPrice = unitPrice(product);
    existing.subtotal = existing.quantity * existing.unitPrice;
  } else {
    items.push(itemFromProduct(product, qty));
  }
  draft.items = items;
  draft.selectedProductId = product.id;
  draft.selectedProductName = product.name;
  return draft;
}

function totals(draft, deliveryFee) {
  const subtotal = (draft.items || []).reduce((sum, item) => sum + Number(item.subtotal || 0), 0);
  const fee = Number(deliveryFee || draft.deliveryFee || 0);
  draft.subtotal = subtotal;
  draft.deliveryFee = fee;
  draft.total = Math.max(0, subtotal + fee);
  return draft;
}

function formatSummary(draft, { confirmed, orderNumber } = {}) {
  const lines = (draft.items || []).map((item) => `${item.productName} × ${item.quantity}`);
  const head = confirmed
    ? `Shukriya! 🎉 Aapka order ${orderNumber ? `#${orderNumber}` : ''} confirm ho gaya hai.`
    : 'Ji 👍\nOrder details:';
  return [
    head.trim(),
    lines.join('\n'),
    `Items: Rs. ${Number(draft.subtotal || 0).toLocaleString()}`,
    `Delivery: Rs. ${Number(draft.deliveryFee || 0).toLocaleString()}`,
    `Total: Rs. ${Number(draft.total || 0).toLocaleString()}`,
    `Address: ${draft.deliveryAddress || '-'}`,
    `Payment: ${draft.paymentMethod || 'COD'}`,
    confirmed ? '' : 'Order confirm kar doon?'
  ]
    .filter(Boolean)
    .join('\n');
}

function maybeGreet(draft, text, reply) {
  if (draft.greeted) return reply;
  draft.greeted = true;
  if (hasGreeting(text) || isGreetingOnly(text)) {
    return `Wa Alaikum Assalam! ${reply}`;
  }
  return reply;
}

function stripRepeatedGreeting(text) {
  return String(text || '')
    .replace(/^(wa\s*)?alaikum\s*assalam[!.,\s]*/i, '')
    .replace(/assalam[- ]?o[- ]?alaikum[^\n]*/gi, '')
    .replace(/welcome to[^\n]*/gi, '')
    .replace(/<<<ORDER[\s\S]*?ORDER>>>/g, '')
    .trim();
}

function nextMissing(draft) {
  if (!draft.items.length && !draft.selectedProductId) return 'PRODUCT';
  const qtyMissing = draft.items.some((item) => !item.quantity);
  if (!draft.items.length || qtyMissing) return 'QUANTITY';
  if (!String(draft.deliveryAddress || '').trim()) return 'ADDRESS';
  return 'CONFIRMATION';
}

function stockReply(product, qty) {
  const stock = stockOf(product);
  if (stock <= 0) {
    return {
      ok: false,
      reply: `Maazrat, ${product.name} filhaal out of stock hai. Koi aur item dekhna chahenge?`
    };
  }
  if (qty > stock) {
    return {
      ok: false,
      reply: `Is product ke sirf ${stock} piece available hain. Aap ${stock} lena chahenge?`,
      available: stock
    };
  }
  return { ok: true, stock };
}

async function applyCustomerTurn({
  tenantId,
  customerPhone,
  customerName,
  conversationId,
  text,
  products,
  businessName,
  deliveryFee = 0,
  persistOrder = true
}) {
  const refs = { customerPhone, conversationId };
  let draft = await loadDraft(tenantId, refs);
  const greetedBefore = Boolean(draft.greeted);
  const message = String(text || '').trim();
  const fee = Number(deliveryFee || 0);

  const done = (reply, extra = {}) => {
    draft = totals(draft, fee);
    return saveDraft(tenantId, draft, refs).then((saved) => ({
      draft: saved,
      cart: saved,
      next: saved.awaiting === 'CONFIRMATION' ? 'ask_confirm' : String(saved.awaiting || 'PRODUCT').toLowerCase(),
      reply,
      order: extra.order || null,
      skipGroq: extra.skipGroq !== false,
      greetedBefore
    }));
  };

  if (!message) {
    return done(null, { skipGroq: false });
  }

  if (isCancel(message)) {
    draft = { ...emptyDraft(), greeted: true };
    await saveDraft(tenantId, draft, refs);
    return {
      draft,
      cart: draft,
      next: 'ask_product',
      reply: 'Order cancel kar diya. Naya product bata dein.',
      order: null,
      skipGroq: true,
      greetedBefore
    };
  }

  if (isGreetingOnly(message)) {
    const reply = maybeGreet(
      draft,
      message,
      draft.greeted
        ? 'Ji, batayein.'
        : 'Ji, batayein aap kis product ke baare mein maloomat chahte hain?'
    );
    draft.awaiting = draft.items.length ? nextMissing(draft) : 'PRODUCT';
    return done(reply);
  }

  if (wantsCatalog(message)) {
    const active = (products || []).filter((p) => p.isActive !== false).slice(0, 12);
    const lines = active.map((p, i) => `${i + 1}) ${p.name} — Rs. ${unitPrice(p).toLocaleString()}`);
    const reply = maybeGreet(
      draft,
      message,
      lines.length
        ? `${lines.join('\n')}\n\nKaunsa item chahiye?`
        : 'Catalog abhi empty hai.'
    );
    draft.awaiting = 'PRODUCT';
    return done(reply);
  }

  if (draft.awaiting === 'CONFIRMATION' && isConfirmText(message) && draft.summaryPresented && draft.items.length && draft.deliveryAddress) {
    const blocked = draft.items
      .map((item) => {
        const product = (products || []).find((p) => p.id === item.productId);
        if (!product) return null;
        return stockReply(product, item.quantity);
      })
      .find((row) => row && !row.ok);
    if (blocked) {
      draft.awaiting = 'QUANTITY';
      draft.summaryPresented = false;
      return done(blocked.reply);
    }
    if (!persistOrder) {
      return done('Order ready hai, confirm ke baad place hoga.');
    }
    const created = await createOrder(tenantId, {
      customerName,
      customerPhone,
      items: draft.items,
      deliveryAddress: draft.deliveryAddress,
      notes: draft.notes,
      paymentMethod: draft.paymentMethod || 'COD',
      deliveryFee: fee,
      status: 'CONFIRMED',
      source: 'whatsapp_ai'
    });
    if (!created?.ok || !created.order) {
      return done('Maazrat, order create karte waqt issue aa gaya. Main dobara try karta hoon.');
    }
    const confirmedDraft = totals({ ...draft, confirmed: true }, fee);
    const reply = formatSummary(confirmedDraft, {
      confirmed: true,
      orderNumber: created.order.orderNumber
    });
    await clearDraft(tenantId, refs);
    return {
      draft: { ...emptyDraft(), greeted: true, lastOrderNumber: created.order.orderNumber },
      cart: emptyDraft(),
      next: 'done',
      reply: created.duplicate
        ? `Yeh order pehle se confirm hai: #${created.order.orderNumber}.`
        : reply,
      order: created.order,
      skipGroq: true,
      greetedBefore
    };
  }

  if (draft.awaiting === 'QUANTITY' && isConfirmText(message) && extractQuantity(message) == null) {
    return done('Ji, quantity kitni chahiye? Misal ke taur par 2 pieces.');
  }

  const qty = extractQuantity(message);
  const address = extractAddress(message, draft.awaiting === 'ADDRESS');
  if (address) draft.deliveryAddress = address;

  const multi = findMultipleItems(products, message);
  if (multi.length) {
    for (const row of multi) {
      const check = stockReply(row.product, row.quantity || 1);
      if (!check.ok) return done(maybeGreet(draft, message, check.reply));
      upsertItem(draft, row.product, row.quantity || 1);
    }
  } else {
    const resolved = resolveProductMention(products, message);
    if (resolved.ambiguous) {
      const names = resolved.matches.map((p) => p.name).join(', ');
      return done(maybeGreet(draft, message, `Kaunsa wala chahiye: ${names}?`));
    }
    if (resolved.matches.length === 1) {
      const product = resolved.matches[0];
      if (isPriceQuery(message) && !isPurchaseIntent(message) && draft.awaiting === 'PRODUCT' && !draft.items.length) {
        return done(
          maybeGreet(draft, message, `${product.name} Rs. ${unitPrice(product).toLocaleString()} ke hain.`)
        );
      }
      if (isStockQuery(message) && !isPurchaseIntent(message) && draft.awaiting === 'PRODUCT' && !draft.items.length) {
        const stock = stockOf(product);
        return done(
          maybeGreet(
            draft,
            message,
            stock > 0 ? `${product.name} available hain (${stock} stock).` : `${product.name} out of stock hain.`
          )
        );
      }
      const nextQty = qty || (isQuantityOnly(message) ? qty : null);
      if (nextQty) {
        const check = stockReply(product, nextQty);
        if (!check.ok) return done(maybeGreet(draft, message, check.reply));
        upsertItem(draft, product, nextQty);
      } else if (isPurchaseIntent(message) || draft.awaiting === 'PRODUCT' || !draft.selectedProductId) {
        draft.selectedProductId = product.id;
        draft.selectedProductName = product.name;
        draft.awaiting = 'QUANTITY';
        return done(
          maybeGreet(
            draft,
            message,
            `${product.name} Rs. ${unitPrice(product).toLocaleString()} hain. Kitni quantity chahiye?`
          )
        );
      }
    } else if (draft.awaiting === 'QUANTITY' && qty && draft.selectedProductId) {
      const product = (products || []).find((p) => p.id === draft.selectedProductId);
      if (product) {
        const check = stockReply(product, qty);
        if (!check.ok) return done(check.reply);
        upsertItem(draft, product, qty);
      }
    } else if (draft.awaiting === 'QUANTITY' && isQuantityOnly(message) && draft.selectedProductId) {
      const product = (products || []).find((p) => p.id === draft.selectedProductId);
      if (!qty) return done('Ji, quantity kitni chahiye? Misal ke taur par 2 pieces.');
      if (product) {
        const check = stockReply(product, qty);
        if (!check.ok) return done(check.reply);
        upsertItem(draft, product, qty);
      }
    }
  }

  draft = totals(draft, fee);
  draft.awaiting = nextMissing(draft);

  if (draft.awaiting === 'QUANTITY' && draft.selectedProductName) {
    return done(`Ji, ${draft.selectedProductName} ke kitne pieces chahiye?`);
  }

  if (draft.awaiting === 'ADDRESS' && draft.items.length) {
    const listed = draft.items.map((i) => `${i.quantity}x ${i.productName}`).join(', ');
    return done(`Ji, ${listed} note kar liye. Delivery address bata dein.`);
  }

  if (draft.awaiting === 'CONFIRMATION' && draft.items.length && draft.deliveryAddress) {
    draft.summaryPresented = true;
    draft.paymentMethod = draft.paymentMethod || 'COD';
    return done(formatSummary(draft));
  }

  if (!draft.items.length && !draft.selectedProductId) {
    if (isPurchaseIntent(message) || qty) {
      return done(maybeGreet(draft, message, 'Kaunsa product chahiye? Catalog ke liye "products dikhao" likhein.'));
    }
    return done(null, { skipGroq: false });
  }

  return done(null, { skipGroq: false });
}

function formatDraftForPrompt(draft) {
  if (!draft) return '(empty)';
  return JSON.stringify(
    {
      items: draft.items,
      selectedProductName: draft.selectedProductName,
      deliveryAddress: draft.deliveryAddress || null,
      awaiting: draft.awaiting,
      greeted: Boolean(draft.greeted),
      summaryPresented: Boolean(draft.summaryPresented),
      totals: { subtotal: draft.subtotal, deliveryFee: draft.deliveryFee, total: draft.total }
    },
    null,
    2
  );
}

module.exports = {
  emptyDraft,
  loadDraft,
  saveDraft,
  clearDraft,
  applyCustomerTurn,
  formatSummary,
  formatDraftForPrompt,
  searchProducts,
  stripRepeatedGreeting,
  wantsCatalog,
  isConfirmText
};
