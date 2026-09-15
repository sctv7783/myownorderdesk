const { getSupabaseConfig, isUuid, sbSelect, sbInsert, sbUpdate } = require('./supabase-rest.cjs');
const blob = require('./inbox-store.cjs');

function normalizePhone(phone) {
  return String(phone || '').replace(/\D/g, '');
}

function mapConversation(row, tenantId) {
  if (!row) return null;
  return {
    id: row.id,
    tenantId: row.business_id || tenantId,
    customerId: row.customer_id || `cust_${normalizePhone(row.customer_phone).slice(-8)}`,
    customerPhone: row.customer_phone,
    customerName: row.customer_name || `Customer ${(row.customer_phone || '').slice(-4)}`,
    phoneNumberId: row.phone_number_id || '',
    status: row.status || (row.agent_paused ? 'HUMAN_ACTIVE' : 'AI_ACTIVE'),
    lastMessageText: row.last_message_text || '',
    lastMessageAt: row.last_message_at || row.updated_at || row.created_at,
    unreadCount: Number(row.unread_count || 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at || row.created_at
  };
}

function mapMessage(row, tenantId) {
  if (!row) return null;
  const sender =
    row.sender ||
    (row.direction === 'inbound' ? 'CUSTOMER' : row.direction === 'outbound' ? 'AI' : 'AI');
  return {
    id: row.id,
    conversationId: row.conversation_id,
    tenantId: row.business_id || tenantId,
    sender,
    text: row.text || row.content || '',
    whatsappMessageId: row.whatsapp_message_id || undefined,
    status: (row.status || 'DELIVERED').toUpperCase(),
    createdAt: row.created_at
  };
}

async function listConversations(tenantId) {
  if (!getSupabaseConfig() || !isUuid(tenantId)) {
    return blob.listConversations(tenantId);
  }
  const { ok, rows } = await sbSelect('whatsapp_conversations', {
    select: '*',
    business_id: `eq.${tenantId}`,
    order: 'last_message_at.desc'
  });
  if (!ok) return blob.listConversations(tenantId);
  return rows.map((row) => mapConversation(row, tenantId));
}

async function listMessages(tenantId, conversationId) {
  if (!getSupabaseConfig() || !isUuid(tenantId) || !isUuid(conversationId)) {
    return blob.listMessages(tenantId, conversationId);
  }
  const { ok, rows } = await sbSelect('whatsapp_messages', {
    select: '*',
    conversation_id: `eq.${conversationId}`,
    order: 'created_at.asc'
  });
  if (!ok) return blob.listMessages(tenantId, conversationId);
  return rows.map((row) => mapMessage(row, tenantId));
}

async function findConversation(tenantId, { conversationId, customerPhone }) {
  if (conversationId && isUuid(conversationId)) {
    const { rows } = await sbSelect('whatsapp_conversations', {
      select: '*',
      id: `eq.${conversationId}`,
      business_id: `eq.${tenantId}`
    });
    if (rows[0]) return rows[0];
  }
  const phone = String(customerPhone || '').trim();
  if (!phone) return null;
  const { rows } = await sbSelect('whatsapp_conversations', {
    select: '*',
    business_id: `eq.${tenantId}`,
    customer_phone: `eq.${phone}`
  });
  if (rows[0]) return rows[0];
  const digits = normalizePhone(phone);
  const all = await sbSelect('whatsapp_conversations', {
    select: '*',
    business_id: `eq.${tenantId}`
  });
  return all.rows.find((row) => normalizePhone(row.customer_phone) === digits) || null;
}

async function appendMessage(tenantId, data) {
  if (!getSupabaseConfig() || !isUuid(tenantId)) {
    return blob.appendMessage(tenantId, data);
  }

  const now = new Date().toISOString();
  const sender = data.sender || 'CUSTOMER';
  const text = data.text || '';
  let conv = await findConversation(tenantId, data);

  if (!conv) {
    const created = await sbInsert('whatsapp_conversations', {
      business_id: tenantId,
      customer_phone: data.customerPhone || 'unknown',
      customer_name: data.customerName || 'Customer',
      phone_number_id: data.phoneNumberId || '',
      status: 'AI_ACTIVE',
      last_message_text: text,
      last_message_at: now,
      unread_count: sender === 'CUSTOMER' ? 1 : 0,
      updated_at: now
    });
    conv = Array.isArray(created.data) ? created.data[0] : created.data;
    if (!conv?.id) return blob.appendMessage(tenantId, data);
  } else {
    await sbUpdate(
      'whatsapp_conversations',
      { id: `eq.${conv.id}` },
      {
        customer_name: data.customerName || conv.customer_name,
        last_message_text: text,
        last_message_at: now,
        unread_count: sender === 'CUSTOMER' ? Number(conv.unread_count || 0) + 1 : 0,
        updated_at: now
      }
    );
  }

  const direction = sender === 'CUSTOMER' ? 'inbound' : 'outbound';
  const inserted = await sbInsert('whatsapp_messages', {
    business_id: tenantId,
    conversation_id: conv.id,
    direction,
    sender,
    message_type: 'text',
    content: text,
    text,
    whatsapp_message_id: data.whatsappMessageId || null,
    status: data.status || 'DELIVERED',
    created_at: now
  });

  const msg = Array.isArray(inserted.data) ? inserted.data[0] : inserted.data;
  if (!inserted.ok || !msg) {
    return blob.appendMessage(tenantId, { ...data, conversationId: conv.id });
  }

  return {
    conversation: mapConversation(conv, tenantId),
    message: mapMessage(msg, tenantId),
    persisted: true
  };
}

async function setConversationStatus(tenantId, conversationId, status) {
  if (!getSupabaseConfig() || !isUuid(conversationId)) {
    return blob.setConversationStatus(tenantId, conversationId, status);
  }
  const result = await sbUpdate(
    'whatsapp_conversations',
    { id: `eq.${conversationId}`, business_id: `eq.${tenantId}` },
    {
      status,
      agent_paused: status === 'HUMAN_ACTIVE',
      updated_at: new Date().toISOString()
    }
  );
  const row = Array.isArray(result.data) ? result.data[0] : result.data;
  return mapConversation(row, tenantId);
}

module.exports = {
  listConversations,
  listMessages,
  appendMessage,
  setConversationStatus
};
