import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';
import { db, generateId } from './server/db';
import { metaWhatsAppService, resolveMetaAccessToken } from './server/whatsapp/meta-service';
import { processCustomerMessageWithAi, MANDATORY_GROQ_MODEL } from './server/ai/groq';
import { syncSupabaseWithStore, persistOrderStatusToSupabase, persistWhatsAppConnectionToSupabase } from './server/supabase';
import { scrapeProductsFromUrl } from './server/services/scraper';

dotenv.config();

const app = express();
const PORT = 3000;

// Middleware for JSON and URL-encoded bodies
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Helper to extract tenantId from header or query or fallback to Tenant A
function getTenantId(req: express.Request): string {
  const headerTenant = req.headers['x-tenant-id'] as string;
  const queryTenant = req.query.tenantId as string;
  if (headerTenant && db.getTenant(headerTenant)) return headerTenant;
  if (queryTenant && db.getTenant(queryTenant)) return queryTenant;
  return db.tenants[0]?.id || 'tenant_khyber_001';
}

// -------------------------------------------------------------
// 1. Health & Meta WhatsApp Webhook Endpoints
// -------------------------------------------------------------
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'WhatsApp OrderDesk Production API',
    model: MANDATORY_GROQ_MODEL,
    time: new Date().toISOString()
  });
});

// Meta Webhook Verification (GET) - Supports both /api/whatsapp/webhook and /api/webhooks/whatsapp
const webhookPaths = ['/api/whatsapp/webhook', '/api/webhooks/whatsapp'];

app.get(webhookPaths, (req, res) => {
  const mode = (req.query['hub.mode'] || req.query.mode) as string;
  const token = (req.query['hub.verify_token'] || req.query.verify_token) as string;
  const challenge = (req.query['hub.challenge'] || req.query.challenge) as string;

  console.log(`[Meta Webhook GET Verify]: path=${req.path} mode=${mode} token=${token ? '[present]' : '[missing]'}`);

  const verification = metaWhatsAppService.verifyWebhook(mode, token, challenge);
  if (verification.isValid && verification.challenge != null) {
    console.log('[Meta Webhook GET Verify]: Verified successfully! Returning challenge.');
    res.status(200);
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    return res.send(String(verification.challenge));
  }

  console.warn('[Meta Webhook GET Verify]: Verification failed. Token mismatch.');
  res.status(403);
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  return res.send('Forbidden');
});

// Meta Webhook Message Receiver (POST)
app.post(webhookPaths, async (req, res) => {
  try {
    // Return 200 immediately to Meta so the webhook never times out
    res.status(200).json({ status: 'EVENT_RECEIVED' });

    // Process webhook event asynchronously with full idempotency
    await metaWhatsAppService.processWebhookEvent(req.body);
  } catch (err: any) {
    console.error('[Meta Webhook Error]:', err);
  }
});

// -------------------------------------------------------------
// 2. Authentication Endpoints
// -------------------------------------------------------------
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  const profile = db.profiles.find(p => p.email.toLowerCase() === (email || '').toLowerCase()) || db.profiles[0];
  const userMemberships = db.tenantMembers.filter(m => m.userId === profile.id);
  const tenantIds = userMemberships.map(m => m.tenantId);
  const userTenants = db.tenants.filter(t => tenantIds.includes(t.id));

  res.json({
    user: profile,
    token: `jwt_session_${profile.id}_${Date.now()}`,
    tenants: userTenants,
    currentTenant: userTenants[0] || db.tenants[0]
  });
});

