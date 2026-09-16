-- ==============================================================================
-- WHATSAPP ORDERDESK — COMPLETE SUPABASE SCHEMA + SEED (600+ lines)
-- Paste this WHOLE file into the Supabase SQL Editor and run once.
-- Safe to re-run.
--
-- Line count note:
--   The previous 300-line file was a crash-fix only. This restores the full
--   original coverage (all tables, atomic order function, RLS, seed) but uses
--   business_id / businesses so it will NOT fail with:
--   ERROR 42703: column "tenant_id" does not exist
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- -----------------------------------------------------------------------------
-- Helper: add a column only when the table exists and the column does not
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION orderdesk_add_column(p_table TEXT, p_column TEXT, p_type TEXT)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  IF to_regclass('public.' || p_table) IS NULL THEN
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = p_table AND column_name = p_column
  ) THEN
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN %I %s', p_table, p_column, p_type);
  END IF;
END;
$$;

-- ==============================================================================
-- 1. BUSINESSES (live app tenancy — replaces tenants / tenant_id)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS businesses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT,
  business_type TEXT DEFAULT 'E-Commerce',
  currency TEXT NOT NULL DEFAULT 'PKR',
  timezone TEXT NOT NULL DEFAULT 'Asia/Karachi',
  phone TEXT,
  whatsapp_number TEXT,
  email TEXT,
  address TEXT,
  city TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS business_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  user_id UUID,
  role TEXT NOT NULL DEFAULT 'OWNER',
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==============================================================================
-- 2. BUSINESS PROFILE, HOURS, DELIVERY AREAS, PAYMENT METHODS
-- ==============================================================================
CREATE TABLE IF NOT EXISTS business_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL UNIQUE REFERENCES businesses(id) ON DELETE CASCADE,
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
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  day_of_week INT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  is_open BOOLEAN NOT NULL DEFAULT TRUE,
  open_time TIME NOT NULL DEFAULT '09:00',
  close_time TIME NOT NULL DEFAULT '23:00',
  UNIQUE(business_id, day_of_week)
);

CREATE TABLE IF NOT EXISTS business_delivery_areas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  area_name TEXT NOT NULL,
  delivery_fee NUMERIC(12, 2) NOT NULL DEFAULT 0,
  min_order_amount NUMERIC(12, 2) DEFAULT 0,
  estimated_time_minutes INT DEFAULT 30
);

CREATE TABLE IF NOT EXISTS business_payment_methods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  instructions TEXT,
  account_details TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE
);

-- ==============================================================================
-- 3. META WHATSAPP CLOUD API
-- ==============================================================================
CREATE TABLE IF NOT EXISTS whatsapp_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL UNIQUE REFERENCES businesses(id) ON DELETE CASCADE,
  waba_id TEXT,
  phone_number_id TEXT,
  display_phone_number TEXT,
  verified_name TEXT,
  agent_name TEXT,
  access_token TEXT,
  quality_rating TEXT DEFAULT 'GREEN',
  messaging_limit_tier TEXT DEFAULT 'TIER_1K',
  agent_enabled BOOLEAN DEFAULT TRUE,
  groq_model TEXT DEFAULT 'openai/gpt-oss-20b',
  agent_language TEXT DEFAULT 'auto',
  agent_greeting TEXT,
  agent_instructions TEXT,
  auto_confirm_orders BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID REFERENCES businesses(id) ON DELETE SET NULL,
  external_event_id TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  processing_status TEXT NOT NULL DEFAULT 'PROCESSED',
  processed_at TIMESTAMPTZ DEFAULT NOW(),
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==============================================================================
-- 4. PRODUCTS & INVENTORY
-- ==============================================================================
CREATE TABLE IF NOT EXISTS product_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  category_id UUID,
  name TEXT NOT NULL,
  sku TEXT,
  description TEXT DEFAULT '',
  price NUMERIC(12, 2) NOT NULL DEFAULT 0,
  sale_price NUMERIC(12, 2),
  image_url TEXT,
  stock INT DEFAULT 0,
  stock_quantity INT,
  reserved_quantity INT NOT NULL DEFAULT 0,
  low_stock_threshold INT NOT NULL DEFAULT 5,
  is_active BOOLEAN DEFAULT TRUE,
  category TEXT,
  sizes JSONB,
  variants JSONB DEFAULT '[]'::JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS inventory_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  change_quantity INT NOT NULL,
  previous_quantity INT NOT NULL,
  new_quantity INT NOT NULL,
  type TEXT NOT NULL,
  reference_id TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==============================================================================
