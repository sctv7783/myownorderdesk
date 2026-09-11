import Groq from 'groq-sdk';
import { db } from '../db';
import { Customer, Conversation, Product } from '../../src/types';
import { generateId } from '../db';

// Groq API Model Configuration
export const MANDATORY_GROQ_MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-20b';

export function getGroqClient(): Groq | null {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return null;
  }
  return new Groq({ apiKey });
}

// OrderDesk Tool Definitions for Groq Function Calling
export const ORDERDESK_TOOLS: Groq.Chat.Completions.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'get_business_info',
      description: 'Get business details such as opening hours, business name, address, delivery fee, and return policy.',
      parameters: {
        type: 'object',
        properties: {},
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'search_products',
      description: 'Search catalog products by name, keyword, category, or description.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Product name or search keywords (e.g., "earbuds", "shoes", "silk suit")'
          }
        },
        required: ['query']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'check_stock',
      description: 'Check available inventory stock quantity and price for a specific product by ID or SKU.',
      parameters: {
        type: 'object',
        properties: {
          product_identifier: {
            type: 'string',
            description: 'Product ID or SKU'
          }
        },
        required: ['product_identifier']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'calculate_delivery_fee',
      description: 'Calculate delivery charges and estimated transit time for customer address.',
      parameters: {
        type: 'object',
        properties: {
          city: { type: 'string', description: 'Destination city name e.g. Lahore, Karachi' }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_order_status',
      description: 'Lookup existing customer order status, tracking updates, and items by order number.',
      parameters: {
        type: 'object',
        properties: {
          order_number: {
            type: 'string',
            description: 'Order number e.g. "ORD-1001"'
          }
        },
        required: ['order_number']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'create_order',
      description: 'Create and confirm a new customer order in the database ONLY after customer has explicitly provided their delivery address AND clearly confirmed the order.',
      parameters: {
        type: 'object',
        properties: {
          items: {
            type: 'array',
            description: 'Array of products to order',
            items: {
              type: 'object',
              properties: {
                product_id: { type: 'string', description: 'Product ID' },
                quantity: { type: 'number', description: 'Quantity to purchase' }
              },
              required: ['product_id', 'quantity']
            }
          },
          delivery_address: { type: 'string', description: 'Mandatory full delivery address of customer (house, street, area, city)' },
          payment_method: { type: 'string', description: 'Payment method e.g. COD' },
          notes: { type: 'string', description: 'Special instructions or notes' }
        },
        required: ['items', 'delivery_address']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'handoff_to_human',
      description: 'Escalate the conversation to human staff when customer requests human agent, has a serious complaint, or asks something unsupported.',
      parameters: {
        type: 'object',
        properties: {
          reason: { type: 'string', description: 'Reason for handoff e.g. "Customer requested human representative"' }
        },
        required: ['reason']
      }
    }
  }
];

// Helper: Extract delivery address from user text
export function extractDeliveryAddress(text: string): string | null {
  const lower = text.toLowerCase();

  // Pattern: "address: ...", "pata: ...", "yahan bhejein: ..."
  const explicitMatch = text.match(/(?:address|pata|location|yahan)\s*[:=-]?\s*(.+)/i);
  if (explicitMatch && explicitMatch[1].trim().length >= 8) {
    return explicitMatch[1].trim();
  }

  // Address keywords commonly used in Pakistan
  const addressKeywords = [
    'house', 'h#', 'h no', 'street', 'st#', 'st no', 'gali', 'mohallah', 'block',
    'phase', 'sector', 'flat', 'apartment', 'road', 'chowk', 'colony', 'town',
    'lahore', 'karachi', 'islamabad', 'rawalpindi', 'faisalabad', 'multan', 'peshawar',
    'sialkot', 'gujranwala', 'quetta', 'hyderabad', 'near', 'opp', 'bazar'
  ];

  const hasKeyword = addressKeywords.some(k => lower.includes(k));
  if (hasKeyword && text.trim().length >= 10) {
    return text.trim();
  }

  return null;
}

// Helper: Find product matching user text using fuzzy / token matching
export function findMatchingProduct(products: Product[], text: string): { product: Product; quantity: number } | null {
  const lower = text.toLowerCase();

  // Extract quantity if present
  const qtyMatch = text.match(/\b([1-9]|10)\s*(?:x|piece|pieces|pc|pcs|dane|adad)?\b/i);
  const quantity = qtyMatch ? parseInt(qtyMatch[1], 10) : 1;

  // 1. Direct name or SKU inclusion
  for (const p of products) {
    if (lower.includes(p.name.toLowerCase()) || lower.includes(p.sku.toLowerCase())) {
      return { product: p, quantity };
    }
  }

  // 2. Tokenized match (filter common stop words)
  const stopWords = new Set([
    'kya', 'hai', 'mujhe', 'chahiye', 'mangwana', 'order', 'karna', 'kardo', 'bhej', 'do',
    'please', 'the', 'a', 'an', 'for', 'in', 'of', 'and', 'with', 'rate', 'price',
    'kitne', 'ka', 'ke', 'ki', 'available', 'stock', 'hai', 'hain'
  ]);
  const words = lower.split(/[\s,\.!?_]+/).filter(w => w.length >= 3 && !stopWords.has(w));

  let bestMatch: Product | null = null;
  let maxScore = 0;

  for (const p of products) {
    const pText = (p.name + ' ' + p.description + ' ' + p.sku + ' ' + (p.categoryName || '')).toLowerCase();
    let score = 0;
    for (const w of words) {
      if (pText.includes(w)) {
        score += w.length >= 5 ? 3 : 1;
      }
    }
    if (score > maxScore) {
      maxScore = score;
      bestMatch = p;
    }
  }

  if (bestMatch && maxScore > 0) {
    return { product: bestMatch, quantity };
  }

  return null;
}

// Execute tool call against tenant database partition
export async function executeAiTool(
  tenantId: string,
  customer: Customer,
  conversation: Conversation,
  rawToolName: string,
  args: any
): Promise<{ result: any; isHandoff?: boolean }> {
  // Strip special tokens like <|channel|>commentary that reasoning models may append
  const toolName = rawToolName.replace(/<\|.*?\|>/g, '').trim();

  switch (toolName) {
    case 'get_business_info': {
      const bp = db.getBusinessProfile(tenantId);
      const knowledge = db.getAgentKnowledge(tenantId);
      return {
        result: {
          business_name: bp?.businessName || 'Our Store',
          description: bp?.description,
          city: bp?.city,
          address: bp?.address,
          delivery_fee: bp?.deliveryFee ?? 150,
          estimated_delivery_time: bp?.estimatedDeliveryTime ?? '30-45 mins',
          faqs: knowledge.map(k => ({ q: k.question, a: k.answer }))
        }
      };
    }

    case 'search_products': {
      const query = args.query || '';
      const products = db.getProducts(tenantId, { query, activeOnly: true });
      return {
        result: products.map(p => ({
          product_id: p.id,
          name: p.name,
          sku: p.sku,
          price: p.salePrice ?? p.price,
          in_stock: p.stockQuantity > 0,
          available_quantity: p.stockQuantity,
          description: p.description
        }))
      };
    }

    case 'check_stock': {
      const ident = args.product_identifier;
      const product =
        db.getProductById(tenantId, ident) ||
        db.getProductBySku(tenantId, ident) ||
        db.getProducts(tenantId, { query: ident, activeOnly: true })[0];

      if (!product) {
        return { result: { found: false, message: `Product "${ident}" not found in store catalog.` } };
      }
      return {
        result: {
          found: true,
          product_id: product.id,
          name: product.name,
          sku: product.sku,
          price: product.salePrice ?? product.price,
          in_stock: product.stockQuantity > 0,
          available_quantity: product.stockQuantity
        }
      };
    }

    case 'calculate_delivery_fee': {
      const bp = db.getBusinessProfile(tenantId);
      return {
        result: {
          delivery_fee: bp?.deliveryFee ?? 150,
          currency: bp?.currency ?? 'PKR',
          estimated_delivery_time: bp?.estimatedDeliveryTime ?? '30-45 mins'
        }
      };
    }

    case 'get_order_status': {
      const order = db.getOrderByNumber(tenantId, args.order_number);
      if (!order) {
        return { result: { found: false, message: `Order #${args.order_number} was not found.` } };
      }
      return {
        result: {
          found: true,
          order_number: order.orderNumber,
          status: order.status,
          total: order.total,
          items: order.items.map(i => `${i.quantity}x ${i.productName}`),
          delivery_address: order.deliveryAddress,
          created_at: order.createdAt
        }
      };
    }

    case 'create_order': {
      let finalAddress = (args.delivery_address || '').trim();

      // Check if address is missing or a placeholder
      if (
        !finalAddress ||
        finalAddress.length < 5 ||
        finalAddress.toLowerCase().includes('whatsapp') ||
        finalAddress.toLowerCase().includes('provided via')
      ) {
        if (customer.address && customer.address.trim().length >= 6) {
          finalAddress = customer.address.trim();
        } else {
          return {
            result: {
              success: false,
              error: 'MISSING_DELIVERY_ADDRESS',
              message:
                'Delivery address is required. Ask the customer: "Aapka order finalize karne ke liye, barah-e-karam apna mukammal delivery address (house, street, area, city) send karein."'
            }
          };
        }
      }

      // Save customer address to CRM
      db.updateCustomer(tenantId, customer.id, { address: finalAddress });

      const result = db.createOrderAtomic(tenantId, {
        customerId: customer.id,
        customerName: customer.name,
        customerPhone: customer.phone,
        items: args.items,
        deliveryAddress: finalAddress,
        paymentMethod: args.payment_method || 'COD',
        notes: args.notes,
        source: 'whatsapp_ai'
      });
      return { result };
    }

    case 'handoff_to_human': {
      db.setConversationStatus(tenantId, conversation.id, 'HUMAN_ACTIVE');
      return {
        result: {
          handed_off: true,
          status: 'HUMAN_ACTIVE',
          message: 'Conversation transferred to staff member. AI auto-reply paused.'
        },
        isHandoff: true
      };
    }

    default:
      return { result: { error: `Tool ${toolName} not supported.` } };
  }
}

// Main AI processing function using Groq API
export async function processCustomerMessageWithAi(
  tenantId: string,
  customer: Customer,
  conversation: Conversation,
  incomingText: string
): Promise<{ responseText: string; isHandoff: boolean }> {
  const settings = db.getAgentSettings(tenantId);
  const bp = db.getBusinessProfile(tenantId);
  const history = db.getMessages(tenantId, conversation.id).slice(-10);
  const products = db.getProducts(tenantId, { activeOnly: true });

  // 1. Check if customer provided an address in this message
  const detectedAddress = extractDeliveryAddress(incomingText);
  if (detectedAddress) {
    db.updateCustomer(tenantId, customer.id, { address: detectedAddress });
    customer.address = detectedAddress;
  }

  // 2. Check if customer asked for human handoff keywords directly
  const lowerText = incomingText.toLowerCase();
  const handoffTriggered = settings.handoffKeywords.some(k => lowerText.includes(k.toLowerCase()));
  if (handoffTriggered) {
    db.setConversationStatus(tenantId, conversation.id, 'HUMAN_ACTIVE');
    const handoffMsg =
      settings.primaryLanguage === 'urdu'
        ? 'Aapki request par conversation staff member ko transfer kar di gayi hai. Humara team member jald aap se rabta karega.'
        : 'Maine aapki conversation humare human staff ko transfer kar di hai. A staff member will be with you shortly!';
    return { responseText: handoffMsg, isHandoff: true };
  }

  // Active Catalog Summary for Groq prompt context
  const catalogSummary = products
    .slice(0, 30)
    .map(p => `- ${p.name} | Price: Rs. ${p.salePrice ?? p.price} | Stock: ${p.stockQuantity} | SKU: ${p.sku} | ID: ${p.id}`)
    .join('\n');

  // Customer context
  const customerAddressContext = customer.address
    ? `Known Customer Address: "${customer.address}"`
    : 'Customer Address: NOT PROVIDED YET';

  // System instructions for Groq
  const systemPrompt = `You are the official WhatsApp AI order desk agent for "${bp?.businessName || 'our business'}".
Platform: WhatsApp.
Customer: ${customer.name || 'Customer'} (${customer.phone}).
${customerAddressContext}

LANGUAGE SUPPORT:
You naturally speak Urdu, Roman Urdu, and English depending on how the customer speaks to you. Default to friendly Roman Urdu.

STORE PRODUCTS CATALOG (${products.length} active products):
${catalogSummary || 'No products added yet.'}

BUSINESS RULES:
- Delivery Fee: Rs. ${bp?.deliveryFee ?? 150} (COD / Cash on Delivery).
- Delivery Time: ${bp?.estimatedDeliveryTime || '30-45 mins'}.
- City: ${bp?.city || 'Pakistan'}.

ORDER PROCESSING WORKFLOW RULES:
1. When customer asks about any item, quote the exact product name, price, and stock from the catalog above.
2. When customer wants to buy an item:
   - Calculate Subtotal = Price * Quantity.
   - Total = Subtotal + Rs. ${bp?.deliveryFee ?? 150} (Delivery).
   - MANDATORY ADDRESS RULE: If customer has NOT provided their delivery address yet, you MUST ask:
     "Aapka order process karne ke liye, barah-e-karam apna mukammal delivery address (house, street, area, city) send karein."
   - DO NOT call create_order without having a full physical delivery address!
3. When customer gives their delivery address:
   - State the address and confirm: "Delivery Address: {address}. Total: Rs. {total} (COD). Kya main order confirm kar doon?"
4. ONLY call create_order after the customer clearly confirms (e.g., "yes", "haan", "confirm kardo", "theek hai") AND you have the delivery address.
5. In create_order, ALWAYS pass the exact customer address in the "delivery_address" parameter.
6. Keep replies concise, polite, and suitable for WhatsApp (1-4 short lines).`;

  const groq = getGroqClient();

  // If Groq is connected with API key:
  if (groq) {
    try {
      const messages: Groq.Chat.Completions.ChatCompletionMessageParam[] = [
        { role: 'system', content: systemPrompt },
        ...history.map(h => ({
          role: (h.sender === 'CUSTOMER' ? 'user' : 'assistant') as 'user' | 'assistant',
          content: h.text
        })),
        { role: 'user', content: incomingText }
      ];

      const startTime = Date.now();

      // Turn 1
      let response = await groq.chat.completions.create({
        model: MANDATORY_GROQ_MODEL,
        messages,
        tools: ORDERDESK_TOOLS,
        tool_choice: 'auto',
        temperature: 0.2,
        max_tokens: 600
      });

      let choice = response.choices[0];
      let assistantMsg = choice.message;
      let finalHandoff = false;

      // Tool calling loop (up to 3 turns)
      let turns = 0;
      while (assistantMsg.tool_calls && assistantMsg.tool_calls.length > 0 && turns < 3) {
        turns++;
        messages.push(assistantMsg);

        for (const toolCall of assistantMsg.tool_calls) {
          const rawToolName = toolCall.function.name;
          let parsedArgs = {};
          try {
            parsedArgs = JSON.parse(toolCall.function.arguments || '{}');
          } catch {
            parsedArgs = {};
          }

          const { result, isHandoff } = await executeAiTool(
            tenantId,
            customer,
            conversation,
            rawToolName,
            parsedArgs
          );

          if (isHandoff) finalHandoff = true;

          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: JSON.stringify(result)
          });
        }

        // Subsequent call with tools still available to avoid Groq 400 "tool_choice is none but model called tool"
        try {
          const followUp = await groq.chat.completions.create({
            model: MANDATORY_GROQ_MODEL,
            messages,
            tools: ORDERDESK_TOOLS,
            tool_choice: 'auto',
            temperature: 0.2,
            max_tokens: 600
          });

          choice = followUp.choices[0];
          assistantMsg = choice.message;
        } catch (followUpErr) {
          console.warn('[Groq Followup Turn Warning]:', followUpErr);
          // If followUp failed, attempt text-only completion without tool parameters
          const textOnlyCompletion = await groq.chat.completions.create({
            model: MANDATORY_GROQ_MODEL,
            messages: [
              ...messages,
              { role: 'user', content: 'Please summarize the result in a friendly WhatsApp message now.' }
            ],
            temperature: 0.2,
            max_tokens: 400
          });
          assistantMsg = textOnlyCompletion.choices[0].message;
          break;
        }
      }

      const reply = assistantMsg.content || 'Ji, main aapki kya madad kar sakta hoon?';

      db.agentRuns.push({
        id: generateId('run'),
        tenantId,
        conversationId: conversation.id,
        model: MANDATORY_GROQ_MODEL,
        latencyMs: Date.now() - startTime,
        status: turns > 0 ? 'TOOL_CALLED' : 'SUCCESS',
        createdAt: new Date().toISOString()
      });

      return { responseText: reply, isHandoff: finalHandoff };
    } catch (err: any) {
      console.error('[Groq API Error]:', err?.message || err);
      // Fall through to deterministic fallback below
    }
  }

  // Graceful deterministic fallback (handles missing keys, network dips, or edge cases)
  return handleDeterministicFallback(tenantId, customer, conversation, incomingText, bp);
}

