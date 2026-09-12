const GROQ_MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-20b';
const { loadAiSettings, loadStoreProfile } = require('./ai-settings-store.cjs');
const { listConversations, listMessages, setConversationStatus } = require('./inbox-store.cjs');

function normalizePhone(phone) {
  return String(phone || '').replace(/\D/g, '');
}

function buildSystemPrompt({ businessName, settings, knowledge, customerName, customerPhone, historyText }) {
  const faqs = (knowledge || [])
    .filter((k) => k && k.isActive !== false)
    .slice(0, 20)
    .map((k) => `- Q: ${k.question}\n  A: ${k.answer}`)
    .join('\n');

  const tone = settings?.tone || 'friendly';
  const lang = settings?.primaryLanguage || 'auto';
  const greeting = settings?.greetingMessage || `Assalam-o-Alaikum! ${businessName} mein khush amdeed.`;
  const extra = settings?.customInstructions || '';

  return `You are the official WhatsApp AI order desk agent for "${businessName}".
Platform: WhatsApp.
Customer: ${customerName || 'Customer'} (${customerPhone || 'unknown'}).

LANGUAGE:
Speak in the customer's language (Urdu, Roman Urdu, or English). Default language mode: ${lang}.
Tone: ${tone}. Keep replies short and WhatsApp-friendly (1-6 short lines).

GREETING STYLE (use on first contact or when they say salam):
${greeting}

TRAINING / BUSINESS INSTRUCTIONS (follow these exactly):
${extra || 'Be polite. Confirm quantity and full delivery address before finalizing any order. Cash on delivery unless told otherwise.'}

STORE KNOWLEDGE / FAQs:
${faqs || 'No extra FAQs saved yet. Do not invent policies or exact prices if unknown — ask what they want.'}

ORDER WORKFLOW:
1. Help with products, prices, delivery, and taking orders.
2. Quote only facts from training/FAQs above. If price/stock is unknown, ask a clarifying question.
3. Before confirming an order, collect quantity AND a full delivery address (house, street, area, city).
4. After address is given, recap item + total if known + address, then ask for confirmation (haan / yes / confirm).
5. After clear confirmation, thank them and say the order is noted for staff. Do not invent an order number unless one is provided in history.
6. If the customer asks for a human, manager, or files a complaint, tell them staff will take over.

Recent conversation:
${historyText || '(new chat)'}`;
}

async function generateAgentReply(incomingText, options = {}) {
  const tenantId = options.tenantId || process.env.DEFAULT_TENANT_ID || 'tenant_khyber_001';
  const text = String(incomingText || '').trim();
  const customerName = options.customerName || 'Customer';
  const customerPhone = options.customerPhone || '';

  const [{ settings, knowledge }, profile] = await Promise.all([
    loadAiSettings(tenantId),
    loadStoreProfile(tenantId)
  ]);

  const businessName =
    options.businessName ||
    profile?.name ||
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
    const reply =
      settings.primaryLanguage === 'urdu'
        ? 'Aapki request par conversation staff member ko transfer kar di gayi hai. Humara team member jald aap se rabta karega.'
        : 'Maine aapki conversation human staff ko transfer kar di hai. A staff member will be with you shortly.';
    return { reply, skipped: false, handoff: true, settings, model: GROQ_MODEL };
  }

  if (!text || text.startsWith('[')) {
    return {
      reply:
        'Photo/media receive ho gayi. Barah-e-karam product ka naam ya order detail text mein likhein.',
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
  const greeting = settings.greetingMessage || `Assalam o Alaikum! ${businessName} mein khush amdeed.`;

  if (!apiKey) {
    return {
      reply: `${greeting}\n\nAapka message receive ho gaya: "${text.slice(0, 80)}"\nGroq API key Netlify env mein set karein taake AI jawab de sake.`,
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
        temperature: 0.2,
        max_tokens: 600,
        messages: [
          {
            role: 'system',
            content: buildSystemPrompt({
              businessName,
              settings,
              knowledge,
              customerName,
              customerPhone,
              historyText
            })
          },
          { role: 'user', content: text }
        ]
      })
    });
    const groqData = await groqRes.json().catch(() => ({}));
    if (!groqRes.ok) {
      console.error('[Groq]', groqData.error || groqData);
      return {
        reply: `${greeting}\nAapka message receive ho gaya. AI abhi respond nahi kar saki (${groqData.error?.message || 'Groq error'}).`,
        skipped: false,
        settings,
        error: groqData.error?.message
      };
    }
    const reply = groqData.choices?.[0]?.message?.content?.trim();
    if (reply) {
      return {
        reply,
        skipped: false,
        settings,
        model: GROQ_MODEL,
        groqConfigured: true
      };
    }
  } catch (err) {
    console.error('[Groq network]', err);
  }

  return {
    reply: `${greeting}\nAapka message receive ho gaya. Order confirm karne ke liye product naam aur address bhejein.`,
    skipped: false,
    settings
  };
}

module.exports = { GROQ_MODEL, generateAgentReply, buildSystemPrompt };
