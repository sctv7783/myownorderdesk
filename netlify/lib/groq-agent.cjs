const GROQ_MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-20b';
const { loadAiSettings, loadStoreProfile } = require('./ai-settings-store.cjs');
const { listConversations, listMessages, setConversationStatus } = require('./conversations.cjs');
const { listProducts, catalogText } = require('./products-store.cjs');
const { getBusiness } = require('./business.cjs');
const { applyCustomerTurn, parseGroqAction, loadCart } = require('./order-engine.cjs');

function normalizePhone(phone) {
  return String(phone || '').replace(/\D/g, '');
}

function wantsProductList(text) {
  const t = String(text || '').toLowerCase();
  return /product|catalog|menu|list|items|saare|sari|saari|dikha|dikhao|dikh|all product|poori list|pura list/.test(
    t
  );
}

function wantsStoreName(text) {
  const t = String(text || '').toLowerCase();
  return /store ka naam|store ka name|tumhara naam|tumhara name|your name|business name|shop ka naam/.test(
    t
  );
}

function formatCatalogReply(businessName, products) {
  const active = (products || []).filter((p) => p.isActive !== false);
  if (!active.length) {
    return `${businessName} ki catalog abhi empty hai. Dashboard se products add/import karein, phir main yahan list bhej doonga.`;
  }
  const lines = active.slice(0, 20).map((p, i) => {
    const price = p.salePrice || p.price;
    return `${i + 1}) ${p.name} — Rs. ${Number(price).toLocaleString()} (stock ${p.stockQuantity})`;
  });
  const extra = active.length > 20 ? `\n+${active.length - 20} more items.` : '';
  return `${businessName} ke available products:\n${lines.join('\n')}${extra}\n\nOrder ke liye number ya product naam + quantity likhein, phir delivery address.`;
}

function buildSystemPrompt({
  businessName,
  settings,
  knowledge,
  customerName,
  customerPhone,
  historyText,
  catalog,
  isFirstMessage,
  cartText
}) {
  const faqs = (knowledge || [])
    .filter((k) => k && k.isActive !== false)
    .slice(0, 20)
    .map((k) => `- Q: ${k.question}\n  A: ${k.answer}`)
    .join('\n');

  const tone = settings?.tone || 'friendly';
  const greeting = settings?.greetingMessage || `Assalam-o-Alaikum! ${businessName} mein khush amdeed.`;
  const extra = settings?.customInstructions || '';

  return `You are the official WhatsApp sales assistant AND order-taker for "${businessName}".
Your name is "${businessName} Order Assistant". Never invent a human name. Never write [Name] or {name}.
Customer: ${customerName && !/\[name\]/i.test(customerName) ? customerName : 'Customer'} (${customerPhone || 'unknown'}).

You have FULL permission to:
- talk naturally about products, prices, stock, delivery, payment (COD default)
- recommend items from the live catalog
- collect quantity, name, phone, and full delivery address
- recap the order and ask for HAAN/confirm
The backend places the real order after confirm. Do not pretend an order is confirmed unless the draft below already has items + address and the customer clearly said haan/confirm.

STRICT RULES:
- Reply in the customer's language (Urdu / Roman Urdu / English). Tone: ${tone}.
- Keep replies 1-10 short WhatsApp lines. Be a helpful closer, not a robot.
- ${isFirstMessage ? `First message only, you may greet like: ${greeting}` : 'Do NOT greet again. Answer the latest message directly.'}
- Quote ONLY catalog names and prices. Never invent products.
- If they ask for list/menu/products, list real catalog items.
- If something is out of stock, say so and offer alternatives from the catalog.
- Missing quantity? Ask. Missing address (house, street, area, city)? Ask. Then recap and wait for confirm.
- Complaints / "human" / manager: be empathetic; handoff is handled separately.

TRAINING:
${extra || 'Be polite. Confirm quantity and address before finalizing. COD unless told otherwise.'}

FAQs:
${faqs || '(none)'}

LIVE PRODUCT CATALOG:
${catalog || '(empty — do not invent products)'}

CURRENT DRAFT CART:
${cartText || '(empty)'}

Recent chat:
${historyText || '(new chat)'}

After your customer-facing reply, ALWAYS append this exact block (not shown as chat if you keep it last):
<<<ORDER
{"action":"none","items":[],"address":"","confirmed":false}
ORDER>>>
Use action "add_items" when they chose products, include items [{name,qty}]. Put address string when they gave one. Set confirmed true only if they clearly confirmed.`;
}

