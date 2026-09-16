const { getSupabaseConfig, isUuid, sbSelect, sbInsert, sbUpdate } = require('./supabase-rest.cjs');
const blob = require('./inbox-store.cjs');

function normalizePhone(phone) {
  return String(phone || '').replace(/\D/g, '');
}

function displayPhone(phone) {
  const digits = normalizePhone(phone);
  if (!digits) return String(phone || '').trim() || 'unknown';
  return digits.startsWith('92') ? `+${digits}` : `+${digits}`;
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

function mergeConversations(primary, secondary) {
  const map = new Map();
  const byPhone = new Map();
  for (const conv of [...secondary, ...primary]) {
    if (!conv) continue;
    const phone = normalizePhone(conv.customerPhone);
    const prev = (conv.id && map.get(conv.id)) || (phone && byPhone.get(phone)) || null;
    const next =
      !prev || new Date(conv.lastMessageAt || 0).getTime() >= new Date(prev.lastMessageAt || 0).getTime()
        ? { ...prev, ...conv }
        : { ...conv, ...prev };
    if (prev?.id && next.id && prev.id !== next.id) {
      map.delete(prev.id);
    }
    map.set(next.id || phone, next);
    if (phone) byPhone.set(phone, next);
  }
  return [...map.values()].sort(
    (a, b) => new Date(b.lastMessageAt || 0).getTime() - new Date(a.lastMessageAt || 0).getTime()
  );
}

async function insertVariants(table, variants) {
  for (const body of variants) {
    const result = await sbInsert(table, body);
    if (result.ok) {
      const row = Array.isArray(result.data) ? result.data[0] : result.data;
      if (row) return { ok: true, row };
    }
  }
  return { ok: false, row: null };
}

async function conversationsFromMessages(tenantId) {
  const { ok, rows } = await sbSelect('whatsapp_messages', {
    select: '*',
    business_id: `eq.${tenantId}`,
    order: 'created_at.desc',
    limit: '200'
  });
  if (!ok || !rows.length) return [];
  const byConv = new Map();
  for (const row of rows) {
    const id = row.conversation_id;
    if (!id || byConv.has(id)) continue;
    byConv.set(id, {
      id,
      tenantId,
      customerId: `cust_${String(id).slice(-8)}`,
      customerPhone: '',
      customerName: 'Customer',
      phoneNumberId: '',
      status: 'AI_ACTIVE',
      lastMessageText: row.text || row.content || '',
      lastMessageAt: row.created_at,
      unreadCount: 0,
      createdAt: row.created_at,
      updatedAt: row.created_at
    });
  }
  const convRows = await sbSelect('whatsapp_conversations', {
    select: '*',
    business_id: `eq.${tenantId}`
  });
  return [...byConv.values()].map((conv) => {
    const row = (convRows.rows || []).find((item) => item.id === conv.id);
    return row ? mapConversation(row, tenantId) : conv;
  });
}

async function listConversations(tenantId, phoneNumberId) {
  const wabaId = phoneNumberId || process.env.META_PHONE_NUMBER_ID || '';
  const local = await blob.listConversations(tenantId, wabaId);
  if (!getSupabaseConfig()) return local;
  const remoteChunks = [];
  if (isUuid(tenantId)) {
    let remoteRes = await sbSelect('whatsapp_conversations', {
      select: '*',
      business_id: `eq.${tenantId}`,
      order: 'last_message_at.desc'
    });
    if (!remoteRes.ok) {
      remoteRes = await sbSelect('whatsapp_conversations', {
        select: '*',
        business_id: `eq.${tenantId}`
      });
    }
    if (remoteRes.ok) remoteChunks.push(remoteRes.rows.map((row) => mapConversation(row, tenantId)));
  }
  if (wabaId) {
    const byPhone = await sbSelect('whatsapp_conversations', {
      select: '*',
      phone_number_id: `eq.${wabaId}`
    });
    if (byPhone.ok && byPhone.rows.length) {
      remoteChunks.push(byPhone.rows.map((row) => mapConversation(row, tenantId)));
    }
  }
  let remote = remoteChunks.flat();
  const fromMessages = isUuid(tenantId) ? await conversationsFromMessages(tenantId) : [];
  return mergeConversations(remote, mergeConversations(fromMessages, local));
}

async function listMessages(tenantId, conversationId, phoneNumberId) {
  const local = await blob.listMessages(tenantId, conversationId, phoneNumberId);
  if (!getSupabaseConfig() || !isUuid(tenantId)) return local;
  if (isUuid(conversationId)) {
    const { ok, rows } = await sbSelect('whatsapp_messages', {
      select: '*',
      conversation_id: `eq.${conversationId}`,
      order: 'created_at.asc'
    });
    if (ok && rows.length) {
      const remote = rows.map((row) => mapMessage(row, tenantId));
      const seen = new Set(remote.map((m) => m.whatsappMessageId || `${m.sender}:${m.text}:${m.createdAt}`));
      const extras = local.filter((m) => !seen.has(m.whatsappMessageId || `${m.sender}:${m.text}:${m.createdAt}`));
      return [...remote, ...extras].sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );
    }
  }
  return local;
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
  const phone = displayPhone(customerPhone);
  const digits = normalizePhone(customerPhone);
  if (!digits) return null;
  const { rows } = await sbSelect('whatsapp_conversations', {
    select: '*',
    business_id: `eq.${tenantId}`
  });
  return (
    (rows || []).find((row) => normalizePhone(row.customer_phone) === digits) ||
    (rows || []).find((row) => row.customer_phone === phone) ||
    null
  );
}

