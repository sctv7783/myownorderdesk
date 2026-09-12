const STORE_NAME = 'orderdesk-ai-settings';

function defaults(tenantId) {
  return {
    settings: {
      id: `ai_settings_${tenantId}`,
      tenantId,
      isEnabled: true,
      model: process.env.GROQ_MODEL || 'openai/gpt-oss-20b',
      primaryLanguage: 'auto',
      tone: 'friendly',
      greetingMessage:
        'Assalam-o-Alaikum! Welcome to our official WhatsApp store. Main aapki kya madad kar sakta hoon?',
      customInstructions:
        'Be polite, friendly, and always confirm delivery address and item counts before finalizing any order.',
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

async function getStore() {
  try {
    const { getStore } = require('@netlify/blobs');
    return getStore(STORE_NAME);
  } catch {
    return null;
  }
}

async function loadAiSettings(tenantId) {
  const store = await getStore();
  const base = defaults(tenantId);
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
  const store = await getStore();
  if (!store) return false;
  await store.setJSON(`tenant:${tenantId}`, data);
  return true;
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

module.exports = {
  defaults,
  loadAiSettings,
  saveAiSettings,
  loadStoreProfile
};
