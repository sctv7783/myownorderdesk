const { createOrder } = require('./orders-store.cjs');
const { getSupabaseConfig, isUuid, sbSelect, sbInsert, sbUpdate } = require('./supabase-rest.cjs');

const memoryDrafts = new Map();

function resetMemoryDrafts() {
  memoryDrafts.clear();
}

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
    deliveryCity: '',
    customerName: '',
    paymentMethod: 'COD',
    notes: '',
    subtotal: 0,
    deliveryFee: 0,
    total: 0,
    awaiting: 'PRODUCT',
    currentIntent: 'UNKNOWN',
    lastIntent: null,
    lastUserQuestion: null,
    lastAssistantAction: null,
    confirmationRequired: true,
    orderConfirmed: false,
    orderCreated: false,
    confirmationVersion: 0,
    lastGreetingSentAt: null,
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

function draftScore(draft) {
  if (!draft) return -1;
  return (
    (draft.items?.length || 0) * 10 +
    (draft.selectedProductId ? 3 : 0) +
    (draft.deliveryAddress ? 4 : 0) +
    (draft.greeted ? 1 : 0) +
    (draft.summaryPresented ? 2 : 0)
  );
}

function pickRicherDraft(...drafts) {
  return drafts.filter(Boolean).sort((a, b) => draftScore(b) - draftScore(a))[0] || emptyDraft();
}

async function loadDraft(tenantId, { customerPhone, conversationId, isolated } = {}) {
  const found = [];
  if (isolated) {
    const key = convKey(tenantId, conversationId || `iso_${customerPhone}`);
    const mem = memoryDrafts.get(key);
    if (mem) return normalizeDraft(mem);
    const store = await getDraftStore();
    if (store && conversationId) {
      try {
        const byConv = await store.get(key, { type: 'json' });
        if (byConv) return normalizeDraft(byConv);
      } catch {
        /* continue */
      }
    }
    return emptyDraft();
  }
  const memConv = conversationId ? memoryDrafts.get(convKey(tenantId, conversationId)) : null;
  const memPhone = memoryDrafts.get(phoneKey(tenantId, customerPhone));
  if (memConv) found.push(normalizeDraft(memConv));
  if (memPhone) found.push(normalizeDraft(memPhone));
  const store = await getDraftStore();
  if (store) {
    try {
      if (conversationId) {
        const byConv = await store.get(convKey(tenantId, conversationId), { type: 'json' });
        if (byConv) found.push(normalizeDraft(byConv));
      }
      const byPhone = await store.get(phoneKey(tenantId, customerPhone), { type: 'json' });
      if (byPhone) found.push(normalizeDraft(byPhone));
    } catch {
      /* continue */
    }
  }
  if (getSupabaseConfig() && isUuid(tenantId)) {
    const digits = String(customerPhone || '').replace(/\D/g, '');
    const { rows } = await sbSelect('order_drafts', {
      select: '*',
      business_id: `eq.${tenantId}`
    });
    const match =
      (rows || []).find((row) => digits && String(row.customer_phone || '').replace(/\D/g, '') === digits) ||
      (conversationId
        ? (rows || []).find((row) => row.conversation_id === conversationId)
        : null);
    if (match?.state) found.push(normalizeDraft(match.state));
  }
  return pickRicherDraft(...found);
}

