const DEFAULT_INSTRUCTIONS = `You are a stateful WhatsApp sales representative, not a chatbot.
Never restart the conversation. Greet at most once. Never say Assalam/Welcome again after greeted=true.
Never dump the catalog unless the customer asked. Never invent products, prices, or stock.
Ask only for the missing field: product → quantity → address → confirmation.
A short "2" means quantity when awaiting QUANTITY. "haan" confirms only when awaiting CONFIRMATION.
Mirror the customer's language. Replies: 1-5 short lines.`;

function defaults(tenantId) {
  return {
    settings: {
      id: `ai_settings_${tenantId}`,
      tenantId,
      isEnabled: true,
      model: process.env.GROQ_MODEL || 'openai/gpt-oss-20b',
      primaryLanguage: 'auto',
      tone: 'friendly',
      greetingMessage: 'Wa Alaikum Assalam! Ji, batayein.',
      customInstructions: DEFAULT_INSTRUCTIONS,
      orderConfirmationRequired: true,
      handoffKeywords: ['human', 'agent', 'staff', 'complaint', 'manager', 'madad'],
      enableStockCheck: true,
      autoHandoffOnComplaint: true,
      workingHoursOnly: false,
      maxToolLoops: 5,
      updatedAt: new Date().toISOString()
    },
    knowledge: []
  };
}

const STORE_NAME = 'orderdesk-ai-settings';
const { getSupabaseConfig, isUuid, sbSelect, sbInsert, sbUpdate, sbDelete } = require('./supabase-rest.cjs');

function mapSettings(row, tenantId, base) {
  if (!row) return base.settings;
  return {
    ...base.settings,
    id: row.id || base.settings.id,
    tenantId,
    isEnabled: row.is_enabled !== false,
    model: row.model || base.settings.model,
    primaryLanguage: row.primary_language || 'auto',
    tone: row.tone || 'friendly',
    greetingMessage: row.greeting_message || base.settings.greetingMessage,
    customInstructions: row.custom_instructions || base.settings.customInstructions,
    orderConfirmationRequired: row.order_confirmation_required !== false,
    handoffKeywords: row.handoff_keywords || base.settings.handoffKeywords,
    enableStockCheck: row.enable_stock_check !== false,
    autoHandoffOnComplaint: row.auto_handoff_on_complaint !== false,
    workingHoursOnly: Boolean(row.working_hours_only),
    maxToolLoops: Number(row.max_tool_loops || 5),
    updatedAt: row.updated_at || new Date().toISOString()
  };
}

function mapKnowledge(rows, tenantId) {
  return (rows || []).map((row) => ({
    id: row.id,
    tenantId,
    category: row.category || 'FAQ',
    question: row.question,
    answer: row.answer,
    isActive: row.is_active !== false
  }));
}

async function getStore() {
  try {
    const { getStore } = require('@netlify/blobs');
    return getStore(STORE_NAME);
  } catch {
    return null;
  }
}

async function loadAiSettings(tenantId) {
  const base = defaults(tenantId);
  if (tenantId && isUuid(tenantId) && getSupabaseConfig()) {
    const settingsRes = await sbSelect('agent_settings', {
      select: '*',
      business_id: `eq.${tenantId}`
    });
    const knowledgeRes = await sbSelect('agent_knowledge', {
      select: '*',
      business_id: `eq.${tenantId}`
    });
    if (settingsRes.ok && settingsRes.rows[0]) {
      return {
        settings: mapSettings(settingsRes.rows[0], tenantId, base),
        knowledge: mapKnowledge(knowledgeRes.rows, tenantId)
      };
    }
  }

  const store = await getStore();
  if (!store) return base;
  try {
    const saved = await store.get(`tenant:${tenantId}`, { type: 'json' });
    if (!saved) return base;
    return {
      settings: { ...base.settings, ...saved.settings },
      knowledge: saved.knowledge || []
    };
  } catch {
    return base;
  }
}

async function saveAiSettings(tenantId, data) {
  const settings = data.settings || data;
  if (tenantId && isUuid(tenantId) && getSupabaseConfig()) {
    const payload = {
      business_id: tenantId,
      is_enabled: settings.isEnabled !== false,
      model: process.env.GROQ_MODEL || 'openai/gpt-oss-20b',
      primary_language: settings.primaryLanguage || 'auto',
      tone: settings.tone || 'friendly',
      greeting_message: settings.greetingMessage || defaults(tenantId).settings.greetingMessage,
      custom_instructions: settings.customInstructions || DEFAULT_INSTRUCTIONS,
      order_confirmation_required: settings.orderConfirmationRequired !== false,
      handoff_keywords: settings.handoffKeywords || defaults(tenantId).settings.handoffKeywords,
      enable_stock_check: settings.enableStockCheck !== false,
      auto_handoff_on_complaint: settings.autoHandoffOnComplaint !== false,
      working_hours_only: Boolean(settings.workingHoursOnly),
      max_tool_loops: Number(settings.maxToolLoops || 5),
      updated_at: new Date().toISOString()
    };
    const existing = await sbSelect('agent_settings', { select: 'id', business_id: `eq.${tenantId}` });
    if (existing.rows[0]) {
      await sbUpdate('agent_settings', { business_id: `eq.${tenantId}` }, payload);
    } else {
      await sbInsert('agent_settings', payload);
    }
    if (Array.isArray(data.knowledge)) {
      /* knowledge saved via dedicated endpoints */
    }
  }

  const store = await getStore();
  if (store) await store.setJSON(`tenant:${tenantId}`, data);
  return true;
}

async function seedAgentSettings(tenantId) {
  return saveAiSettings(tenantId, defaults(tenantId));
}

async function loadStoreProfile(tenantId) {
  try {
    const { getStore } = require('@netlify/blobs');
    const store = getStore('store-profile');
    return (await store.get(`tenant:${tenantId}`, { type: 'json' })) || null;
  } catch {
    return null;
  }
}

async function addKnowledgeItem(tenantId, item) {
  const payload = {
    tenantId,
    category: item.category || 'FAQ',
    question: item.question || item.title || 'FAQ',
    answer: item.answer || item.content || '',
    isActive: true
  };
  if (tenantId && isUuid(tenantId) && getSupabaseConfig()) {
    const result = await sbInsert('agent_knowledge', {
      business_id: tenantId,
      category: payload.category,
      question: payload.question,
      answer: payload.answer,
      is_active: true
    });
    const row = Array.isArray(result.data) ? result.data[0] : result.data;
    if (result.ok && row) return mapKnowledge([row], tenantId)[0];
  }
  return { ...payload, id: `faq_${Date.now()}` };
}

async function deleteKnowledgeItem(tenantId, id) {
  if (tenantId && isUuid(tenantId) && id && getSupabaseConfig()) {
    await sbDelete('agent_knowledge', { id: `eq.${id}`, business_id: `eq.${tenantId}` });
  }
  return true;
}

module.exports = {
  DEFAULT_INSTRUCTIONS,
  defaults,
  loadAiSettings,
  saveAiSettings,
  seedAgentSettings,
  loadStoreProfile,
  addKnowledgeItem,
  deleteKnowledgeItem
};
