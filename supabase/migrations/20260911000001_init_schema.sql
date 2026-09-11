-- WhatsApp OrderDesk: Multi-Tenant SaaS Initial Schema & RLS
-- PostgreSQL Migration
-- Version: 20260911000001

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Profiles & Tenants
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  business_type TEXT NOT NULL DEFAULT 'Other',
  currency TEXT NOT NULL DEFAULT 'PKR',
  timezone TEXT NOT NULL DEFAULT 'Asia/Karachi',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tenant_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('OWNER', 'ADMIN', 'MANAGER', 'STAFF')),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INVITED', 'SUSPENDED')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_tenant_members_user ON tenant_members(user_id);
CREATE INDEX IF NOT EXISTS idx_tenant_members_tenant ON tenant_members(tenant_id);

-- 2. Business Configuration
CREATE TABLE IF NOT EXISTS business_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL UNIQUE REFERENCES tenants(id) ON DELETE CASCADE,
  business_name TEXT NOT NULL,
  business_type TEXT NOT NULL DEFAULT 'Restaurant',
  phone TEXT,
  email TEXT,
  address TEXT,
  city TEXT,
  description TEXT,
  delivery_fee NUMERIC(12, 2) DEFAULT 0,
  free_delivery_threshold NUMERIC(12, 2),
  estimated_delivery_time TEXT DEFAULT '30-45 mins',
  currency TEXT NOT NULL DEFAULT 'PKR',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS business_hours (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  day_of_week INT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  is_open BOOLEAN NOT NULL DEFAULT TRUE,
  open_time TIME NOT NULL DEFAULT '09:00',
  close_time TIME NOT NULL DEFAULT '23:00',
  UNIQUE(tenant_id, day_of_week)
);

CREATE TABLE IF NOT EXISTS business_delivery_areas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  area_name TEXT NOT NULL,
  delivery_fee NUMERIC(12, 2) NOT NULL DEFAULT 0,
  min_order_amount NUMERIC(12, 2) DEFAULT 0,
  estimated_time_minutes INT DEFAULT 30
);

CREATE TABLE IF NOT EXISTS business_payment_methods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  code TEXT NOT NULL CHECK (code IN ('COD', 'BANK_TRANSFER', 'EASYPAISA', 'JAZZCASH', 'CARD')),
  instructions TEXT,
  account_details TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE
);

-- 3. WhatsApp Integration
CREATE TABLE IF NOT EXISTS whatsapp_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL UNIQUE REFERENCES tenants(id) ON DELETE CASCADE,
  waba_id TEXT NOT NULL,
  business_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'CONNECTED' CHECK (status IN ('CONNECTED', 'DISCONNECTED', 'ATTENTION_REQUIRED')),
  access_token_encrypted TEXT,
  token_expires_at TIMESTAMPTZ,
  last_verified_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS whatsapp_phone_numbers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  whatsapp_account_id UUID NOT NULL REFERENCES whatsapp_accounts(id) ON DELETE CASCADE,
  phone_number_id TEXT NOT NULL UNIQUE,
  display_phone_number TEXT NOT NULL,
  verified_name TEXT NOT NULL,
  quality_rating TEXT DEFAULT 'GREEN',
  messaging_limit_tier TEXT DEFAULT 'TIER_1K',
  status TEXT NOT NULL DEFAULT 'CONNECTED',
  is_primary BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_phone_number_id ON whatsapp_phone_numbers(phone_number_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_phone_numbers_tenant ON whatsapp_phone_numbers(tenant_id);

CREATE TABLE IF NOT EXISTS webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL,
  external_event_id TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  processing_status TEXT NOT NULL DEFAULT 'PROCESSED' CHECK (processing_status IN ('PROCESSED', 'FAILED', 'IGNORED')),
  processed_at TIMESTAMPTZ DEFAULT NOW(),
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhook_events_external_id ON webhook_events(external_event_id);

-- 4. Products & Inventory
CREATE TABLE IF NOT EXISTS product_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  category_id UUID REFERENCES product_categories(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  sku TEXT NOT NULL,
  description TEXT DEFAULT '',
  price NUMERIC(12, 2) NOT NULL CHECK (price >= 0),
  sale_price NUMERIC(12, 2) CHECK (sale_price IS NULL OR sale_price >= 0),
  image_url TEXT,
  stock_quantity INT NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
  reserved_quantity INT NOT NULL DEFAULT 0 CHECK (reserved_quantity >= 0),
  low_stock_threshold INT NOT NULL DEFAULT 5,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  variants JSONB DEFAULT '[]'::JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, sku)
);

