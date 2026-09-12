import {
  Tenant,
  Profile,
  TenantMember,
  BusinessProfile,
  BusinessHours,
  BusinessPaymentMethod,
  WhatsAppAccount,
  WhatsAppPhoneNumber,
  WebhookEvent,
  Product,
  ProductCategory,
  InventoryMovement,
  Customer,
  Conversation,
  ConversationMessage,
  Order,
  OrderItem,
  OrderStatusHistory,
  AgentSettings,
  AgentKnowledgeItem,
  AgentRun,
  TenantSubscription,
  Notification,
  AuditLog,
  OrderStatus
} from '../src/types';

import {
  persistOrderToSupabase,
  persistOrderStatusToSupabase,
  persistProductStockToSupabase,
  persistProductToSupabase,
  persistMessageToSupabase
} from './supabase';

// Helper to generate IDs
export function generateId(prefix: string = ''): string {
  const rand = Math.random().toString(36).substring(2, 10);
  const time = Date.now().toString(36);
  return prefix ? `${prefix}_${time}_${rand}` : `${time}-${rand}`;
}

export function generateOrderNumber(): string {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const randomNum = Math.floor(1000 + Math.random() * 9000);
  return `ORD-${dateStr}-${randomNum}`;
}

// In-Memory Database Store with Pre-seeded Multi-tenant Data & Supabase sync
export class OrderDeskStore {
  profiles: Profile[] = [];
  tenants: Tenant[] = [];
  tenantMembers: TenantMember[] = [];
  businessProfiles: BusinessProfile[] = [];
  businessHours: BusinessHours[] = [];
  paymentMethods: BusinessPaymentMethod[] = [];
  whatsappAccounts: WhatsAppAccount[] = [];
  whatsappPhoneNumbers: WhatsAppPhoneNumber[] = [];
  webhookEvents: WebhookEvent[] = [];
  categories: ProductCategory[] = [];
  products: Product[] = [];
  inventoryMovements: InventoryMovement[] = [];
  customers: Customer[] = [];
  conversations: Conversation[] = [];
  messages: ConversationMessage[] = [];
  orders: Order[] = [];
  orderItems: OrderItem[] = [];
  orderStatusHistory: OrderStatusHistory[] = [];
  agentSettings: AgentSettings[] = [];
  agentKnowledge: AgentKnowledgeItem[] = [];
  agentRuns: AgentRun[] = [];
  subscriptions: TenantSubscription[] = [];
  notifications: Notification[] = [];
  auditLogs: AuditLog[] = [];

  constructor() {
    this.seedInitialData();
  }