-- 5. CUSTOMERS & CRM
-- ==============================================================================
CREATE TABLE IF NOT EXISTS customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  phone TEXT NOT NULL,
  name TEXT NOT NULL,
  email TEXT,
  address TEXT,
  city TEXT,
  tags TEXT[] DEFAULT '{}',
  notes TEXT,
  first_contact TIMESTAMPTZ DEFAULT NOW(),
  last_contact TIMESTAMPTZ DEFAULT NOW(),
  total_orders INT NOT NULL DEFAULT 0,
  total_spent NUMERIC(12, 2) NOT NULL DEFAULT 0,
  order_count INT,
  total_spend NUMERIC(12, 2),
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS customer_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  author_name TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==============================================================================
-- 6. WHATSAPP CONVERSATIONS & MESSAGES (names the live app actually queries)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS whatsapp_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  customer_id UUID,
  customer_phone TEXT NOT NULL,
  customer_name TEXT,
  phone_number_id TEXT,
  status TEXT DEFAULT 'AI_ACTIVE',
  agent_paused BOOLEAN DEFAULT FALSE,
  last_message_text TEXT DEFAULT '',
  last_message_at TIMESTAMPTZ DEFAULT NOW(),
  unread_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS order_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  conversation_id UUID,
  customer_phone TEXT,
  awaiting TEXT,
  state JSONB DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_order_drafts_business ON order_drafts(business_id);
COMMENT ON TABLE order_drafts IS 'Per-customer WhatsApp order conversation state (JSON in state: cart, awaiting, confirmation flags).';

CREATE TABLE IF NOT EXISTS whatsapp_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES whatsapp_conversations(id) ON DELETE CASCADE,
  direction TEXT NOT NULL DEFAULT 'inbound',
  sender TEXT,
  message_type TEXT NOT NULL DEFAULT 'text',
  content TEXT,
  text TEXT,
  whatsapp_message_id TEXT,
  status TEXT DEFAULT 'SENT',
  meta JSONB DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==============================================================================
-- 7. ORDERS
-- ==============================================================================
CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  customer_name TEXT,
  customer_phone TEXT,
  order_number TEXT,
  status TEXT,
  order_status TEXT DEFAULT 'confirmed',
  subtotal NUMERIC(12, 2) DEFAULT 0,
  delivery_fee NUMERIC(12, 2) DEFAULT 0,
  discount NUMERIC(12, 2) DEFAULT 0,
  tax NUMERIC(12, 2) DEFAULT 0,
  total NUMERIC(12, 2) DEFAULT 0,
  payment_method TEXT DEFAULT 'cod',
  payment_status TEXT DEFAULT 'pending',
  delivery_address TEXT,
  notes TEXT,
  customer_note TEXT,
  source TEXT DEFAULT 'whatsapp',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  product_id UUID,
  product_name TEXT,
  sku TEXT,
  unit_price NUMERIC(12, 2) DEFAULT 0,
  quantity INT NOT NULL DEFAULT 1,
  subtotal NUMERIC(12, 2) DEFAULT 0,
  variant TEXT,
  variant_details TEXT
);

CREATE TABLE IF NOT EXISTS order_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  previous_status TEXT,
  new_status TEXT NOT NULL,
  changed_by TEXT NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==============================================================================
-- 8. AI AGENT (Groq openai/gpt-oss-20b)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS agent_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL UNIQUE REFERENCES businesses(id) ON DELETE CASCADE,
  is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  model TEXT NOT NULL DEFAULT 'openai/gpt-oss-20b',
  primary_language TEXT NOT NULL DEFAULT 'auto',
  tone TEXT NOT NULL DEFAULT 'friendly',
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
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS agent_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  conversation_id UUID,
  model TEXT NOT NULL DEFAULT 'openai/gpt-oss-20b',
  prompt_tokens INT,
  completion_tokens INT,
  total_tokens INT,
  latency_ms INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'SUCCESS',
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==============================================================================
-- 9. BILLING, NOTIFICATIONS, AUDIT
-- ==============================================================================
CREATE TABLE IF NOT EXISTS business_subscriptions (
  business_id UUID PRIMARY KEY REFERENCES businesses(id) ON DELETE CASCADE,
  plan_id TEXT NOT NULL DEFAULT 'pro',
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  orders_this_month INT NOT NULL DEFAULT 0,
  current_period_start TIMESTAMPTZ DEFAULT NOW(),
  current_period_end TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '30 days')
);

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  reference_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  user_id UUID,
  user_name TEXT NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==============================================================================
-- 10. PATCH EXISTING TABLES (in case they were created with a different shape)
-- ==============================================================================
SELECT orderdesk_add_column('businesses', 'slug', 'TEXT');
SELECT orderdesk_add_column('businesses', 'business_type', 'TEXT');
SELECT orderdesk_add_column('businesses', 'currency', 'TEXT DEFAULT ''PKR''');
SELECT orderdesk_add_column('businesses', 'timezone', 'TEXT DEFAULT ''Asia/Karachi''');
SELECT orderdesk_add_column('businesses', 'phone', 'TEXT');
SELECT orderdesk_add_column('businesses', 'whatsapp_number', 'TEXT');
SELECT orderdesk_add_column('businesses', 'email', 'TEXT');
SELECT orderdesk_add_column('businesses', 'address', 'TEXT');
SELECT orderdesk_add_column('businesses', 'city', 'TEXT');
SELECT orderdesk_add_column('businesses', 'created_at', 'TIMESTAMPTZ DEFAULT NOW()');
SELECT orderdesk_add_column('businesses', 'updated_at', 'TIMESTAMPTZ DEFAULT NOW()');

