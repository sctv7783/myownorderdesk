const GROQ_MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-20b';
const { loadAiSettings, loadStoreProfile } = require('./ai-settings-store.cjs');
const { listMessages, setConversationStatus } = require('./conversations.cjs');
const { listProducts, catalogText } = require('./products-store.cjs');
const { getBusiness } = require('./business.cjs');
const { listOrdersForPhone } = require('./orders-store.cjs');
const {
  applyCustomerTurn,
  formatDraftForPrompt,
  stripRepeatedGreeting,
  searchProducts
} = require('./order-engine.cjs');

function normalizePhone(phone) {
  return String(phone || '').replace(/\D/g, '');
}

function isHumanHandoff(text) {
  const t = String(text || '').toLowerCase();
  return /\b(human staff|live agent|real (person|human|insaan)|manager se baat|staff se baat|complaint against)\b/.test(
    t
  );
}

function wantsPhotos(text) {
  return /photo|photos|pic\b|pics\b|picture|image|images|tasveer|tasvir|photo bhejo|pic bhejo|send (me )?(a )?photo|picture bhejo|📷|📸/i.test(
    String(text || '')
  );
}

function publicImageUrl(url) {
  const value = String(url || '').trim();
  return /^https?:\/\//i.test(value) ? value : '';
}

function pickProductPhotos(products, draft, text, names) {
  const active = (products || []).filter((p) => p.isActive !== false && publicImageUrl(p.imageUrl));
  const picked = [];
  const push = (product) => {
    if (!product || picked.some((row) => row.productId === product.id)) return;
    const url = publicImageUrl(product.imageUrl);
    if (!url) return;
    picked.push({
      productId: product.id,
      imageUrl: url,
      caption: `${product.name} — Rs. ${Number(product.salePrice || product.price || 0).toLocaleString()}`
    });
  };

  for (const name of names || []) {
    const hit = searchProducts(active, String(name))[0]?.product;
    if (hit) push(hit);
  }
  if (draft?.selectedProductId) {
    push((products || []).find((p) => p.id === draft.selectedProductId));
  }
  for (const item of draft?.items || []) {
    push((products || []).find((p) => p.id === item.productId));
  }
  for (const row of searchProducts(active, text).slice(0, 3)) {
    push(row.product);
  }
  return picked.slice(0, 5);
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

const HUMAN_PROMPT = `You are this store's full WhatsApp shopkeeper. Do every job a human seller would do, A-to-Z. Never say you cannot help with a normal shop task.

YOU CAN AND MUST HANDLE:
- greetings, small talk, store name, hours, city, delivery areas
- product search, recommend, compare, alternatives, size/color/variant
- prices, discounts, stock, "kitne ka", "available hai?"
- send photos when asked (META send_images) and when they send a photo, match catalog
- quantity, cart, add/remove items, change item
- delivery fee, ETA, COD / payment methods from STORE OPS
- take full address or WhatsApp location pin
- order summary, confirm, create (backend creates; use ENGINE_HINT numbers)
- order status / tracking from CUSTOMER ORDERS
- cancel request, complaint, refund policy from FAQs
- invoice recap, "dobara bhejo", "pic bhejo", "catalog"
Languages: English, Urdu, Roman Urdu/Hindi, Hindi, Greek, Arabic, Punjabi, mixed slang. Mirror the customer.

Think first: intent, missing info, catalog facts, then reply 1-8 WhatsApp lines like a person.
Greet at most once. Never invent products, prices, stock, or order numbers.
If something is truly outside a shop (illegal, medical diagnosis, etc.) refuse politely and offer a product or staff instead.

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
      reply: 'Theek hai, main aapko human staff se connect kar raha hoon. Staff jaldi reply karega.',
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

  const engine = await applyCustomerTurn({
    tenantId,
    customerPhone,
    customerName,
    conversationId: options.conversationId,
    text: text.startsWith('[') && !/photo/i.test(text) ? '' : text,
    products,
    businessName,
    deliveryFee,
    persistOrder: true
  });

  const draft = engine.draft || engine.cart;

  if (engine.next === 'done' && engine.reply) {
    return {
      reply: engine.reply,
      skipped: false,
      settings,
      order: engine.order || null,
      model: GROQ_MODEL,
      images: []
    };
  }

  let historyText = '';
  try {
    const convId = options.conversationId;
    if (convId) {
      const msgs = await listMessages(tenantId, convId);
      historyText = msgs
        .slice(-16)
        .filter((m, i, arr) => !(i === arr.length - 1 && m.sender === 'CUSTOMER' && m.text === text))
        .slice(-12)
        .map((m) => `${m.sender}: ${m.text}`)
        .join('\n');
    }
  } catch (err) {
    console.warn('[Groq] history load failed', err?.message || err);
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
                greeted: Boolean(engine.greetedBefore),
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
      } else {
        console.error('[Groq]', groqData.error || groqData);
      }
    } catch (err) {
      console.error('[Groq network]', err?.name === 'AbortError' ? 'timeout' : err);
    } finally {
      clearTimeout(timer);
    }
  }

  if (engine.greetedBefore) {
    reply = stripRepeatedGreeting(reply);
  }

  const wantPics = wantsPhotos(text) || Boolean((meta.send_images || []).length);
  const images = wantPics
    ? pickProductPhotos(products, draft, text, meta.send_images)
    : [];

  if (wantPics && !images.length) {
    reply = `${reply}\n\nIs product ki photo catalog mein save nahi hai. Dashboard se image URL add karein.`.trim();
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

module.exports = { GROQ_MODEL, generateAgentReply, buildSystemPrompt };
