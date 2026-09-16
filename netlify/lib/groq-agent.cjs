const GROQ_MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-20b';
const { loadAiSettings, loadStoreProfile } = require('./ai-settings-store.cjs');
const { listMessages, setConversationStatus } = require('./conversations.cjs');
const { listProducts, catalogText } = require('./products-store.cjs');
const { getBusiness } = require('./business.cjs');
const { listOrdersForPhone } = require('./orders-store.cjs');
const { publicImageUrls } = require('./product-media.cjs');
const {
  applyCustomerTurn,
  formatDraftForPrompt,
  stripRepeatedGreeting,
  searchProducts,
  looksLikeCatalogDump,
  wantsPhotos
} = require('./order-engine.cjs');

function normalizePhone(phone) {
  return String(phone || '').replace(/\D/g, '');
}

function isHumanHandoff(text) {
  const t = String(text || '').toLowerCase();
  return /\b(human staff|live agent|real (person|human|insaan)|manager se baat|staff se baat|complaint against|mujhe human|human se baat|representative|handoff)\b/.test(
    t
  );
}

function pickProductPhotos(products, draft, text, names) {
  const active = (products || []).filter((p) => p.isActive !== false && publicImageUrls(p).length);
  const picked = [];
  const pushAll = (product) => {
    if (!product) return;
    const urls = publicImageUrls(product);
    urls.forEach((url, index) => {
      if (picked.some((row) => row.imageUrl === url)) return;
      picked.push({
        productId: product.id,
        imageUrl: url,
        caption:
          index === 0
            ? `${product.name} — Rs. ${Number(product.salePrice || product.price || 0).toLocaleString()}`
            : `${product.name} (${index + 1}/${urls.length})`
      });
    });
  };

  for (const name of names || []) {
    const hit = searchProducts(active, String(name))[0]?.product;
    if (hit) pushAll(hit);
  }
  if (draft?.selectedProductId) {
    pushAll((products || []).find((p) => p.id === draft.selectedProductId));
  }
  for (const item of draft?.items || []) {
    pushAll((products || []).find((p) => p.id === item.productId));
  }
  for (const row of searchProducts(active, text).slice(0, 3)) {
    pushAll(row.product);
  }
  if (!picked.length && /photo|pic|tasveer|products?|catalog|saare|all/i.test(String(text || ''))) {
    for (const product of active.slice(0, 3)) pushAll(product);
  }
  return picked.slice(0, 10);
}

function parseMeta(raw) {
  const text = String(raw || '');
  const block = text.match(/<<<META([\s\S]*?)META>>>/i);
  let meta = {};
  let clean = text;
  if (block) {
    try {
      meta = JSON.parse(block[1].trim());
    } catch {
      meta = {};
    }
    clean = text.replace(block[0], '').trim();
  }
  return { meta, clean: stripRepeatedGreeting(clean) };
}

const HUMAN_PROMPT = `You are a WhatsApp ordering assistant.

Use ORDER DRAFT as memory. Never reset the chat. Never guess product, price, stock, address or order number. Never pick the first catalog item.

Patterns (follow the behavior, do not copy wording blindly):
- Price question ("kitne ka") → only price. No address. No order.
- Product without quantity → quote price and ask quantity.
- Quantity after a remembered product → apply it to THAT product, then ask address. Do not ask "kaunsa product".
- Quantity + address in one message → save both, show totals, ask confirmation.
- Product + qty + address in one message → summary + confirm.
- "haan" creates an order ONLY when awaiting=CONFIRMATION and summary was shown.
- "haan" while awaiting quantity → ask quantity again, never create an order.
- Bare quantity with no product → remember the number and ask which product.
- Catalog request → list once. Do not dump catalog again unless asked.
- Greeting only once. Later turns never start with Salam.
- Over-stock → tell actual available stock. Out of stock → say out of stock.
- Multiple products in one message → keep every item.
- If a saved delivery address exists, ask to reuse it. Do not silently assume.
- Human request → hand off and stop selling.
- Unknown product → say it is not in the catalog. Never invent a price.
- Order status → use CUSTOMER PAST ORDERS only.

<<<META
{"send_images":[],"note":""}
META>>>`;