SELECT orderdesk_add_column('whatsapp_configs', 'business_id', 'UUID');
SELECT orderdesk_add_column('whatsapp_configs', 'waba_id', 'TEXT');
SELECT orderdesk_add_column('whatsapp_configs', 'phone_number_id', 'TEXT');
SELECT orderdesk_add_column('whatsapp_configs', 'display_phone_number', 'TEXT');
SELECT orderdesk_add_column('whatsapp_configs', 'verified_name', 'TEXT');
SELECT orderdesk_add_column('whatsapp_configs', 'agent_name', 'TEXT');
SELECT orderdesk_add_column('whatsapp_configs', 'access_token', 'TEXT');
SELECT orderdesk_add_column('whatsapp_configs', 'quality_rating', 'TEXT DEFAULT ''GREEN''');
SELECT orderdesk_add_column('whatsapp_configs', 'messaging_limit_tier', 'TEXT DEFAULT ''TIER_1K''');
SELECT orderdesk_add_column('whatsapp_configs', 'agent_enabled', 'BOOLEAN DEFAULT TRUE');
SELECT orderdesk_add_column('whatsapp_configs', 'groq_model', 'TEXT DEFAULT ''openai/gpt-oss-20b''');
SELECT orderdesk_add_column('whatsapp_configs', 'agent_language', 'TEXT DEFAULT ''auto''');
SELECT orderdesk_add_column('whatsapp_configs', 'agent_greeting', 'TEXT');
SELECT orderdesk_add_column('whatsapp_configs', 'agent_instructions', 'TEXT');
SELECT orderdesk_add_column('whatsapp_configs', 'auto_confirm_orders', 'BOOLEAN DEFAULT FALSE');
SELECT orderdesk_add_column('whatsapp_configs', 'updated_at', 'TIMESTAMPTZ DEFAULT NOW()');

SELECT orderdesk_add_column('products', 'business_id', 'UUID');
SELECT orderdesk_add_column('products', 'category_id', 'UUID');
SELECT orderdesk_add_column('products', 'sku', 'TEXT');
SELECT orderdesk_add_column('products', 'description', 'TEXT DEFAULT ''''');
SELECT orderdesk_add_column('products', 'price', 'NUMERIC(12,2) DEFAULT 0');
SELECT orderdesk_add_column('products', 'sale_price', 'NUMERIC(12,2)');
SELECT orderdesk_add_column('products', 'image_url', 'TEXT');
SELECT orderdesk_add_column('products', 'image_urls', 'JSONB DEFAULT ''[]''::JSONB');
SELECT orderdesk_add_column('products', 'stock', 'INT DEFAULT 0');
SELECT orderdesk_add_column('products', 'stock_quantity', 'INT');
SELECT orderdesk_add_column('products', 'reserved_quantity', 'INT DEFAULT 0');
SELECT orderdesk_add_column('products', 'low_stock_threshold', 'INT DEFAULT 5');
SELECT orderdesk_add_column('products', 'is_active', 'BOOLEAN DEFAULT TRUE');
SELECT orderdesk_add_column('products', 'category', 'TEXT');
SELECT orderdesk_add_column('products', 'sizes', 'JSONB');
SELECT orderdesk_add_column('products', 'variants', 'JSONB DEFAULT ''[]''::JSONB');
SELECT orderdesk_add_column('products', 'created_at', 'TIMESTAMPTZ DEFAULT NOW()');
SELECT orderdesk_add_column('products', 'updated_at', 'TIMESTAMPTZ DEFAULT NOW()');

DO $$
BEGIN
  UPDATE products
  SET stock = stock_quantity
  WHERE (stock IS NULL OR stock = 0) AND stock_quantity IS NOT NULL AND stock_quantity <> 0;
EXCEPTION WHEN undefined_column THEN
  NULL;
END $$;

SELECT orderdesk_add_column('customers', 'business_id', 'UUID');
SELECT orderdesk_add_column('customers', 'phone', 'TEXT');
SELECT orderdesk_add_column('customers', 'name', 'TEXT');
SELECT orderdesk_add_column('customers', 'email', 'TEXT');
SELECT orderdesk_add_column('customers', 'address', 'TEXT');
SELECT orderdesk_add_column('customers', 'city', 'TEXT');
SELECT orderdesk_add_column('customers', 'notes', 'TEXT');
SELECT orderdesk_add_column('customers', 'total_orders', 'INT DEFAULT 0');
SELECT orderdesk_add_column('customers', 'total_spent', 'NUMERIC(12,2) DEFAULT 0');
SELECT orderdesk_add_column('customers', 'order_count', 'INT DEFAULT 0');
SELECT orderdesk_add_column('customers', 'total_spend', 'NUMERIC(12,2) DEFAULT 0');
SELECT orderdesk_add_column('customers', 'status', 'TEXT DEFAULT ''ACTIVE''');
SELECT orderdesk_add_column('customers', 'created_at', 'TIMESTAMPTZ DEFAULT NOW()');

