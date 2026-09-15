const STORE_NAME = 'orderdesk-inbox';

async function getStore() {
  try {
    const { getStore } = require('@netlify/blobs');
    return getStore(STORE_NAME);
  } catch (err) {
    console.warn('[Inbox Store] Blobs unavailable:', err?.message || err);
    return null;
  }
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
  return { conversation: conv, message: msg, persisted: true };
}

async function listConversations(tenantId) {
  const state = await loadInbox(tenantId);
  return [...state.conversations].sort(
    (a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime()
  );
}

async function listMessages(tenantId, conversationId) {
  const state = await loadInbox(tenantId);
  return state.messagesByConv[conversationId] || [];
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