app.post('/api/auth/register', (req, res) => {
  const { email, fullName, businessName, businessType } = req.body;
  if (!email || !fullName || !businessName) {
    return res.status(400).json({ error: 'Email, Full Name, and Business Name are required.' });
  }

  const newProfile = {
    id: generateId('usr'),
    email,
    fullName,
    createdAt: new Date().toISOString()
  };
  db.profiles.push(newProfile);

  const slug = businessName.toLowerCase().replace(/[^a-z0-9]/g, '-');
  const newTenant = {
    id: generateId('tenant'),
    name: businessName,
    slug: `${slug}-${Math.floor(100 + Math.random() * 900)}`,
    businessType: businessType || 'Restaurant',
    currency: 'PKR',
    timezone: 'Asia/Karachi',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  db.tenants.push(newTenant);

  db.tenantMembers.push({
    id: generateId('mem'),
    tenantId: newTenant.id,
    userId: newProfile.id,
    role: 'OWNER',
    status: 'ACTIVE',
    createdAt: new Date().toISOString(),
    profile: newProfile
  });

  db.updateBusinessProfile(newTenant.id, {
    businessName,
    businessType: businessType || 'Restaurant',
    email,
    deliveryFee: 150,
    currency: 'PKR',
    description: `${businessName} automated WhatsApp ordering.`
  });

  res.json({
    user: newProfile,
    token: `jwt_session_${newProfile.id}_${Date.now()}`,
    tenants: [newTenant],
    currentTenant: newTenant
  });
});

app.get('/api/auth/me', (req, res) => {
  const profile = db.profiles[0];
  const userTenants = db.tenants;
  res.json({
    user: profile,
    tenants: userTenants,
    currentTenant: db.tenants[0]
  });
});

app.get('/api/tenants', (req, res) => {
  res.json({ tenants: db.tenants });
});

// -------------------------------------------------------------
// 3. WhatsApp Integration Endpoints
// -------------------------------------------------------------
const getWhatsAppStatusHandler = (req: express.Request, res: express.Response) => {
  const tenantId = getTenantId(req);
  const account = db.getWhatsAppAccount(tenantId);
  const phoneNumbers = db.getWhatsAppPhoneNumbers(tenantId);
  const primaryPhone = phoneNumbers.find(p => p.isPrimary) || phoneNumbers[0];

  res.json({
    account,
    phoneNumbers,
    primaryPhone,
    appUrl: process.env.APP_URL || 'https://whats-app-orderdesk.netlify.app',
    webhookUrl: `${process.env.APP_URL || 'https://whats-app-orderdesk.netlify.app'}/api/whatsapp/webhook`,
    verifyToken: process.env.META_VERIFY_TOKEN || 'orderdesk_webhook_verify_token_secure',
    metaAppId: process.env.META_APP_ID || ''
  });
};

app.get('/api/whatsapp/status', getWhatsAppStatusHandler);
app.get('/api/whatsapp/config', getWhatsAppStatusHandler);

app.post('/api/whatsapp/config', async (req, res) => {
  const tenantId = getTenantId(req);
  const { wabaId, phoneNumberId, accessToken, displayNumber, displayPhoneNumber, businessName, verifiedName } = req.body;

  if (!wabaId || !phoneNumberId || !accessToken) {
    return res.status(400).json({
      success: false,
      error: 'WABA ID, Phone Number ID, and Access Token are required.'
    });
  }

  const verified = await metaWhatsAppService.verifyCredentials(phoneNumberId, accessToken);
  if (!verified.ok) {
    return res.status(400).json({ success: false, error: verified.error, connected: false });
  }

  const conn = db.saveWhatsAppConnection(tenantId, {
    wabaId,
    businessName: businessName || verified.verifiedName || verifiedName || 'WhatsApp Business',
    phoneNumberId,
    displayPhoneNumber: verified.displayPhoneNumber || displayNumber || displayPhoneNumber,
    verifiedName: verified.verifiedName || verifiedName || businessName || 'WhatsApp Business',
    accessTokenEncrypted: accessToken
  });

  await persistWhatsAppConnectionToSupabase({
    tenantId,
    wabaId,
    phoneNumberId,
    displayPhoneNumber: conn.phoneNumber.displayPhoneNumber,
    verifiedName: conn.phoneNumber.verifiedName,
    accessToken
  });

  res.json({
    success: true,
    connected: true,
    connection: conn,
    account: db.getWhatsAppAccount(tenantId),
    phoneNumbers: db.getWhatsAppPhoneNumbers(tenantId),
    message: 'Meta WhatsApp Cloud API connected and credentials saved.'
  });
});

app.post('/api/whatsapp/send-test', async (req, res) => {
  const tenantId = getTenantId(req);
  const { phoneNumber, text } = req.body;
  const phoneNumbers = db.getWhatsAppPhoneNumbers(tenantId);
  const phoneId = phoneNumbers[0]?.phoneNumberId || 'phone_id_khyber_1001';
  const account = db.getWhatsAppAccount(tenantId);
  const token = account?.accessTokenEncrypted || process.env.META_ACCESS_TOKEN || 'mock_token';
  const result = await metaWhatsAppService.sendTextMessage(phoneId, token, phoneNumber || '+923001234567', text || 'Test message from WhatsApp OrderDesk');
  res.status(result.success ? 200 : 400).json({ success: result.success, result, error: result.error });
});

app.post('/api/whatsapp/connect-embedded', async (req, res) => {
  const tenantId = getTenantId(req);
  const { code, businessName } = req.body;
  const result = await metaWhatsAppService.exchangeEmbeddedSignupCode(tenantId, code || 'sample_code', businessName || 'My Business');
  res.json(result);
});

app.post('/api/whatsapp/connect-manual', (req, res) => {
  const tenantId = getTenantId(req);
  const { wabaId, phoneNumberId, displayPhoneNumber, verifiedName, accessToken } = req.body;

  if (!wabaId || !phoneNumberId || !displayPhoneNumber) {
    return res.status(400).json({ error: 'WABA ID, Phone Number ID, and Display Phone Number are required.' });
  }

  const conn = db.saveWhatsAppConnection(tenantId, {
    wabaId,
    businessName: verifiedName || 'My Business',
    phoneNumberId,
    displayPhoneNumber,
    verifiedName: verifiedName || 'Verified WhatsApp Business',
    accessTokenEncrypted: accessToken
  });

  res.json({ success: true, connection: conn });
});

app.post('/api/whatsapp/test', async (req, res) => {
  const tenantId = getTenantId(req);
  const testRes = await metaWhatsAppService.testConnection(tenantId);
  res.json(testRes);
});

app.post('/api/whatsapp/disconnect', (req, res) => {
  const tenantId = getTenantId(req);
  db.disconnectWhatsApp(tenantId);
  res.json({ success: true, message: 'WhatsApp account disconnected for tenant.' });
});

// -------------------------------------------------------------
// 4. Products & Inventory Endpoints
// -------------------------------------------------------------
app.get('/api/products', (req, res) => {
  const tenantId = getTenantId(req);
  const query = req.query.query as string;
  const categoryId = req.query.categoryId as string;
  const products = db.getProducts(tenantId, { query, categoryId });
  res.json(products);
});

app.post('/api/products', (req, res) => {
  const tenantId = getTenantId(req);
  const product = db.createProduct(tenantId, req.body);
  res.status(201).json({ success: true, product, ...product });
});

app.put('/api/products/:id', (req, res) => {
  const tenantId = getTenantId(req);
  const updated = db.updateProduct(tenantId, req.params.id, req.body);
  if (!updated) return res.status(404).json({ error: 'Product not found' });
  res.json({ success: true, product: updated, ...updated });
});

app.delete('/api/products/:id', (req, res) => {
  const tenantId = getTenantId(req);
  const success = db.deleteProduct(tenantId, req.params.id);
  if (!success) return res.status(404).json({ error: 'Product not found' });
  res.json({ success: true, message: 'Product deleted successfully' });
});

// Import products from any e-commerce website URL using Groq AI
app.post('/api/products/import-from-url', async (req, res) => {
  const tenantId = getTenantId(req);
  const { url } = req.body;
  if (!url) {
    return res.status(400).json({ success: false, error: 'Website URL is required.' });
  }

  const result = await scrapeProductsFromUrl(tenantId, url);
  res.json(result);
});

app.post('/api/products/inventory/adjust', (req, res) => {
  const tenantId = getTenantId(req);
  const { productId, changeQuantity, notes } = req.body;
  if (!productId || changeQuantity === undefined) {
    return res.status(400).json({ error: 'Product ID and changeQuantity are required.' });
  }

  const prod = db.adjustInventory(tenantId, productId, Number(changeQuantity), 'ADJUSTMENT', notes);
  if (!prod) return res.status(404).json({ error: 'Product not found' });
  res.json({ success: true, product: prod });
});

app.post('/api/products/:id/adjust', (req, res) => {
  const tenantId = getTenantId(req);
  const productId = req.params.id;
  const { changeQuantity, notes } = req.body;
  if (changeQuantity === undefined) {
    return res.status(400).json({ error: 'changeQuantity is required.' });
  }

  const prod = db.adjustInventory(tenantId, productId, Number(changeQuantity), 'ADJUSTMENT', notes);
  if (!prod) return res.status(404).json({ error: 'Product not found' });
  res.json({ success: true, product: prod });
});

app.get('/api/products/inventory/movements', (req, res) => {
  const tenantId = getTenantId(req);
  const productId = req.query.productId as string;
  const movements = db.getInventoryMovements(tenantId, productId);
  res.json(movements);
});

// -------------------------------------------------------------
// 5. Orders Endpoints
// -------------------------------------------------------------
app.get('/api/orders', (req, res) => {
  const tenantId = getTenantId(req);
  const status = req.query.status as any;
  const query = req.query.query as string;
  const orders = db.getOrders(tenantId, { status, query });
  res.json(orders);
});

app.get('/api/orders/:id', (req, res) => {
  const tenantId = getTenantId(req);
  const order = db.getOrderById(tenantId, req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  res.json(order);
});

app.post('/api/orders', (req, res) => {
  const tenantId = getTenantId(req);
  const result = db.createOrderAtomic(tenantId, {
    ...req.body,
    source: 'dashboard'
  });
  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }
  res.status(201).json(result.order);
});

// Update order status with instant WhatsApp push notification to the customer
app.patch('/api/orders/:id/status', async (req, res) => {
  const tenantId = getTenantId(req);
  const { status, note } = req.body;
  const order = db.updateOrderStatus(tenantId, req.params.id, status, 'Staff Dashboard', note);
  if (!order) return res.status(404).json({ error: 'Order not found' });

  // Sync to Supabase
  persistOrderStatusToSupabase(order.id, status).catch(err => {
    console.warn('[Supabase Order Status Sync Warning]:', err?.message || err);
  });

  // Automatically send notification to customer WhatsApp
  let notificationSent = false;
  try {
    const account = db.getWhatsAppAccount(tenantId);
    const token = resolveMetaAccessToken(account);
    const phoneObj = db.getWhatsAppPhoneNumbers(tenantId)[0];
    const phoneNumberId = phoneObj?.phoneNumberId || process.env.META_PHONE_NUMBER_ID || '1257112607493238';

    const statusMessages: Record<string, string> = {
      CONFIRMED: `Assalam o Alaikum ${order.customerName}! ✅ Aapka order #${order.orderNumber} confirm ho chuka hai.\nTotal: Rs. ${order.total.toLocaleString()} (Cash on Delivery).\nDelivery Address: 📍 ${order.deliveryAddress}\nHum jald aapka parcel dispatch kar rahe hain.`,
      PREPARING: `Assalam o Alaikum ${order.customerName}! 👨‍🍳 Aapka order #${order.orderNumber} packing / prepare ho raha hai.\nTotal: Rs. ${order.total.toLocaleString()}.\nJald dispatch kiya jayega.`,
      SHIPPED: `Assalam o Alaikum ${order.customerName}! 🚚 Good news! Aapka order #${order.orderNumber} dispatch ho chuka hai aur rider ke paas hai.\nDelivery Address: 📍 ${order.deliveryAddress}\nTotal (COD): Rs. ${order.total.toLocaleString()}.\nBarah-e-karam payment tayar rakhein. Shukriya!`,
      DELIVERED: `Assalam o Alaikum ${order.customerName}! 🎉 Aapka order #${order.orderNumber} successfully deliver ho gaya hai.\nHum se shopping karne ka bohat shukriya! Agar koi masla ya feedback ho to isi chat par message karein.`,
      CANCELLED: `Assalam o Alaikum ${order.customerName}! ⚠️ Aapka order #${order.orderNumber} cancel kar diya gaya hai.${note ? `\nWajah: ${note}` : ''}\nAgar koi sawal ho to humein isi chat par message karein.`
    };

    const notifyText =
      statusMessages[status] ||
      `Assalam o Alaikum ${order.customerName}! Aapke order #${order.orderNumber} ka status update ho kar "${status}" ho gaya hai.`;

    if (order.customerPhone) {
      const sendRes = await metaWhatsAppService.sendTextMessage(phoneNumberId, token, order.customerPhone, notifyText);
      notificationSent = !!sendRes.success;

      // Also record message in the conversation history
      const conv = db.getConversationByCustomerPhone(tenantId, order.customerPhone);
      if (conv) {
        db.addMessage(tenantId, conv.id, 'SYSTEM', notifyText, {
          type: 'ORDER_STATUS_UPDATE',
          status,
          orderNumber: order.orderNumber,
          whatsappMessageId: sendRes.messageId
        });
      }
    }
  } catch (waErr: any) {
    console.error('[WhatsApp Status Notification Error]:', waErr?.message || waErr);
  }

  res.json({ success: true, order, notificationSent, ...order });
});

// -------------------------------------------------------------
// 6. Customers Endpoints
// -------------------------------------------------------------
app.get('/api/customers', (req, res) => {
  const tenantId = getTenantId(req);
  const query = req.query.query as string;
  const customers = db.getCustomers(tenantId, query);
  res.json(customers);
});

app.get('/api/customers/:id', (req, res) => {
  const tenantId = getTenantId(req);
  const customer = db.getCustomerById(tenantId, req.params.id);
  if (!customer) return res.status(404).json({ error: 'Customer not found' });
  const orders = db.getOrders(tenantId).filter(o => o.customerId === customer.id);
  res.json({ customer, orders });
});

// -------------------------------------------------------------
// 7. Conversations & Inbox Endpoints
// -------------------------------------------------------------
app.get('/api/conversations', (req, res) => {
  const tenantId = getTenantId(req);
  const status = req.query.status as any;
  const search = req.query.search as string;
  const convs = db.getConversations(tenantId, { status, search });
  res.json(convs);
});

app.get('/api/conversations/:id', (req, res) => {
  const tenantId = getTenantId(req);
  const conv = db.getConversationById(tenantId, req.params.id);
  if (!conv) return res.status(404).json({ error: 'Conversation not found' });
  const messages = db.getMessages(tenantId, conv.id);
  const customer = db.getCustomerById(tenantId, conv.customerId);
  const customerOrders = db.getOrders(tenantId).filter(o => o.customerId === conv.customerId);
  res.json({ conversation: conv, messages, customer, orders: customerOrders });
});

// GET messages specifically for a conversation
app.get('/api/conversations/:id/messages', (req, res) => {
  const tenantId = getTenantId(req);
  const messages = db.getMessages(tenantId, req.params.id);
  res.json({ messages });
});

// Staff sends reply directly to customer via WhatsApp
app.post('/api/conversations/:id/messages', async (req, res) => {
  const tenantId = getTenantId(req);
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: 'Message text is required' });

  const conv = db.getConversationById(tenantId, req.params.id);
  if (!conv) return res.status(404).json({ error: 'Conversation not found' });

  // Store in database
  const msg = db.addMessage(tenantId, conv.id, 'STAFF', text);

  // Send through WhatsApp
  const account = db.getWhatsAppAccount(tenantId);
  const token = resolveMetaAccessToken(account);
  await metaWhatsAppService.sendTextMessage(conv.phoneNumberId, token, conv.customerPhone, text);

  res.status(201).json(msg);
});