SELECT orderdesk_add_column('orders', 'business_id', 'UUID');
SELECT orderdesk_add_column('orders', 'order_number', 'TEXT');
SELECT orderdesk_add_column('orders', 'customer_id', 'UUID');
SELECT orderdesk_add_column('orders', 'customer_name', 'TEXT');
SELECT orderdesk_add_column('orders', 'customer_phone', 'TEXT');
SELECT orderdesk_add_column('orders', 'status', 'TEXT');
SELECT orderdesk_add_column('orders', 'order_status', 'TEXT DEFAULT ''confirmed''');
SELECT orderdesk_add_column('orders', 'subtotal', 'NUMERIC(12,2) DEFAULT 0');
SELECT orderdesk_add_column('orders', 'discount', 'NUMERIC(12,2) DEFAULT 0');
SELECT orderdesk_add_column('orders', 'delivery_fee', 'NUMERIC(12,2) DEFAULT 0');
SELECT orderdesk_add_column('orders', 'tax', 'NUMERIC(12,2) DEFAULT 0');
SELECT orderdesk_add_column('orders', 'total', 'NUMERIC(12,2) DEFAULT 0');
SELECT orderdesk_add_column('orders', 'payment_method', 'TEXT DEFAULT ''cod''');
SELECT orderdesk_add_column('orders', 'payment_status', 'TEXT DEFAULT ''pending''');
SELECT orderdesk_add_column('orders', 'delivery_address', 'TEXT');
SELECT orderdesk_add_column('orders', 'notes', 'TEXT');
SELECT orderdesk_add_column('orders', 'customer_note', 'TEXT');
SELECT orderdesk_add_column('orders', 'source', 'TEXT DEFAULT ''whatsapp''');
SELECT orderdesk_add_column('orders', 'created_at', 'TIMESTAMPTZ DEFAULT NOW()');
SELECT orderdesk_add_column('orders', 'updated_at', 'TIMESTAMPTZ DEFAULT NOW()');

SELECT orderdesk_add_column('order_items', 'order_id', 'UUID');
SELECT orderdesk_add_column('order_items', 'business_id', 'UUID');
SELECT orderdesk_add_column('order_items', 'product_id', 'UUID');
SELECT orderdesk_add_column('order_items', 'product_name', 'TEXT');
SELECT orderdesk_add_column('order_items', 'quantity', 'INT DEFAULT 1');
SELECT orderdesk_add_column('order_items', 'unit_price', 'NUMERIC(12,2) DEFAULT 0');
SELECT orderdesk_add_column('order_items', 'sku', 'TEXT');
SELECT orderdesk_add_column('order_items', 'subtotal', 'NUMERIC(12,2) DEFAULT 0');
SELECT orderdesk_add_column('order_items', 'variant', 'TEXT');
SELECT orderdesk_add_column('order_items', 'variant_details', 'TEXT');

SELECT orderdesk_add_column('whatsapp_conversations', 'business_id', 'UUID');
SELECT orderdesk_add_column('whatsapp_conversations', 'customer_id', 'UUID');
SELECT orderdesk_add_column('whatsapp_conversations', 'customer_phone', 'TEXT');
SELECT orderdesk_add_column('whatsapp_conversations', 'customer_name', 'TEXT');
SELECT orderdesk_add_column('whatsapp_conversations', 'phone_number_id', 'TEXT');
SELECT orderdesk_add_column('whatsapp_conversations', 'status', 'TEXT DEFAULT ''AI_ACTIVE''');
SELECT orderdesk_add_column('whatsapp_conversations', 'agent_paused', 'BOOLEAN DEFAULT FALSE');
SELECT orderdesk_add_column('whatsapp_conversations', 'last_message_at', 'TIMESTAMPTZ DEFAULT NOW()');
SELECT orderdesk_add_column('whatsapp_conversations', 'created_at', 'TIMESTAMPTZ DEFAULT NOW()');

SELECT orderdesk_add_column('whatsapp_messages', 'business_id', 'UUID');
SELECT orderdesk_add_column('whatsapp_messages', 'conversation_id', 'UUID');
SELECT orderdesk_add_column('whatsapp_messages', 'direction', 'TEXT DEFAULT ''inbound''');
SELECT orderdesk_add_column('whatsapp_messages', 'message_type', 'TEXT DEFAULT ''text''');
SELECT orderdesk_add_column('whatsapp_messages', 'content', 'TEXT');
SELECT orderdesk_add_column('whatsapp_messages', 'whatsapp_message_id', 'TEXT');
SELECT orderdesk_add_column('whatsapp_messages', 'created_at', 'TIMESTAMPTZ DEFAULT NOW()');

-- Copy leftover tenant_id values into business_id when both columns exist
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'products', 'customers', 'orders', 'order_items', 'whatsapp_configs',
    'whatsapp_conversations', 'whatsapp_messages', 'agent_settings',
    'agent_knowledge', 'notifications'
  ]
  LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = t AND column_name = 'tenant_id'
    ) AND EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = t AND column_name = 'business_id'
    ) THEN
      EXECUTE format(
        'UPDATE public.%I SET business_id = tenant_id WHERE business_id IS NULL AND tenant_id IS NOT NULL',
        t
      );
    END IF;
  END LOOP;
END $$;