function buildSystemPrompt({
  businessName,
  settings,
  knowledge,
  customerName,
  customerPhone,
  historyText,
  catalog,
  draftText,
  greeted,
  engineHint,
  storeOps,
  customerOrders
}) {
  const faqs = (knowledge || [])
    .filter((k) => k && k.isActive !== false)
    .slice(0, 25)
    .map((k) => `- Q: ${k.question}\n  A: ${k.answer}`)
    .join('\n');
  const extra = settings?.customInstructions || '';

  return `${HUMAN_PROMPT}

Store: "${businessName}". You represent this store. Never use [Name] or {name}.
Customer: ${customerName} (${customerPhone || 'unknown'}).
GREETED: ${greeted ? 'yes' : 'no'}.

Extra shop training:
${extra}

FAQs / policies:
${faqs || '(none)'}

STORE OPS (hours, delivery, payment — use these, do not invent):
${storeOps || '(defaults: COD, delivery fee from profile or 0)'}

CUSTOMER PAST ORDERS:
${customerOrders || '(none yet)'}

LIVE CATALOG (products/prices/stock/photos):
${catalog || '(empty)'}

ORDER DRAFT STATE (authoritative for the cart):
${draftText}

ENGINE_HINT (facts to keep accurate, rephrase naturally):
${engineHint || '(none)'}

Recent chat:
${historyText || '(new chat)'}`;
}

