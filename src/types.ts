export type Role = 'OWNER' | 'ADMIN' | 'MANAGER' | 'STAFF';
export type UserRole = Role;

export interface Profile {
  id: string;
  email: string;
  fullName: string;
  avatarUrl?: string;
  createdAt: string;
}

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  businessType: string;
  currency: string;
  timezone: string;
  createdAt: string;
  updatedAt: string;
}

export interface TenantMember {
  id: string;
  tenantId: string;
  userId: string;
  role: Role;
  invitedEmail?: string;
  status: 'ACTIVE' | 'INVITED' | 'SUSPENDED';
  createdAt: string;
  profile?: Profile;
}

export interface BusinessProfile {
  id: string;
  tenantId: string;
  businessName: string;
  businessType: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  description: string;
  deliveryFee: number;
  freeDeliveryThreshold?: number;
  estimatedDeliveryTime: string;
  currency: string;
  createdAt: string;
  updatedAt: string;
}

export interface BusinessHours {
  id: string;
  tenantId: string;
  dayOfWeek: number; // 0 = Sunday, 1 = Monday...
  isOpen: boolean;
  openTime: string; // "09:00"
  closeTime: string; // "23:00"
}

export interface BusinessDeliveryArea {
  id: string;
  tenantId: string;
  areaName: string;
  deliveryFee: number;
  minOrderAmount: number;
  estimatedTimeMinutes: number;
}

export interface BusinessPaymentMethod {
  id: string;
  tenantId: string;
  name: string;
  code: 'COD' | 'BANK_TRANSFER' | 'EASYPAISA' | 'JAZZCASH' | 'CARD';
  instructions?: string;
  accountDetails?: string;
  isActive: boolean;
}