CREATE INDEX IF NOT EXISTS idx_products_business ON products(business_id);
CREATE INDEX IF NOT EXISTS idx_customers_business_phone ON customers(business_id, phone);
CREATE INDEX IF NOT EXISTS idx_orders_business ON orders(business_id);
CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_configs_business ON whatsapp_configs(business_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_conv ON whatsapp_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_webhook_events_external_id ON webhook_events(external_event_id);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_prod ON inventory_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_agent_knowledge_business ON agent_knowledge(business_id);
CREATE INDEX IF NOT EXISTS idx_notifications_business ON notifications(business_id);

-- ==============================================================================
-- 11. ATOMIC ORDER + STOCK DEDUCTION (uses business_id + stock)
-- ==============================================================================
CREATE OR REPLACE FUNCTION create_order_atomic(
  p_business_id UUID,
  p_customer_id UUID,
  p_customer_name TEXT,
  p_customer_phone TEXT,
  p_order_number TEXT,
  p_delivery_address TEXT,
  p_payment_method TEXT,
  p_items JSONB,
  p_delivery_fee NUMERIC DEFAULT 0,
  p_discount NUMERIC DEFAULT 0,
  p_source TEXT DEFAULT 'whatsapp'
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
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_prod_id := (v_item->>'product_id')::UUID;
    v_qty := (v_item->>'quantity')::INT;

    SELECT
      p.name,
      COALESCE(p.sku, 'SKU'),
      p.price,
      COALESCE(p.stock, p.stock_quantity, 0)
    INTO v_prod_name, v_sku, v_price, v_current_stock
    FROM products p
    WHERE p.id = v_prod_id AND p.business_id = p_business_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Product % not found in this business catalog', v_prod_id;
    END IF;

    IF v_current_stock < v_qty THEN
      RAISE EXCEPTION 'Insufficient stock for product "%": requested %, available %', v_prod_name, v_qty, v_current_stock;
    END IF;

    v_subtotal := v_subtotal + (v_price * v_qty);
  END LOOP;

  v_total := v_subtotal + p_delivery_fee - p_discount;

  INSERT INTO orders (
    business_id, customer_id, customer_name, customer_phone, order_number,
    status, order_status, subtotal, delivery_fee, discount, total,
    payment_method, payment_status, delivery_address, customer_note, source
  ) VALUES (
    p_business_id, p_customer_id, p_customer_name, p_customer_phone, p_order_number,
    'CONFIRMED', 'confirmed', v_subtotal, p_delivery_fee, p_discount, v_total,
    p_payment_method, 'pending', p_delivery_address, NULL, p_source
  ) RETURNING id INTO v_order_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_prod_id := (v_item->>'product_id')::UUID;
    v_qty := (v_item->>'quantity')::INT;

    SELECT
      p.name,
      COALESCE(p.sku, 'SKU'),
      p.price,
      COALESCE(p.stock, p.stock_quantity, 0)
    INTO v_prod_name, v_sku, v_price, v_current_stock
    FROM products p
    WHERE p.id = v_prod_id AND p.business_id = p_business_id;

    INSERT INTO order_items (
      order_id, business_id, product_id, product_name, sku, unit_price, quantity, subtotal
    ) VALUES (
      v_order_id, p_business_id, v_prod_id, v_prod_name, v_sku, v_price, v_qty, (v_price * v_qty)
    );

    UPDATE products
    SET
      stock = COALESCE(stock, stock_quantity, 0) - v_qty,
      stock_quantity = COALESCE(stock_quantity, stock, 0) - v_qty,
      updated_at = NOW()
    WHERE id = v_prod_id;

    INSERT INTO inventory_movements (
      business_id, product_id, change_quantity, previous_quantity, new_quantity, type, reference_id, notes
    ) VALUES (
      p_business_id, v_prod_id, -v_qty, v_current_stock, (v_current_stock - v_qty),
      'SALE', p_order_number, 'Deducted via WhatsApp Order'
    );
  END LOOP;

  UPDATE customers
  SET
    total_orders = COALESCE(total_orders, order_count, 0) + 1,
    order_count = COALESCE(order_count, total_orders, 0) + 1,
    total_spent = COALESCE(total_spent, total_spend, 0) + v_total,
    total_spend = COALESCE(total_spend, total_spent, 0) + v_total,
    last_contact = NOW()
  WHERE id = p_customer_id;

  INSERT INTO order_status_history (
    order_id, business_id, previous_status, new_status, changed_by, note
  ) VALUES (
    v_order_id, p_business_id, NULL, 'CONFIRMED', p_source, 'Order created and confirmed'
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

-- ==============================================================================
-- 12. ROW LEVEL SECURITY — service_role (backend) can always access
-- ==============================================================================
ALTER TABLE businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_hours ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_delivery_areas ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_payment_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_knowledge ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS service_role_all_businesses ON businesses;
CREATE POLICY service_role_all_businesses ON businesses FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS service_role_all_whatsapp_configs ON whatsapp_configs;
CREATE POLICY service_role_all_whatsapp_configs ON whatsapp_configs FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS service_role_all_products ON products;
CREATE POLICY service_role_all_products ON products FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS service_role_all_customers ON customers;
CREATE POLICY service_role_all_customers ON customers FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS service_role_all_orders ON orders;
CREATE POLICY service_role_all_orders ON orders FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS service_role_all_order_items ON order_items;
CREATE POLICY service_role_all_order_items ON order_items FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS service_role_all_wa_conversations ON whatsapp_conversations;
CREATE POLICY service_role_all_wa_conversations ON whatsapp_conversations FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS service_role_all_wa_messages ON whatsapp_messages;
CREATE POLICY service_role_all_wa_messages ON whatsapp_messages FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS service_role_all_agent_settings ON agent_settings;
CREATE POLICY service_role_all_agent_settings ON agent_settings FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS service_role_all_agent_knowledge ON agent_knowledge;
CREATE POLICY service_role_all_agent_knowledge ON agent_knowledge FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS service_role_all_notifications ON notifications;
CREATE POLICY service_role_all_notifications ON notifications FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS service_role_all_inventory ON inventory_movements;
CREATE POLICY service_role_all_inventory ON inventory_movements FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS service_role_all_webhooks ON webhook_events;
CREATE POLICY service_role_all_webhooks ON webhook_events FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ==============================================================================
-- 13. SEED DATA — Khyber Delight + Urban Chic
-- ==============================================================================
DO $$
DECLARE
  v_biz_1 UUID := '11111111-1111-1111-1111-111111111111';
  v_biz_2 UUID := '22222222-2222-2222-2222-222222222222';
  v_cat_burgers UUID := gen_random_uuid();
  v_cat_bbq UUID := gen_random_uuid();
  v_cat_desi UUID := gen_random_uuid();
  v_cat_women UUID := gen_random_uuid();
  v_cat_men UUID := gen_random_uuid();
BEGIN
  INSERT INTO businesses (id, name, slug, business_type, currency, timezone, phone, whatsapp_number, address, city)
  SELECT v_biz_1, 'Khyber Delight Restaurant', 'khyber-delight', 'Restaurant', 'PKR', 'Asia/Karachi',
         '+92 300 1234567', '+92 300 1234567', 'F-7 Markaz, Main Boulevard', 'Islamabad'
  WHERE NOT EXISTS (SELECT 1 FROM businesses WHERE id = v_biz_1);

  INSERT INTO businesses (id, name, slug, business_type, currency, timezone, phone, whatsapp_number, address, city)
  SELECT v_biz_2, 'Urban Chic Apparel', 'urban-chic', 'Clothing', 'PKR', 'Asia/Karachi',
         '+92 321 9876543', '+92 321 9876543', 'Y-Block, Phase 3, DHA', 'Lahore'
  WHERE NOT EXISTS (SELECT 1 FROM businesses WHERE id = v_biz_2);

  INSERT INTO business_profiles (business_id, business_name, business_type, phone, email, address, city, delivery_fee, free_delivery_threshold, estimated_delivery_time)
  SELECT v_biz_1, 'Khyber Delight Official', 'Restaurant', '+92 300 1234567', 'orders@khyberdelight.com',
         'F-7 Markaz, Main Boulevard', 'Islamabad', 150, 1500, '30-45 mins'
  WHERE NOT EXISTS (SELECT 1 FROM business_profiles WHERE business_id = v_biz_1);

  INSERT INTO business_profiles (business_id, business_name, business_type, phone, email, address, city, delivery_fee, free_delivery_threshold, estimated_delivery_time)
  SELECT v_biz_2, 'Urban Chic Clothing', 'Clothing', '+92 321 9876543', 'support@urbanchic.pk',
         'Y-Block, Phase 3, DHA', 'Lahore', 250, 3000, '2-4 business days'
  WHERE NOT EXISTS (SELECT 1 FROM business_profiles WHERE business_id = v_biz_2);

  INSERT INTO business_hours (business_id, day_of_week, is_open, open_time, close_time)
  SELECT v_biz_1, d, TRUE, '11:00', '23:30'
  FROM generate_series(0, 6) AS d
  WHERE NOT EXISTS (SELECT 1 FROM business_hours WHERE business_id = v_biz_1 AND day_of_week = d);

  INSERT INTO business_payment_methods (business_id, name, code, is_active)
  SELECT v_biz_1, x.name, x.code, TRUE
  FROM (VALUES ('Cash on Delivery', 'COD'), ('JazzCash', 'JAZZCASH'), ('EasyPaisa', 'EASYPAISA'), ('Bank Transfer', 'BANK_TRANSFER')) AS x(name, code)
  WHERE NOT EXISTS (SELECT 1 FROM business_payment_methods WHERE business_id = v_biz_1 AND code = x.code);

  INSERT INTO whatsapp_configs (
    business_id, waba_id, phone_number_id, display_phone_number, verified_name,
    groq_model, agent_enabled, agent_language, agent_greeting
  )
  SELECT v_biz_1, 'waba_khyber_1001', 'phone_id_khyber_1001', '+92 300 1234567', 'Khyber Delight Official',
         'openai/gpt-oss-20b', TRUE, 'roman_urdu',
         'Assalam-o-Alaikum! Welcome to Khyber Delight. Main aapka AI order assistant hoon. Aaj kya deliver karwayenge?'
  WHERE NOT EXISTS (SELECT 1 FROM whatsapp_configs WHERE business_id = v_biz_1);

  INSERT INTO whatsapp_configs (
    business_id, waba_id, phone_number_id, display_phone_number, verified_name,
    groq_model, agent_enabled, agent_language, agent_greeting
  )
  SELECT v_biz_2, 'waba_urban_2002', 'phone_id_urban_2002', '+92 321 9876543', 'Urban Chic Official',
         'openai/gpt-oss-20b', TRUE, 'auto',
         'Welcome to Urban Chic Apparel. How may I assist you with our new arrivals today?'
  WHERE NOT EXISTS (SELECT 1 FROM whatsapp_configs WHERE business_id = v_biz_2);

  INSERT INTO product_categories (id, business_id, name, slug)
  SELECT v_cat_burgers, v_biz_1, 'Burgers & Fast Food', 'burgers'
  WHERE NOT EXISTS (SELECT 1 FROM product_categories WHERE business_id = v_biz_1 AND slug = 'burgers');

  INSERT INTO product_categories (id, business_id, name, slug)
  SELECT v_cat_bbq, v_biz_1, 'BBQ & Grills', 'bbq'
  WHERE NOT EXISTS (SELECT 1 FROM product_categories WHERE business_id = v_biz_1 AND slug = 'bbq');

  INSERT INTO product_categories (id, business_id, name, slug)
  SELECT v_cat_desi, v_biz_1, 'Traditional Desi', 'desi'
  WHERE NOT EXISTS (SELECT 1 FROM product_categories WHERE business_id = v_biz_1 AND slug = 'desi');

  INSERT INTO product_categories (id, business_id, name, slug)
  SELECT v_cat_women, v_biz_2, 'Women Collection', 'women'
  WHERE NOT EXISTS (SELECT 1 FROM product_categories WHERE business_id = v_biz_2 AND slug = 'women');

  INSERT INTO product_categories (id, business_id, name, slug)
  SELECT v_cat_men, v_biz_2, 'Men Collection', 'men'
  WHERE NOT EXISTS (SELECT 1 FROM product_categories WHERE business_id = v_biz_2 AND slug = 'men');

  INSERT INTO products (business_id, name, sku, description, price, stock, stock_quantity, category, low_stock_threshold, is_active)
  SELECT v_biz_1, 'Crispy Zinger Burger', 'BUR-ZING-01', 'Crispy fried chicken fillet with secret spicy mayo & lettuce', 550, 45, 45, 'Burgers', 5, TRUE
  WHERE NOT EXISTS (SELECT 1 FROM products WHERE sku = 'BUR-ZING-01');

  INSERT INTO products (business_id, name, sku, description, price, stock, stock_quantity, category, low_stock_threshold, is_active)
  SELECT v_biz_1, 'Double Beef Cheese Burger', 'BUR-BEEF-02', '200g smashed beef patties with double melted cheddar', 780, 20, 20, 'Burgers', 5, TRUE
  WHERE NOT EXISTS (SELECT 1 FROM products WHERE sku = 'BUR-BEEF-02');

  INSERT INTO products (business_id, name, sku, description, price, stock, stock_quantity, category, low_stock_threshold, is_active)
  SELECT v_biz_1, 'Special Chicken Biryani (Single)', 'DES-BIRY-01', 'Authentic aromatic basmati rice with tender spiced chicken & raita', 420, 35, 35, 'Desi', 10, TRUE
  WHERE NOT EXISTS (SELECT 1 FROM products WHERE sku = 'DES-BIRY-01');

  INSERT INTO products (business_id, name, sku, description, price, stock, stock_quantity, category, low_stock_threshold, is_active)
  SELECT v_biz_1, 'Chicken Tikka Boti Roll', 'BBQ-ROLL-01', 'Charcoal grilled tikka boti in fresh paratha with mint chutney', 380, 50, 50, 'BBQ', 8, TRUE
  WHERE NOT EXISTS (SELECT 1 FROM products WHERE sku = 'BBQ-ROLL-01');

  INSERT INTO products (business_id, name, sku, description, price, stock, stock_quantity, category, low_stock_threshold, is_active)
  SELECT v_biz_1, 'Mutton Shinwari Karahi (Half KG)', 'DES-KAR-01', 'Traditional Peshawari salted mutton karahi cooked in lamb fat', 1650, 15, 15, 'Desi', 3, TRUE
  WHERE NOT EXISTS (SELECT 1 FROM products WHERE sku = 'DES-KAR-01');

  INSERT INTO products (business_id, name, sku, description, price, stock, stock_quantity, category, low_stock_threshold, is_active)
  SELECT v_biz_2, 'Embroidered Lawn 3-Piece Suit', 'LAWN-3PC-EMB', 'Pure lawn digital printed shirt with chiffon dupatta & dyed trouser', 4200, 30, 30, 'Women', 5, TRUE
  WHERE NOT EXISTS (SELECT 1 FROM products WHERE sku = 'LAWN-3PC-EMB');

  INSERT INTO products (business_id, name, sku, description, price, stock, stock_quantity, category, low_stock_threshold, is_active)
  SELECT v_biz_2, 'Ready-to-Wear Floral Kurti', 'KURTI-FLR-01', 'Stitched summer cotton kurti with delicate pearl buttons', 2100, 25, 25, 'Women', 5, TRUE
  WHERE NOT EXISTS (SELECT 1 FROM products WHERE sku = 'KURTI-FLR-01');

  INSERT INTO products (business_id, name, sku, description, price, stock, stock_quantity, category, low_stock_threshold, is_active)
  SELECT v_biz_2, 'Classic Pique Polo Shirt', 'POLO-MEN-NVY', '100% combed pique cotton polo with embroidered crest', 1850, 40, 40, 'Men', 8, TRUE
  WHERE NOT EXISTS (SELECT 1 FROM products WHERE sku = 'POLO-MEN-NVY');

  INSERT INTO products (business_id, name, sku, description, price, stock, stock_quantity, category, low_stock_threshold, is_active)
  SELECT v_biz_2, 'Slim Fit Stretch Denim Jeans', 'JNS-SLIM-BLU', 'Premium stretch denim in washed indigo finish', 3200, 20, 20, 'Men', 4, TRUE
  WHERE NOT EXISTS (SELECT 1 FROM products WHERE sku = 'JNS-SLIM-BLU');

  INSERT INTO agent_settings (business_id, model, primary_language, tone, greeting_message, order_confirmation_required)
  SELECT v_biz_1, 'openai/gpt-oss-20b', 'roman_urdu', 'friendly',
         'Assalam-o-Alaikum! Welcome to Khyber Delight. Main aapka AI order assistant hoon. Aaj kya deliver karwayenge?', TRUE
  WHERE NOT EXISTS (SELECT 1 FROM agent_settings WHERE business_id = v_biz_1);

  INSERT INTO agent_settings (business_id, model, primary_language, tone, greeting_message, order_confirmation_required)
  SELECT v_biz_2, 'openai/gpt-oss-20b', 'auto', 'professional',
         'Welcome to Urban Chic Apparel. How may I assist you with our new arrivals today?', TRUE
  WHERE NOT EXISTS (SELECT 1 FROM agent_settings WHERE business_id = v_biz_2);

  INSERT INTO agent_knowledge (business_id, category, question, answer)
  SELECT v_biz_1, 'DELIVERY', 'Delivery charges kitne hain?',
         'Hamare delivery charges Rs. 150 hain. Rs. 1,500 se barhi orders par delivery FREE hai!'
  WHERE NOT EXISTS (SELECT 1 FROM agent_knowledge WHERE business_id = v_biz_1 AND question = 'Delivery charges kitne hain?');

  INSERT INTO agent_knowledge (business_id, category, question, answer)
  SELECT v_biz_1, 'PAYMENT', 'Payment methods kya hain?',
         'Hum Cash on Delivery (COD), JazzCash, EasyPaisa, aur Online Bank Transfer accept karte hain.'
  WHERE NOT EXISTS (SELECT 1 FROM agent_knowledge WHERE business_id = v_biz_1 AND question = 'Payment methods kya hain?');

  INSERT INTO agent_knowledge (business_id, category, question, answer)
  SELECT v_biz_2, 'POLICY', 'Exchange policy kya hai?',
         'Aap delivery ke 7 dino ke andar unworn items exchange karwa sakte hain with original tags.'
  WHERE NOT EXISTS (SELECT 1 FROM agent_knowledge WHERE business_id = v_biz_2 AND question = 'Exchange policy kya hai?');

  INSERT INTO customers (business_id, phone, name, address, city, total_orders, total_spent, order_count, total_spend)
  SELECT v_biz_1, '+923331234567', 'Ahmed Khan', 'House 14, Street 22, Sector G-11/2', 'Islamabad', 2, 1850, 2, 1850
  WHERE NOT EXISTS (SELECT 1 FROM customers WHERE phone IN ('+923331234567', '923331234567'));

  INSERT INTO customers (business_id, phone, name, address, city, total_orders, total_spent, order_count, total_spend)
  SELECT v_biz_2, '+923459876543', 'Zainab Bibi', 'House 5, Street 9, Model Town', 'Lahore', 1, 4200, 1, 4200
  WHERE NOT EXISTS (SELECT 1 FROM customers WHERE phone IN ('+923459876543', '923459876543'));

  INSERT INTO business_subscriptions (business_id, plan_id, status)
  SELECT v_biz_1, 'pro', 'ACTIVE'
  WHERE NOT EXISTS (SELECT 1 FROM business_subscriptions WHERE business_id = v_biz_1);

  INSERT INTO business_subscriptions (business_id, plan_id, status)
  SELECT v_biz_2, 'starter', 'ACTIVE'
  WHERE NOT EXISTS (SELECT 1 FROM business_subscriptions WHERE business_id = v_biz_2);
END $$;

-- ==============================================================================
-- 14. VERIFICATION
-- ==============================================================================
SELECT
  'WhatsApp OrderDesk complete schema ready (business_id, no tenant_id crash).' AS status,
  (SELECT COUNT(*) FROM businesses) AS businesses_count,
  (SELECT COUNT(*) FROM products) AS products_count,
  (SELECT COUNT(*) FROM whatsapp_configs) AS whatsapp_configs_count,
  (SELECT COUNT(*) FROM agent_knowledge) AS knowledge_count,
  (SELECT COUNT(*) FROM customers) AS customers_count;