CREATE INDEX IF NOT EXISTS idx_products_tenant ON products(tenant_id);
CREATE INDEX IF NOT EXISTS idx_products_sku ON products(tenant_id, sku);

CREATE TABLE IF NOT EXISTS inventory_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  change_quantity INT NOT NULL,
  previous_quantity INT NOT NULL,
  new_quantity INT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('SALE', 'RESTOCK', 'ADJUSTMENT', 'RESERVATION', 'CANCELLATION_RESTORE')),
  reference_id TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inventory_movements_prod ON inventory_movements(product_id);

-- 5. Customers & CRM
CREATE TABLE IF NOT EXISTS customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  phone TEXT NOT NULL,
  name TEXT NOT NULL,
  email TEXT,
  address TEXT,
  city TEXT,
  tags TEXT[] DEFAULT '{}',
  notes TEXT,
  first_contact TIMESTAMPTZ DEFAULT NOW(),
  last_contact TIMESTAMPTZ DEFAULT NOW(),
  order_count INT NOT NULL DEFAULT 0,
  total_spend NUMERIC(12, 2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'BLOCKED', 'VIP')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, phone)
);

CREATE INDEX IF NOT EXISTS idx_customers_tenant_phone ON customers(tenant_id, phone);

CREATE TABLE IF NOT EXISTS customer_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  author_name TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. WhatsApp Conversations & Messages
CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  customer_phone TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  phone_number_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'AI_ACTIVE' CHECK (status IN ('AI_ACTIVE', 'HUMAN_ACTIVE', 'WAITING', 'CLOSED')),
  assigned_user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  last_message_text TEXT DEFAULT '',
  last_message_at TIMESTAMPTZ DEFAULT NOW(),
  unread_count INT NOT NULL DEFAULT 0,
  customer_service_window_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conversations_tenant_status ON conversations(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_conversations_customer ON conversations(customer_id);

CREATE TABLE IF NOT EXISTS conversation_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  sender TEXT NOT NULL CHECK (sender IN ('CUSTOMER', 'AI', 'STAFF', 'SYSTEM')),
  text TEXT NOT NULL,
  whatsapp_message_id TEXT,
  status TEXT DEFAULT 'SENT' CHECK (status IN ('SENT', 'DELIVERED', 'READ', 'FAILED')),
  meta JSONB DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conv_messages_conv ON conversation_messages(conversation_id);

-- 7. Orders & Order Items
CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  order_number TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING_CONFIRMATION' CHECK (
    status IN ('DRAFT', 'PENDING_CONFIRMATION', 'CONFIRMED', 'PREPARING', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'REFUNDED')
  ),
  subtotal NUMERIC(12, 2) NOT NULL DEFAULT 0,
  delivery_fee NUMERIC(12, 2) NOT NULL DEFAULT 0,
  discount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  total NUMERIC(12, 2) NOT NULL DEFAULT 0,
  payment_method TEXT NOT NULL DEFAULT 'COD',
  payment_status TEXT NOT NULL DEFAULT 'PENDING' CHECK (payment_status IN ('PENDING', 'PAID', 'FAILED', 'REFUNDED')),
  delivery_address TEXT NOT NULL,
  notes TEXT,
  source TEXT NOT NULL DEFAULT 'whatsapp_ai' CHECK (source IN ('whatsapp_ai', 'whatsapp_human', 'dashboard', 'manual')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, order_number)
);

CREATE INDEX IF NOT EXISTS idx_orders_tenant_status ON orders(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id);

CREATE TABLE IF NOT EXISTS order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  product_name TEXT NOT NULL,
  sku TEXT NOT NULL,
  unit_price NUMERIC(12, 2) NOT NULL,
  quantity INT NOT NULL CHECK (quantity > 0),
  subtotal NUMERIC(12, 2) NOT NULL,
  variant_details TEXT
);

CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);

CREATE TABLE IF NOT EXISTS order_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  previous_status TEXT,
  new_status TEXT NOT NULL,
  changed_by TEXT NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. AI Agent Configuration & Logs