export interface WhatsAppAccount {
  id: string;
  tenantId: string;
  wabaId: string;
  businessName: string;
  status: 'CONNECTED' | 'DISCONNECTED' | 'ATTENTION_REQUIRED';
  accessTokenEncrypted?: string;
  tokenExpiresAt?: string;
  lastVerifiedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface WhatsAppPhoneNumber {
  id: string;
  tenantId: string;
  whatsappAccountId: string;
  phoneNumberId: string;
  displayPhoneNumber: string;
  verifiedName: string;
  qualityRating?: string;
  messagingLimitTier?: string;
  status: 'CONNECTED' | 'DISCONNECTED' | 'FLAGGED';
  isPrimary: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface WebhookEvent {
  id: string;
  tenantId?: string;
  externalEventId: string;
  eventType: string;
  payload: any;
  processingStatus: 'PROCESSED' | 'FAILED' | 'IGNORED';
  processedAt?: string;
  error?: string;
  createdAt: string;
}

export interface ProductCategory {
  id: string;
  tenantId: string;
  name: string;
  slug: string;
  description?: string;
  createdAt: string;
}

export interface Product {
  id: string;
  tenantId: string;
  categoryId?: string;
  categoryName?: string;
  name: string;
  sku: string;
  description: string;
  price: number;
  salePrice?: number;
  imageUrl?: string;
  stockQuantity: number;
  reservedQuantity: number;
  availableQuantity: number;
  lowStockThreshold: number;
  isActive: boolean;
  variants?: ProductVariant[];
  createdAt: string;
  updatedAt: string;
}

export interface ProductVariant {
  id: string;
  productId: string;
  name: string; // e.g. "Size", "Color"
  options: string[]; // e.g. ["Small", "Medium", "Large"]
  priceModifier?: number;
}

export interface InventoryMovement {
  id: string;
  tenantId: string;
  productId: string;
  productName?: string;
  changeQuantity: number;
  previousQuantity: number;
  newQuantity: number;
  type: 'SALE' | 'RESTOCK' | 'ADJUSTMENT' | 'RESERVATION' | 'CANCELLATION_RESTORE';
  referenceId?: string; // e.g. orderId
  notes?: string;
  createdAt: string;
}

export interface Customer {
  id: string;
  tenantId: string;
  phone: string;
  name: string;
  email?: string;
  address?: string;
  city?: string;
  tags: string[];
  notes?: string;
  firstContact: string;
  lastContact: string;
  orderCount: number;
  totalSpend: number;
  status: 'ACTIVE' | 'BLOCKED' | 'VIP';
}

export interface CustomerNote {
  id: string;
  tenantId: string;
  customerId: string;
  authorName: string;
  content: string;
  createdAt: string;
}

export type ConversationMode = 'AI_ACTIVE' | 'HUMAN_ACTIVE' | 'WAITING' | 'CLOSED';

export interface Conversation {
  id: string;
  tenantId: string;
  customerId: string;
  customerPhone: string;
  customerName: string;
  phoneNumberId: string;
  status: ConversationMode;
  assignedUserId?: string;
  assignedUserName?: string;
  lastMessageText: string;
  lastMessageAt: string;
  unreadCount: number;
  customerServiceWindowExpiresAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ConversationMessage {
  id: string;
  conversationId: string;
  tenantId: string;
  sender: 'CUSTOMER' | 'AI' | 'STAFF' | 'SYSTEM';
  text: string;
  whatsappMessageId?: string;
  status?: 'SENT' | 'DELIVERED' | 'READ' | 'FAILED';
  meta?: any;
  createdAt: string;
}

export type OrderStatus =
  | 'DRAFT'
  | 'PENDING_CONFIRMATION'
  | 'CONFIRMED'
  | 'PREPARING'
  | 'SHIPPED'
  | 'DELIVERED'
  | 'CANCELLED'
  | 'REFUNDED';

export type PaymentStatus = 'PENDING' | 'PAID' | 'FAILED' | 'REFUNDED';

export interface OrderItem {
  id: string;
  orderId: string;
  productId: string;
  productName: string;
  sku: string;
  unitPrice: number;
  quantity: number;
  subtotal: number;
  variantDetails?: string;
}

export interface Order {
  id: string;
  tenantId: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  orderNumber: string;
  status: OrderStatus;
  items: OrderItem[];
  subtotal: number;
  deliveryFee: number;
  discount: number;
  total: number;
  paymentMethod: string;
  paymentStatus: PaymentStatus;
  deliveryAddress: string;
  notes?: string;
  source: 'whatsapp_ai' | 'whatsapp_human' | 'dashboard' | 'manual';
  createdAt: string;
  updatedAt: string;
}

export interface OrderStatusHistory {
  id: string;
  orderId: string;
  tenantId: string;
  previousStatus?: OrderStatus;
  newStatus: OrderStatus;
  changedBy: string; // 'AI', 'Staff Name', 'System'
  note?: string;
  createdAt: string;
}

export interface AgentSettings {
  id: string;
  tenantId: string;
  isEnabled: boolean;
  model: string;
  primaryLanguage: 'auto' | 'urdu' | 'roman_urdu' | 'english';
  tone: 'friendly' | 'professional' | 'concise';
  greetingMessage: string;
  customInstructions: string;
  orderConfirmationRequired: boolean;
  handoffKeywords: string[];
  enableStockCheck: boolean;
  autoHandoffOnComplaint: boolean;
  workingHoursOnly: boolean;
  maxToolLoops: number;
  updatedAt: string;
}

export interface AgentKnowledgeItem {
  id: string;
  tenantId: string;
  category: 'FAQ' | 'POLICY' | 'DELIVERY' | 'PAYMENT' | 'CUSTOM';
  question: string;
  answer: string;
  isActive: boolean;
}

export interface AgentRun {
  id: string;
  tenantId: string;
  conversationId: string;
  model: string;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  latencyMs: number;
  status: 'SUCCESS' | 'TOOL_CALLED' | 'FAILED';
  errorMessage?: string;
  createdAt: string;
}

export interface Plan {
  id: 'starter' | 'pro' | 'business';
  name: string;
  priceMonthly: number;
  orderLimitMonthly: number;
  hasAiAgent: boolean;
  hasAnalytics: boolean;
  hasTeamMembers: boolean;
  hasCustomKnowledge: boolean;
}

export interface TenantSubscription {
  tenantId: string;
  planId: 'starter' | 'pro' | 'business';
  status: 'ACTIVE' | 'TRIALING' | 'PAST_DUE' | 'CANCELLED';
  ordersThisMonth: number;
  currentPeriodStart: string;
  currentPeriodEnd: string;
}

export interface Notification {
  id: string;
  tenantId: string;
  title: string;
  message: string;
  type: 'NEW_ORDER' | 'HUMAN_HANDOFF' | 'LOW_STOCK' | 'WHATSAPP_DISCONNECTED' | 'AI_ERROR';
  isRead: boolean;
  referenceId?: string;
  createdAt: string;
}

export interface AuditLog {
  id: string;
  tenantId: string;
  userId?: string;
  userName: string;
  action: string;
  entityType: string;
  entityId: string;
  details?: any;
  createdAt: string;
}
