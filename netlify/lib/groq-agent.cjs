const GROQ_MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-20b';
const { loadAiSettings, loadStoreProfile } = require('./ai-settings-store.cjs');
const { listConversations, listMessages, setConversationStatus } = require('./conversations.cjs');
const { listProducts, catalogText } = require('./products-store.cjs');
const { getBusiness } = require('./business.cjs');

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
  return `${businessName} ke available products:\n${lines.join('\n')}${extra}\n\nKis item ki quantity aur delivery address bhejain?`;
}

function buildSystemPrompt({
  businessName,
  settings,
  knowledge,
  customerName,
  customerPhone,
  historyText,
  catalog,
  isFirstMessage
}) {
  const faqs = (knowledge || [])
    .filter((k) => k && k.isActive !== false)
    .slice(0, 20)
    .map((k) => `- Q: ${k.question}\n  A: ${k.answer}`)
    .join('\n');

  const tone = settings?.tone || 'friendly';
  const greeting = settings?.greetingMessage || `Assalam-o-Alaikum! ${businessName} mein khush amdeed.`;
  const extra = settings?.customInstructions || '';

  return `You are the official WhatsApp order-desk agent for "${businessName}".
Your name is "${businessName} Order Assistant". Never invent a human name. Never write placeholders like [Name], {name}, or "Mera naam [Name] hai".
Customer display name: ${customerName && !/\[name\]/i.test(customerName) ? customerName : 'Customer'} (${customerPhone || 'unknown'}).

STRICT RULES:
- Reply in the customer's language (Urdu / Roman Urdu / English). Tone: ${tone}.
- Keep replies 1-8 short WhatsApp lines.
- ${isFirstMessage ? `First message only, you may greet like: ${greeting}` : 'Do NOT greet again. Do NOT say Assalam-o-Alaikum again. Answer the latest question directly.'}
- When asked for products / list / menu / "all products", list REAL catalog items with prices. Do not ask "phones, laptops, accessories" if a catalog exists.
- Quote ONLY names and prices from the catalog below. Never invent products or prices.
- If catalog is empty, say catalog is empty and ask them to wait while staff adds products.
- Before confirming an order: quantity + full delivery address.
- After address, recap item, price, address, then ask for haan/confirm.
- If they ask your name or store name, answer: "${businessName}".

TRAINING INSTRUCTIONS:
${extra || 'Be polite. Confirm quantity and address before finalizing. COD unless told otherwise.'}

FAQs:
${faqs || '(none)'}

LIVE PRODUCT CATALOG:
${catalog || '(empty — do not invent products)'}

Recent chat:
${historyText || '(new chat)'}`;
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

  if (!text || text.startsWith('[')) {
    return {
      reply: 'Photo/media receive ho gayi. Product ka naam ya order detail text mein likhein.',
      skipped: false,
      settings
    };
  }

  if (wantsStoreName(text)) {
    return {
      reply: `Mera naam ${businessName} ka WhatsApp order assistant hai.\nStore: ${businessName}.`,
      skipped: false,
      settings
    };
  }

  if (wantsProductList(text)) {
    return {
      reply: formatCatalogReply(businessName, products),
      skipped: false,
      settings
    };
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

  if (!apiKey) {
    if (products.length) return { reply: formatCatalogReply(businessName, products), skipped: false, settings };
    return {
      reply: `${businessName}: Groq key missing hai. Staff se rabta karein ya Netlify pe GROQ_API_KEY set karein.`,
      skipped: false,
      groqConfigured: false,
      settings
    };
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
        temperature: 0.15,
        max_tokens: 700,
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
              isFirstMessage
            })
          },
          { role: 'user', content: text }
        ]
      })
    });
    const groqData = await groqRes.json().catch(() => ({}));
    if (!groqRes.ok) {
      console.error('[Groq]', groqData.error || groqData);
      if (products.length) {
        return { reply: formatCatalogReply(businessName, products), skipped: false, settings };
      }
      return {
        reply: `Aapka message receive ho gaya. AI abhi busy hai (${groqData.error?.message || 'Groq error'}).`,
        skipped: false,
        settings,
        error: groqData.error?.message
      };
    }
    let reply = groqData.choices?.[0]?.message?.content?.trim() || '';
    reply = reply.replace(/\[Name\]/gi, customerName === 'Customer' ? businessName : customerName);
    if (reply) {
      return { reply, skipped: false, settings, model: GROQ_MODEL, groqConfigured: true };
    }
  } catch (err) {
    console.error('[Groq network]', err);
  }

  if (products.length) return { reply: formatCatalogReply(businessName, products), skipped: false, settings };
  return {
    reply: 'Aapka message receive ho gaya. Product naam, quantity aur delivery address bhejein.',
    skipped: false,
    settings
  };
}

module.exports = { GROQ_MODEL, generateAgentReply, buildSystemPrompt };
