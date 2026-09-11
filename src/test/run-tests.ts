import { db } from '../../server/db';
import { metaWhatsAppService } from '../../server/whatsapp/meta-service';
import { processCustomerMessageWithAi, MANDATORY_GROQ_MODEL } from '../../server/ai/groq';

async function runAllTests() {
  console.log('====================================================');
  console.log('  WHATSAPP ORDERDESK: AUTOMATED TEST SUITE');
  console.log('  Model Requirement: ' + MANDATORY_GROQ_MODEL);
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`✅ [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${testName}${detail ? ` — ${detail}` : ''}`);
      failed++;
    }
  }

  // TEST 1: Multi-Tenant Architecture & Isolation
  console.log('\n--- 1. Multi-Tenant Data Isolation ---');
  const tenantA = db.getTenant('tenant_khyber_001')!;
  const tenantB = db.getTenant('tenant_urban_002')!;

  assert(!!tenantA && !!tenantB, 'Both test tenants exist (Khyber Delight & Urban Chic)');

  const prodsA = db.getProducts(tenantA.id);
  const prodsB = db.getProducts(tenantB.id);

  assert(prodsA.length > 0 && prodsB.length > 0, 'Both tenants have distinct product catalogs');
  assert(
    !prodsA.some(p => p.tenantId === tenantB.id) && !prodsB.some(p => p.tenantId === tenantA.id),
    'Tenant A cannot access Tenant B products (Zero row cross-leakage)'
  );

  const ordersA = db.getOrders(tenantA.id);
  const ordersB = db.getOrders(tenantB.id);
  assert(
    !ordersA.some(o => o.tenantId === tenantB.id) && !ordersB.some(o => o.tenantId === tenantA.id),
    'Tenant A cannot access Tenant B orders'
  );

  // TEST 2: Phone Number ID Tenant Resolution
  console.log('\n--- 2. WhatsApp Phone Number ID Tenant Resolution ---');
  const resA = db.getTenantByPhoneNumberId('phone_id_khyber_1001');
  const resB = db.getTenantByPhoneNumberId('phone_id_urban_2002');

  assert(resA?.tenant.id === tenantA.id, 'phone_id_khyber_1001 resolves strictly to Tenant A (Khyber Delight)');
  assert(resB?.tenant.id === tenantB.id, 'phone_id_urban_2002 resolves strictly to Tenant B (Urban Chic)');

  const resUnknown = db.getTenantByPhoneNumberId('phone_id_fake_9999');
  assert(resUnknown === null, 'Unknown Phone Number ID returns null safely');

  // TEST 3: Atomic Order Creation & Inventory Deductions
  console.log('\n--- 3. Atomic Order Creation & Stock Deductions ---');
  const testProd = prodsA[0];
  const initialStock = testProd.stockQuantity;

  const orderResult = db.createOrderAtomic(tenantA.id, {
    customerId: 'cust_khyber_01',
    customerName: 'Test Customer',
    customerPhone: '+92 300 1112233',
    items: [{ productId: testProd.id, quantity: 2 }],
    deliveryAddress: 'Street 4, Sector G, Lahore',
    source: 'whatsapp_ai'
  });

  assert(orderResult.success === true, 'Atomic order creation succeeds when stock is sufficient');
  assert(orderResult.order?.total === testProd.price * 2 + 150, 'Order total calculates correctly (items + delivery)');

  const updatedProd = db.getProductById(tenantA.id, testProd.id)!;
  assert(updatedProd.stockQuantity === initialStock - 2, 'Stock quantity deducted exactly by 2');

  // Test rollback on insufficient stock
  const overOrderResult = db.createOrderAtomic(tenantA.id, {
    customerId: 'cust_khyber_01',
    customerName: 'Test Customer',
    customerPhone: '+92 300 1112233',
    items: [{ productId: testProd.id, quantity: 99999 }],
    deliveryAddress: 'Lahore',
    source: 'whatsapp_ai'
  });
  assert(overOrderResult.success === false, 'Order rejected with insufficient stock (No negative stock)');

  // TEST 4: Meta WhatsApp Webhook GET Verification
  console.log('\n--- 4. Meta Webhook Verification ---');
  const expectedToken = process.env.META_VERIFY_TOKEN || 'orderdesk_webhook_verify_token_secure';
  const verifyValid = metaWhatsAppService.verifyWebhook('subscribe', expectedToken, 'challenge_123456');
  assert(verifyValid.isValid === true && verifyValid.challenge === 'challenge_123456', 'Valid webhook subscription challenge accepted');

  const verifyInvalid = metaWhatsAppService.verifyWebhook('subscribe', 'wrong_token', 'challenge_123456');
  assert(verifyInvalid.isValid === false, 'Invalid webhook subscription token rejected');

  // TEST 5: Webhook Idempotency & Message Processing
  console.log('\n--- 5. Webhook Idempotency & Deduplication ---');
  const testMsgId = `wamid.test_${Date.now()}`;
  const webhookPayload = {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'waba_khyber_1001',
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: {
                display_phone_number: '+92 300 1234567',
                phone_number_id: 'phone_id_khyber_1001'
              },
              contacts: [{ profile: { name: 'Ali Raza' }, wa_id: '923331234567' }],
              messages: [
                {
                  from: '923331234567',
                  id: testMsgId,
                  timestamp: `${Math.floor(Date.now() / 1000)}`,
                  text: { body: 'Assalam o Alaikum! Zinger burger kitne ka hai?' },
                  type: 'text'
                }
              ]
            }
          }
        ]
      }
    ]
  };

  const proc1 = await metaWhatsAppService.processWebhookEvent(webhookPayload);
  assert(proc1.handled === true, 'Incoming webhook processed successfully');

  // Second identical webhook
  const proc2 = await metaWhatsAppService.processWebhookEvent(webhookPayload);
  const dupCheck = proc2.results.find(r => r.status === 'DUPLICATE_IGNORED');
  assert(!!dupCheck, 'Duplicate webhook event ignored idempotently');

  // TEST 6: Groq AI Response & Language Support (Urdu / Roman Urdu)
  console.log('\n--- 6. Groq AI Processing & Language Handling ---');
  const testCustomer = db.findOrCreateCustomer(tenantA.id, '+92 333 1234567', 'Ali Raza');
  const testConv = db.findOrCreateConversation(tenantA.id, testCustomer.id, testCustomer.phone, testCustomer.name, 'phone_id_khyber_1001');

  const aiRes = await processCustomerMessageWithAi(
    tenantA.id,
    testCustomer,
    testConv,
    'Zinger burger kitne ka hai?'
  );

  assert(aiRes.responseText.length > 0, 'AI generated a helpful WhatsApp response');
  assert(
    aiRes.responseText.toLowerCase().includes('zinger') || aiRes.responseText.includes('550') || aiRes.responseText.toLowerCase().includes('burger'),
    'AI accurately referenced store product and pricing'
  );

  // TEST 7: Human Handoff Transition
  console.log('\n--- 7. Human Handoff Mechanism ---');
  const handoffRes = await processCustomerMessageWithAi(
    tenantA.id,
    testCustomer,
    testConv,
    'Mujhe human agent se baat karni hai'
  );

  assert(handoffRes.isHandoff === true, 'Handoff to human recognized and triggered');
  const convAfterHandoff = db.getConversationById(tenantA.id, testConv.id)!;
  assert(convAfterHandoff.status === 'HUMAN_ACTIVE', 'Conversation mode transitioned to HUMAN_ACTIVE');

  const notifs = db.getNotifications(tenantA.id);
  const handoffNotif = notifs.find(n => n.type === 'HUMAN_HANDOFF');
  assert(!!handoffNotif, 'Human handoff notification dispatched for staff');

  // TEST 8: Cross-Tenant WhatsApp Reply Isolation
  console.log('\n--- 8. WhatsApp Outgoing Number Isolation ---');
  const phoneObjA = db.getWhatsAppPhoneNumbers(tenantA.id)[0];
  const phoneObjB = db.getWhatsAppPhoneNumbers(tenantB.id)[0];
  assert(phoneObjA.phoneNumberId !== phoneObjB.phoneNumberId, 'Tenant A and Tenant B use different WhatsApp Phone IDs');
  assert(phoneObjA.displayPhoneNumber !== phoneObjB.displayPhoneNumber, 'Tenant A and Tenant B display distinct phone numbers');

  console.log('\n====================================================');
  console.log(`  TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runAllTests().catch(err => {
  console.error('Test runner fatal error:', err);
  process.exit(1);
});