async function saveDraft(tenantId, draft, { customerPhone, conversationId, isolated } = {}) {
  const next = { ...normalizeDraft(draft), updatedAt: new Date().toISOString() };
  if (isolated) {
    const key = convKey(tenantId, conversationId || `iso_${customerPhone}`);
    memoryDrafts.set(key, next);
    const store = await getDraftStore();
    if (store) await store.setJSON(key, next);
    return next;
  }
  memoryDrafts.set(phoneKey(tenantId, customerPhone), next);
  if (conversationId) memoryDrafts.set(convKey(tenantId, conversationId), next);
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

async function clearDraft(tenantId, refs, extras = {}) {
  const kept = {
    ...emptyDraft(),
    greeted: true,
    lastOrderNumber: extras.lastOrderNumber || null,
    orderCreated: Boolean(extras.lastOrderNumber),
    lastGreetingSentAt: extras.lastGreetingSentAt || null
  };
  return saveDraft(tenantId, kept, refs);
}

const QTY_WORDS = {
  aik: 1, ek: 1, one: 1, do: 2, two: 2, teen: 3, three: 3,
  char: 4, chaar: 4, four: 4, panch: 5, paanch: 5, five: 5,
  che: 6, chhe: 6, six: 6, saat: 7, seven: 7, aath: 8, eight: 8,
  nau: 9, nine: 9, das: 10, ten: 10
};

function extractQuantity(text) {
  const raw = String(text || '')
    .replace(/(?:product(?:\s*(?:number|no\.?|#))?|item|number|no\.?|#)\s*\d+/gi, ' ')
    .replace(/\b\d+\s*(?:wala|wali|wale)\b/gi, ' ')
    .trim();
  if (!raw) return null;
  const cued = raw.match(
    /(?<![A-Za-z0-9])(\d+)\s*(?:x|pcs?|pieces?|pair|pairs|qty|quantity|adad|dane|chahiye|chahiyein|kar do|kar dein)\b/i
  );
  if (cued) {
    const qty = Number(cued[1]);
    if (qty >= 1 && qty <= 9999) return qty;
  }
  const keQty = raw.match(/\b(?:ke|ki|of)\s+(\d+)\b/i);
  if (keQty) {
    const qty = Number(keQty[1]);
    if (qty >= 1 && qty <= 9999) return qty;
  }
  const leading = raw.match(/^(?:sirf|only|bs|just)?\s*(\d+)\s+(.+)$/i);
  if (leading) {
    const qty = Number(leading[1]);
    const rest = String(leading[2] || '').trim();
    const restIsAddress = looksLikeAddress(rest);
    const qtyThenHouse = /^(house|h#|flat|plot|apartment)\b/i.test(rest);
    if (qty >= 1 && qty <= 9999 && (!restIsAddress || qtyThenHouse) && /[a-z]/i.test(rest)) {
      return qty;
    }
  }
  if (looksLikeAddress(raw) && !isQuantityOnly(raw)) return null;
  if (isQuantityOnly(raw)) {
    const n = Number(String(raw).replace(/[^\d]/g, ''));
    if (n >= 1 && n <= 9999) return n;
    const lower = raw.toLowerCase();
    for (const [word, qty] of Object.entries(QTY_WORDS)) {
      if (new RegExp(`(^|\\s)${word}(\\s|$)`, 'i').test(lower)) return qty;
    }
  }
  const trailing = raw.match(/(?<![A-Za-z0-9])(\d+)\s*$/);
  if (trailing && /[a-z]/i.test(raw) && !looksLikeAddress(raw)) {
    const qty = Number(trailing[1]);
    if (qty >= 1 && qty <= 50) return qty;
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

function wantsPhotos(text) {
  const t = String(text || '').toLowerCase();
  return /photo|photos|pic\b|pics\b|picture|image|images|tasveer|tasvir|📷|📸|bhyj|bhejo|bhejna|bhyjna|bhyjo/.test(
    t
  ) && /photo|pic|tasveer|tasvir|image|picture|📷|📸/.test(t);
}

function isPurchaseIntent(text) {
  if (wantsPhotos(text)) return false;
  return /\b(chahiye|chahiyein|lena hai|order kar|mangwana|buy|i want|ye wala|order kardo|order kar do)\b/i.test(
    String(text || '')
  );
}

function isConfirmText(text) {
  const t = String(text || '').toLowerCase().trim();
  if (looksLikeAddress(t) && !/^(haan|han|yes|ok|okay|theek|confirm)\b/.test(t)) return false;
  return /^(haan+|han+|ha+|yes+|ok+|okay+|theek hai|done|bilkul|confirm)(\s|$)/.test(t) ||
    /\b(order confirm|confirm kar(?:o| do| dein)?)\b/.test(t);
}

function isCancel(text) {
  return /\b(cancel|rakh do|mat bhejo|order cancel|don't want|cancel kar)\b/i.test(String(text || ''));
}

function isOrderStatusQuery(text) {
  return /#?\s*ord[- ]?\d+|order\s*(#|no\.?|number)|kahan (hai|pohancha|pohncha|pohcha)|track(ing)?|status mera|mera order/i.test(
    String(text || '')
  );
}

function isGeneralQuery(text) {
  const t = String(text || '');
  if (isPurchaseIntent(t) || isQuantityOnly(t) || looksLikeAddress(t) || wantsPhotos(t) || isCancel(t)) {
    return false;
  }
  return /kitne din|delivery time|eta|hours|timing|payment|cod\b|kahan deliver|policy|refund|warranty|kitne din mein/i.test(
    t
  );
}

function isUpdateQuantity(text) {
  const t = String(text || '').toLowerCase();
  return /\b(kar do|kar dein|update|change|badal|bana do)\b/.test(t) && extractQuantity(t) != null;
}

function stripGreetingPrefix(text) {
  return String(text || '')
    .replace(
      /^(assalamu?[\s-]*alaikum|assalam[- ]?o[- ]?alaikum|wa\s*alaikum\s*assalam|salaam|salam|aoa|hello|hi|hey|slm)[\s!,.]*/i,
      ''
    )
    .replace(/^[,:-]\s*/, '')
    .trim();
}

function rememberedProduct(draft, products) {
  if (draft.selectedProductId) {
    const hit = (products || []).find((p) => p.id === draft.selectedProductId);
    if (hit) return hit;
  }
  if (draft.items?.length) {
    const last = draft.items[draft.items.length - 1];
    return (products || []).find((p) => p.id === last.productId) || null;
  }
  return null;
}

function isQuantityOnly(text) {
  const raw = String(text || '').trim();
  if (!raw) return false;
  if (/^(sirf|only|bs|just)?\s*(do|teen|char|chaar|aik|ek|panch|paanch|che|das)\s*(pcs?|pieces?|adad|dane)?$/i.test(raw)) {
    return true;
  }
  return /^(sirf|only|bs|just)?\s*\d+\s*(x|pcs?|pieces?|adad|dane|chahiye|chahiyein)?$/i.test(raw);
}

function activeCatalog(products) {
  return (products || []).filter((p) => p.isActive !== false);
}

function resolveCatalogNumber(products, text) {
  const raw = String(text || '');
  const match =
    raw.match(/(?:product(?:\s*(?:number|no\.?))?|item|number|no\.?|#)\s*(\d+)/i) ||
    raw.match(/\b(\d+)\s*(?:wala|wali|wale)\b/i);
  if (!match) return null;
  const index = Number(match[1]);
  const list = activeCatalog(products);
  if (!index || index < 1 || index > list.length) return null;
  return list[index - 1];
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
  if (looksLikeAddress(raw)) {
    const start = raw.search(
      /\b(house|h#|street|gali|mohallah|block|phase|sector|flat|apartment|road|chowk|colony|town|lahore|karachi|islamabad|rawalpindi|faisalabad|multan|peshawar|sialkot|gujranwala|quetta|hyderabad|near|bazar|dha|bahria|gulberg|johar|township|cantt|model town|expo)\b/i
    );
    if (start > 0) return raw.slice(start).trim();
    return raw;
  }
  if (awaitingAddress && raw.length >= 8 && !isConfirmText(raw) && !isQuantityOnly(raw) && !isCancel(raw)) {
    if (extractQuantity(raw) && !looksLikeAddress(raw)) return '';
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

function editDistance(a, b) {
  const s = String(a || '');
  const t = String(b || '');
  if (s === t) return 0;
  if (!s.length) return t.length;
  if (!t.length) return s.length;
  const row = Array.from({ length: t.length + 1 }, (_, i) => i);
  for (let i = 1; i <= s.length; i += 1) {
    let prev = i - 1;
    row[0] = i;
    for (let j = 1; j <= t.length; j += 1) {
      const cur = row[j];
      row[j] = s[i - 1] === t[j - 1] ? prev : Math.min(prev, row[j], row[j - 1]) + 1;
      prev = cur;
    }
  }
  return row[t.length];
}

function searchProducts(products, query) {
  const active = (products || []).filter((p) => p.isActive !== false);
  const q = String(query || '').toLowerCase();
  if (!q.trim()) return [];
  const qTokens = q.split(/[^a-z0-9]+/).filter((t) => t.length >= 3);
  const scored = [];
  for (const product of active) {
    const name = String(product.name || '').toLowerCase();
    const sku = String(product.sku || '').toLowerCase();
    let score = 0;
    if (name && q.includes(name)) score += 20;
    if (sku && sku.length >= 2 && q.includes(sku)) score += 18;
    for (const token of distinctiveTokens(product.name)) {
      if (token.length >= 3 && q.includes(token)) score += token.length >= 5 ? 4 : 2;
      for (const qt of qTokens) {
        if (token.length >= 5 && qt.length >= 5 && editDistance(token, qt) <= 2) score += 3;
      }
    }
    if (score > 0) scored.push({ product, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored;
}

function resolveProductMention(products, text) {
  const byNumber = resolveCatalogNumber(products, text);
  if (byNumber) return { matches: [byNumber], ambiguous: false };
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
    ? `Shukriya${draft.customerName && !isPlaceholderName(draft.customerName) ? ` ${draft.customerName}` : ''}! 🎉 Aapka order ${orderNumber ? `#${orderNumber}` : ''} confirm ho gaya hai.`
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
    .replace(/<<<META[\s\S]*?META>>>/gi, '')
    .replace(/<<<ORDER[\s\S]*?ORDER>>>/gi, '')
    .replace(/<send_images>[\s\S]*?(<\/send_images>|$)/gi, '')
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/Is product ki photo catalog mein save nahi hai[^\n]*/gi, '')
    .replace(/photos?\s+whatsapp\s+pe\s+bhej\s+rah[^\n]*/gi, '')
    .replace(/photo(s)? (bhej raha|send kar raha)[^\n]*/gi, '')
    .replace(/^(wa\s*)?alaikum\s*assalam[!.,\s]*/i, '')
    .replace(/assalam[- ]?o[- ]?alaikum[^\n]*/gi, '')
    .replace(/welcome to[^\n]*/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function looksLikeCatalogDump(text) {
  const t = String(text || '');
  const numbered = (t.match(/^\s*\d+\s*[).:-]/gm) || []).length;
  return numbered >= 6 || /quick list of our items|products available:|let me know which item/i.test(t);
}

function isPlaceholderName(name) {
  const n = String(name || '').trim();
  if (!n) return true;
  if (/^customer(\s+\d+)?$/i.test(n)) return true;
  if (/^Customer\s+\d{2,4}$/.test(n)) return true;
  if (/\[name\]|\{name\}/i.test(n)) return true;
  return false;
}

function extractPersonName(text) {
  const raw = String(text || '')
    .replace(/^(mera naam|my name is|name is|i am|main)\s+/i, '')
    .replace(/[.,!]+$/g, '')
    .trim();
  if (raw.length < 2 || raw.length > 48) return '';
  if (extractQuantity(raw) && isQuantityOnly(raw)) return '';
  if (looksLikeAddress(raw)) return '';
  if (/\d{5,}/.test(raw)) return '';
  return raw;
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
      reply: `Maazrat, ${product.name} filhaal out of stock hai.`
    };
  }
  if (qty > stock) {
    return {
      ok: false,
      reply: `Filhaal ${product.name} ke sirf ${stock} pieces available hain. Kya aap ${stock} lena chahenge?`,
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
  persistOrder = true,
  history = [],
  isolated = false,
  savedAddress = ''
}) {
  const refs = { customerPhone, conversationId, isolated };
  let draft = await loadDraft(tenantId, refs);
  const message = String(text || '').trim();
  let historyForHydrate = Array.isArray(history) ? history : [];
  if (message && historyForHydrate.length) {
    const last = historyForHydrate[historyForHydrate.length - 1];
    if (last?.sender === 'CUSTOMER' && String(last.text || '').trim() === message) {
      historyForHydrate = historyForHydrate.slice(0, -1);
    }
  }
  if (
    historyForHydrate.length &&
    !draft.items.length &&
    !draft.selectedProductId &&
    !draft.deliveryAddress
  ) {
    draft = hydrateDraftFromHistory(draft, products, historyForHydrate);
  }
  const priorCustomer = (Array.isArray(history) ? history : []).filter(
    (m) => m.sender === 'CUSTOMER' && String(m.text || '').trim() !== message
  );
  const greetedBefore = Boolean(draft.greeted) || priorCustomer.length > 0;
  if (priorCustomer.length) draft.greeted = true;
  if (!isPlaceholderName(customerName) && isPlaceholderName(draft.customerName)) {
    draft.customerName = customerName;
  }
  const fee = Number(deliveryFee || 0);

  const done = (reply, extra = {}) => {
    draft.currentIntent = extra.intent || draft.currentIntent || 'UNKNOWN';
    draft.lastIntent = draft.currentIntent;
    draft.lastUserQuestion = message;
    draft.lastAssistantAction = extra.action || (reply ? 'reply' : 'defer_to_groq');
    draft.confirmationRequired = draft.awaiting === 'CONFIRMATION';
    draft = totals(draft, fee);
    return saveDraft(tenantId, draft, refs).then((saved) => ({
      draft: saved,
      cart: saved,
      next: saved.awaiting === 'CONFIRMATION' ? 'ask_confirm' : String(saved.awaiting || 'PRODUCT').toLowerCase(),
      reply,
      order: extra.order || null,
      skipGroq: extra.skipGroq !== false,
      greetedBefore,
      intent: saved.currentIntent
    }));
  };

  if (!message) {
    return done(null, { skipGroq: false, intent: 'UNKNOWN' });
  }

  if (isOrderStatusQuery(message)) {
    draft.currentIntent = 'ORDER_STATUS';
    return done(null, { skipGroq: false, intent: 'ORDER_STATUS', action: 'order_status' });
  }

  if (isGeneralQuery(message)) {
    return done(null, { skipGroq: false, intent: 'GENERAL_QUERY', action: 'general_query' });
  }

  if (wantsPhotos(message)) {
    const resolved = resolveProductMention(products, message);
    if (resolved.matches.length === 1) {
      draft.selectedProductId = resolved.matches[0].id;
      draft.selectedProductName = resolved.matches[0].name;
    }
    return done(null, { skipGroq: false, intent: 'PRODUCT_INQUIRY', action: 'send_photos' });
  }

  if (isQuantityOnly(message) && Number(String(message).replace(/[^\d]/g, '')) === 0) {
    return done('Kam az kam 1 piece likhein.', { intent: 'UPDATE_QUANTITY' });
  }

  if (isCancel(message)) {
    const greetingAt = draft.lastGreetingSentAt;
    draft = { ...emptyDraft(), greeted: true, lastGreetingSentAt: greetingAt };
    await saveDraft(tenantId, draft, refs);
    return {
      draft,
      cart: draft,
      next: 'ask_product',
      reply: 'Order cancel kar diya. Naya product bata dein.',
      order: null,
      skipGroq: true,
      greetedBefore,
      intent: 'CANCEL_ORDER'
    };
  }

  if (isGreetingOnly(message)) {
    if (!draft.items.length) {
      draft.selectedProductId = null;
      draft.selectedProductName = null;
      draft.awaiting = 'PRODUCT';
    }
    if (draft.lastGreetingSentAt) {
      draft.greeted = true;
      return done('Ji, batayein — product, price, photo, ya order.', { intent: 'GREETING' });
    }
    draft.lastGreetingSentAt = new Date().toISOString();
    const reply = maybeGreet(draft, message, 'Ji, batayein aap kis product ke baare mein maloomat chahte hain?');
    draft.greeted = true;
    draft.awaiting = draft.items.length ? nextMissing(draft) : 'PRODUCT';
    return done(reply, { intent: 'GREETING' });
  }

  let working = message;
  if (hasGreeting(working) && !isGreetingOnly(working)) {
    if (!draft.lastGreetingSentAt) draft.lastGreetingSentAt = new Date().toISOString();
    working = stripGreetingPrefix(working) || working;
  }

  if (wantsCatalog(working)) {
    const active = (products || []).filter((p) => p.isActive !== false).slice(0, 40);
    const lines = active.map((p, i) => `${i + 1}) ${p.name} — Rs. ${unitPrice(p).toLocaleString()}`);
    const reply = maybeGreet(
      draft,
      message,
      lines.length ? `${lines.join('\n')}\n\nKaunsa item chahiye?` : 'Catalog abhi empty hai.'
    );
    draft.awaiting = 'PRODUCT';
    return done(reply, { intent: 'PRODUCT_SEARCH' });
  }

  const canConfirm =
    draft.awaiting === 'CONFIRMATION' &&
    draft.summaryPresented &&
    draft.items.length &&
    String(draft.deliveryAddress || '').trim() &&
    isConfirmText(working);

  if (isConfirmText(working) && extractQuantity(working) == null && !canConfirm) {
    if (draft.savedAddressOffer && (draft.awaiting === 'ADDRESS' || draft.items.length) && !String(draft.deliveryAddress || '').trim()) {
      draft.deliveryAddress = draft.savedAddressOffer;
      draft.awaiting = 'CONFIRMATION';
    } else if (draft.orderCreated && draft.lastOrderNumber && !draft.items.length) {
      return done(`Yeh order pehle se confirm hai: #${draft.lastOrderNumber}.`, {
        intent: 'CONFIRM_ORDER'
      });
    }
    if (!draft.items.length && !draft.selectedProductId) {
      return done('Kya confirm karun? Product name bata dein.', { intent: 'CONFIRM_ORDER' });
    }
    draft.awaiting = nextMissing(draft);
    if (draft.awaiting === 'QUANTITY') {
      return done('Ji, quantity kitni chahiye? Misal ke taur par 2 pieces.', { intent: 'UPDATE_QUANTITY' });
    }
    if (draft.awaiting === 'ADDRESS' && !String(draft.deliveryAddress || '').trim()) {
      return done('Pehle delivery address bhej dein, phir confirm karunga.', { intent: 'PROVIDE_ADDRESS' });
    }
  }

  if (canConfirm) {
    const blocked = draft.items
      .map((item) => {
        const product = (products || []).find((p) => p.id === item.productId);
        if (!product) return { ok: false, reply: `${item.productName} catalog se match nahi hua.` };
        return stockReply(product, item.quantity);
      })
      .find((row) => row && !row.ok);
    if (blocked) {
      draft.awaiting = 'QUANTITY';
      draft.summaryPresented = false;
      return done(blocked.reply, { intent: 'UPDATE_QUANTITY' });
    }
    if (!persistOrder) {
      return done('Order ready hai, confirm ke baad place hoga.', { intent: 'CONFIRM_ORDER' });
    }
    draft.confirmationVersion = Number(draft.confirmationVersion || 0) + 1;
    const created = await createOrder(tenantId, {
      customerName: draft.customerName || customerName,
      customerPhone,
      items: draft.items,
      deliveryAddress: draft.deliveryAddress,
      notes: `${draft.notes || ''} conv:${conversationId || ''} v:${draft.confirmationVersion}`.trim(),
      paymentMethod: draft.paymentMethod || 'COD',
      deliveryFee: fee,
      status: 'CONFIRMED',
      source: 'whatsapp_ai'
    });
    if (!created?.ok || !created.order) {
      return done('Maazrat, order create karte waqt issue aa gaya. Main dobara try karta hoon.', {
        intent: 'CONFIRM_ORDER'
      });
    }
    const confirmedDraft = totals({ ...draft, confirmed: true, orderConfirmed: true, orderCreated: true }, fee);
    const reply = created.duplicate
      ? `Yeh order pehle se confirm hai: #${created.order.orderNumber}.`
      : formatSummary(confirmedDraft, { confirmed: true, orderNumber: created.order.orderNumber });
    await clearDraft(tenantId, refs, { lastOrderNumber: created.order.orderNumber });
    return {
      draft: {
        ...emptyDraft(),
        greeted: true,
        lastOrderNumber: created.order.orderNumber,
        orderCreated: true
      },
      cart: emptyDraft(),
      next: 'done',
      reply,
      order: created.order,
      skipGroq: true,
      greetedBefore,
      intent: 'CONFIRM_ORDER'
    };
  }

  const qty = extractQuantity(working);
  let address = looksLikeAddress(working) || draft.awaiting === 'ADDRESS'
    ? extractAddress(working, draft.awaiting === 'ADDRESS' || Boolean(draft.items.length))
    : '';
  if (address) {
    draft.deliveryAddress = address;
    const cityMatch = address.match(
      /(lahore|karachi|islamabad|rawalpindi|faisalabad|multan|peshawar|sialkot|gujranwala|quetta|hyderabad)/i
    );
    if (cityMatch) draft.deliveryCity = cityMatch[1];
  }

  const multi = findMultipleItems(products, working);
  if (multi.length) {
    for (const row of multi) {
      const check = stockReply(row.product, row.quantity || 1);
      if (!check.ok) return done(maybeGreet(draft, message, check.reply), { intent: 'ADD_TO_CART' });
      upsertItem(draft, row.product, row.quantity || 1);
    }
  } else {
    const resolved = resolveProductMention(products, working);
    const addressOnly = Boolean(address) && !qty && resolved.matches.length === 0 && !isPurchaseIntent(working);
    if (resolved.ambiguous && !addressOnly) {
      const names = resolved.matches.map((p) => p.name).join(', ');
      return done(maybeGreet(draft, message, `Kaunsa wala chahiye: ${names}?`), {
        intent: 'PRODUCT_SEARCH'
      });
    }
    if (!addressOnly && resolved.matches.length === 1) {
      const product = resolved.matches[0];
      draft.selectedProductId = product.id;
      draft.selectedProductName = product.name;
      if (isPriceQuery(working) && !isPurchaseIntent(working) && !qty) {
        draft.awaiting = 'QUANTITY';
        return done(
          maybeGreet(draft, message, `${product.name} Rs. ${unitPrice(product).toLocaleString()} ke hain.`),
          { intent: 'PRODUCT_INQUIRY' }
        );
      }
      if (isStockQuery(working) && !isPurchaseIntent(working) && !qty) {
        const stock = stockOf(product);
        draft.awaiting = 'QUANTITY';
        return done(
          maybeGreet(
            draft,
            message,
            stock > 0 ? `${product.name} available hain (${stock} stock).` : `${product.name} out of stock hain.`
          ),
          { intent: 'PRODUCT_INQUIRY' }
        );
      }
      const nextQty = qty || draft.pendingQuantity;
      if (nextQty) {
        const check = stockReply(product, nextQty);
        if (!check.ok) return done(maybeGreet(draft, message, check.reply), { intent: 'ADD_TO_CART' });
        upsertItem(draft, product, nextQty);
        draft.pendingQuantity = null;
      } else if (isPurchaseIntent(working) || draft.awaiting === 'PRODUCT') {
        draft.awaiting = 'QUANTITY';
        return done(
          maybeGreet(
            draft,
            message,
            `${product.name} Rs. ${unitPrice(product).toLocaleString()} hain. Kitni quantity chahiye?`
          ),
          { intent: 'ADD_TO_CART' }
        );
      }
    } else if (!addressOnly) {
      const remembered = rememberedProduct(draft, products);
      if (qty && remembered) {
        const check = stockReply(remembered, qty);
        if (!check.ok) return done(check.reply, { intent: 'UPDATE_QUANTITY' });
        upsertItem(draft, remembered, qty);
      } else if (isQuantityOnly(working) && remembered) {
        return done('Ji, quantity kitni chahiye? Misal ke taur par 2 pieces.', {
          intent: 'UPDATE_QUANTITY'
        });
      } else if (qty && !remembered) {
        draft.pendingQuantity = qty;
        return done(
          maybeGreet(draft, message, `Ji, quantity ${qty} note kar li. Kaunsa product chahiye?`),
          { intent: 'PRODUCT_SEARCH' }
        );
      } else if (isPurchaseIntent(working) && !remembered) {
        return done(
          maybeGreet(
            draft,
            message,
            'Maazrat, yeh item current catalog mein available nahi hai. Agar aap chahein to main available products dikha deta hoon.'
          ),
          { intent: 'PRODUCT_SEARCH' }
        );
      }
    }
  }

  draft = totals(draft, fee);
  draft.awaiting = nextMissing(draft);

  if (draft.awaiting === 'QUANTITY' && draft.selectedProductName) {
    return done(`Ji, ${draft.selectedProductName} ke kitne pieces chahiye?`, { intent: 'UPDATE_QUANTITY' });
  }

  if (draft.awaiting === 'ADDRESS' && draft.items.length) {
    const listed = draft.items.map((i) => `${i.quantity}x ${i.productName}`).join(', ');
    const known = String(savedAddress || draft.savedAddressOffer || '').trim();
    if (known && !String(draft.deliveryAddress || '').trim()) {
      draft.savedAddressOffer = known;
      return done(
        maybeGreet(
          draft,
          message,
          `Ji, ${listed} note kar liye. Aapka saved delivery address ${known} hai. Isi address par bhejna hai?`
        ),
        { intent: 'PROVIDE_ADDRESS' }
      );
    }
    return done(maybeGreet(draft, message, `Ji, ${listed} note kar liye. Delivery address bata dein.`), {
      intent: 'ADD_TO_CART'
    });
  }

  if (draft.awaiting === 'CONFIRMATION' && draft.items.length && draft.deliveryAddress) {
    draft.summaryPresented = true;
    draft.paymentMethod = draft.paymentMethod || 'COD';
    draft.confirmationRequired = true;
    return done(maybeGreet(draft, message, formatSummary(draft)), { intent: 'CONFIRM_ORDER' });
  }

  if (!draft.items.length && !draft.selectedProductId) {
    if (isPurchaseIntent(working) || qty) {
      return done(
        maybeGreet(draft, message, 'Kaunsa product chahiye? Catalog ke liye "products dikhao" likhein.'),
        { intent: 'PRODUCT_SEARCH' }
      );
    }
    return done(null, { skipGroq: false, intent: 'UNKNOWN' });
  }

  return done(null, { skipGroq: false, intent: draft.currentIntent || 'GENERAL_QUERY' });
}

function hydrateDraftFromHistory(draft, products, messages) {
  let next = normalizeDraft(draft);
  const customerMsgs = (messages || []).filter(
    (m) => m.sender === 'CUSTOMER' && m.text && !String(m.text).startsWith('[')
  );
  if (!customerMsgs.length) return next;
  next.greeted = true;
  for (const msg of customerMsgs) {
    const resolved = resolveProductMention(products, msg.text);
    const qty = extractQuantity(msg.text);
    if (resolved.matches.length === 1) {
      if (qty) upsertItem(next, resolved.matches[0], qty);
      else {
        next.selectedProductId = resolved.matches[0].id;
        next.selectedProductName = resolved.matches[0].name;
      }
    } else if (qty && next.selectedProductId) {
      const product = (products || []).find((p) => p.id === next.selectedProductId);
      if (product) upsertItem(next, product, qty);
    }
    const addr = extractAddress(msg.text, Boolean(next.items.length) || next.awaiting === 'ADDRESS');
    if (addr) next.deliveryAddress = addr;
  }
  next = totals(next, next.deliveryFee || 0);
  next.awaiting = nextMissing(next);
  if (next.awaiting === 'CONFIRMATION' && next.items.length && next.deliveryAddress) {
    next.summaryPresented = true;
  }
  return next;
}

function formatDraftForPrompt(draft) {
  if (!draft) return '(empty)';
  return JSON.stringify(
    {
      currentIntent: draft.currentIntent,
      awaiting: draft.awaiting,
      items: draft.items,
      selectedProductId: draft.selectedProductId,
      selectedProductName: draft.selectedProductName,
      customerName: draft.customerName || null,
      deliveryAddress: draft.deliveryAddress || null,
      deliveryCity: draft.deliveryCity || null,
      paymentMethod: draft.paymentMethod || 'COD',
      greeted: Boolean(draft.greeted),
      summaryPresented: Boolean(draft.summaryPresented),
      confirmationRequired: Boolean(draft.confirmationRequired || draft.awaiting === 'CONFIRMATION'),
      orderConfirmed: Boolean(draft.orderConfirmed),
      orderCreated: Boolean(draft.orderCreated),
      lastOrderNumber: draft.lastOrderNumber || null,
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
  resetMemoryDrafts,
  applyCustomerTurn,
  hydrateDraftFromHistory,
  formatSummary,
  formatDraftForPrompt,
  searchProducts,
  stripRepeatedGreeting,
  wantsCatalog,
  wantsPhotos,
  isConfirmText,
  looksLikeCatalogDump,
  resolveCatalogNumber,
  activeCatalog,
  extractQuantity
};