  private seedInitialData() {
    // 1. Primary Owner Profile
    const ownerProfile: Profile = {
      id: 'usr_owner_001',
      email: 'sctv7783@gmail.com',
      fullName: 'Sariq Tariq (Admin)',
      createdAt: new Date().toISOString()
    };
    this.profiles.push(ownerProfile);

    // 2. Tenant A: Khyber Delight Restaurant (Food & Restaurant)
    const tenantA: Tenant = {
      id: 'tenant_khyber_001',
      name: 'Khyber Delight Restaurant',
      slug: 'khyber-delight',
      businessType: 'Restaurant',
      currency: 'PKR',
      timezone: 'Asia/Karachi',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    this.tenants.push(tenantA);

    this.tenantMembers.push({
      id: generateId('mem'),
      tenantId: tenantA.id,
      userId: ownerProfile.id,
      role: 'OWNER',
      status: 'ACTIVE',
      createdAt: new Date().toISOString(),
      profile: ownerProfile
    });

    this.businessProfiles.push({
      id: generateId('bp'),
      tenantId: tenantA.id,
      businessName: 'Khyber Delight Restaurant',
      businessType: 'Restaurant',
      phone: '+92 300 1234567',
      email: 'orders@khyberdelight.com',
      address: 'Main Commercial Area, DHA Phase 5',
      city: 'Lahore',
      description: 'Authentic Traditional Fast Food, Crispy Burgers & Karahi.',
      deliveryFee: 150,
      freeDeliveryThreshold: 2000,
      estimatedDeliveryTime: '30-40 mins',
      currency: 'PKR',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    const wabaA: WhatsAppAccount = {
      id: 'waba_khyber_acc',
      tenantId: tenantA.id,
      wabaId: 'waba_khyber_1001',
      businessName: 'Khyber Delight Official',
      status: 'CONNECTED',
      lastVerifiedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    this.whatsappAccounts.push(wabaA);

    const phoneA: WhatsAppPhoneNumber = {
      id: 'phone_rec_khyber_001',
      tenantId: tenantA.id,
      whatsappAccountId: wabaA.id,
      phoneNumberId: 'phone_id_khyber_1001',
      displayPhoneNumber: '+92 300 1234567',
      verifiedName: 'Khyber Delight Orders',
      qualityRating: 'GREEN',
      messagingLimitTier: 'TIER_10K',
      status: 'CONNECTED',
      isPrimary: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    this.whatsappPhoneNumbers.push(phoneA);

    // Products for Tenant A
    const catA1 = { id: generateId('cat'), tenantId: tenantA.id, name: 'Fast Food & Burgers', slug: 'burgers', createdAt: new Date().toISOString() };
    const catA2 = { id: generateId('cat'), tenantId: tenantA.id, name: 'Beverages', slug: 'beverages', createdAt: new Date().toISOString() };
    this.categories.push(catA1, catA2);

    const prodA1: Product = {
      id: 'prod_zinger_01',
      tenantId: tenantA.id,
      categoryId: catA1.id,
      categoryName: 'Fast Food & Burgers',
      name: 'Zinger Burger',
      sku: 'KHY-ZNG-01',
      description: 'Crispy fried chicken breast fillet with spicy mayo and fresh lettuce in toasted sesame bun.',
      price: 550,
      stockQuantity: 45,
      reservedQuantity: 2,
      availableQuantity: 43,
      lowStockThreshold: 10,
      isActive: true,
      imageUrl: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=600&auto=format&fit=crop&q=80',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const prodA2: Product = {
      id: 'prod_beef_02',
      tenantId: tenantA.id,
      categoryId: catA1.id,
      categoryName: 'Fast Food & Burgers',
      name: 'Smoky Beef Burger',
      sku: 'KHY-BEEF-02',
      description: 'Juicy 150g grilled beef patty, cheddar cheese, BBQ glaze and caramelized onions.',
      price: 650,
      stockQuantity: 28,
      reservedQuantity: 0,
      availableQuantity: 28,
      lowStockThreshold: 5,
      isActive: true,
      imageUrl: 'https://images.unsplash.com/photo-1550547660-d9450f859349?w=600&auto=format&fit=crop&q=80',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const prodA3: Product = {
      id: 'prod_fries_03',
      tenantId: tenantA.id,
      categoryId: catA1.id,
      categoryName: 'Fast Food & Burgers',
      name: 'Masala Fries (Large)',
      sku: 'KHY-FRIES-03',
      description: 'Golden crispy potato fries seasoned with chef special chaat masala.',
      price: 250,
      stockQuantity: 80,
      reservedQuantity: 0,
      availableQuantity: 80,
      lowStockThreshold: 15,
      isActive: true,
      imageUrl: 'https://images.unsplash.com/photo-1576107232684-1279f3908594?w=600&auto=format&fit=crop&q=80',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    this.products.push(prodA1, prodA2, prodA3);

    // AI Settings for Tenant A
    this.agentSettings.push({
      id: generateId('as'),
      tenantId: tenantA.id,
      isEnabled: true,
      model: 'openai/gpt-oss-20b',
      primaryLanguage: 'auto',
      tone: 'friendly',
      greetingMessage: 'Assalam-o-Alaikum! Welcome to Khyber Delight. Main aapka AI assistant hoon. Aaj kya order karna chahenge?',
      customInstructions: 'We serve fresh food within 30-40 mins. Always verify if customer wants cold drink or fries with burger. Delivery charges are Rs 150. Cash on delivery accepted.',
      orderConfirmationRequired: true,
      handoffKeywords: ['human', 'agent', 'staff', 'manager', 'shikayat', 'complaint'],
      enableStockCheck: true,
      autoHandoffOnComplaint: true,
      workingHoursOnly: false,
      maxToolLoops: 5,
      updatedAt: new Date().toISOString()
    });

    // Knowledge base for Tenant A
    this.agentKnowledge.push(
      { id: generateId('ak'), tenantId: tenantA.id, category: 'DELIVERY', question: 'Delivery charges and timing?', answer: 'Delivery fee is Rs. 150 across DHA & Gulberg. Orders arrive in 35-45 minutes.', isActive: true },
      { id: generateId('ak'), tenantId: tenantA.id, category: 'PAYMENT', question: 'Payment methods accepted?', answer: 'We accept Cash On Delivery (COD), EasyPaisa, and JazzCash.', isActive: true }
    );

    // Customer & Conversation for Tenant A
    const custA1: Customer = {
      id: 'cust_khyber_01',
      tenantId: tenantA.id,
      phone: '+92 333 4567890',
      name: 'Hamza Khan',
      email: 'hamza@example.com',
      address: 'House 42, Street 7, Sector Y, DHA Phase 3',
      city: 'Lahore',
      tags: ['Frequent Customer', 'WhatsApp'],
      notes: 'Prefers extra spicy sauce.',
      firstContact: new Date(Date.now() - 86400000 * 5).toISOString(),
      lastContact: new Date().toISOString(),
      orderCount: 3,
      totalSpend: 3450,
      status: 'VIP'
    };
    this.customers.push(custA1);

    const convA1: Conversation = {
      id: 'conv_khyber_01',
      tenantId: tenantA.id,
      customerId: custA1.id,
      customerPhone: custA1.phone,
      customerName: custA1.name,
      phoneNumberId: phoneA.phoneNumberId,
      status: 'AI_ACTIVE',
      lastMessageText: '2 Zinger Burger aur 1 Masala Fries chahiye',
      lastMessageAt: new Date().toISOString(),
      unreadCount: 0,
      createdAt: new Date(Date.now() - 3600000).toISOString(),
      updatedAt: new Date().toISOString()
    };
    this.conversations.push(convA1);

    this.messages.push(
      {
        id: generateId('msg'),
        conversationId: convA1.id,
        tenantId: tenantA.id,
        sender: 'CUSTOMER',
        text: 'Assalam o Alaikum, menu mil sakta hai?',
        createdAt: new Date(Date.now() - 1800000).toISOString()
      },
      {
        id: generateId('msg'),
        conversationId: convA1.id,
        tenantId: tenantA.id,
        sender: 'AI',
        text: 'Walaikum Assalam! Hamare paas Crispy Zinger Burger (Rs. 550), Smoky Beef Burger (Rs. 650), aur Masala Fries (Rs. 250) available hain. Aap kya pasand karenge?',
        createdAt: new Date(Date.now() - 1700000).toISOString()
      },
      {
        id: generateId('msg'),
        conversationId: convA1.id,
        tenantId: tenantA.id,
        sender: 'CUSTOMER',
        text: '2 Zinger Burger aur 1 Masala Fries chahiye',
        createdAt: new Date(Date.now() - 1200000).toISOString()
      },
      {
        id: generateId('msg'),
        conversationId: convA1.id,
        tenantId: tenantA.id,
        sender: 'AI',
        text: 'Bilkul! 2 Zinger Burgers (Rs. 1,100) + 1 Masala Fries (Rs. 250) + Delivery (Rs. 150). Total: Rs. 1,500. Kya main apka order confirm kar doon?',
        createdAt: new Date(Date.now() - 1100000).toISOString()
      }
    );

    // Initial Order for Tenant A
    const orderA1: Order = {
      id: generateId('ord'),
      tenantId: tenantA.id,
      customerId: custA1.id,
      customerName: custA1.name,
      customerPhone: custA1.phone,
      orderNumber: 'ORD-20260911-0012',
      status: 'CONFIRMED',
      items: [
        {
          id: generateId('item'),
          orderId: '',
          productId: prodA1.id,
          productName: prodA1.name,
          sku: prodA1.sku,
          unitPrice: 550,
          quantity: 2,
          subtotal: 1100
        },
        {
          id: generateId('item'),
          orderId: '',
          productId: prodA3.id,
          productName: prodA3.name,
          sku: prodA3.sku,
          unitPrice: 250,
          quantity: 1,
          subtotal: 250
        }
      ],
      subtotal: 1350,
      deliveryFee: 150,
      discount: 0,
      total: 1500,
      paymentMethod: 'COD',
      paymentStatus: 'PENDING',
      deliveryAddress: custA1.address || 'DHA Phase 3, Lahore',
      notes: 'Customer confirmed via WhatsApp AI',
      source: 'whatsapp_ai',
      createdAt: new Date(Date.now() - 1000000).toISOString(),
      updatedAt: new Date(Date.now() - 1000000).toISOString()
    };
    orderA1.items.forEach(it => (it.orderId = orderA1.id));
    this.orders.push(orderA1);
    this.orderItems.push(...orderA1.items);

    this.subscriptions.push({
      tenantId: tenantA.id,
      planId: 'pro',
      status: 'ACTIVE',
      ordersThisMonth: 42,
      currentPeriodStart: new Date(Date.now() - 86400000 * 12).toISOString(),
      currentPeriodEnd: new Date(Date.now() + 86400000 * 18).toISOString()
    });

    // 3. Tenant B: Urban Chic Apparel (Clothing & Fashion - Strictly Isolated from Tenant A)
    const tenantB: Tenant = {
      id: 'tenant_urban_002',
      name: 'Urban Chic Apparel',
      slug: 'urban-chic',
      businessType: 'Clothing',
      currency: 'PKR',
      timezone: 'Asia/Karachi',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    this.tenants.push(tenantB);

    this.tenantMembers.push({
      id: generateId('mem'),
      tenantId: tenantB.id,
      userId: ownerProfile.id,
      role: 'OWNER',
      status: 'ACTIVE',
      createdAt: new Date().toISOString(),
      profile: ownerProfile
    });

    this.businessProfiles.push({
      id: generateId('bp'),
      tenantId: tenantB.id,
      businessName: 'Urban Chic Apparel',
      businessType: 'Clothing',
      phone: '+92 321 7654321',
      email: 'support@urbanchic.pk',
      address: 'Shop 14, Dolmen Mall Clifton',
      city: 'Karachi',
      description: 'Premium Men & Women Casual Wear, Formal Shirts and Denim.',
      deliveryFee: 200,
      freeDeliveryThreshold: 3500,
      estimatedDeliveryTime: '2-3 business days',
      currency: 'PKR',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    const wabaB: WhatsAppAccount = {
      id: 'waba_urban_acc',
      tenantId: tenantB.id,
      wabaId: 'waba_urban_2002',
      businessName: 'Urban Chic Store',
      status: 'CONNECTED',
      lastVerifiedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    this.whatsappAccounts.push(wabaB);

    const phoneB: WhatsAppPhoneNumber = {
      id: 'phone_rec_urban_002',
      tenantId: tenantB.id,
      whatsappAccountId: wabaB.id,
      phoneNumberId: 'phone_id_urban_2002',
      displayPhoneNumber: '+92 321 7654321',
      verifiedName: 'Urban Chic Official',
      qualityRating: 'GREEN',
      messagingLimitTier: 'TIER_1K',
      status: 'CONNECTED',
      isPrimary: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    this.whatsappPhoneNumbers.push(phoneB);

    const prodB1: Product = {
      id: 'prod_shirt_b1',
      tenantId: tenantB.id,
      name: 'Black Slim-Fit Oxford Shirt',
      sku: 'URB-SHT-BLK',
      description: '100% premium Egyptian cotton casual button-down oxford shirt.',
      price: 2800,
      stockQuantity: 18,
      reservedQuantity: 1,
      availableQuantity: 17,
      lowStockThreshold: 4,
      isActive: true,
      imageUrl: 'https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?w=600&auto=format&fit=crop&q=80',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    this.products.push(prodB1);

    this.agentSettings.push({
      id: generateId('as'),
      tenantId: tenantB.id,
      isEnabled: true,
      model: 'openai/gpt-oss-20b',
      primaryLanguage: 'auto',
      tone: 'professional',
      greetingMessage: 'Welcome to Urban Chic Apparel. How may I assist you with your wardrobe today?',
      customInstructions: 'We offer hassle-free 7 days size exchange. Standard delivery takes 2-3 working days across Pakistan.',
      orderConfirmationRequired: true,
      handoffKeywords: ['human', 'agent', 'size guide', 'exchange'],
      enableStockCheck: true,
      autoHandoffOnComplaint: true,
      workingHoursOnly: false,
      maxToolLoops: 5,
      updatedAt: new Date().toISOString()
    });

    this.subscriptions.push({
      tenantId: tenantB.id,
      planId: 'starter',
      status: 'ACTIVE',
      ordersThisMonth: 14,
      currentPeriodStart: new Date().toISOString(),
      currentPeriodEnd: new Date(Date.now() + 86400000 * 30).toISOString()
    });
  }

  // --- Multi-Tenant Query Methods ---

  getTenant(id: string): Tenant | undefined {
    return this.tenants.find(t => t.id === id);
  }

  updateTenant(
    tenantId: string,
    updates: Partial<Pick<Tenant, 'name' | 'businessType' | 'currency' | 'timezone' | 'slug'>>
  ): Tenant | undefined {
    const tenant = this.tenants.find(t => t.id === tenantId);
    if (!tenant) return undefined;
    if (updates.name && updates.name.trim()) {
      tenant.name = updates.name.trim();
      tenant.slug = updates.slug || tenant.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    }
    if (updates.businessType) tenant.businessType = updates.businessType;
    if (updates.currency) tenant.currency = updates.currency;
    if (updates.timezone) tenant.timezone = updates.timezone;
    tenant.updatedAt = new Date().toISOString();
    const bp = this.businessProfiles.find(p => p.tenantId === tenantId);
    if (bp && updates.name) {
      bp.businessName = tenant.name;
      bp.updatedAt = tenant.updatedAt;
    }
    return tenant;
  }

  getTenantBySlug(slug: string): Tenant | undefined {
    return this.tenants.find(t => t.slug === slug);
  }

  getTenantByPhoneNumberId(phoneNumberId: string): { tenant: Tenant; phoneNumber: WhatsAppPhoneNumber } | null {
    const pn = this.whatsappPhoneNumbers.find(p => p.phoneNumberId === phoneNumberId);
    if (!pn) return null;
    const tenant = this.tenants.find(t => t.id === pn.tenantId);
    if (!tenant) return null;
    return { tenant, phoneNumber: pn };
  }

  getBusinessProfile(tenantId: string): BusinessProfile | undefined {
    return this.businessProfiles.find(bp => bp.tenantId === tenantId);
  }

  updateBusinessProfile(tenantId: string, updates: Partial<BusinessProfile>): BusinessProfile {
    let bp = this.businessProfiles.find(b => b.tenantId === tenantId);
    if (!bp) {
      bp = {
        id: generateId('bp'),
        tenantId,
        businessName: updates.businessName || 'My Business',
        businessType: updates.businessType || 'General',
        phone: updates.phone || '',
        email: updates.email || '',
        address: updates.address || '',
        city: updates.city || '',
        description: updates.description || '',
        deliveryFee: updates.deliveryFee || 0,
        currency: 'PKR',
        estimatedDeliveryTime: updates.estimatedDeliveryTime || '30 mins',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      this.businessProfiles.push(bp);
    } else {
      Object.assign(bp, updates, { updatedAt: new Date().toISOString() });
    }
    return bp;
  }

  // --- WhatsApp Connection Methods ---
  getWhatsAppAccount(tenantId: string): WhatsAppAccount | undefined {
    return this.whatsappAccounts.find(w => w.tenantId === tenantId);
  }

  getWhatsAppPhoneNumbers(tenantId: string): WhatsAppPhoneNumber[] {
    return this.whatsappPhoneNumbers.filter(p => p.tenantId === tenantId);
  }

  saveWhatsAppConnection(
    tenantId: string,
    data: {
      wabaId: string;
      businessName: string;
      phoneNumberId: string;
      displayPhoneNumber: string;
      verifiedName: string;
      accessTokenEncrypted?: string;
    }
  ): { account: WhatsAppAccount; phoneNumber: WhatsAppPhoneNumber } {
    let acc = this.whatsappAccounts.find(w => w.tenantId === tenantId);
    if (!acc) {
      acc = {
        id: generateId('waba'),
        tenantId,
        wabaId: data.wabaId,
        businessName: data.businessName,
        status: 'CONNECTED',
        accessTokenEncrypted: data.accessTokenEncrypted,
        lastVerifiedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      this.whatsappAccounts.push(acc);
    } else {
      acc.wabaId = data.wabaId;
      acc.businessName = data.businessName;
      acc.status = 'CONNECTED';
      if (data.accessTokenEncrypted) acc.accessTokenEncrypted = data.accessTokenEncrypted;
      acc.lastVerifiedAt = new Date().toISOString();
      acc.updatedAt = new Date().toISOString();
    }

    let phone = this.whatsappPhoneNumbers.find(p => p.phoneNumberId === data.phoneNumberId);
    if (!phone) {
      phone = {
        id: generateId('phone'),
        tenantId,
        whatsappAccountId: acc.id,
        phoneNumberId: data.phoneNumberId,
        displayPhoneNumber: data.displayPhoneNumber,
        verifiedName: data.verifiedName,
        qualityRating: 'GREEN',
        messagingLimitTier: 'TIER_1K',
        status: 'CONNECTED',
        isPrimary: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      this.whatsappPhoneNumbers.push(phone);
    } else {
      phone.tenantId = tenantId;
      phone.displayPhoneNumber = data.displayPhoneNumber;
      phone.verifiedName = data.verifiedName;
      phone.status = 'CONNECTED';
      phone.updatedAt = new Date().toISOString();
    }

    this.addAuditLog(tenantId, 'WHATSAPP_CONNECT', 'whatsapp_accounts', acc.id, {
      wabaId: data.wabaId,
      phoneNumberId: data.phoneNumberId
    });

    return { account: acc, phoneNumber: phone };
  }

  disconnectWhatsApp(tenantId: string): boolean {
    const acc = this.whatsappAccounts.find(w => w.tenantId === tenantId);
    if (acc) {
      acc.status = 'DISCONNECTED';
      acc.updatedAt = new Date().toISOString();
    }
    this.whatsappPhoneNumbers.filter(p => p.tenantId === tenantId).forEach(p => {
      p.status = 'DISCONNECTED';
      p.updatedAt = new Date().toISOString();
    });

    this.addAuditLog(tenantId, 'WHATSAPP_DISCONNECT', 'whatsapp_accounts', acc?.id || '', {});
    return true;
  }

  // --- Idempotent Webhook Events ---
  hasWebhookEvent(externalEventId: string): boolean {
    return this.webhookEvents.some(e => e.externalEventId === externalEventId);
  }

  recordWebhookEvent(tenantId: string | undefined, externalEventId: string, eventType: string, payload: any): WebhookEvent {
    const event: WebhookEvent = {
      id: generateId('evt'),
      tenantId,
      externalEventId,
      eventType,
      payload,
      processingStatus: 'PROCESSED',
      processedAt: new Date().toISOString(),
      createdAt: new Date().toISOString()
    };
    this.webhookEvents.push(event);
    return event;
  }

  // --- Products & Inventory ---
  getProducts(tenantId: string, filter?: { query?: string; categoryId?: string; activeOnly?: boolean }): Product[] {
    return this.products.filter(p => {
      if (p.tenantId !== tenantId) return false;
      if (filter?.activeOnly && !p.isActive) return false;
      if (filter?.categoryId && p.categoryId !== filter.categoryId) return false;
      if (filter?.query) {
        const q = filter.query.trim().toLowerCase();
        if (q === '' || q === 'all' || q === 'list' || q === 'menu' || q === 'catalog' || q === 'products' || q === 'items') {
          return true;
        }
        // Direct match on name, sku, or description
        if (p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q) || p.description.toLowerCase().includes(q)) {
          return true;
        }
        // Token based match: split search query into individual words (e.g. "air earbuds" -> "air", "earbuds")
        const tokens = q.split(/[\s,\-_/]+/).filter(t => t.length >= 3);
        if (tokens.length > 0) {
          const pTokens = (p.name + ' ' + p.description + ' ' + p.sku + ' ' + (p.categoryName || '')).toLowerCase();
          return tokens.some(t => pTokens.includes(t));
        }
      }
      return true;
    });
  }

  getProductById(tenantId: string, id: string): Product | undefined {
    return this.products.find(p => p.tenantId === tenantId && p.id === id);
  }

  getProductBySku(tenantId: string, sku: string): Product | undefined {
    return this.products.find(p => p.tenantId === tenantId && p.sku.toLowerCase() === sku.toLowerCase());
  }

  createProduct(tenantId: string, data: Partial<Product>): Product {
    const newProduct: Product = {
      id: generateId('prod'),
      tenantId,
      categoryId: data.categoryId,
      categoryName: data.categoryName,
      name: data.name || 'Untitled Product',
      sku: data.sku || `SKU-${Date.now().toString().slice(-5)}`,
      description: data.description || '',
      price: Number(data.price) || 0,
      salePrice: data.salePrice ? Number(data.salePrice) : undefined,
      imageUrl: data.imageUrl,
      stockQuantity: Number(data.stockQuantity) || 0,
      reservedQuantity: 0,
      availableQuantity: Number(data.stockQuantity) || 0,
      lowStockThreshold: Number(data.lowStockThreshold) || 5,
      isActive: data.isActive !== undefined ? data.isActive : true,
      variants: data.variants || [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    this.products.push(newProduct);
    persistProductToSupabase(newProduct).catch(() => {});
    this.addAuditLog(tenantId, 'PRODUCT_CREATE', 'products', newProduct.id, { name: newProduct.name, sku: newProduct.sku });
    return newProduct;
  }

  updateProduct(tenantId: string, id: string, updates: Partial<Product>): Product | null {
    const prod = this.getProductById(tenantId, id);
    if (!prod) return null;

    Object.assign(prod, updates, {
      updatedAt: new Date().toISOString(),
      availableQuantity: Math.max(0, (updates.stockQuantity !== undefined ? updates.stockQuantity : prod.stockQuantity) - prod.reservedQuantity)
    });

    persistProductToSupabase(prod).catch(() => {});
    this.addAuditLog(tenantId, 'PRODUCT_UPDATE', 'products', prod.id, updates);
    return prod;
  }

  deleteProduct(tenantId: string, id: string): boolean {
    const idx = this.products.findIndex(p => p.tenantId === tenantId && p.id === id);
    if (idx === -1) return false;
    const removed = this.products.splice(idx, 1)[0];
    this.addAuditLog(tenantId, 'PRODUCT_DELETE', 'products', id, { name: removed.name });
    return true;
  }

  adjustInventory(tenantId: string, productId: string, changeQty: number, type: InventoryMovement['type'], notes?: string): Product | null {
    const prod = this.getProductById(tenantId, productId);
    if (!prod) return null;

    const previousQty = prod.stockQuantity;
    const newQty = Math.max(0, previousQty + changeQty);
    prod.stockQuantity = newQty;
    prod.availableQuantity = Math.max(0, newQty - prod.reservedQuantity);
    prod.updatedAt = new Date().toISOString();
    persistProductStockToSupabase(productId, newQty).catch(() => {});

    const movement: InventoryMovement = {
      id: generateId('inv'),
      tenantId,
      productId,
      productName: prod.name,
      changeQuantity: changeQty,
      previousQuantity: previousQty,
      newQuantity: newQty,
      type,
      notes,
      createdAt: new Date().toISOString()
    };
    this.inventoryMovements.push(movement);

    if (newQty <= prod.lowStockThreshold) {
      this.createNotification(tenantId, {
        title: 'Low Stock Alert',
        message: `Product "${prod.name}" has reached low stock (${newQty} units remaining).`,
        type: 'LOW_STOCK',
        referenceId: prod.id
      });
    }

    return prod;
  }

  getInventoryMovements(tenantId: string, productId?: string): InventoryMovement[] {
    return this.inventoryMovements
      .filter(m => m.tenantId === tenantId && (!productId || m.productId === productId))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  // --- Customers & CRM ---
  getCustomers(tenantId: string, query?: string): Customer[] {
    return this.customers.filter(c => {
      if (c.tenantId !== tenantId) return false;
      if (query) {
        const q = query.toLowerCase();
        return c.name.toLowerCase().includes(q) || c.phone.includes(q);
      }
      return true;
    });
  }

  getCustomerByPhone(tenantId: string, phone: string): Customer | undefined {
    return this.customers.find(c => c.tenantId === tenantId && c.phone === phone);
  }

  getCustomerById(tenantId: string, id: string): Customer | undefined {
    return this.customers.find(c => c.tenantId === tenantId && c.id === id);
  }

  findOrCreateCustomer(tenantId: string, phone: string, name?: string): Customer {
    let customer = this.getCustomerByPhone(tenantId, phone);
    if (!customer) {
      customer = {
        id: generateId('cust'),
        tenantId,
        phone,
        name: name || `Customer ${phone.slice(-4)}`,
        tags: ['WhatsApp Lead'],
        firstContact: new Date().toISOString(),
        lastContact: new Date().toISOString(),
        orderCount: 0,
        totalSpend: 0,
        status: 'ACTIVE'
      };
      this.customers.push(customer);
    } else {
      customer.lastContact = new Date().toISOString();
      if (name && (!customer.name || customer.name.startsWith('Customer '))) {
        customer.name = name;
      }
    }
    return customer;
  }

  updateCustomer(tenantId: string, id: string, updates: Partial<Customer>): Customer | null {
    const customer = this.getCustomerById(tenantId, id);
    if (!customer) return null;
    Object.assign(customer, updates);
    return customer;
  }

  // --- Conversations & Messages ---
  getConversations(tenantId: string, filter?: { status?: Conversation['status']; search?: string }): Conversation[] {
    return this.conversations
      .filter(c => {
        if (c.tenantId !== tenantId) return false;
        if (filter?.status && c.status !== filter.status) return false;
        if (filter?.search) {
          const s = filter.search.toLowerCase();
          return c.customerName.toLowerCase().includes(s) || c.customerPhone.includes(s) || c.lastMessageText.toLowerCase().includes(s);
        }
        return true;
      })
      .sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime());
  }

  getConversationById(tenantId: string, id: string): Conversation | undefined {
    return this.conversations.find(c => c.tenantId === tenantId && c.id === id);
  }

  getConversationByCustomerPhone(tenantId: string, customerPhone: string): Conversation | undefined {
    return this.conversations.find(c => c.tenantId === tenantId && c.customerPhone === customerPhone);
  }

  findOrCreateConversation(tenantId: string, customerId: string, customerPhone: string, customerName: string, phoneNumberId: string): Conversation {
    let conv = this.conversations.find(c => c.tenantId === tenantId && c.customerId === customerId);
    if (!conv) {
      conv = {
        id: generateId('conv'),
        tenantId,
        customerId,
        customerPhone,
        customerName,
        phoneNumberId,
        status: 'AI_ACTIVE',
        lastMessageText: '',
        lastMessageAt: new Date().toISOString(),
        unreadCount: 0,
        customerServiceWindowExpiresAt: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      this.conversations.push(conv);
    }
    return conv;
  }

  getMessages(tenantId: string, conversationId: string): ConversationMessage[] {
    return this.messages
      .filter(m => m.tenantId === tenantId && m.conversationId === conversationId)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }

  addMessage(
    tenantId: string,
    conversationId: string,
    sender: ConversationMessage['sender'],
    text: string,
    meta?: any
  ): ConversationMessage {
    const msg: ConversationMessage = {
      id: generateId('msg'),
      conversationId,
      tenantId,
      sender,
      text,
      status: 'SENT',
      meta,
      createdAt: new Date().toISOString()
    };
    this.messages.push(msg);
    persistMessageToSupabase(msg, tenantId).catch(() => {});

    const conv = this.getConversationById(tenantId, conversationId);
    if (conv) {
      conv.lastMessageText = text;
      conv.lastMessageAt = msg.createdAt;
      conv.updatedAt = msg.createdAt;
      if (sender === 'CUSTOMER') {
        conv.unreadCount += 1;
        conv.customerServiceWindowExpiresAt = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
      }
    }

    return msg;
  }

  setConversationStatus(tenantId: string, conversationId: string, status: Conversation['status'], assignedUserName?: string): Conversation | null {
    const conv = this.getConversationById(tenantId, conversationId);
    if (!conv) return null;
    conv.status = status;
    if (assignedUserName) conv.assignedUserName = assignedUserName;
    conv.updatedAt = new Date().toISOString();

    if (status === 'HUMAN_ACTIVE') {
      this.createNotification(tenantId, {
        title: 'Human Handoff Requested',
        message: `Customer ${conv.customerName} (${conv.customerPhone}) requested human assistance.`,
        type: 'HUMAN_HANDOFF',
        referenceId: conv.id
      });
      this.addAuditLog(tenantId, 'CONVERSATION_HANDOFF', 'conversations', conv.id, {
        customerPhone: conv.customerPhone
      });
    }

    return conv;
  }

  // --- Orders & Atomic Checkout ---
  getOrders(tenantId: string, filter?: { status?: OrderStatus; query?: string }): Order[] {
    return this.orders
      .filter(o => {
        if (o.tenantId !== tenantId) return false;
        if (filter?.status && o.status !== filter.status) return false;
        if (filter?.query) {
          const q = filter.query.toLowerCase();
          return o.orderNumber.toLowerCase().includes(q) || o.customerName.toLowerCase().includes(q) || o.customerPhone.includes(q);
        }
        return true;
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  getOrderById(tenantId: string, orderId: string): Order | undefined {
    return this.orders.find(o => o.tenantId === tenantId && o.id === orderId);
  }

  getOrderByNumber(tenantId: string, orderNumber: string): Order | undefined {
    return this.orders.find(o => o.tenantId === tenantId && o.orderNumber.toLowerCase() === orderNumber.toLowerCase());
  }

  createOrderAtomic(
    tenantId: string,
    data: {
      customerId: string;
      customerName: string;
      customerPhone: string;
      items: Array<{ productId: string; quantity: number }>;
      deliveryAddress: string;
      paymentMethod?: string;
      deliveryFee?: number;
      discount?: number;
      notes?: string;
      source: Order['source'];
    }
  ): { success: boolean; order?: Order; error?: string } {
    // 1. Validate items & stock
    if (!data.items || data.items.length === 0) {
      return { success: false, error: 'Order must contain at least one product item.' };
    }

    const resolvedItems: OrderItem[] = [];
    let subtotal = 0;

    for (const item of data.items) {
      const prod = this.getProductById(tenantId, item.productId);
      if (!prod) {
        return { success: false, error: `Product ID ${item.productId} was not found in store catalog.` };
      }
      if (prod.stockQuantity < item.quantity) {
        return {
          success: false,
          error: `Insufficient stock for "${prod.name}". Requested: ${item.quantity}, Available: ${prod.stockQuantity}`
        };
      }

      const unitPrice = prod.salePrice ?? prod.price;
      const itemSubtotal = unitPrice * item.quantity;
      subtotal += itemSubtotal;

      resolvedItems.push({
        id: generateId('item'),
        orderId: '',
        productId: prod.id,
        productName: prod.name,
        sku: prod.sku,
        unitPrice,
        quantity: item.quantity,
        subtotal: itemSubtotal
      });
    }

    const business = this.getBusinessProfile(tenantId);
    const deliveryFee = data.deliveryFee !== undefined ? data.deliveryFee : (business?.deliveryFee ?? 150);
    const discount = data.discount || 0;
    const total = subtotal + deliveryFee - discount;

    const orderNumber = generateOrderNumber();

    // 2. Deduct inventory & record movement
    for (const item of resolvedItems) {
      const prod = this.getProductById(tenantId, item.productId)!;
      const prev = prod.stockQuantity;
      prod.stockQuantity -= item.quantity;
      prod.availableQuantity = Math.max(0, prod.stockQuantity - prod.reservedQuantity);
      prod.updatedAt = new Date().toISOString();

      this.inventoryMovements.push({
        id: generateId('inv'),
        tenantId,
        productId: prod.id,
        productName: prod.name,
        changeQuantity: -item.quantity,
        previousQuantity: prev,
        newQuantity: prod.stockQuantity,
        type: 'SALE',
        referenceId: orderNumber,
        notes: `Sold via ${data.source}`,
        createdAt: new Date().toISOString()
      });
    }

    // 3. Create Order
    const order: Order = {
      id: generateId('ord'),
      tenantId,
      customerId: data.customerId,
      customerName: data.customerName,
      customerPhone: data.customerPhone,
      orderNumber,
      status: 'CONFIRMED',
      items: resolvedItems,
      subtotal,
      deliveryFee,
      discount,
      total,
      paymentMethod: data.paymentMethod || 'COD',
      paymentStatus: 'PENDING',
      deliveryAddress: data.deliveryAddress,
      notes: data.notes,
      source: data.source,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    order.items.forEach(it => (it.orderId = order.id));

    this.orders.push(order);
    this.orderItems.push(...order.items);
    persistOrderToSupabase(order, order.items).catch(() => {});

    // 4. Update customer stats
    const cust = this.getCustomerById(tenantId, data.customerId);
    if (cust) {
      cust.orderCount += 1;
      cust.totalSpend += total;
      cust.lastContact = order.createdAt;
      if (data.deliveryAddress && !cust.address) {
        cust.address = data.deliveryAddress;
      }
    }

    // 5. Subscription count
    const sub = this.subscriptions.find(s => s.tenantId === tenantId);
    if (sub) sub.ordersThisMonth += 1;

    // 6. Notifications & Audit
    this.createNotification(tenantId, {
      title: 'New WhatsApp Order Confirmed',
      message: `Order #${order.orderNumber} for Rs. ${order.total.toLocaleString()} from ${order.customerName}`,
      type: 'NEW_ORDER',
      referenceId: order.id
    });

    this.addAuditLog(tenantId, 'ORDER_CREATE', 'orders', order.id, {
      orderNumber,
      total,
      source: data.source
    });

    return { success: true, order };
  }

  updateOrderStatus(tenantId: string, orderId: string, newStatus: OrderStatus, changedBy: string, note?: string): Order | null {
    const order = this.getOrderById(tenantId, orderId);
    if (!order) return null;

    const prev = order.status;
    order.status = newStatus;
    order.updatedAt = new Date().toISOString();

    // If cancelled, restore inventory
    if (newStatus === 'CANCELLED' && prev !== 'CANCELLED') {
      for (const item of order.items) {
        const prod = this.getProductById(tenantId, item.productId);
        if (prod) {
          const prevQty = prod.stockQuantity;
          prod.stockQuantity += item.quantity;
          prod.availableQuantity = Math.max(0, prod.stockQuantity - prod.reservedQuantity);
          prod.updatedAt = new Date().toISOString();

          this.inventoryMovements.push({
            id: generateId('inv'),
            tenantId,
            productId: prod.id,
            productName: prod.name,
            changeQuantity: item.quantity,
            previousQuantity: prevQty,
            newQuantity: prod.stockQuantity,
            type: 'CANCELLATION_RESTORE',
            referenceId: order.orderNumber,
            notes: `Restored from cancelled order #${order.orderNumber}`,
            createdAt: new Date().toISOString()
          });
        }
      }
    }

    this.orderStatusHistory.push({
      id: generateId('osh'),
      orderId,
      tenantId,
      previousStatus: prev,
      newStatus,
      changedBy,
      note,
      createdAt: new Date().toISOString()
    });

    this.addAuditLog(tenantId, 'ORDER_STATUS_CHANGE', 'orders', order.id, { previousStatus: prev, newStatus });
    persistOrderStatusToSupabase(orderId, newStatus).catch(() => {});
    return order;
  }

  // --- AI Settings & Knowledge ---
  getAgentSettings(tenantId: string): AgentSettings {
    let settings = this.agentSettings.find(s => s.tenantId === tenantId);
    if (!settings) {
      settings = {
        id: generateId('as'),
        tenantId,
        isEnabled: true,
        model: 'openai/gpt-oss-20b',
        primaryLanguage: 'auto',
        tone: 'friendly',
        greetingMessage: 'Assalam-o-Alaikum! Welcome. How can I help you today?',
        customInstructions: '',
        orderConfirmationRequired: true,
        handoffKeywords: ['human', 'agent', 'staff', 'manager', 'complaint'],
        enableStockCheck: true,
        autoHandoffOnComplaint: true,
        workingHoursOnly: false,
        maxToolLoops: 5,
        updatedAt: new Date().toISOString()
      };
      this.agentSettings.push(settings);
    }
    return settings;
  }

  updateAgentSettings(tenantId: string, updates: Partial<AgentSettings>): AgentSettings {
    const settings = this.getAgentSettings(tenantId);
    Object.assign(settings, updates, { updatedAt: new Date().toISOString() });
    this.addAuditLog(tenantId, 'AGENT_SETTINGS_UPDATE', 'agent_settings', settings.id, updates);
    return settings;
  }

  getAgentKnowledge(tenantId: string): AgentKnowledgeItem[] {
    return this.agentKnowledge.filter(k => k.tenantId === tenantId && k.isActive);
  }

  addAgentKnowledge(tenantId: string, item: Omit<AgentKnowledgeItem, 'id' | 'tenantId'>): AgentKnowledgeItem {
    const k: AgentKnowledgeItem = {
      id: generateId('ak'),
      tenantId,
      ...item
    };
    this.agentKnowledge.push(k);
    return k;
  }

  deleteAgentKnowledge(tenantId: string, id: string): boolean {
    const idx = this.agentKnowledge.findIndex(k => k.tenantId === tenantId && k.id === id);
    if (idx !== -1) {
      this.agentKnowledge.splice(idx, 1);
      return true;
    }
    return false;
  }

  inviteMember(tenantId: string, email: string, role: string): TenantMember {
    const memberId = generateId('mem');
    const newMember: TenantMember = {
      id: memberId,
      tenantId,
      userId: generateId('usr'),
      role: role as any,
      status: 'INVITED',
      createdAt: new Date().toISOString(),
      profile: {
        id: generateId('prof'),
        email,
        fullName: email.split('@')[0],
        createdAt: new Date().toISOString()
      }
    };
    this.tenantMembers.push(newMember);
    return newMember;
  }

  updateSubscription(tenantId: string, plan: string): TenantSubscription {
    const sub = this.getSubscription(tenantId);
    const validPlan = (plan.toLowerCase() === 'starter' || plan.toLowerCase() === 'business') ? plan.toLowerCase() as 'starter' | 'business' : 'pro';
    sub.planId = validPlan;
    return sub;
  }

  // --- Analytics ---
  getAnalytics(tenantId: string) {
    const orders = this.getOrders(tenantId);
    const confirmedOrders = orders.filter(o => o.status !== 'CANCELLED' && o.status !== 'DRAFT');
    const totalRevenue = confirmedOrders.reduce((sum, o) => sum + o.total, 0);
    const totalOrders = confirmedOrders.length;
    const avgOrderValue = totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0;

    const customers = this.getCustomers(tenantId);
    const totalCustomers = customers.length;
    const repeatCustomers = customers.filter(c => c.orderCount > 1).length;

    const convs = this.getConversations(tenantId);
    const totalConvs = convs.length;
    const aiHandled = convs.filter(c => c.status === 'AI_ACTIVE' || c.status === 'CLOSED').length;
    const humanHandoffs = convs.filter(c => c.status === 'HUMAN_ACTIVE').length;

    const lowStockProducts = this.products.filter(p => p.tenantId === tenantId && p.stockQuantity <= p.lowStockThreshold);

    return {
      totalRevenue,
      totalOrders,
      avgOrderValue,
      totalCustomers,
      repeatCustomers,
      totalConvs,
      aiHandled,
      humanHandoffs,
      lowStockCount: lowStockProducts.length,
      conversionRate: totalConvs > 0 ? ((totalOrders / totalConvs) * 100).toFixed(1) : '0'
    };
  }

  // --- Notifications & Audit ---
  getNotifications(tenantId: string): Notification[] {
    return this.notifications
      .filter(n => n.tenantId === tenantId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  createNotification(tenantId: string, n: Omit<Notification, 'id' | 'tenantId' | 'isRead' | 'createdAt'>): Notification {
    const item: Notification = {
      id: generateId('notif'),
      tenantId,
      isRead: false,
      createdAt: new Date().toISOString(),
      ...n
    };
    this.notifications.unshift(item);
    return item;
  }

  markNotificationRead(tenantId: string, id: string) {
    const notif = this.notifications.find(n => n.tenantId === tenantId && n.id === id);
    if (notif) notif.isRead = true;
  }

  addAuditLog(tenantId: string, action: string, entityType: string, entityId: string, details?: any) {
    this.auditLogs.unshift({
      id: generateId('log'),
      tenantId,
      userName: 'System / Staff',
      action,
      entityType,
      entityId,
      details,
      createdAt: new Date().toISOString()
    });
  }

  getSubscription(tenantId: string): TenantSubscription {
    let sub = this.subscriptions.find(s => s.tenantId === tenantId);
    if (!sub) {
      sub = {
        tenantId,
        planId: 'pro',
        status: 'ACTIVE',
        ordersThisMonth: 0,
        currentPeriodStart: new Date().toISOString(),
        currentPeriodEnd: new Date(Date.now() + 86400000 * 30).toISOString()
      };
      this.subscriptions.push(sub);
    }
    return sub;
  }
}

// Export singleton database store instance
export const db = new OrderDeskStore();