async function appendMessage(tenantId, data) {
  const now = new Date().toISOString();
  const sender = data.sender || 'CUSTOMER';
  const text = data.text || '';
  const phone = displayPhone(data.customerPhone);

  let remoteConv = null;
  if (getSupabaseConfig() && isUuid(tenantId)) {
    remoteConv = await findConversation(tenantId, { ...data, customerPhone: phone });
    if (!remoteConv) {
      const created = await insertVariants('whatsapp_conversations', [
        {
          business_id: tenantId,
          customer_phone: phone,
          customer_name: data.customerName || 'Customer',
          phone_number_id: data.phoneNumberId || '',
          status: 'AI_ACTIVE',
          last_message_text: text,
          last_message_at: now,
          unread_count: sender === 'CUSTOMER' ? 1 : 0,
          updated_at: now
        },
        {
          business_id: tenantId,
          customer_phone: phone,
          customer_name: data.customerName || 'Customer',
          last_message_text: text
        }
      ]);
      remoteConv = created.row;
      if (!remoteConv) {
        console.warn('[Inbox] whatsapp_conversations insert failed for', tenantId, phone);
      }
    } else {
      await sbUpdate(
        'whatsapp_conversations',
        { id: `eq.${remoteConv.id}` },
        {
          customer_name: data.customerName || remoteConv.customer_name,
          last_message_text: text,
          last_message_at: now,
          unread_count: sender === 'CUSTOMER' ? Number(remoteConv.unread_count || 0) + 1 : 0,
          updated_at: now
        }
      );
    }

    if (remoteConv?.id) {
      const direction = sender === 'CUSTOMER' ? 'inbound' : 'outbound';
      await insertVariants('whatsapp_messages', [
        {
          business_id: tenantId,
          conversation_id: remoteConv.id,
          direction,
          sender,
          message_type: 'text',
          content: text,
          text,
          whatsapp_message_id: data.whatsappMessageId || null,
          status: data.status || 'DELIVERED',
          created_at: now
        },
        {
          conversation_id: remoteConv.id,
          direction,
          content: text,
          created_at: now
        }
      ]);
    }
  }

  const local = await blob.appendMessage(tenantId, {
    ...data,
    conversationId: remoteConv?.id || data.conversationId,
    customerPhone: phone,
    tenantId
  });

  return {
    conversation: remoteConv ? mapConversation(remoteConv, tenantId) : local.conversation,
    message: local.message,
    persisted: true
  };
}

async function setConversationStatus(tenantId, conversationId, status) {
  if (getSupabaseConfig() && isUuid(conversationId)) {
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
    if (row) return mapConversation(row, tenantId);
  }
  return blob.setConversationStatus(tenantId, conversationId, status);
}

module.exports = {
  listConversations,
  listMessages,
  appendMessage,
  setConversationStatus
};