async function generateAgentReply(incomingText, options = {}) {
  const tenantId = options.tenantId;
  const text = String(incomingText || '').trim();
  const customerName = options.customerName && !/\[name\]/i.test(options.customerName)
    ? options.customerName
    : 'Customer';
  const customerPhone = options.customerPhone || '';

  const [aiRecord, profile, business, products] = await Promise.all([
    loadAiSettings(tenantId),
    loadStoreProfile(tenantId),
    getBusiness(tenantId),
    listProducts(tenantId)
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

  if (settings?.isEnabled === false) {
    return { reply: null, skipped: true, reason: 'disabled', settings };
  }

  const keywords = Array.isArray(settings.handoffKeywords) ? settings.handoffKeywords : [];
  const lower = text.toLowerCase();
  const handoff = keywords.some((k) => k && lower.includes(String(k).toLowerCase()));
  if (handoff) {
    if (options.conversationId) {
      await setConversationStatus(tenantId, options.conversationId, 'HUMAN_ACTIVE');
    }
    return {
      reply:
        'Maine aapki conversation human staff ko transfer kar di hai. A staff member will be with you shortly.',
      skipped: false,
      handoff: true,
      settings,
      model: GROQ_MODEL
    };
  }

  const engineFirst = await applyCustomerTurn({
    tenantId,
    customerPhone,
    customerName,
    text: text.startsWith('[') ? '' : text,
    products,
    businessName,
    persistOrder: true
  });

  if (engineFirst.next === 'done' && engineFirst.reply) {
    return {
      reply: engineFirst.reply,
      skipped: false,
      settings,
      order: engineFirst.order,
      model: GROQ_MODEL
    };
  }
  if (engineFirst.next === 'ask_confirm' && engineFirst.reply) {
    return {
      reply: engineFirst.reply,
      skipped: false,
      settings,
      orderDraft: true,
      model: GROQ_MODEL
    };
  }

  if (!text || text.startsWith('[')) {
    return {
      reply: 'Photo/media receive ho gayi. Product ka naam, quantity aur delivery address text mein likhein.',
      skipped: false,
      settings
    };
  }

  if (wantsStoreName(text)) {
    return {
      reply: `Mera naam ${businessName} ka WhatsApp order assistant hai.\nStore: ${businessName}. Main products recommend kar sakta hoon aur order confirm kar sakta hoon.`,
      skipped: false,
      settings
    };
  }

  if (wantsProductList(text) && engineFirst.next === 'ask_product') {
    return {
      reply: formatCatalogReply(businessName, products),
      skipped: false,
      settings
    };
  }

  if (engineFirst.next === 'ask_address' && engineFirst.reply) {
    return { reply: engineFirst.reply, skipped: false, settings };
  }

  let historyText = '';
  let isFirstMessage = true;
  try {
    const convs = await listConversations(tenantId);
    const phoneDigits = normalizePhone(customerPhone);
    const conv =
      convs.find((c) => c.id === options.conversationId) ||
      convs.find((c) => normalizePhone(c.customerPhone) === phoneDigits);
    if (conv) {
      if (conv.status === 'HUMAN_ACTIVE') {
        return { reply: null, skipped: true, reason: 'human_active', settings };
      }
      const msgs = await listMessages(tenantId, conv.id);
      isFirstMessage = msgs.length <= 1;
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

  const apiKey = process.env.GROQ_API_KEY;
  const catalog = catalogText(products);
  const cart = engineFirst.cart || (await loadCart(tenantId, customerPhone));
  const cartText = cart?.items?.length
    ? cart.items.map((i) => `${i.quantity}x ${i.productName} @ Rs ${i.unitPrice}`).join('\n') +
      `\nAddress: ${cart.address || '(missing)'}`
    : '(empty)';

  const fallbackTalk = () => {
    if (engineFirst.reply) return engineFirst.reply;
    if (products.length) return formatCatalogReply(businessName, products);
    return `${businessName}: product naam, quantity aur complete delivery address bhejein — main order confirm kar doonga.`;
  };

  if (!apiKey) {
    return { reply: fallbackTalk(), skipped: false, groqConfigured: false, settings };
  }

  try {
    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        temperature: 0.35,
        max_tokens: 900,
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
              isFirstMessage,
              cartText
            })
          },
          { role: 'user', content: text }
        ]
      })
    });
    const groqData = await groqRes.json().catch(() => ({}));
    if (!groqRes.ok) {
      console.error('[Groq]', groqData.error || groqData);
      return { reply: fallbackTalk(), skipped: false, settings, error: groqData.error?.message };
    }
    const rawReply = groqData.choices?.[0]?.message?.content?.trim() || '';
    const parsed = parseGroqAction(rawReply);
    let reply = (parsed.clean || '').replace(/\[Name\]/gi, customerName === 'Customer' ? businessName : customerName);

    const engineSecond = await applyCustomerTurn({
      tenantId,
      customerPhone,
      customerName,
      text: '',
      products,
      businessName,
      groqAction: parsed.action,
      persistOrder: true
    });
    if (engineSecond.next === 'done' && engineSecond.reply) {
      return { reply: engineSecond.reply, skipped: false, settings, order: engineSecond.order, model: GROQ_MODEL };
    }
    if (engineSecond.next === 'ask_confirm' && engineSecond.reply) {
      return { reply: engineSecond.reply, skipped: false, settings, orderDraft: true, model: GROQ_MODEL };
    }
    if (reply) {
      return { reply, skipped: false, settings, model: GROQ_MODEL, groqConfigured: true };
    }
  } catch (err) {
    console.error('[Groq network]', err);
  }

  return { reply: fallbackTalk(), skipped: false, settings };
}

module.exports = { GROQ_MODEL, generateAgentReply, buildSystemPrompt };