async function generateAgentReply(incomingText, options = {}) {
  const tenantId = options.tenantId;
  const text = String(incomingText || '').trim();
  const customerName =
    options.customerName && !/\[name\]/i.test(options.customerName) ? options.customerName : 'Customer';
  const customerPhone = options.customerPhone || '';

  const [aiRecord, profile, business, products, pastOrders] = await Promise.all([
    loadAiSettings(tenantId),
    loadStoreProfile(tenantId),
    getBusiness(tenantId),
    listProducts(tenantId),
    listOrdersForPhone(tenantId, customerPhone)
  ]);

  const settings = aiRecord.settings;
  const knowledge = aiRecord.knowledge;
  const fromMeta = options.businessName;
  const businessName =
    business?.name ||
    profile?.name ||
    (fromMeta && !/whatsapp business/i.test(fromMeta) ? fromMeta : '') ||
    options.verifiedName ||
    'our store';
  const deliveryFee = Number(profile?.deliveryFee || business?.deliveryFee || 0);

  if (settings?.isEnabled === false) {
    return { reply: null, skipped: true, reason: 'disabled', settings };
  }

  if (isHumanHandoff(text)) {
    if (options.conversationId) {
      await setConversationStatus(tenantId, options.conversationId, 'HUMAN_ACTIVE');
    }
    return {
      reply: 'Ji bilkul. Aapki conversation staff member ko transfer kar raha hoon.',
      skipped: false,
      handoff: true,
      settings,
      model: GROQ_MODEL,
      images: []
    };
  }

  if (options.conversationStatus === 'HUMAN_ACTIVE') {
    return { reply: null, skipped: true, reason: 'human_active', settings, images: [] };
  }

  let history = [];
  try {
    if (options.conversationId && !options.isolated) {
      history = await listMessages(tenantId, options.conversationId, options.phoneNumberId);
    } else if (Array.isArray(options.history)) {
      history = options.history;
    }
  } catch (err) {
    console.warn('[Groq] history load failed', err?.message || err);
  }

  const engine = await applyCustomerTurn({
    tenantId,
    customerPhone,
    customerName,
    conversationId: options.conversationId,
    text: text.startsWith('[') && !/photo/i.test(text) ? '' : text,
    products,
    businessName,
    deliveryFee,
    persistOrder: options.persistOrder !== false,
    history,
    isolated: Boolean(options.isolated),
    savedAddress: (pastOrders || []).find((o) => o.deliveryAddress)?.deliveryAddress || ''
  });

  const draft = engine.draft || engine.cart;
  const historyText = history
    .slice(-16)
    .filter((m, i, arr) => !(i === arr.length - 1 && m.sender === 'CUSTOMER' && m.text === text))
    .slice(-12)
    .map((m) => `${m.sender}: ${m.text}`)
    .join('\n');
  const continuing = Boolean(historyText || draft?.items?.length || draft?.selectedProductId);
  const photoAsk = wantsPhotos(text);
  const photoImages = photoAsk ? pickProductPhotos(products, draft, text, []) : [];

  if (engine.intent === 'ORDER_STATUS') {
    const wanted = String(text).match(/ord[- ]?\d+/i);
    const hit =
      (pastOrders || []).find(
        (o) => wanted && String(o.orderNumber || '').toLowerCase().includes(wanted[0].toLowerCase().replace(/\s/g, ''))
      ) || (pastOrders || [])[0];
    const reply = hit
      ? `${hit.orderNumber} abhi ${hit.status} hai.${hit.deliveryAddress ? ` Address: ${hit.deliveryAddress}.` : ''}`
      : 'Is number se matching order nahi mila. Order number dobara bhej dein.';
    return {
      reply,
      skipped: false,
      settings,
      order: null,
      model: GROQ_MODEL,
      images: []
    };
  }

  if (engine.reply && (engine.skipGroq || engine.next === 'done' || photoAsk)) {
    return {
      reply: stripRepeatedGreeting(engine.reply),
      skipped: false,
      settings,
      order: engine.order || null,
      model: GROQ_MODEL,
      images: photoAsk ? photoImages : []
    };
  }

  if (photoAsk) {
    const name = draft?.selectedProductName || photoImages[0]?.caption?.split(' — ')[0] || '';
    const reply = photoImages.length
      ? `${name || 'Product'} ki photos.`
      : `${name || 'Product'} ki photo catalog mein HTTPS image nahi hai. Dashboard pe product photos add karein.`;
    return {
      reply: stripRepeatedGreeting(reply),
      skipped: false,
      settings,
      order: engine.order || null,
      model: GROQ_MODEL,
      images: photoImages
    };
  }

  if ((engine.skipGroq && engine.reply) || (engine.next === 'done' && engine.reply)) {
    return {
      reply: stripRepeatedGreeting(engine.reply),
      skipped: false,
      settings,
      order: engine.order || null,
      model: GROQ_MODEL,
      images: []
    };
  }

  if (wantsPhotos(text) && /url na|without url|link mat|url nahi/i.test(text)) {
    return {
      reply: 'Theek hai, koi URL nahi. Product photos WhatsApp images ki soorat mein jayengi.',
      skipped: false,
      settings,
      order: engine.order || null,
      model: GROQ_MODEL,
      images: []
    };
  }

  const ranked = searchProducts(products, text).slice(0, 12).map((row) => row.product);
  const rankedIds = new Set(ranked.map((p) => p.id));
  const rest = (products || []).filter((p) => p.isActive !== false && !rankedIds.has(p.id)).slice(0, 28);
  const catalog = catalogText(ranked.length ? [...ranked, ...rest] : products);
  const storeOps = [
    `name: ${businessName}`,
    `currency: ${business?.currency || 'PKR'}`,
    `deliveryFee: Rs. ${deliveryFee}`,
    `payment: ${profile?.paymentMethods || 'Cash on Delivery (COD)'}`,
    `hours: ${profile?.hours || profile?.estimatedDeliveryTime || 'open for WhatsApp orders'}`,
    `city/address: ${profile?.city || profile?.address || 'as per store profile'}`,
    `phone: ${profile?.phone || 'WhatsApp this number'}`
  ].join('\n');
  const customerOrders = (pastOrders || [])
    .map(
      (o) =>
        `${o.orderNumber} | ${o.status} | Rs. ${o.total} | ${o.deliveryAddress || '-'} | ${(o.items || []).map((i) => `${i.quantity}x ${i.productName}`).join(', ')}`
    )
    .join('\n');
  const engineHint = engine.reply || '';
  const fallback = engine.reply || 'Ji, batayein — product, photo, price, delivery, ya order, jo chahiye.';
  const apiKey = process.env.GROQ_API_KEY;

  let reply = fallback;
  let meta = {};
  if (apiKey) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 14000);
    try {
      const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        signal: ctrl.signal,
        body: JSON.stringify({
          model: GROQ_MODEL,
          temperature: 0.4,
          max_tokens: 500,
          messages: [
            {
              role: 'system',
              content: buildSystemPrompt({
                businessName,
                settings,
                knowledge,
                customerName,
                customerPhone,
                historyText,
                catalog,
                draftText: formatDraftForPrompt(draft),
                greeted: Boolean(engine.greetedBefore || continuing),
                engineHint,
                storeOps,
                customerOrders: customerOrders || '(none yet)'
              })
            },
            { role: 'user', content: text || '(empty message)' }
          ]
        })
      });
      const groqData = await groqRes.json().catch(() => ({}));
      if (groqRes.ok) {
        const parsed = parseMeta(groqData.choices?.[0]?.message?.content || '');
        meta = parsed.meta || {};
        if (parsed.clean) reply = parsed.clean;
        if (continuing && looksLikeCatalogDump(reply) && (draft?.selectedProductId || draft?.items?.length)) {
          reply = engine.reply || `${draft.selectedProductName || 'Item'} already cart mein hai. Quantity ya address bata dein.`;
        }
      } else {
        console.error('[Groq]', groqData.error || groqData);
      }
    } catch (err) {
      console.error('[Groq network]', err?.name === 'AbortError' ? 'timeout' : err);
    } finally {
      clearTimeout(timer);
    }
  }

  if (engine.greetedBefore || continuing) {
    reply = stripRepeatedGreeting(reply);
  }

  const wantPics = wantsPhotos(text) || Boolean((meta.send_images || []).length);
  const images = wantPics
    ? pickProductPhotos(products, draft, text, meta.send_images)
    : [];

  if (wantPics && images.length) {
    reply = stripRepeatedGreeting(reply);
  }

  return {
    reply,
    skipped: false,
    settings,
    order: engine.order || null,
    model: GROQ_MODEL,
    groqConfigured: Boolean(apiKey),
    images
  };
}

module.exports = { GROQ_MODEL, generateAgentReply, buildSystemPrompt, isHumanHandoff };