// Switch AI vs Human Active mode
app.post('/api/conversations/:id/toggle-mode', (req, res) => {
  const tenantId = getTenantId(req);
  const { status } = req.body;
  const updated = db.setConversationStatus(tenantId, req.params.id, status, 'Staff');
  if (!updated) return res.status(404).json({ error: 'Conversation not found' });
  res.json(updated);
});

// -------------------------------------------------------------
// 8. AI Agent Configuration & Interactive Simulator
// -------------------------------------------------------------
app.get('/api/ai/settings', (req, res) => {
  const tenantId = getTenantId(req);
  const settings = db.getAgentSettings(tenantId);
  const knowledge = db.getAgentKnowledge(tenantId);
  const business = db.getBusinessProfile(tenantId);
  res.json({ settings, knowledge, business, mandatoryModel: MANDATORY_GROQ_MODEL });
});

app.put('/api/ai/settings', (req, res) => {
  const tenantId = getTenantId(req);
  const updated = db.updateAgentSettings(tenantId, req.body);
  res.json(updated);
});

app.post('/api/ai/settings', (req, res) => {
  const tenantId = getTenantId(req);
  const updated = db.updateAgentSettings(tenantId, req.body);
  res.json(updated);
});

app.post('/api/ai/knowledge', (req, res) => {
  const tenantId = getTenantId(req);
  const { question, answer, title, content, category } = req.body;
  const q = question || title || 'Frequently Asked Question';
  const a = answer || content || '';
  if (!q || !a) {
    return res.status(400).json({ error: 'Question/Title and Answer/Content are required' });
  }
  const item = db.addAgentKnowledge(tenantId, {
    question: q,
    answer: a,
    category: (category as any) || 'FAQ',
    isActive: true
  });
  res.status(201).json(item);
});

