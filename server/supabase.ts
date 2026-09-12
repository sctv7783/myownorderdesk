import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { OrderDeskStore } from './db';
import type {
  Tenant,
  Product,
  Customer,
  Order,
  OrderItem,
  Conversation,
  ConversationMessage,
  AgentSettings,
  WhatsAppAccount,
  WhatsAppPhoneNumber,
  Notification,
  OrderStatus
} from '../src/types';

let supabaseServerClient: SupabaseClient | null = null;

/**
 * Returns a server-side Supabase client using SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
 * Never exposed to browser or client code.
 * Lazily initialized to prevent startup crashes when keys are not yet configured.
 */
export function getSupabaseServerClient(): SupabaseClient | null {
  if (supabaseServerClient) return supabaseServerClient;

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return null;
  }

  try {
    supabaseServerClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });
    return supabaseServerClient;
  } catch (err) {
    console.warn('[Supabase Server]: Failed to initialize client, using memory store fallback:', err);
    return null;
  }
}

/**
 * Syncs the live Supabase database into the in-memory store so the entire app
 * runs with the user's real store, real products, real customers, and real orders.
 */
export async function syncSupabaseWithStore(store: OrderDeskStore): Promise<boolean> {
  const client = getSupabaseServerClient();
  if (!client) {
    console.log('[Supabase Sync]: No Supabase credentials configured, running with fallback store.');
    return false;
  }

  try {
    console.log('[Supabase Sync]: Connecting to live Supabase database...');

    // 1. Fetch businesses
    const { data: businesses, error: busError } = await client.from('businesses').select('*');
    if (busError) {
      console.warn('[Supabase Sync]: Failed to fetch businesses:', busError.message);
    } else if (businesses && businesses.length > 0) {
      console.log(`[Supabase Sync]: Loaded ${businesses.length} business(es) from Supabase.`);

      // Prepend user businesses so the live store is the primary tenant
      for (const bus of businesses) {
        const existingIdx = store.tenants.findIndex(t => t.id === bus.id);
        const tenantObj: Tenant = {
          id: bus.id,
          name: bus.name || 'My Store',
          slug: (bus.name || 'my-store').toLowerCase().replace(/[^a-z0-9]+/g, '-'),
          businessType: bus.business_type || 'E-Commerce',
          currency: bus.currency || 'PKR',
          timezone: bus.timezone || 'Asia/Karachi',
          createdAt: bus.created_at || new Date().toISOString(),
          updatedAt: bus.created_at || new Date().toISOString()
        };

        if (existingIdx >= 0) {
          store.tenants[existingIdx] = tenantObj;
        } else {
          // Prepend as primary
          store.tenants.unshift(tenantObj);
        }

        // Setup Business Profile
        const existingBp = store.businessProfiles.find(bp => bp.tenantId === bus.id);
        const bpObj = {
          id: 'bp_' + bus.id,
          tenantId: bus.id,
          businessName: bus.name,
          businessType: bus.business_type || 'E-Commerce',
          phone: bus.phone || bus.whatsapp_number || '+92 300 0000000',
          email: 'admin@' + (bus.name || 'store').toLowerCase().replace(/[^a-z0-9]/g, '') + '.pk',
          address: bus.address || 'Pakistan',
          city: 'Lahore',
          description: 'Official WhatsApp OrderDesk Store',
          deliveryFee: 150,
          freeDeliveryThreshold: 2000,
          estimatedDeliveryTime: '2-4 business days',
          currency: bus.currency || 'PKR',
          createdAt: bus.created_at || new Date().toISOString(),
          updatedAt: bus.created_at || new Date().toISOString()
        };
        if (existingBp) {
          Object.assign(existingBp, bpObj);
        } else {
          store.businessProfiles.unshift(bpObj);
        }
      }
    }

    // 2. Fetch WhatsApp configs & connections
    const { data: configs } = await client.from('whatsapp_configs').select('*');
    if (configs && configs.length > 0) {
      for (const cfg of configs) {
        const busId = cfg.business_id;
        const phoneId = cfg.phone_number_id || '1257112607493238';
        const wabaId = cfg.waba_id || '2248866769241951';

        // Add WhatsApp Account
        const accIdx = store.whatsappAccounts.findIndex(a => a.tenantId === busId);
        const accObj: WhatsAppAccount = {
          id: 'waba_acc_' + busId,
          tenantId: busId,
          wabaId: wabaId,
          businessName: cfg.verified_name || cfg.agent_name || 'Store Official',
          status: 'CONNECTED',
          accessTokenEncrypted: cfg.access_token || undefined,
          lastVerifiedAt: new Date().toISOString(),
          createdAt: cfg.created_at || new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        if (accIdx >= 0) store.whatsappAccounts[accIdx] = accObj;
        else store.whatsappAccounts.unshift(accObj);

        // Add Phone Number
        const phoneIdx = store.whatsappPhoneNumbers.findIndex(p => p.phoneNumberId === phoneId);
        const phoneObj: WhatsAppPhoneNumber = {
          id: 'phone_rec_' + busId,
          tenantId: busId,
          whatsappAccountId: accObj.id,
          phoneNumberId: phoneId,
          displayPhoneNumber: cfg.display_phone_number || cfg.phone_number_id || '+92 336 6705003',
          verifiedName: cfg.verified_name || 'Store Official',
          qualityRating: 'GREEN',
          messagingLimitTier: 'TIER_10K',
          status: 'CONNECTED',
          isPrimary: true,
          createdAt: cfg.created_at || new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        if (phoneIdx >= 0) store.whatsappPhoneNumbers[phoneIdx] = phoneObj;
        else store.whatsappPhoneNumbers.unshift(phoneObj);

        // Add Agent Settings
        const aiIdx = store.agentSettings.findIndex(s => s.tenantId === busId);
        const aiObj: AgentSettings = {
          id: 'ai_settings_' + busId,
          tenantId: busId,
          isEnabled: cfg.agent_enabled ?? true,
          model: cfg.groq_model || 'openai/gpt-oss-20b',
          primaryLanguage: (cfg.agent_language as any) || 'auto',
          tone: 'friendly',
          greetingMessage: cfg.agent_greeting || 'Assalam o Alaikum! Main aap ki order mein madad kar sakta hoon. Kya order karna chahte hain?',
          customInstructions: cfg.agent_instructions || '',
          orderConfirmationRequired: cfg.auto_confirm_orders ? false : true,
          handoffKeywords: ['human', 'agent', 'staff', 'complaint', 'manager', 'madad'],
          enableStockCheck: true,
          autoHandoffOnComplaint: true,
          workingHoursOnly: false,
          maxToolLoops: 5,
          updatedAt: new Date().toISOString()
        };
        if (aiIdx >= 0) store.agentSettings[aiIdx] = aiObj;
        else store.agentSettings.unshift(aiObj);
      }
    }

    // 3. Fetch Products
    const { data: products } = await client.from('products').select('*');
    if (products && products.length > 0) {
      console.log(`[Supabase Sync]: Loaded ${products.length} product(s) from Supabase.`);
      for (const p of products) {
        const busId = p.business_id;
        const existingIdx = store.products.findIndex(prod => prod.id === p.id);
        const sku = p.sku || `SKU-${(p.name || 'PROD').replace(/[^a-zA-Z0-9]/g, '').slice(0, 6).toUpperCase()}-${p.id.slice(0, 4)}`;
        const prodObj: Product = {
          id: p.id,
          tenantId: busId,
          categoryId: p.category || undefined,
          name: p.name,
          sku: sku,
          description: p.description || '',
          price: Number(p.price || 0),
          salePrice: undefined,
          imageUrl: p.image_url || undefined,
          stockQuantity: p.stock !== null && p.stock !== undefined ? Number(p.stock) : 50,
          reservedQuantity: 0,
          availableQuantity: p.stock !== null && p.stock !== undefined ? Number(p.stock) : 50,
          lowStockThreshold: 5,
          isActive: p.is_active ?? true,
          variants: p.sizes
            ? [
                {
                  id: 'var_' + p.id,
                  productId: p.id,
                  name: 'Size',
                  options: Array.isArray(p.sizes) ? p.sizes.map(String) : [String(p.sizes)]
                }
              ]
            : [],
          createdAt: p.created_at || new Date().toISOString(),
          updatedAt: p.created_at || new Date().toISOString()
        };
        if (existingIdx >= 0) store.products[existingIdx] = prodObj;
        else store.products.push(prodObj);
      }
    }

    // 4. Fetch Customers
    const { data: customers } = await client.from('customers').select('*');
    if (customers && customers.length > 0) {
      console.log(`[Supabase Sync]: Loaded ${customers.length} customer(s) from Supabase.`);
      for (const c of customers) {
        const phoneFormatted = c.phone.startsWith('+') ? c.phone : `+${c.phone}`;
        const existingIdx = store.customers.findIndex(cust => cust.id === c.id || (cust.tenantId === c.business_id && cust.phone === phoneFormatted));
        const custObj: Customer = {
          id: c.id,
          tenantId: c.business_id,
          phone: phoneFormatted,
          name: c.name || 'Customer',
          email: c.email || undefined,
          address: c.address || undefined,
          city: 'Lahore',
          tags: [],
          notes: c.notes || undefined,
          firstContact: c.created_at || new Date().toISOString(),
          lastContact: c.created_at || new Date().toISOString(),
          orderCount: Number(c.total_orders || 0),
          totalSpend: Number(c.total_spent || 0),
          status: 'ACTIVE'
        };
        if (existingIdx >= 0) store.customers[existingIdx] = custObj;
        else store.customers.push(custObj);
      }
    }

    // 5. Fetch Orders & Order Items
    const { data: orders } = await client.from('orders').select('*');
    const { data: orderItems } = await client.from('order_items').select('*');
    if (orders && orders.length > 0) {
      console.log(`[Supabase Sync]: Loaded ${orders.length} order(s) from Supabase.`);
      for (const o of orders) {
        const existingIdx = store.orders.findIndex(ord => ord.id === o.id);
        const relatedItems = (orderItems || []).filter(item => item.order_id === o.id).map(item => ({
          id: item.id,
          orderId: o.id,
          tenantId: o.business_id,
          productId: item.product_id || '',
          productName: item.product_name,
          sku: item.sku || 'SKU-ITEM',
          unitPrice: Number(item.unit_price || 0),
          quantity: Number(item.quantity || 1),
          subtotal: Number(item.subtotal || item.unit_price * item.quantity || 0),
          variantDetails: item.variant || undefined
        }));

        const customer = store.customers.find(c => c.id === o.customer_id);
        const statusUpper = (o.order_status || 'CONFIRMED').toUpperCase();
        const validStatus: OrderStatus = ['CONFIRMED', 'DELIVERED', 'PREPARING', 'SHIPPED', 'CANCELLED', 'REFUNDED'].includes(statusUpper)
          ? (statusUpper as OrderStatus)
          : 'CONFIRMED';

        const orderObj: Order = {
          id: o.id,
          tenantId: o.business_id,
          customerId: o.customer_id,
          customerName: customer?.name || 'Customer',
          customerPhone: customer?.phone || '+92 300 0000000',
          orderNumber: o.order_number || `ORD-${o.id.slice(0, 8)}`,
          status: validStatus,
          subtotal: Number(o.subtotal || o.total || 0),
          deliveryFee: Number(o.delivery_fee || 0),
          discount: Number(o.discount || 0),
          total: Number(o.total || 0),
          paymentMethod: o.payment_method || 'COD',
          paymentStatus: o.payment_status === 'paid' ? 'PAID' : 'PENDING',
          deliveryAddress: o.delivery_address || customer?.address || 'Address on file',
          notes: o.customer_note || undefined,
          source: (o.source === 'whatsapp' ? 'whatsapp_ai' : 'manual') as any,
          items: relatedItems,
          createdAt: o.created_at || new Date().toISOString(),
          updatedAt: o.updated_at || new Date().toISOString()
        };
        if (existingIdx >= 0) store.orders[existingIdx] = orderObj;
        else store.orders.unshift(orderObj);
      }
    }

    // 6. Fetch WhatsApp Conversations & Messages
    const { data: convs } = await client.from('whatsapp_conversations').select('*');
    const { data: msgs } = await client.from('whatsapp_messages').select('*').order('created_at', { ascending: true });
    if (convs && convs.length > 0) {
      console.log(`[Supabase Sync]: Loaded ${convs.length} conversation(s) from Supabase.`);
      for (const c of convs) {
        const existingIdx = store.conversations.findIndex(cv => cv.id === c.id);
        const convObj: Conversation = {
          id: c.id,
          tenantId: c.business_id,
          customerId: c.customer_id || '',
          customerPhone: c.customer_phone.startsWith('+') ? c.customer_phone : `+${c.customer_phone}`,
          customerName: c.customer_name || 'Customer',
          phoneNumberId: '1257112607493238',
          status: c.agent_paused ? 'HUMAN_ACTIVE' : 'AI_ACTIVE',
          lastMessageText: '',
          lastMessageAt: c.last_message_at || c.created_at || new Date().toISOString(),
          unreadCount: 0,
          createdAt: c.created_at || new Date().toISOString(),
          updatedAt: c.last_message_at || c.created_at || new Date().toISOString()
        };
        if (existingIdx >= 0) store.conversations[existingIdx] = convObj;
        else store.conversations.push(convObj);
      }
    }

    if (msgs && msgs.length > 0) {
      for (const m of msgs) {
        const existingIdx = store.messages.findIndex(msg => msg.id === m.id);
        const sender = m.direction === 'inbound' ? 'CUSTOMER' : 'AI';
        const msgObj: ConversationMessage = {
          id: m.id,
          conversationId: m.conversation_id,
          tenantId: m.business_id,
          sender: sender,
          text: m.content || '',
          whatsappMessageId: m.whatsapp_message_id || undefined,
          status: 'DELIVERED',
          createdAt: m.created_at || new Date().toISOString()
        };
        if (existingIdx >= 0) store.messages[existingIdx] = msgObj;
        else store.messages.push(msgObj);

        // Update last message in parent conversation
        const parentConv = store.conversations.find(cv => cv.id === m.conversation_id);
        if (parentConv) {
          parentConv.lastMessageText = m.content || '';
          parentConv.lastMessageAt = m.created_at || parentConv.lastMessageAt;
        }
      }
    }

    console.log('[Supabase Sync]: ✅ Full sync with live database completed successfully!');
    return true;
  } catch (err) {
    console.error('[Supabase Sync Error]:', err);
    return false;
  }
}

function isUuid(str: string | undefined): boolean {
  if (!str) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(str);
}

// -------------------------------------------------------------
// ASYNCHRONOUS SUPABASE WRITE-BACK HELPERS
// -------------------------------------------------------------

export async function persistOrderToSupabase(order: Order, items: OrderItem[]): Promise<void> {
  const client = getSupabaseServerClient();
  if (!client) return;
  if (!isUuid(order.tenantId) || !isUuid(order.customerId)) return;

  try {
    const { error: orderErr } = await client.from('orders').upsert({
      id: isUuid(order.id) ? order.id : undefined,
      business_id: order.tenantId,
      order_number: order.orderNumber,
      customer_id: order.customerId,
      subtotal: order.subtotal,
      discount: order.discount,
      delivery_fee: order.deliveryFee,
      tax: 0,
      total: order.total,
      payment_method: order.paymentMethod.toLowerCase(),
      payment_status: order.paymentStatus.toLowerCase(),
      order_status: order.status.toLowerCase(),
      delivery_address: order.deliveryAddress,
      customer_note: order.notes || null,
      source: order.source === 'whatsapp_ai' ? 'whatsapp' : 'dashboard',
      created_at: order.createdAt,
      updated_at: order.updatedAt
    });

    if (orderErr) {
      console.warn('[Supabase Persist Order]:', orderErr.message);
      return;
    }

    // Persist items
    if (items && items.length > 0) {
      const itemsPayload = items.map(item => ({
        id: isUuid(item.id) ? item.id : undefined,
        order_id: isUuid(order.id) ? order.id : undefined,
        product_id: isUuid(item.productId) ? item.productId : null,
        product_name: item.productName,
        quantity: item.quantity,
        unit_price: item.unitPrice,
        sku: item.sku,
        subtotal: item.subtotal
      }));
      await client.from('order_items').upsert(itemsPayload);
    }

    // Update customer stats
    const { data: cust } = await client.from('customers').select('total_orders, total_spent').eq('id', order.customerId).single();
    if (cust) {
      await client.from('customers').update({
        total_orders: (cust.total_orders || 0) + 1,
        total_spent: (cust.total_spent || 0) + order.total
      }).eq('id', order.customerId);
    }
  } catch (e) {
    console.warn('[Supabase Persist Order Exception]:', e);
  }
}

export async function persistOrderStatusToSupabase(orderId: string, status: string): Promise<void> {
  const client = getSupabaseServerClient();
  if (!client || !isUuid(orderId)) return;

  try {
    await client.from('orders').update({
      order_status: status.toLowerCase(),
      updated_at: new Date().toISOString()
    }).eq('id', orderId);
  } catch (e) {
    console.warn('[Supabase Update Order Status Exception]:', e);
  }
}

export async function persistProductStockToSupabase(productId: string, newStock: number): Promise<void> {
  const client = getSupabaseServerClient();
  if (!client || !isUuid(productId)) return;

  try {
    await client.from('products').update({
      stock: newStock
    }).eq('id', productId);
  } catch (e) {
    console.warn('[Supabase Update Product Stock Exception]:', e);
  }
}

export async function persistProductToSupabase(prod: Product): Promise<void> {
  const client = getSupabaseServerClient();
  if (!client || !isUuid(prod.tenantId) || !isUuid(prod.id)) return;

  try {
    await client.from('products').upsert({
      id: prod.id,
      business_id: prod.tenantId,
      name: prod.name,
      sku: prod.sku,
      description: prod.description,
      price: prod.price,
      stock: prod.stockQuantity,
      is_active: prod.isActive,
      image_url: prod.imageUrl || null,
      created_at: prod.createdAt
    });
  } catch (e) {
    console.warn('[Supabase Upsert Product Exception]:', e);
  }
}

export async function persistWhatsAppConnectionToSupabase(data: {
  tenantId: string;
  wabaId: string;
  phoneNumberId: string;
  displayPhoneNumber: string;
  verifiedName: string;
  accessToken: string;
}): Promise<boolean> {
  const client = getSupabaseServerClient();
  if (!client) return false;

  const now = new Date().toISOString();

  try {
    const { error: cfgError } = await client.from('whatsapp_configs').upsert(
      {
        business_id: data.tenantId,
        waba_id: data.wabaId,
        phone_number_id: data.phoneNumberId,
        display_phone_number: data.displayPhoneNumber,
        verified_name: data.verifiedName,
        access_token: data.accessToken,
        updated_at: now
      },
      { onConflict: 'business_id' }
    );
    if (!cfgError) return true;
    console.warn('[Supabase WhatsApp Config]:', cfgError.message);
  } catch (e: any) {
    console.warn('[Supabase WhatsApp Config Exception]:', e?.message || e);
  }

  if (!isUuid(data.tenantId)) return false;

  try {
    const accountPayload = {
      tenant_id: data.tenantId,
      waba_id: data.wabaId,
      business_name: data.verifiedName,
      status: 'CONNECTED',
      access_token_encrypted: data.accessToken,
      last_verified_at: now,
      updated_at: now
    };
    const { data: existing } = await client
      .from('whatsapp_accounts')
      .select('id')
      .eq('tenant_id', data.tenantId)
      .maybeSingle();

    let accountId = existing?.id as string | undefined;
    if (accountId) {
      await client.from('whatsapp_accounts').update(accountPayload).eq('id', accountId);
    } else {
      const { data: inserted, error } = await client
        .from('whatsapp_accounts')
        .insert(accountPayload)
        .select('id')
        .single();
      if (error) {
        console.warn('[Supabase WhatsApp Account]:', error.message);
        return false;
      }
      accountId = inserted.id;
    }

    await client.from('whatsapp_phone_numbers').upsert(
      {
        tenant_id: data.tenantId,
        whatsapp_account_id: accountId,
        phone_number_id: data.phoneNumberId,
        display_phone_number: data.displayPhoneNumber,
        verified_name: data.verifiedName,
        status: 'CONNECTED',
        is_primary: true,
        updated_at: now
      },
      { onConflict: 'phone_number_id' }
    );
    return true;
  } catch (e: any) {
    console.warn('[Supabase WhatsApp Account Exception]:', e?.message || e);
    return false;
  }
}

export async function persistMessageToSupabase(msg: ConversationMessage, tenantId: string): Promise<void> {
  const client = getSupabaseServerClient();
  if (!client || !isUuid(tenantId) || !isUuid(msg.conversationId)) return;

  try {
    await client.from('whatsapp_messages').insert({
      id: isUuid(msg.id) ? msg.id : undefined,
      business_id: tenantId,
      conversation_id: msg.conversationId,
      direction: msg.sender === 'CUSTOMER' ? 'inbound' : 'outbound',
      message_type: 'text',
      content: msg.text,
      whatsapp_message_id: msg.whatsappMessageId || null,
      created_at: msg.createdAt
    });
  } catch (e) {
    console.warn('[Supabase Insert Message Exception]:', e);
  }
}