// Fallback logic that guarantees 100% functional WhatsApp AI experience
function handleDeterministicFallback(
  tenantId: string,
  customer: Customer,
  conversation: Conversation,
  text: string,
  bp: any
): { responseText: string; isHandoff: boolean } {
  const lower = text.toLowerCase();
  const deliveryFee = bp?.deliveryFee ?? 150;
  const products = db.getProducts(tenantId, { activeOnly: true });

  // Check if text has an address
  const extractedAddress = extractDeliveryAddress(text);
  if (extractedAddress) {
    db.updateCustomer(tenantId, customer.id, { address: extractedAddress });
    customer.address = extractedAddress;
  }

  // 1. Check for Order Confirmation ("confirm", "yes", "haan", "theek hai", "order kardo")
  const isConfirming =
    lower.includes('confirm') ||
    lower === 'yes' ||
    lower === 'haan' ||
    lower === 'theek hai' ||
    lower.includes('order kardo') ||
    lower.includes('bhej do') ||
    lower === 'ok' ||
    lower === 'done';

  // Find mentioned or recent product
  const recentMsgs = db.getMessages(tenantId, conversation.id);
  const matched = findMatchingProduct(products, text);
  let targetProduct: Product | undefined = matched?.product;

  if (!targetProduct) {
    // Check previous AI messages for product reference
    const lastAiMsg = [...recentMsgs].reverse().find(m => m.sender === 'AI');
    if (lastAiMsg) {
      targetProduct = products.find(p => lastAiMsg.text.toLowerCase().includes(p.name.toLowerCase()));
    }
  }

  // Fallback to first product if user explicitly asks to order
  if (!targetProduct && (isConfirming || lower.includes('order'))) {
    targetProduct = products[0];
  }

  // Case A: Customer is confirming or asking to order, but NO address is recorded yet
  if ((isConfirming || lower.includes('order')) && targetProduct) {
    if (!customer.address || customer.address.trim().length < 6) {
      const price = targetProduct.salePrice ?? targetProduct.price;
      const total = price + deliveryFee;
      return {
        responseText: `Zabardast! 👍\nItem: 1x ${targetProduct.name}\nTotal: Rs. ${total.toLocaleString()} (incl. Rs. ${deliveryFee} delivery - COD).\n\nAapka order finalize karne ke liye, barah-e-karam apna mukammal delivery address (House/Street, Area, City) send karein.`,
        isHandoff: false
      };
    }

    // Customer has confirmed AND address is available -> Create Order
    const orderRes = db.createOrderAtomic(tenantId, {
      customerId: customer.id,
      customerName: customer.name,
      customerPhone: customer.phone,
      items: [{ productId: targetProduct.id, quantity: 1 }],
      deliveryAddress: customer.address,
      paymentMethod: 'COD',
      source: 'whatsapp_ai'
    });

    if (orderRes.success && orderRes.order) {
      return {
        responseText: `Bohat shukriya! 🎉 Aapka order #${orderRes.order.orderNumber} confirm ho gaya hai.\n\nItem: 1x ${targetProduct.name}\nTotal: Rs. ${orderRes.order.total.toLocaleString()} (Cash on Delivery)\nDelivery Address: 📍 ${customer.address}\nEstimated Delivery: ${bp?.estimatedDeliveryTime || '30-45 mins'}.\n\nAapko dispatch hote hi message mil jaye ga!`,
        isHandoff: false
      };
    }
  }

  // Case B: Customer just provided their address
  if (extractedAddress && targetProduct) {
    const price = targetProduct.salePrice ?? targetProduct.price;
    const total = price + deliveryFee;
    return {
      responseText: `Shukriya! Delivery Address note ho gaya hai: 📍 ${extractedAddress}\n\nItem: 1x ${targetProduct.name}\nTotal: Rs. ${total.toLocaleString()} (Cash on Delivery).\n\nKya main order confirm kar doon? ("Yes" ya "Confirm" likh kar bhejein)`,
      isHandoff: false
    };
  }

  // Case C: Matched product inquiry
  if (matched) {
    const p = matched.product;
    const qty = matched.quantity;
    const unitPrice = p.salePrice ?? p.price;
    const subtotal = unitPrice * qty;
    const total = subtotal + deliveryFee;

    if (p.stockQuantity < qty) {
      return {
        responseText: `Maazrat! "${p.name}" ka stock filhaal sirf ${p.stockQuantity} pieces available hai. Kya aap ${p.stockQuantity} lena chahenge?`,
        isHandoff: false
      };
    }

    return {
      responseText: `Bilkul 👍\n\n${qty}x ${p.name} available hai.\nPrice: Rs. ${subtotal.toLocaleString()}\nDelivery Fee: Rs. ${deliveryFee}\nTotal: Rs. ${total.toLocaleString()} (Cash on Delivery).\n\nOrder confirm karne ke liye apna delivery address share karein.`,
      isHandoff: false
    };
  }

  // Case D: Greetings or Catalog request
  if (
    lower.includes('salam') ||
    lower.includes('hello') ||
    lower.includes('hi') ||
    lower.includes('menu') ||
    lower.includes('products') ||
    lower.includes('catalog') ||
    lower.includes('kya hai')
  ) {
    const list = products.slice(0, 5).map(p => `• ${p.name} - Rs. ${(p.salePrice ?? p.price).toLocaleString()}`).join('\n');
    return {
      responseText: `Walaikum Assalam! Welcome to ${bp?.businessName || 'OrderDesk'}.\n\nHamari popular items:\n${list || 'Catalog loading...'}\n\nAapko konsi item deliver karwaen?`,
      isHandoff: false
    };
  }

  // Case E: Default friendly assistant reply
  return {
    responseText: `Aapka message mil gaya hai. Hamare paas ${products.slice(0, 3).map(p => p.name).join(', ')} available hain. Aap konsi item aur kis address par mangwana chahte hain?`,
    isHandoff: false
  };
}