app.delete('/api/ai/knowledge/:id', (req, res) => {
  const tenantId = getTenantId(req);
  const success = db.deleteAgentKnowledge(tenantId, req.params.id);
  res.json({ success });
});

// Interactive Simulator: lets dashboard user simulate any customer query with Groq openai/gpt-oss-20b
app.post('/api/ai/simulate', async (req, res) => {
  const tenantId = getTenantId(req);
  const { message, customerPhone, customerName } = req.body;
  if (!message) return res.status(400).json({ error: 'Message text is required' });

  const phone = customerPhone || '+92 333 9998877';
  const name = customerName || 'Simulated Customer';

  const customer = db.findOrCreateCustomer(tenantId, phone, name);
  const phoneNumbers = db.getWhatsAppPhoneNumbers(tenantId);
  const phoneId = phoneNumbers[0]?.phoneNumberId || 'simulated_phone_id';

  const conv = db.findOrCreateConversation(tenantId, customer.id, phone, name, phoneId);

  // Record simulated incoming message
  db.addMessage(tenantId, conv.id, 'CUSTOMER', message);

  // Run AI processing with Groq openai/gpt-oss-20b
  const { responseText, isHandoff } = await processCustomerMessageWithAi(tenantId, customer, conv, message);

  // Record AI response
  const aiMsg = db.addMessage(tenantId, conv.id, 'AI', responseText);

  res.json({
    conversationId: conv.id,
    customer,
    userMessage: message,
    aiResponse: responseText,
    isHandoff,
    status: conv.status
  });
});

