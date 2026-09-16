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
  looksLikeCatalogDump
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

const HUMAN_PROMPT = `You are this store's full WhatsApp shopkeeper. Do every job a human seller would do, A-to-Z. Never say you cannot help with a normal shop task.

YOU CAN AND MUST HANDLE:
- greetings, small talk, store name, hours, city, delivery areas
- product search, recommend, compare, alternatives, size/color/variant
- prices, discounts, stock, "kitne ka", "available hai?"
- send photos when asked. Backend sends the actual WhatsApp images. NEVER write "photo bhej raha hoon", never paste URLs, never mention META.
- quantity, cart, customer NAME (ask before address), then full delivery address
- delivery fee, ETA, COD / payment methods from STORE OPS
- take full address or WhatsApp location pin
- order summary, confirm, create (backend creates; use ENGINE_HINT numbers)
- order status / tracking from CUSTOMER ORDERS
- cancel request, complaint, refund policy from FAQs
- invoice recap, "dobara bhejo", "pic bhejo", "catalog"
Think first: is this a continuation of Recent chat? If history exists, SAME conversation — never restart, never greet again, never ask "kaunsa product" if draft/history already has the item. Use ORDER DRAFT + history as memory.
Voice notes are transcribed into the customer message. Treat that text as what they SAID. Never say you cannot hear, never complain about voice, never force typing unless a number/address is truly missing.

Languages: English, Urdu, Roman Urdu/Hindi, Hindi, Greek, Arabic, Punjabi, mixed slang. Mirror the customer.
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

  let history = [];
  try {
    if (options.conversationId) {
      history = await listMessages(tenantId, options.conversationId, options.phoneNumberId);
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
    persistOrder: true,
    history
  });

  const draft = engine.draft || engine.cart;
  const historyText = history
    .slice(-16)
    .filter((m, i, arr) => !(i === arr.length - 1 && m.sender === 'CUSTOMER' && m.text === text))
    .slice(-12)
    .map((m) => `${m.sender}: ${m.text}`)
    .join('\n');
  const continuing = Boolean(historyText || draft?.items?.length || draft?.selectedProductId);
  const orderStep = ['QUANTITY', 'NAME', 'ADDRESS', 'CONFIRMATION'].includes(String(draft?.awaiting || ''));

  if ((engine.skipGroq && engine.reply) || (engine.next === 'done' && engine.reply) || (orderStep && engine.reply)) {
    return {
      reply: stripRepeatedGreeting(engine.reply),
      skipped: false,
      settings,
      order: engine.order || null,
      model: GROQ_MODEL,
      images: wantsPhotos(text) ? pickProductPhotos(products, draft, text, []) : []
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

module.exports = { GROQ_MODEL, generateAgentReply, buildSystemPrompt };