CREATE TABLE IF NOT EXISTS agent_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL UNIQUE REFERENCES tenants(id) ON DELETE CASCADE,
  is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  model TEXT NOT NULL DEFAULT 'openai/gpt-oss-20b',
  primary_language TEXT NOT NULL DEFAULT 'auto' CHECK (primary_language IN ('auto', 'urdu', 'roman_urdu', 'english')),
  tone TEXT NOT NULL DEFAULT 'friendly' CHECK (tone IN ('friendly', 'professional', 'concise')),
  greeting_message TEXT NOT NULL DEFAULT 'Assalam-o-Alaikum! Welcome to our store. How can I help you today?',
  custom_instructions TEXT DEFAULT '',
  order_confirmation_required BOOLEAN NOT NULL DEFAULT TRUE,
  handoff_keywords TEXT[] DEFAULT ARRAY['human', 'agent', 'staff', 'complaint', 'manager', 'madad'],
  enable_stock_check BOOLEAN NOT NULL DEFAULT TRUE,
  auto_handoff_on_complaint BOOLEAN NOT NULL DEFAULT TRUE,
  working_hours_only BOOLEAN NOT NULL DEFAULT FALSE,
  max_tool_loops INT NOT NULL DEFAULT 5,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS agent_knowledge (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN ('FAQ', 'POLICY', 'DELIVERY', 'PAYMENT', 'CUSTOM')),
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS agent_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  model TEXT NOT NULL DEFAULT 'openai/gpt-oss-20b',
  prompt_tokens INT,
  completion_tokens INT,
  total_tokens INT,
  latency_ms INT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('SUCCESS', 'TOOL_CALLED', 'FAILED')),
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. Subscriptions & Notifications
CREATE TABLE IF NOT EXISTS tenant_subscriptions (
  tenant_id UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  plan_id TEXT NOT NULL DEFAULT 'pro' CHECK (plan_id IN ('starter', 'pro', 'business')),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'TRIALING', 'PAST_DUE', 'CANCELLED')),
  orders_this_month INT NOT NULL DEFAULT 0,
  current_period_start TIMESTAMPTZ DEFAULT NOW(),
  current_period_end TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '30 days')
);

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('NEW_ORDER', 'HUMAN_HANDOFF', 'LOW_STOCK', 'WHATSAPP_DISCONNECTED', 'AI_ERROR')),
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  reference_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  user_name TEXT NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 10. Atomic Order Creation Stored Procedure
CREATE OR REPLACE FUNCTION create_order_atomic(
  p_tenant_id UUID,
  p_customer_id UUID,
  p_customer_name TEXT,
  p_customer_phone TEXT,
  p_order_number TEXT,
  p_delivery_address TEXT,
  p_payment_method TEXT,
  p_items JSONB, -- Array of {product_id, quantity, unit_price}
  p_delivery_fee NUMERIC,
  p_discount NUMERIC,
  p_source TEXT
) RETURNS JSONB AS $$
DECLARE
  v_order_id UUID;
  v_item JSONB;
  v_prod_id UUID;
  v_qty INT;
  v_price NUMERIC;
  v_subtotal NUMERIC := 0;
  v_total NUMERIC;
  v_current_stock INT;
  v_prod_name TEXT;
  v_sku TEXT;
BEGIN
  -- 1. Check stock & validate each product
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_prod_id := (v_item->>'product_id')::UUID;
    v_qty := (v_item->>'quantity')::INT;

    SELECT name, sku, price, stock_quantity INTO v_prod_name, v_sku, v_price, v_current_stock
    FROM products
    WHERE id = v_prod_id AND tenant_id = p_tenant_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Product % not found in tenant catalog', v_prod_id;
    END IF;

    IF v_current_stock < v_qty THEN
      RAISE EXCEPTION 'Insufficient stock for product "%": requested %, available %', v_prod_name, v_qty, v_current_stock;
    END IF;

    v_subtotal := v_subtotal + (v_price * v_qty);
  END LOOP;

  v_total := v_subtotal + p_delivery_fee - p_discount;

  -- 2. Create Order
  INSERT INTO orders (
    tenant_id, customer_id, customer_name, customer_phone, order_number,
    status, subtotal, delivery_fee, discount, total,
    payment_method, payment_status, delivery_address, source
  ) VALUES (
    p_tenant_id, p_customer_id, p_customer_name, p_customer_phone, p_order_number,
    'CONFIRMED', v_subtotal, p_delivery_fee, p_discount, v_total,
    p_payment_method, 'PENDING', p_delivery_address, p_source
  ) RETURNING id INTO v_order_id;

  -- 3. Insert Items and Deduct Inventory
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_prod_id := (v_item->>'product_id')::UUID;
    v_qty := (v_item->>'quantity')::INT;

    SELECT name, sku, price, stock_quantity INTO v_prod_name, v_sku, v_price, v_current_stock
    FROM products
    WHERE id = v_prod_id AND tenant_id = p_tenant_id;

    INSERT INTO order_items (
      order_id, tenant_id, product_id, product_name, sku, unit_price, quantity, subtotal
    ) VALUES (
      v_order_id, p_tenant_id, v_prod_id, v_prod_name, v_sku, v_price, v_qty, (v_price * v_qty)
    );

    UPDATE products
    SET stock_quantity = stock_quantity - v_qty,
        updated_at = NOW()
    WHERE id = v_prod_id;

    INSERT INTO inventory_movements (
      tenant_id, product_id, change_quantity, previous_quantity, new_quantity, type, reference_id, notes
    ) VALUES (
      p_tenant_id, v_prod_id, -v_qty, v_current_stock, (v_current_stock - v_qty), 'SALE', p_order_number, 'Deducted via WhatsApp Order'
    );
  END LOOP;

  -- 4. Update Customer stats
  UPDATE customers
  SET order_count = order_count + 1,
      total_spend = total_spend + v_total,
      last_contact = NOW()
  WHERE id = p_customer_id;

  -- 5. Record Order History
  INSERT INTO order_status_history (
    order_id, tenant_id, previous_status, new_status, changed_by, note
  ) VALUES (
    v_order_id, p_tenant_id, NULL, 'CONFIRMED', p_source, 'Order created and confirmed'
  );

  RETURN jsonb_build_object(
    'order_id', v_order_id,
    'order_number', p_order_number,
    'subtotal', v_subtotal,
    'total', v_total,
    'status', 'CONFIRMED'
  );