// -------------------------------------------------------------
// 9. Analytics, Team, Billing & Notifications Endpoints
// -------------------------------------------------------------
app.get('/api/analytics', (req, res) => {
  const tenantId = getTenantId(req);
  const data = db.getAnalytics(tenantId);
  res.json(data);
});

app.get('/api/team', (req, res) => {
  const tenantId = getTenantId(req);
  const members = db.tenantMembers.filter(m => m.tenantId === tenantId);
  res.json(members);
});

app.post('/api/team/invite', (req, res) => {
  const tenantId = getTenantId(req);
  const { email, role } = req.body;
  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }
  const member = db.inviteMember(tenantId, email, role || 'SUPPORT');
  res.status(201).json(member);
});

app.get('/api/billing', (req, res) => {
  const tenantId = getTenantId(req);
  const sub = db.getSubscription(tenantId);
  res.json({
    subscription: sub,
    plans: [
      { id: 'starter', name: 'Starter', priceMonthly: 9.99, orderLimitMonthly: 500, hasAiAgent: false, hasAnalytics: false },
      { id: 'pro', name: 'Pro', priceMonthly: 19.99, orderLimitMonthly: 2000, hasAiAgent: true, hasAnalytics: true },
      { id: 'business', name: 'Business', priceMonthly: 39.99, orderLimitMonthly: 999999, hasAiAgent: true, hasAnalytics: true }
    ]
  });
});

app.post('/api/billing/upgrade', (req, res) => {
  const tenantId = getTenantId(req);
  const { plan } = req.body;
  if (!plan) {
    return res.status(400).json({ error: 'Plan is required' });
  }
  const sub = db.updateSubscription(tenantId, plan);
  res.json({ success: true, subscription: sub });
});

app.get('/api/notifications', (req, res) => {
  const tenantId = getTenantId(req);
  res.json(db.getNotifications(tenantId));
});

app.patch('/api/notifications/:id/read', (req, res) => {
  const tenantId = getTenantId(req);
  db.markNotificationRead(tenantId, req.params.id);
  res.json({ success: true });
});

// Trigger on-demand sync from Supabase
app.post('/api/sync-supabase', async (req, res) => {
  try {
    const success = await syncSupabaseWithStore(db);
    res.json({ success, tenants: db.tenants, productsCount: db.products.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// 10. Vite Middleware or Production Static Serving
// -------------------------------------------------------------
async function startServer() {
  // Sync live Supabase tables on startup
  try {
    await syncSupabaseWithStore(db);
  } catch (err) {
    console.warn('[Server Startup]: Supabase sync failed, continuing with cached store:', err);
  }

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api/')) return next();
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`WhatsApp OrderDesk Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
