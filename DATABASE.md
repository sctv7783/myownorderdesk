# WhatsApp OrderDesk — Database Architecture & Schema

## Overview
WhatsApp OrderDesk uses a **PostgreSQL** database. The live app stores tenancy as `business_id` on the `businesses` table (not `tenant_id`). Always run `supabase_queries.sql` — it is safe on existing projects and will not error if `tenant_id` is missing.

Strict Row Level Security (RLS) policies and security-definer helper functions guarantee that users and AI operations never access cross-tenant data.

---

## 1. Tables Specification

### Core Identity & Tenancy
1. `profiles`: User account details mapped 1:1 with `auth.users`.
2. `tenants`: The business organization entity (`id`, `name`, `slug`, `currency`, `timezone`).
3. `tenant_members`: Links `profiles` to `tenants` with assigned roles (`OWNER`, `ADMIN`, `MANAGER`, `STAFF`) and `status`.

### Business Configuration
4. `business_profiles`: Name, business type, contact info, delivery fee, free delivery threshold, estimated delivery time.
5. `business_hours`: Operating schedule per day of the week (0-6) with open/close times and `is_open` flag.
6. `business_delivery_areas`: Specific delivery zones with custom fees and ETAs.
7. `business_payment_methods`: Supported payment methods (e.g. Cash On Delivery, Bank Transfer, EasyPaisa, JazzCash).

### WhatsApp Cloud API Integration
8. `whatsapp_accounts`: Meta WhatsApp Business Account (WABA) details, encrypted access token reference, connection status.
9. `whatsapp_phone_numbers`: Connected WhatsApp phone numbers with `phone_number_id`, `display_phone_number`, `verified_name`, and quality rating. **The `phone_number_id` is globally unique and resolves directly to `tenant_id`.**
10. `webhook_events`: Idempotency tracking table storing Meta event IDs to ensure duplicate webhooks are processed exactly once.

### Products & Inventory
11. `product_categories`: Tenant-scoped product classifications.
12. `products`: Items catalog with SKU, name, price, sale price, stock quantity, reserved quantity, low-stock threshold, variants JSON.
13. `inventory_movements`: Complete ledger tracking every stock addition, reservation, order deduction, and restock.

### Customers & CRM
14. `customers`: WhatsApp customers uniquely scoped per tenant (`tenant_id`, `phone`). Tracks total spend, order count, tags, addresses.
15. `customer_notes`: Internal CRM notes left by human staff.

### WhatsApp Conversations
16. `conversations`: Active WhatsApp threads. State tracked as `AI_ACTIVE`, `HUMAN_ACTIVE`, `WAITING`, or `CLOSED`.
17. `conversation_messages`: Individual WhatsApp messages with direction (`CUSTOMER`, `AI`, `STAFF`, `SYSTEM`), timestamps, and WhatsApp message IDs.

### Orders & Checkout
18. `orders`: Orders created via WhatsApp AI, WhatsApp Human, or Dashboard. Contains order number, customer reference, items subtotal, delivery fee, discount, total, payment status, and delivery address.
19. `order_items`: Line items associated with each order, recording unit price at time of purchase.
20. `order_status_history`: Audit trail of order status transitions.

### AI Agent Configuration & Monitoring
21. `agent_settings`: Groq model configuration (`openai/gpt-oss-20b`), primary language, greeting message, tone, custom instructions, and human handoff keywords.
22. `agent_knowledge`: FAQs, policies, and store information queried by the AI agent tools.
23. `agent_runs`: Performance and latency log for every Groq AI invocation.

### System & Billing
24. `tenant_subscriptions`: Current plan (`starter`, `pro`, `business`) and monthly quota tracking.
25. `notifications`: In-app alerts for human handoff requests, new orders, and low-stock alerts.
26. `audit_logs`: Activity log for security, administrative, and inventory modifications.

---

## 2. Atomic Order Transaction Function
The database includes the stored function `create_order_atomic` which:
- Locks relevant product rows with `FOR UPDATE`
- Verifies real-time stock availability
- Deducts stock and records an `inventory_movements` row
- Inserts `orders` and `order_items` records
- Increments customer `order_count` and `total_spend`
- Rolls back the entire transaction if any product has insufficient stock.

---

## 3. Row Level Security (RLS)
RLS is enabled on every tenant table.
Policies verify that `auth.uid()` belongs to an active record in `tenant_members` matching the target row's `tenant_id`.
