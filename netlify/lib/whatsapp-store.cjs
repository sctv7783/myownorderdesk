const STORE_NAME = 'whatsapp-config';

function tenantKey(tenantId) {
  return `tenant:${tenantId || 'default'}`;
}

function publicAccount(record) {
  if (!record) return null;
  const token = record.accessToken || '';
  return {
    id: record.accountId || `waba_acc_${record.tenantId}`,
    tenantId: record.tenantId,
    wabaId: record.wabaId,
    businessName: record.verifiedName || record.businessName || 'WhatsApp Business',
    status: record.status || 'CONNECTED',
    hasAccessToken: Boolean(token),
    accessTokenMasked: token ? `${token.slice(0, 6)}…${token.slice(-4)}` : '',
    lastVerifiedAt: record.lastVerifiedAt,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt
  };
}

function publicPhone(record) {
  if (!record) return null;
  return {
    id: record.phoneRecordId || `phone_rec_${record.tenantId}`,
    tenantId: record.tenantId,
    whatsappAccountId: record.accountId || `waba_acc_${record.tenantId}`,
    phoneNumberId: record.phoneNumberId,
    displayPhoneNumber: record.displayPhoneNumber,
    verifiedName: record.verifiedName || 'WhatsApp Business',
    qualityRating: record.qualityRating || 'GREEN',
    messagingLimitTier: record.messagingLimitTier || 'TIER_1K',
    status: record.status || 'CONNECTED',
    isPrimary: true,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt
  };
}

async function getBlobStore() {
  try {
    const { getStore } = require('@netlify/blobs');
    return getStore(STORE_NAME);
  } catch (err) {
    console.warn('[WhatsApp Store] Blobs unavailable:', err?.message || err);
    return null;
  }
}

async function loadConfig(tenantId) {
  const store = await getBlobStore();
  if (!store) return null;
  try {
    return (await store.get(tenantKey(tenantId), { type: 'json' })) || null;
  } catch (err) {
    console.warn('[WhatsApp Store] Load failed:', err?.message || err);
    return null;
  }
}

async function saveConfig(tenantId, data) {
  const now = new Date().toISOString();
  const record = {
    tenantId,
    accountId: data.accountId || `waba_acc_${tenantId}`,
    phoneRecordId: data.phoneRecordId || `phone_rec_${tenantId}`,
    wabaId: data.wabaId,
    phoneNumberId: data.phoneNumberId,
    displayPhoneNumber: data.displayPhoneNumber,
    verifiedName: data.verifiedName,
    businessName: data.businessName || data.verifiedName,
    accessToken: data.accessToken,
    qualityRating: data.qualityRating || 'GREEN',
    messagingLimitTier: data.messagingLimitTier || 'TIER_1K',
    status: 'CONNECTED',
    createdAt: data.createdAt || now,
    updatedAt: now,
    lastVerifiedAt: now
  };

  const store = await getBlobStore();
  if (!store) {
    return { persisted: false, record };
  }
  await store.setJSON(tenantKey(tenantId), record);
  if (record.phoneNumberId) {
    await store.setJSON(`phone:${record.phoneNumberId}`, record);
  }
  return { persisted: true, record };
}

async function loadConfigByPhone(phoneNumberId) {
  if (!phoneNumberId) return null;
  const store = await getBlobStore();
  if (!store) return null;
  try {
    return (await store.get(`phone:${phoneNumberId}`, { type: 'json' })) || null;
  } catch (err) {
    console.warn('[WhatsApp Store] Phone lookup failed:', err?.message || err);
    return null;
  }
}

function configResponse(record, extras) {
  return {
    success: true,
    persisted: extras?.persisted !== false,
    account: publicAccount(record),
    phoneNumbers: record ? [publicPhone(record)] : [],
    primaryPhone: record ? publicPhone(record) : null,
    webhookUrl: `${process.env.APP_URL || 'https://whats-app-orderdesk.netlify.app'}/api/whatsapp/webhook`,
    verifyToken: process.env.META_VERIFY_TOKEN || 'orderdesk_webhook_verify_token_secure',
    metaAppId: process.env.META_APP_ID || '',
    ...extras
  };
}

module.exports = {
  loadConfig,
  loadConfigByPhone,
  saveConfig,
  publicAccount,
  publicPhone,
  configResponse
};
