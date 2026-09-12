import { WhatsAppAccount, WhatsAppPhoneNumber } from './types';

export interface StoredWhatsAppConfig {
  wabaId: string;
  phoneNumberId: string;
  accessToken: string;
  displayNumber: string;
  verifiedName?: string;
  qualityRating?: string;
}

function storageKey(tenantId: string) {
  return `orderdesk_whatsapp_config_${tenantId}`;
}

export function loadLocalWhatsAppConfig(tenantId: string): StoredWhatsAppConfig | null {
  try {
    const raw = localStorage.getItem(storageKey(tenantId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredWhatsAppConfig;
    if (!parsed?.wabaId || !parsed?.phoneNumberId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveLocalWhatsAppConfig(tenantId: string, data: StoredWhatsAppConfig) {
  localStorage.setItem(storageKey(tenantId), JSON.stringify(data));
}

export function localConfigToAccount(
  tenantId: string,
  data: StoredWhatsAppConfig
): { account: WhatsAppAccount; phoneNumbers: WhatsAppPhoneNumber[] } {
  const now = new Date().toISOString();
  const account: WhatsAppAccount = {
    id: `waba_acc_${tenantId}`,
    tenantId,
    wabaId: data.wabaId,
    businessName: data.verifiedName || 'WhatsApp Business',
    status: 'CONNECTED',
    lastVerifiedAt: now,
    createdAt: now,
    updatedAt: now
  };
  const phoneNumbers: WhatsAppPhoneNumber[] = [
    {
      id: `phone_rec_${tenantId}`,
      tenantId,
      whatsappAccountId: account.id,
      phoneNumberId: data.phoneNumberId,
      displayPhoneNumber: data.displayNumber,
      verifiedName: data.verifiedName || 'WhatsApp Business',
      qualityRating: data.qualityRating || 'GREEN',
      messagingLimitTier: 'TIER_1K',
      status: 'CONNECTED',
      isPrimary: true,
      createdAt: now,
      updatedAt: now
    }
  ];
  return { account, phoneNumbers };
}