END;
$$ LANGUAGE plpgsql;

-- 11. Row Level Security (RLS) Policies
-- Helper function to check tenant membership
CREATE OR REPLACE FUNCTION auth_user_has_tenant(p_tenant_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM tenant_members
    WHERE tenant_id = p_tenant_id
      AND user_id = auth.uid()
      AND status = 'ACTIVE'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Enable RLS on every tenant table
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_hours ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_delivery_areas ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_payment_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_phone_numbers ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_knowledge ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Tenants: Users can view tenants they are members of
CREATE POLICY tenant_member_read_tenants ON tenants
  FOR SELECT USING (
    id IN (SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid())
  );

-- Tenant Members: View members of their own tenants
CREATE POLICY member_read_tenant_members ON tenant_members
  FOR SELECT USING (
    tenant_id IN (SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid())
  );

-- Standard Tenant Isolation Policy Macro for all other tables
CREATE POLICY tenant_isolation_products ON products
  FOR ALL USING (auth_user_has_tenant(tenant_id));

CREATE POLICY tenant_isolation_categories ON product_categories
  FOR ALL USING (auth_user_has_tenant(tenant_id));

CREATE POLICY tenant_isolation_inventory ON inventory_movements
  FOR ALL USING (auth_user_has_tenant(tenant_id));

CREATE POLICY tenant_isolation_customers ON customers
  FOR ALL USING (auth_user_has_tenant(tenant_id));

CREATE POLICY tenant_isolation_customer_notes ON customer_notes
  FOR ALL USING (auth_user_has_tenant(tenant_id));

CREATE POLICY tenant_isolation_conversations ON conversations
  FOR ALL USING (auth_user_has_tenant(tenant_id));

CREATE POLICY tenant_isolation_messages ON conversation_messages
  FOR ALL USING (auth_user_has_tenant(tenant_id));

CREATE POLICY tenant_isolation_orders ON orders
  FOR ALL USING (auth_user_has_tenant(tenant_id));

CREATE POLICY tenant_isolation_order_items ON order_items
  FOR ALL USING (auth_user_has_tenant(tenant_id));

CREATE POLICY tenant_isolation_order_history ON order_status_history
  FOR ALL USING (auth_user_has_tenant(tenant_id));

CREATE POLICY tenant_isolation_whatsapp_acc ON whatsapp_accounts
  FOR ALL USING (auth_user_has_tenant(tenant_id));

CREATE POLICY tenant_isolation_whatsapp_nums ON whatsapp_phone_numbers
  FOR ALL USING (auth_user_has_tenant(tenant_id));

CREATE POLICY tenant_isolation_agent_settings ON agent_settings
  FOR ALL USING (auth_user_has_tenant(tenant_id));

CREATE POLICY tenant_isolation_agent_knowledge ON agent_knowledge
  FOR ALL USING (auth_user_has_tenant(tenant_id));

CREATE POLICY tenant_isolation_notifications ON notifications
  FOR ALL USING (auth_user_has_tenant(tenant_id));

CREATE POLICY tenant_isolation_audit_logs ON audit_logs
  FOR ALL USING (auth_user_has_tenant(tenant_id));
