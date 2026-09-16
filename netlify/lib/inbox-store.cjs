const { getNamedStore } = require('./blobs.cjs');

const STORE_NAME = 'orderdesk-inbox';

async function getStore() {
  return getNamedStore(STORE_NAME);
}

function emptyState() {
  return { conversations: [], messagesByConv: {} };
}

async function loadInbox(tenantId) {
  const store = await getStore();
  if (!store) return emptyState();
  try {
    return (await store.get(`tenant:${tenantId}`, { type: 'json' })) || emptyState();
  } catch {
    return emptyState();
  }
}

async function saveInbox(tenantId, state) {
  const store = await getStore();
  if (!store) return false;
  await store.setJSON(`tenant:${tenantId}`, state);
  return true;
}

function wabaKey(phoneNumberId) {
  return `waba:${String(phoneNumberId || '').trim()}`;
}

async function loadWabaInbox(phoneNumberId) {
  if (!phoneNumberId) return emptyState();
  const store = await getStore();
  if (!store) return emptyState();
  try {
    return (await store.get(wabaKey(phoneNumberId), { type: 'json' })) || emptyState();
  } catch {
    return emptyState();
  }
}

async function saveWabaInbox(phoneNumberId, state) {
  if (!phoneNumberId) return false;
  const store = await getStore();
  if (!store) return false;
  await store.setJSON(wabaKey(phoneNumberId), state);
  return true;
}

function upsertConversation(state, data) {
  const now = new Date().toISOString();
  const phone = String(data.customerPhone || '').replace(/\s/g, '');
  let conv = state.conversations.find((c) => {
    if (data.conversationId && c.id === data.conversationId) return true;
    const existingPhone = String(c.customerPhone || '').replace(/\D/g, '');
    const nextPhone = String(data.customerPhone || '').replace(/\D/g, '');
    return existingPhone && nextPhone && existingPhone === nextPhone;
  });
  if (!conv) {
    conv = {
      id: data.conversationId || `conv_${Date.now()}`,
      tenantId: data.tenantId,
      customerId: data.customerId || `cust_${phone.slice(-8) || Date.now()}`,
      customerPhone: data.customerPhone,
      customerName: data.customerName || `Customer ${phone.slice(-4)}`,
      phoneNumberId: data.phoneNumberId || '',
      status: 'AI_ACTIVE',
      lastMessageText: data.text || '',
      lastMessageAt: now,
      unreadCount: data.sender === 'CUSTOMER' ? 1 : 0,
      createdAt: now,
      updatedAt: now
    };
    state.conversations.unshift(conv);
  } else {
    conv.customerName = data.customerName || conv.customerName;
    conv.lastMessageText = data.text || conv.lastMessageText;
    conv.lastMessageAt = now;
    conv.updatedAt = now;
    if (data.sender === 'CUSTOMER') conv.unreadCount = (conv.unreadCount || 0) + 1;
    if (data.sender === 'STAFF' || data.sender === 'AI') conv.unreadCount = 0;
  }
  if (!state.messagesByConv[conv.id]) state.messagesByConv[conv.id] = [];
  return conv;
}

async function appendMessage(tenantId, data) {
  const state = await loadInbox(tenantId);
  const conv = upsertConversation(state, { ...data, tenantId });
  const msg = {
    id: data.id || `msg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    conversationId: conv.id,
    tenantId,
    sender: data.sender || 'CUSTOMER',
    text: data.text || '',
    whatsappMessageId: data.whatsappMessageId,
    status: data.status || 'DELIVERED',
    createdAt: new Date().toISOString()
  };
  state.messagesByConv[conv.id].push(msg);
  await saveInbox(tenantId, state);

  const phoneNumberId = data.phoneNumberId;
  if (phoneNumberId) {
    const waba = await loadWabaInbox(phoneNumberId);
    const wabaConv = upsertConversation(waba, { ...data, tenantId, conversationId: conv.id });
    if (!waba.messagesByConv[wabaConv.id]) waba.messagesByConv[wabaConv.id] = [];
    waba.messagesByConv[wabaConv.id].push(msg);
    await saveWabaInbox(phoneNumberId, waba);
  }

  return { conversation: conv, message: msg, persisted: true };
}

function mergeConvStates(states) {
  const map = new Map();
  const byPhone = new Map();
  for (const state of states) {
    for (const conv of state?.conversations || []) {
      if (!conv) continue;
      const phone = String(conv.customerPhone || '').replace(/\D/g, '');
      const prev = (conv.id && map.get(conv.id)) || (phone && byPhone.get(phone));
      const next =
        prev && new Date(prev.lastMessageAt || 0) > new Date(conv.lastMessageAt || 0) ? prev : conv;
      if (next.id) map.set(next.id, next);
      if (phone) byPhone.set(phone, next);
    }
  }
  const merged = [];
  const seen = new Set();
  for (const conv of [...map.values(), ...byPhone.values()]) {
    const key = conv.id || String(conv.customerPhone || '');
    if (!key || seen.has(key)) continue;
    seen.add(key);
    merged.push(conv);
  }
  return merged.sort(
    (a, b) => new Date(b.lastMessageAt || 0).getTime() - new Date(a.lastMessageAt || 0).getTime()
  );
}

async function listConversations(tenantId, phoneNumberId) {
  const phones = [...new Set([phoneNumberId, process.env.META_PHONE_NUMBER_ID].filter(Boolean))];
  const tenants = [...new Set([tenantId, 'unmapped'].filter(Boolean))];
  const states = await Promise.all([
    ...tenants.map((id) => loadInbox(id)),
    ...phones.map((id) => loadWabaInbox(id))
  ]);
  return mergeConvStates(states);
}

function collectMessages(state, conversationId) {
  if (state.messagesByConv[conversationId]?.length) return state.messagesByConv[conversationId];
  const conv = (state.conversations || []).find((c) => c.id === conversationId);
  if (!conv) return [];
  const phone = String(conv.customerPhone || '').replace(/\D/g, '');
  for (const other of state.conversations || []) {
    const otherPhone = String(other.customerPhone || '').replace(/\D/g, '');
    if (phone && otherPhone && phone === otherPhone && state.messagesByConv[other.id]?.length) {
      return state.messagesByConv[other.id];
    }
  }
  return [];
}

async function listMessages(tenantId, conversationId, phoneNumberId) {
  const phones = [...new Set([phoneNumberId, process.env.META_PHONE_NUMBER_ID].filter(Boolean))];
  const tenants = [...new Set([tenantId, 'unmapped'].filter(Boolean))];
  const states = await Promise.all([
    ...tenants.map((id) => loadInbox(id)),
    ...phones.map((id) => loadWabaInbox(id))
  ]);
  const seen = new Set();
  const merged = [];
  for (const state of states) {
    for (const msg of collectMessages(state, conversationId)) {
      if (!msg) continue;
      const key = msg.whatsappMessageId || msg.id || `${msg.sender}:${msg.text}:${msg.createdAt}`;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(msg);
    }
  }
  return merged.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}

async function setConversationStatus(tenantId, conversationId, status) {
  const state = await loadInbox(tenantId);
  const conv = state.conversations.find((c) => c.id === conversationId);
  if (!conv) return null;
  conv.status = status;
  conv.updatedAt = new Date().toISOString();
  await saveInbox(tenantId, state);
  return conv;
}

module.exports = {
  loadInbox,
  saveInbox,
  appendMessage,
  listConversations,
  listMessages,
  setConversationStatus
};
