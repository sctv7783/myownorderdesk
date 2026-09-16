const {
  applyCustomerTurn,
  resetMemoryDrafts,
  stripRepeatedGreeting
} = require('./order-engine.cjs');

const products = [
  {
    id: 'p_m10',
    name: 'M10 Digital Display Earbuds',
    sku: 'M10',
    price: 2500,
    salePrice: 2500,
    stockQuantity: 20,
    availableQuantity: 20,
    isActive: true
  },
  {
    id: 'p_charger',
    name: 'Charger',
    sku: 'CHG',
    price: 800,
    stockQuantity: 15,
    availableQuantity: 15,
    isActive: true
  },
  {
    id: 'p_abc',
    name: 'Leather Wallet',
    sku: 'WAL',
    price: 1200,
    stockQuantity: 8,
    availableQuantity: 8,
    isActive: true
  }
];

let passed = 0;
let failed = 0;

function assert(cond, name, detail) {
  if (cond) {
    passed += 1;
    console.log(`PASS  ${name}`);
  } else {
    failed += 1;
    console.error(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

async function turn(phone, text, extra = {}) {
  return applyCustomerTurn({
    tenantId: 'test_tenant',
    customerPhone: phone,
    customerName: extra.customerName || 'Ali',
    conversationId: extra.conversationId || `conv_${phone}`,
    text,
    products,
    deliveryFee: 150,
    persistOrder: extra.persistOrder !== false,
    history: extra.history || []
  });
}

function greetCount(text) {
  return ((String(text || '').match(/alaikum/gi) || []).length);
}

async function run() {
  resetMemoryDrafts();

  // Test 1 — Normal order
  {
    const phone = '+923001111111';
    const a = await turn(phone, 'Salam');
    const b = await turn(phone, 'M10 ke 2 pieces chahiye');
    const c = await turn(phone, 'House 12, Street 4, Johar Town Lahore');
    const d = await turn(phone, 'Haan confirm kar do');
    assert(a.reply && /alaikum|batayein/i.test(a.reply), 'T1 greet once on Salam');
    assert(b.draft.items.length === 1 && b.draft.items[0].quantity === 2, 'T1 quantity 2', JSON.stringify(b.draft.items));
    assert(/address/i.test(b.reply), 'T1 asks address after qty', b.reply);
    assert(greetCount(b.reply) === 0, 'T1 no second greeting on product', b.reply);
    assert(c.draft.deliveryAddress && /Johar/i.test(c.draft.deliveryAddress), 'T1 address saved', c.draft.deliveryAddress);
    assert(/confirm/i.test(c.reply) && c.draft.awaiting === 'CONFIRMATION', 'T1 asks confirmation', c.reply);
    assert(d.order && d.next === 'done', 'T1 exactly one order created', d.reply);
    assert(!/alaikum/i.test(c.reply + d.reply), 'T1 no greeting after address/confirm');
  }

  resetMemoryDrafts();
  // Test 2 — Product then quantity
  {
    const phone = '+923001111112';
    const a = await turn(phone, 'M10 ka rate?');
    const b = await turn(phone, '2 chahiye');
    assert(String(a.reply).replace(/,/g, '').includes('2500'), 'T2 price for M10', a.reply);
    assert(a.draft.selectedProductId === 'p_m10', 'T2 remembers M10 after price');
    assert(b.draft.items[0]?.productId === 'p_m10' && b.draft.items[0]?.quantity === 2, 'T2 qty applies to M10', JSON.stringify(b.draft.items));
    assert(!/kis product/i.test(b.reply || ''), 'T2 does not ask which product', b.reply);
  }

  resetMemoryDrafts();
  // Test 3 — Quantity update
  {
    const phone = '+923001111113';
    await turn(phone, 'M10 ke 1 piece chahiye');
    const b = await turn(phone, '2 kar do');
    assert(b.draft.items.length === 1, 'T3 no duplicate cart line', JSON.stringify(b.draft.items));
    assert(b.draft.items[0].quantity === 2, 'T3 quantity becomes 2', JSON.stringify(b.draft.items));
    assert(b.draft.items[0].subtotal === 5000, 'T3 total recalculated', String(b.draft.items[0].subtotal));
  }

  resetMemoryDrafts();
  // Test 4 — Greeting plus two products
  {
    const phone = '+923001111114';
    const a = await turn(phone, 'Salam, 2 M10 aur 1 charger chahiye');
    assert(/alaikum/i.test(a.reply), 'T4 greeting once', a.reply);
    assert(a.draft.items.length === 2, 'T4 both products added', JSON.stringify(a.draft.items));
    const m10 = a.draft.items.find((i) => i.productId === 'p_m10');
    const ch = a.draft.items.find((i) => i.productId === 'p_charger');
    assert(m10?.quantity === 2 && ch?.quantity === 1, 'T4 quantities 2 and 1', JSON.stringify(a.draft.items));
    assert(!looksLikeDump(a.reply), 'T4 no catalog dump', a.reply);
  }

  resetMemoryDrafts();
  // Test 5 — Address follow-up
  {
    const phone = '+923001111115';
    await turn(phone, 'M10 ke 2 pieces chahiye');
    const b = await turn(phone, 'House 20, Model Town Lahore');
    assert(/Model Town/i.test(b.draft.deliveryAddress || ''), 'T5 address saved');
    assert(!/kis product|quantity kitni/i.test(b.reply || ''), 'T5 does not re-ask product', b.reply);
    assert(/confirm/i.test(b.reply), 'T5 asks confirmation', b.reply);
  }

  resetMemoryDrafts();
  // Test 6 — Generic confirmation without pending confirmation
  {
    const phone = '+923001111116';
    const a = await turn(phone, 'haan');
    assert(!a.order, 'T6 no order created');
    assert(/confirm|product/i.test(a.reply || ''), 'T6 asks what to confirm', a.reply);
  }

  resetMemoryDrafts();
  // Test 7 — Cancellation
  {
    const phone = '+923001111117';
    await turn(phone, 'M10 ke 2 pieces chahiye');
    const b = await turn(phone, 'cancel kar do');
    assert(!b.order, 'T7 no order created');
    assert(!b.draft.items.length, 'T7 draft cleared', JSON.stringify(b.draft.items));
    assert(/cancel/i.test(b.reply), 'T7 cancel confirmed', b.reply);
  }

  resetMemoryDrafts();
  // Test 8 — Order status
  {
    const phone = '+923001111118';
    await turn(phone, 'M10 ke 2 pieces chahiye');
    const b = await turn(phone, 'Mera order #ORD-1001 kahan hai?');
    assert(b.intent === 'ORDER_STATUS' || b.skipGroq === false, 'T8 status uses tool path', b.intent);
    assert(b.draft.items.length === 1, 'T8 does not start a new order / keeps cart', JSON.stringify(b.draft.items));
  }

  resetMemoryDrafts();
  // Test 9 — Repeated confirmation
  {
    const phone = '+923001111119';
    await turn(phone, 'M10 ke 2 pieces chahiye');
    await turn(phone, 'House 12, Street 4, Johar Town Lahore');
    const d1 = await turn(phone, 'Haan confirm kar do');
    const d2 = await turn(phone, 'Haan confirm kar do');
    assert(Boolean(d1.order), 'T9 first confirm creates order');
    const secondCreates = Boolean(d2.order) && !d2.order?.duplicate && d2.order?.orderNumber !== d1.order?.orderNumber;
    assert(!secondCreates, 'T9 second confirm does not create a new order', d2.reply);
  }

  resetMemoryDrafts();
  // Test 10 — Unrelated question during order
  {
    const phone = '+923001111120';
    await turn(phone, 'M10 ke 2 pieces chahiye');
    const b = await turn(phone, 'Aap delivery kitne din mein karte hain?');
    assert(b.draft.items.length === 1, 'T10 preserves cart', JSON.stringify(b.draft.items));
    assert(b.skipGroq === false, 'T10 defers delivery timing to Groq/state');
  }

  resetMemoryDrafts();
  // Test 11 — Product not found
  {
    const phone = '+923001111121';
    const a = await turn(phone, 'Mujhe ABC XYZ chahiye');
    assert(/nahi mila|nahi mila/i.test(a.reply || ''), 'T11 product not found', a.reply);
    assert(!a.draft.items.length, 'T11 never selects a random product', JSON.stringify(a.draft.items));
  }

  resetMemoryDrafts();
  // Test 12 — Multiple products across messages
  {
    const phone = '+923001111122';
    await turn(phone, '2 M10');
    const b = await turn(phone, '1 charger');
    assert(b.draft.items.length === 2, 'T12 both products remembered', JSON.stringify(b.draft.items));
    const m10 = b.draft.items.find((i) => i.productId === 'p_m10');
    const ch = b.draft.items.find((i) => i.productId === 'p_charger');
    assert(m10?.quantity === 2 && ch?.quantity === 1, 'T12 quantities correct', JSON.stringify(b.draft.items));
    assert(b.draft.subtotal === 2500 * 2 + 800, 'T12 combined subtotal', String(b.draft.subtotal));
  }

  resetMemoryDrafts();
  // Extra: empty message, invalid qty, photos keep product
  {
    const phone = '+923001111123';
    const empty = await turn(phone, '   ');
    assert(!empty.order, 'empty message does not create order');
    const photo = await turn(phone, 'M10 ki photo bhejo');
    assert(photo.draft.selectedProductId === 'p_m10', 'photo request remembers M10');
    assert(photo.skipGroq === false, 'photos defer to image sender');
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed) process.exit(1);
}

function looksLikeDump(text) {
  return (String(text || '').match(/^\s*\d+\s*[).:-]/gm) || []).length >= 6;
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
