const { getNamedStore } = require('./blobs.cjs');

const STORE_NAME = 'orderdesk-inbox';

async function getStore() {
  return getNamedStore(STORE_NAME);
}

function emptyState() {
  return { conversations: [], messagesByConv: {} };
}

async function loadJson(key) {
  const store = await getStore();
  if (!store || !key) return emptyState();
  try {
    return (await store.get(key, { type: 'json' })) || emptyState();
  } catch {
    return emptyState();
  }
}

async function saveJson(key, state) {
  const store = await getStore();
  if (!store || !key) return false;
  await store.setJSON(key, state);
  return true;
}

async function loadInbox(tenantId) {
  return loadJson(`tenant:${tenantId}`);
}

async function saveInbox(tenantId, state) {
  return saveJson(`tenant:${tenantId}`, state);
}

function wabaKey(phoneNumberId) {
  return `waba:${String(phoneNumberId || '').trim()}`;
}

async function loadWabaInbox(phoneNumberId) {
  if (!phoneNumberId) return emptyState();
  return loadJson(wabaKey(phoneNumberId));
}

async function saveWabaInbox(phoneNumberId, state) {
  if (!phoneNumberId) return false;
  return saveJson(wabaKey(phoneNumberId), state);
}

async function loadAllInboxStates() {
  const store = await getStore();
  const states = [await loadInbox('__all__'), await loadInbox('unmapped')];
  if (!store || typeof store.list !== 'function') return states;
  try {
    let listed = await store.list();
    const keys = [];
    const pushKeys = (result) => {
      for (const blob of result?.blobs || []) {
        if (blob?.key) keys.push(blob.key);
      }
    };
    pushKeys(listed);
    while (listed?.next) {
      listed = await listed.next();
      pushKeys(listed);
    }
    const unique = [...new Set(keys.filter((key) => /^(tenant:|waba:)/.test(key)))];
    const extra = await Promise.all(unique.slice(0, 40).map((key) => loadJson(key)));
    states.push(...extra);
  } catch (err) {
    console.warn('[Inbox] blob list failed', err?.message || err);
  }
  return states;
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
  const all = await loadInbox('__all__');
  upsertConversation(all, { ...data, tenantId, conversationId: conv.id });
  if (!all.messagesByConv[conv.id]) all.messagesByConv[conv.id] = [];
  all.messagesByConv[conv.id].push(msg);
  await saveInbox('__all__', all);

  const phoneNumberId = data.phoneNumberId || process.env.META_PHONE_NUMBER_ID;
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
      if (phone.startsWith('sim') || String(conv.customerPhone || '').startsWith('sim:')) continue;
      const prev = (conv.id && map.get(conv.id)) || (phone && byPhone.get(phone));
      const next =
        prev && new Date(prev.lastMessageAt || 0) > new Date(conv.lastMessageAt || 0)
          ? { ...conv, ...prev }
          : { ...prev, ...conv };
      if (prev?.id && next.id && prev.id !== next.id) map.delete(prev.id);
      if (next.id) map.set(next.id, next);
      if (phone) byPhone.set(phone, next);
    }
  }
  const seenPhone = new Set();
  const merged = [];
  for (const conv of byPhone.size ? byPhone.values() : map.values()) {
    const phone = String(conv.customerPhone || '').replace(/\D/g, '');
    const key = phone || conv.id;
    if (!key || seenPhone.has(key)) continue;
    seenPhone.add(key);
    merged.push(conv);
  }
  return merged.sort(
    (a, b) => new Date(b.lastMessageAt || 0).getTime() - new Date(a.lastMessageAt || 0).getTime()
  );
}

async function listConversations(tenantId, phoneNumberId) {
  const phones = [...new Set([phoneNumberId, process.env.META_PHONE_NUMBER_ID].filter(Boolean))];
  const tenants = [...new Set([tenantId, 'unmapped', '__all__'].filter(Boolean))];
  const [named, listed] = await Promise.all([
    Promise.all([...tenants.map((id) => loadInbox(id)), ...phones.map((id) => loadWabaInbox(id))]),
    loadAllInboxStates()
  ]);
  return mergeConvStates([...named, ...listed]);
}

function collectMessages(state, conversationId) {
  const out = [];
  if (state.messagesByConv[conversationId]?.length) {
    out.push(...state.messagesByConv[conversationId]);
  }
  const conv = (state.conversations || []).find((c) => c.id === conversationId);
  const phone = String(conv?.customerPhone || '').replace(/\D/g, '');
  for (const other of state.conversations || []) {
    const otherPhone = String(other.customerPhone || '').replace(/\D/g, '');
    if (phone && otherPhone && phone === otherPhone && state.messagesByConv[other.id]?.length) {
      out.push(...state.messagesByConv[other.id]);
    }
  }
  return out;
}

async function listMessages(tenantId, conversationId, phoneNumberId) {
  const phones = [...new Set([phoneNumberId, process.env.META_PHONE_NUMBER_ID].filter(Boolean))];
  const tenants = [...new Set([tenantId, 'unmapped', '__all__'].filter(Boolean))];
  const named = await Promise.all([
    ...tenants.map((id) => loadInbox(id)),
    ...phones.map((id) => loadWabaInbox(id))
  ]);
  const listed = await loadAllInboxStates();
  const states = [...named, ...listed];
  let customerPhone = '';
  for (const state of states) {
    const conv = (state.conversations || []).find((c) => c.id === conversationId);
    if (conv?.customerPhone) {
      customerPhone = String(conv.customerPhone).replace(/\D/g, '');
      break;
    }
  }
  const seen = new Set();
  const merged = [];
  for (const state of states) {
    const ids = new Set([conversationId]);
    if (customerPhone) {
      for (const conv of state.conversations || []) {
        const phone = String(conv.customerPhone || '').replace(/\D/g, '');
        if (phone && phone === customerPhone && conv.id) ids.add(conv.id);
      }
    }
    for (const id of ids) {
      for (const msg of state.messagesByConv?.[id] || []) {
        if (!msg) continue;
        const key = msg.whatsappMessageId || msg.id || `${msg.sender}:${msg.text}:${msg.createdAt}`;
        if (seen.has(key)) continue;
        seen.add(key);
        merged.push(msg);
      }
    }
  }
  return merged.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}

async function setConversationStatus(tenantId, conversationId, status) {
  const targets = [...new Set([tenantId, 'unmapped', '__all__'].filter(Boolean))];
  for (const id of targets) {
    const state = await loadInbox(id);
    const conv = state.conversations.find((c) => c.id === conversationId);
    if (!conv) continue;
    conv.status = status;
    conv.updatedAt = new Date().toISOString();
    await saveInbox(id, state);
    return conv;
  }
  return null;
}

module.exports = {
  loadInbox,
  saveInbox,
  appendMessage,
  listConversations,
  listMessages,
  setConversationStatus
};
