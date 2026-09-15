const GROQ_MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-20b';
const { loadAiSettings, loadStoreProfile } = require('./ai-settings-store.cjs');
const { listConversations, listMessages, setConversationStatus } = require('./conversations.cjs');
const { listProducts, catalogText } = require('./products-store.cjs');
const { getBusiness } = require('./business.cjs');
const {
  applyCustomerTurn,
  formatDraftForPrompt,
  stripRepeatedGreeting,
  searchProducts
} = require('./order-engine.cjs');

function normalizePhone(phone) {
  return String(phone || '').replace(/\D/g, '');
}

function wantsStoreName(text) {
  const t = String(text || '').toLowerCase();
  return /store ka naam|store ka name|tumhara naam|your name|business name|shop ka naam/.test(t);
}

const STATE_RULES = `You are a WhatsApp sales representative for one store, not a generic chatbot.
Follow the ORDER DRAFT STATE. It is the source of truth. Do not restart the chat. Do not dump the catalog.
GREETING: If state.greeted is true, NEVER say Assalam, Wa Alaikum, or Welcome.
If awaiting is QUANTITY, a number means quantity for the selected product.
If awaiting is ADDRESS, treat a location-like message as the address.
If awaiting is CONFIRMATION, do not create an order yourself — the backend does that.
Ask only for the missing field. Replies: 1-5 short Roman Urdu/English lines matching the customer.
Never invent products, prices, stock, or order numbers. Use only the catalog snippet.`;

function buildSystemPrompt({
  businessName,
  settings,
  knowledge,
  customerName,
  customerPhone,
  historyText,
  catalog,
  draftText,
  greeted
}) {
  const faqs = (knowledge || [])
    .filter((k) => k && k.isActive !== false)
    .slice(0, 12)
    .map((k) => `- Q: ${k.question}\n  A: ${k.answer}`)
    .join('\n');
  const extra = settings?.customInstructions || '';

  return `${STATE_RULES}

Store: "${businessName}". Your name is "${businessName} Order Assistant". Never use [Name].
Customer: ${customerName} (${customerPhone || 'unknown'}).
Greeted already: ${greeted ? 'YES — do not greet' : 'NO — a short Wa Alaikum Assalam is allowed only if they greeted'}.

Training:
${extra}

FAQs:
${faqs || '(none)'}

Relevant catalog:
${catalog || '(empty)'}

ORDER DRAFT STATE:
${draftText}

Recent chat:
${historyText || '(new chat)'}`;
}

async function generateAgentReply(incomingText, options = {}) {
  const tenantId = options.tenantId;
  const text = String(incomingText || '').trim();
  const customerName =
    options.customerName && !/\[name\]/i.test(options.customerName) ? options.customerName : 'Customer';
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
  const deliveryFee = Number(profile?.deliveryFee || business?.deliveryFee || 0);

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
      reply: 'Maine aapki baat human staff ko de di hai. Staff jaldi reply karega.',
      skipped: false,
      handoff: true,
      settings,
      model: GROQ_MODEL
    };
  }

  if (wantsStoreName(text)) {
    return {
      reply: `Store: ${businessName}. Main yahin se order le sakta hoon.`,
      skipped: false,
      settings
    };
  }

  const engine = await applyCustomerTurn({
    tenantId,
    customerPhone,
    customerName,
    conversationId: options.conversationId,
    text: text.startsWith('[') ? '' : text,
    products,
    businessName,
    deliveryFee,
    persistOrder: true
  });

  if (engine.reply && engine.skipGroq) {
    const reply = engine.greetedBefore ? stripRepeatedGreeting(engine.reply) : engine.reply;
    return {
      reply,
      skipped: false,
      settings,
      order: engine.order || null,
      model: GROQ_MODEL
    };
  }

  if (!text || text.startsWith('[')) {
    return {
      reply: 'Photo aa gayi. Product ka naam text mein likhein.',
      skipped: false,
      settings
    };
  }

  let historyText = '';
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
      historyText = msgs
        .slice(-10)
        .filter((m, i, arr) => !(i === arr.length - 1 && m.sender === 'CUSTOMER' && m.text === text))
        .slice(-8)
        .map((m) => `${m.sender}: ${m.text}`)
        .join('\n');
    }
  } catch (err) {
    console.warn('[Groq] history load failed', err?.message || err);
  }

  const relevant = searchProducts(products, text).slice(0, 8).map((row) => row.product);
  const catalog = catalogText(relevant.length ? relevant : []);
  const draft = engine.draft || engine.cart;
  const greeted = Boolean(draft?.greeted);
  const fallback = engine.reply || 'Ji, batayein kaunsa product chahiye?';

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return { reply: fallback, skipped: false, groqConfigured: false, settings };
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
        max_tokens: 220,
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
              greeted
            })
          },
          { role: 'user', content: text }
        ]
      })
    });
    const groqData = await groqRes.json().catch(() => ({}));
    if (!groqRes.ok) {
      console.error('[Groq]', groqData.error || groqData);
      return { reply: fallback, skipped: false, settings };
    }
    let reply = groqData.choices?.[0]?.message?.content?.trim() || '';
    reply = stripRepeatedGreeting(reply);
    if (greeted) {
      reply = stripRepeatedGreeting(reply.replace(/assalam[^\n]*/gi, '').trim());
    }
    if (reply) {
      return { reply, skipped: false, settings, model: GROQ_MODEL, groqConfigured: true };
    }
  } catch (err) {
    console.error('[Groq network]', err);
  }

  return { reply: fallback, skipped: false, settings };
}

module.exports = { GROQ_MODEL, generateAgentReply, buildSystemPrompt };
