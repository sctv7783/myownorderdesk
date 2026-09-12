import React, { useState, useEffect, useCallback } from 'react';
import {
  Tenant,
  Order,
  Conversation,
  ConversationMessage,
  Product,
  Customer,
  AgentSettings,
  AgentKnowledgeItem,
  WhatsAppAccount,
  WhatsAppPhoneNumber,
  TenantMember,
  TenantSubscription,
  Notification,
  OrderStatus,
  UserRole
} from './types';
import { Navbar } from './components/Navbar';
import { Sidebar } from './components/Sidebar';
import { LandingPage } from './components/LandingPage';
import { DashboardOverview } from './components/DashboardOverview';
import { WhatsAppInbox } from './components/WhatsAppInbox';
import { WhatsAppSimulator } from './components/WhatsAppSimulator';
import { OrdersView } from './components/OrdersView';
import { ProductsView } from './components/ProductsView';
import { CustomersView } from './components/CustomersView';
import { AiSettingsView } from './components/AiSettingsView';
import { WhatsAppSettingsView } from './components/WhatsAppSettingsView';
import { TeamView } from './components/TeamView';
import { BillingView } from './components/BillingView';
import { OnboardingModal } from './components/OnboardingModal';
import {
  loadLocalWhatsAppConfig,
  saveLocalWhatsAppConfig,
  localConfigToAccount
} from './whatsappLocalConfig';

function defaultAgentSettings(tenantId: string): AgentSettings {
  return {
    id: `ai_settings_${tenantId}`,
    tenantId,
    isEnabled: true,
    model: 'openai/gpt-oss-20b',
    primaryLanguage: 'auto',
    tone: 'friendly',
    greetingMessage:
      'Assalam-o-Alaikum! Welcome to our official WhatsApp store. Main aapki kya madad kar sakta hoon?',
    customInstructions:
      'Be polite, friendly, and always confirm delivery address and item counts before finalizing any order.',
    orderConfirmationRequired: true,
    handoffKeywords: ['human', 'agent', 'staff', 'complaint', 'manager', 'madad'],
    enableStockCheck: true,
    autoHandoffOnComplaint: true,
    workingHoursOnly: false,
    maxToolLoops: 5,
    updatedAt: new Date().toISOString()
  };
}

function storeProfileKey(tenantId: string) {
  return `orderdesk_store_profile_${tenantId}`;
}

function applySavedStoreProfile(tenant: Tenant): Tenant {
  try {
    const raw = localStorage.getItem(storeProfileKey(tenant.id));
    if (!raw) return tenant;
    const saved = JSON.parse(raw) as { name?: string; businessType?: string };
    return {
      ...tenant,
      name: saved.name || tenant.name,
      businessType: saved.businessType || tenant.businessType
    };
  } catch {
    return tenant;
  }
}

export default function App() {
  // Navigation & Tenant state
  const [currentView, setCurrentView] = useState<string>('dashboard');
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [currentTenant, setCurrentTenant] = useState<Tenant | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isOnboardingOpen, setIsOnboardingOpen] = useState<boolean>(false);

  // Tenant-isolated domain data
  const [orders, setOrders] = useState<Order[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [agentSettings, setAgentSettings] = useState<AgentSettings | null>(null);
  const [knowledgeItems, setKnowledgeItems] = useState<AgentKnowledgeItem[]>([]);
  const [whatsappAccount, setWhatsappAccount] = useState<WhatsAppAccount | undefined>(undefined);
  const [phoneNumbers, setPhoneNumbers] = useState<WhatsAppPhoneNumber[]>([]);
  const [members, setMembers] = useState<TenantMember[]>([]);
  const [subscription, setSubscription] = useState<TenantSubscription | undefined>(undefined);
  const [analytics, setAnalytics] = useState<any>({
    totalRevenue: 0,
    totalOrders: 0,
    avgOrderValue: 0,
    totalCustomers: 0,
    totalConvs: 0,
    aiHandled: 0,
    humanHandoffs: 0,
    lowStockCount: 0,
    conversionRate: '0'
  });

  // Modals & temporary state
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [isSendingMessage, setIsSendingMessage] = useState<boolean>(false);

  // Fallback initial tenants in case of slow or offline network
  const fallbackTenants: Tenant[] = [
    {
      id: 'tenant_khyber_001',
      name: 'Khyber Delight Restaurant',
      slug: 'khyber-delight',
      businessType: 'Restaurant',
      currency: 'PKR',
      timezone: 'Asia/Karachi',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    },
    {
      id: 'tenant_urban_002',
      name: 'Urban Chic Apparel',
      slug: 'urban-chic',
      businessType: 'Clothing',
      currency: 'PKR',
      timezone: 'Asia/Karachi',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
  ];

  // Fetch all available tenants on mount
  useEffect(() => {
    let isMounted = true;
    async function loadTenants() {
      try {
        const res = await fetch('/api/tenants');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const list = Array.isArray(data) ? data : (data?.tenants || []);
        if (isMounted) {
          if (list.length > 0) {
            const named = list.map(applySavedStoreProfile);
            setTenants(named);
            setCurrentTenant(named[0]);
          } else {
            const named = fallbackTenants.map(applySavedStoreProfile);
            setTenants(named);
            setCurrentTenant(named[0]);
          }
        }
      } catch (err) {
        console.warn('Error fetching tenants, using fallback:', err);
        if (isMounted) {
          setTenants(fallbackTenants.map(applySavedStoreProfile));
          setCurrentTenant(applySavedStoreProfile(fallbackTenants[0]));
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }
    loadTenants();
    return () => {
      isMounted = false;
    };
  }, []);

  // Fetch all domain data for the active tenant
  const loadTenantData = useCallback(async (tenantId: string) => {
    try {
      const headers = { 'x-tenant-id': tenantId };

      const safeFetch = async (url: string) => {
        try {
          const res = await fetch(url, { headers });
          const raw = await res.text();
          if (!res.ok) return null;
          if (!raw || raw.trimStart().startsWith('<')) return null;
          return JSON.parse(raw);
        } catch (e) {
          console.warn(`Fetch error for ${url}:`, e);
          return null;
        }
      };

      const [
        ordersRes,
        convsRes,
        productsRes,
        customersRes,
        notifsRes,
        aiRes,
        waRes,
        teamRes,
        subRes,
        analyticsRes
      ] = await Promise.all([
        safeFetch('/api/orders'),
        safeFetch('/api/conversations'),
        safeFetch('/api/products'),
        safeFetch('/api/customers'),
        safeFetch('/api/notifications'),
        safeFetch('/api/ai/settings'),
        safeFetch('/api/whatsapp/config'),
        safeFetch('/api/team'),
        safeFetch('/api/billing'),
        safeFetch('/api/analytics')
      ]);

      const loadedOrders = Array.isArray(ordersRes) ? ordersRes : (ordersRes?.orders || []);
      const loadedConvs = Array.isArray(convsRes) ? convsRes : (convsRes?.conversations || []);
      const loadedProducts = Array.isArray(productsRes) ? productsRes : (productsRes?.products || []);
      const loadedCustomers = Array.isArray(customersRes) ? customersRes : (customersRes?.customers || []);
      const loadedNotifs = Array.isArray(notifsRes) ? notifsRes : (notifsRes?.notifications || []);
      const loadedMembers = Array.isArray(teamRes) ? teamRes : (teamRes?.members || []);

      setOrders(loadedOrders);
      setConversations(loadedConvs);
      setProducts(loadedProducts);
      setCustomers(loadedCustomers);
      setNotifications(loadedNotifs);
      setAgentSettings(aiRes?.settings || defaultAgentSettings(tenantId));
      setKnowledgeItems(aiRes?.knowledgeItems || aiRes?.knowledge || []);
      if (waRes?.account) {
        setWhatsappAccount(waRes.account);
        setPhoneNumbers(waRes.phoneNumbers || []);
      } else {
        const local = loadLocalWhatsAppConfig(tenantId);
        if (local) {
          const mapped = localConfigToAccount(tenantId, local);
          setWhatsappAccount(mapped.account);
          setPhoneNumbers(mapped.phoneNumbers);
        } else {
          setWhatsappAccount(undefined);
          setPhoneNumbers([]);
        }
      }
      setMembers(loadedMembers);
      setSubscription(subRes?.subscription);
      if (analyticsRes?.analytics || analyticsRes) setAnalytics(analyticsRes?.analytics || analyticsRes);

      // Auto-select first conversation if available
      if (loadedConvs.length > 0) {
        setSelectedConvId(prev =>
          prev && loadedConvs.some((c: any) => c.id === prev) ? prev : loadedConvs[0].id
        );
      }
    } catch (err) {
      console.error('Error fetching tenant data:', err);
      if (tenantId) setAgentSettings(prev => prev || defaultAgentSettings(tenantId));
    }
  }, []);

  useEffect(() => {
    if (currentTenant) {
      loadTenantData(currentTenant.id);
    }
  }, [currentTenant, loadTenantData]);

  useEffect(() => {
    if (!currentTenant) return;
    let cancelled = false;

    const pollInbox = async () => {
      try {
        const res = await fetch('/api/conversations', {
          headers: { 'x-tenant-id': currentTenant.id }
        });
        const raw = await res.text();
        let data: any = null;
        try {
          data = JSON.parse(raw);
        } catch {
          return;
        }
        const list = Array.isArray(data) ? data : data?.conversations || [];
        if (cancelled || !Array.isArray(list)) return;
        setConversations(prev => {
          const prevStamp = prev[0]?.lastMessageAt || '';
          const nextStamp = list[0]?.lastMessageAt || '';
          if (prev.length === list.length && prevStamp === nextStamp) return prev;
          return list;
        });
        setSelectedConvId(prev => {
          if (prev && list.some((c: any) => c.id === prev)) return prev;
          return list[0]?.id || prev;
        });
      } catch {
        /* ignore poll errors */
      }
    };

    pollInbox();
    const timer = window.setInterval(pollInbox, 4000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [currentTenant?.id]);

  // Load messages whenever selected conversation changes, then poll for new ones
  useEffect(() => {
    if (!currentTenant || !selectedConvId) {
      setMessages([]);
      return;
    }

    let cancelled = false;

    async function loadMessages() {
      try {
        const res = await fetch(`/api/conversations/${selectedConvId}/messages`, {
          headers: { 'x-tenant-id': currentTenant!.id }
        });
        const raw = await res.text();
        if (raw.trimStart().startsWith('<')) return;
        const data = JSON.parse(raw);
        if (!cancelled) setMessages(data.messages || []);
      } catch (err) {
        console.error('Error loading messages:', err);
      }
    }
    loadMessages();
    const timer = window.setInterval(loadMessages, 4000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [currentTenant, selectedConvId]);

  // Handle staff reply in WhatsApp inbox
  const handleSendMessage = async (text: string) => {
    if (!currentTenant || !selectedConvId || isSendingMessage) return;
    setIsSendingMessage(true);
    try {
      const res = await fetch(`/api/conversations/${selectedConvId}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-tenant-id': currentTenant.id
        },
        body: JSON.stringify({
          text,
          sender: 'STAFF'
        })
      });
      const data = await res.json();
      if (data.message) {
        setMessages(prev => [...prev, data.message]);
        // Refresh conversation preview
        setConversations(prev =>
          prev.map(c =>
            c.id === selectedConvId
              ? { ...c, lastMessageText: text, lastMessageAt: new Date().toISOString() }
              : c
          )
        );
      }
    } catch (err) {
      console.error('Error sending staff message:', err);
    } finally {
      setIsSendingMessage(false);
    }
  };

  // Handle AI / Human Staff mode toggle
  const handleToggleMode = async (newStatus: Conversation['status']) => {
    if (!currentTenant || !selectedConvId) return;
    try {
      const res = await fetch(`/api/conversations/${selectedConvId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-tenant-id': currentTenant.id
        },
        body: JSON.stringify({ status: newStatus })
      });
      const data = await res.json();
      if (data.conversation) {
        setConversations(prev =>
          prev.map(c => (c.id === selectedConvId ? { ...c, status: newStatus } : c))
        );
      }
    } catch (err) {
      console.error('Error toggling conversation status:', err);
    }
  };

  // Handle Order Status update
  const handleUpdateOrderStatus = async (orderId: string, status: OrderStatus, note?: string) => {
    if (!currentTenant) return;
    try {
      const res = await fetch(`/api/orders/${orderId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-tenant-id': currentTenant.id
        },
        body: JSON.stringify({ status, note })
      });
      const data = await res.json();
      if (data.order) {
        setOrders(prev => prev.map(o => (o.id === orderId ? data.order : o)));
        if (selectedOrder?.id === orderId) {
          setSelectedOrder(data.order);
        }
        // Also refresh products in case of cancellation stock refund
        if (status === 'CANCELLED') {
          loadTenantData(currentTenant.id);
        }
        // If conversation is open, refresh messages so the automated WhatsApp update appears
        if (selectedConvId) {
          fetch(`/api/conversations/${selectedConvId}/messages`, {
            headers: { 'x-tenant-id': currentTenant.id }
          })
            .then(res => res.json())
            .then(msgRes => {
              if (Array.isArray(msgRes?.messages)) {
                setMessages(msgRes.messages);
              }
            })
            .catch(() => {});
        }
      }
    } catch (err) {
      console.error('Error updating order status:', err);
    }
  };

  // Handle Add Product
  const handleCreateProduct = async (productData: Partial<Product>) => {
    if (!currentTenant) return;
    const localProd: Product = {
      id: `prod_${Date.now()}`,
      tenantId: currentTenant.id,
      name: productData.name || 'Untitled',
      sku: productData.sku || `SKU-${Date.now().toString().slice(-6)}`,
      description: productData.description || '',
      price: Number(productData.price || 0),
      salePrice: productData.salePrice,
      imageUrl: productData.imageUrl,
      stockQuantity: Number(productData.stockQuantity || 0),
      reservedQuantity: 0,
      availableQuantity: Number(productData.stockQuantity || 0),
      lowStockThreshold: Number(productData.lowStockThreshold || 5),
      isActive: productData.isActive !== false,
      categoryName: productData.categoryName,
      variants: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    try {
      const res = await fetch('/api/products', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-tenant-id': currentTenant.id
        },
        body: JSON.stringify(productData)
      });
      const raw = await res.text();
      let data: any = null;
      try {
        data = JSON.parse(raw);
      } catch {
        data = null;
      }
      const newProd = data?.product || (data?.id ? data : null);
      setProducts(prev => [newProd || localProd, ...prev]);
    } catch (err) {
      console.error('Error creating product:', err);
      setProducts(prev => [localProd, ...prev]);
    }
  };

  // Handle Edit/Update Product
  const handleUpdateProduct = async (productId: string, productData: Partial<Product>) => {
    if (!currentTenant) return;
    try {
      const res = await fetch(`/api/products/${productId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-tenant-id': currentTenant.id
        },
        body: JSON.stringify(productData)
      });
      const data = await res.json();
      const updatedProd = data.product || (data.id ? data : null);
      if (updatedProd) {
        setProducts(prev => prev.map(p => (p.id === productId ? updatedProd : p)));
        return true;
      }
    } catch (err) {
      console.error('Error updating product:', err);
      return false;
    }
  };

  // Handle Delete Product
  const handleDeleteProduct = async (productId: string) => {
    if (!currentTenant) return;
    try {
      const res = await fetch(`/api/products/${productId}`, {
        method: 'DELETE',
        headers: {
          'x-tenant-id': currentTenant.id
        }
      });
      const data = await res.json();
      if (data.success) {
        setProducts(prev => prev.filter(p => p.id !== productId));
        return true;
      }
    } catch (err) {
      console.error('Error deleting product:', err);
      return false;
    }
  };

  // Handle Import from Website URL using Groq AI
  const handleImportFromUrl = async (url: string) => {
    if (!currentTenant) return { success: false, error: 'No active tenant' };
    try {
      const res = await fetch('/api/products/import-from-url', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-tenant-id': currentTenant.id
        },
        body: JSON.stringify({ url })
      });
      const raw = await res.text();
      let data: any = null;
      try {
        data = JSON.parse(raw);
      } catch {
        return {
          success: false,
          error: 'Import API HTML return kar rahi hai. Latest Netlify deploy ke baad dobara try karein.'
        };
      }
      if (data.success && Array.isArray(data.products)) {
        const withTenant = data.products.map((p: Product) => ({ ...p, tenantId: currentTenant.id }));
        setProducts(prev => [...withTenant, ...prev]);
      }
      return data;
    } catch (err: any) {
      console.error('Error importing products from URL:', err);
      return { success: false, error: err?.message || 'Network error importing products' };
    }
  };

  // Handle Adjust Stock
  const handleAdjustStock = async (productId: string, changeQuantity: number, notes?: string) => {
    if (!currentTenant) return;
    try {
      const res = await fetch(`/api/products/${productId}/adjust`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-tenant-id': currentTenant.id
        },
        body: JSON.stringify({ changeQuantity, notes })
      });
      const data = await res.json();
      if (data.product) {
        setProducts(prev => prev.map(p => (p.id === productId ? data.product : p)));
      }
    } catch (err) {
      console.error('Error adjusting stock:', err);
    }
  };

  // Handle Save AI Settings
  const handleSaveAiSettings = async (settingsData: Partial<AgentSettings>) => {
    if (!currentTenant) return;
    try {
      const res = await fetch('/api/ai/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-tenant-id': currentTenant.id
        },
        body: JSON.stringify(settingsData)
      });
      const data = await res.json();
      if (data.settings) {
        setAgentSettings(data.settings);
      }
    } catch (err) {
      console.error('Error saving AI settings:', err);
    }
  };

  // Handle Add Knowledge FAQ
  const handleAddKnowledge = async (item: { title: string; content: string; category: string }) => {
    if (!currentTenant) return;
    try {
      const res = await fetch('/api/ai/knowledge', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-tenant-id': currentTenant.id
        },
        body: JSON.stringify(item)
      });
      const data = await res.json();
      if (data.item) {
        setKnowledgeItems(prev => [data.item, ...prev]);
      }
    } catch (err) {
      console.error('Error adding knowledge item:', err);
    }
  };

  // Handle Delete Knowledge FAQ
  const handleDeleteKnowledge = async (id: string) => {
    if (!currentTenant) return;
    try {
      await fetch(`/api/ai/knowledge/${id}`, {
        method: 'DELETE',
        headers: { 'x-tenant-id': currentTenant.id }
      });
      setKnowledgeItems(prev => prev.filter(k => k.id !== id));
    } catch (err) {
      console.error('Error deleting knowledge item:', err);
    }
  };

  const handleSaveManualConfig = async (data: {
    wabaId: string;
    phoneNumberId: string;
    accessToken: string;
    displayNumber: string;
  }): Promise<{ success: boolean; error?: string }> => {
    if (!currentTenant) return { success: false, error: 'No tenant selected.' };
    try {
      const res = await fetch('/api/whatsapp/config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-tenant-id': currentTenant.id
        },
        body: JSON.stringify(data)
      });
      const contentType = res.headers.get('content-type') || '';
      const resData = contentType.includes('application/json') ? await res.json() : null;
      if (!res.ok || !resData?.success) {
        return {
          success: false,
          error: resData?.error || `Save failed (HTTP ${res.status}). Deploy the latest Netlify functions, then try again.`
        };
      }
      if (resData.account) setWhatsappAccount(resData.account);
      if (resData.phoneNumbers) setPhoneNumbers(resData.phoneNumbers);
      saveLocalWhatsAppConfig(currentTenant.id, {
        wabaId: data.wabaId,
        phoneNumberId: data.phoneNumberId,
        accessToken: data.accessToken,
        displayNumber: data.displayNumber,
        verifiedName: resData.primaryPhone?.verifiedName || resData.account?.businessName
      });
      return { success: true };
    } catch (err) {
      console.error('Error saving WhatsApp configuration:', err);
      return { success: false, error: 'Network error while saving Meta credentials.' };
    }
  };

  // Handle Send Test WhatsApp message
  const handleSendTestMessage = async (phoneNumber: string, text: string): Promise<boolean> => {
    if (!currentTenant) return false;
    try {
      const local = loadLocalWhatsAppConfig(currentTenant.id);
      const res = await fetch('/api/whatsapp/send-test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-tenant-id': currentTenant.id
        },
        body: JSON.stringify({
          phoneNumber,
          text,
          accessToken: local?.accessToken,
          phoneNumberId: local?.phoneNumberId
        })
      });
      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) return false;
      const data = await res.json();
      return data.success === true;
    } catch {
      return false;
    }
  };

  // Handle Invite Member
  const handleInviteMember = async (email: string, role: UserRole) => {
    if (!currentTenant) return;
    try {
      const res = await fetch('/api/team/invite', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-tenant-id': currentTenant.id
        },
        body: JSON.stringify({ email, role })
      });
      const data = await res.json();
      if (data.member) {
        setMembers(prev => [...prev, data.member]);
      }
    } catch (err) {
      console.error('Error inviting team member:', err);
    }
  };

  // Handle Plan Upgrade
  const handleUpgradePlan = async (plan: string) => {
    if (!currentTenant) return;
    try {
      const res = await fetch('/api/billing/upgrade', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-tenant-id': currentTenant.id
        },
        body: JSON.stringify({ plan })
      });
      const data = await res.json();
      if (data.subscription) {
        setSubscription(data.subscription);
      }
    } catch (err) {
      console.error('Error upgrading plan:', err);
    }
  };

  // Handle Mark Notification Read
  const handleMarkNotificationRead = async (id: string) => {
    if (!currentTenant) return;
    try {
      await fetch(`/api/notifications/${id}/read`, {
        method: 'PATCH',
        headers: { 'x-tenant-id': currentTenant.id }
      });
      setNotifications(prev =>
        prev.map(n => (n.id === id ? { ...n, isRead: true } : n))
      );
    } catch (err) {
      console.error('Error marking notification read:', err);
    }
  };

  const handleRenameStore = async (name: string, businessType?: string): Promise<boolean> => {
    if (!currentTenant || !name.trim()) return false;
    const updated: Tenant = {
      ...currentTenant,
      name: name.trim(),
      businessType: (businessType || currentTenant.businessType).trim() || currentTenant.businessType,
      slug: name
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, ''),
      updatedAt: new Date().toISOString()
    };
    localStorage.setItem(
      storeProfileKey(currentTenant.id),
      JSON.stringify({ name: updated.name, businessType: updated.businessType })
    );
    setCurrentTenant(updated);
    setTenants(prev => prev.map(t => (t.id === updated.id ? updated : t)));
    try {
      await fetch(`/api/tenants/${currentTenant.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-tenant-id': currentTenant.id
        },
        body: JSON.stringify({ name: updated.name, businessType: updated.businessType })
      });
    } catch (err) {
      console.warn('Store name saved locally; API sync skipped:', err);
    }
    return true;
  };

  if (isLoading || !currentTenant) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-white">
        <div className="flex items-center space-x-3 text-emerald-400">
          <div className="w-5 h-5 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
          <span className="font-semibold text-sm">Initializing WhatsApp OrderDesk...</span>
        </div>
      </div>
    );
  }

  // If user navigated to public landing page
  if (currentView === 'landing') {
    return (
      <LandingPage
        onEnterDashboard={() => setCurrentView('dashboard')}
        onOpenSimulator={() => setCurrentView('simulator')}
      />
    );
  }

  const selectedConv = conversations.find(c => c.id === selectedConvId) || conversations[0];
  const currentCustomer = selectedConv
    ? customers.find(c => c.id === selectedConv.customerId) || null
    : null;
  const customerOrders = currentCustomer
    ? orders.filter(o => o.customerId === currentCustomer.id)
    : [];

  const unreadCount = conversations.filter(c => c.unreadCount > 0).length;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col antialiased selection:bg-emerald-500 selection:text-slate-950">
      {/* Top Navigation Bar */}
      <Navbar
        tenants={tenants}
        currentTenant={currentTenant}
        onSelectTenant={tenant => {
          setCurrentTenant(applySavedStoreProfile(tenant));
          setSelectedConvId(null);
        }}
        onOpenSimulator={() => setCurrentView('simulator')}
        notifications={notifications}
        onMarkNotificationRead={handleMarkNotificationRead}
        connectionStatus="CONNECTED"
        onNavigate={setCurrentView}
        currentView={currentView}
      />

      {/* Main Body with Sidebar + View Content */}
      <div className="flex-1 flex max-w-7xl w-full mx-auto">
        <Sidebar
          currentView={currentView}
          onNavigate={setCurrentView}
          unreadCount={unreadCount}
        />

        <main className="flex-1 p-6 overflow-y-auto">
          {currentView === 'dashboard' && (
            <DashboardOverview
              tenant={currentTenant}
              analytics={analytics}
              orders={orders}
              conversations={conversations}
              products={products}
              onNavigate={setCurrentView}
              onSelectOrder={setSelectedOrder}
              onRenameStore={handleRenameStore}
            />
          )}

          {currentView === 'inbox' && (
            <WhatsAppInbox
              tenant={currentTenant}
              conversations={conversations}
              selectedConvId={selectedConvId}
              onSelectConversation={setSelectedConvId}
              messages={messages}
              currentCustomer={currentCustomer}
              customerOrders={customerOrders}
              onSendMessage={handleSendMessage}
              onToggleMode={handleToggleMode}
              isSending={isSendingMessage}
            />
          )}

          {currentView === 'simulator' && (
            <WhatsAppSimulator
              tenant={currentTenant}
              greeting={agentSettings?.greetingMessage}
              onRefreshData={() => loadTenantData(currentTenant.id)}
            />
          )}

          {currentView === 'orders' && (
            <OrdersView
              tenant={currentTenant}
              orders={orders}
              selectedOrder={selectedOrder}
              onSelectOrder={setSelectedOrder}
              onUpdateStatus={handleUpdateOrderStatus}
            />
          )}

          {currentView === 'products' && (
            <ProductsView
              tenant={currentTenant}
              products={products}
              onCreateProduct={handleCreateProduct}
              onUpdateProduct={handleUpdateProduct}
              onDeleteProduct={handleDeleteProduct}
              onImportFromUrl={handleImportFromUrl}
              onAdjustStock={handleAdjustStock}
            />
          )}

          {currentView === 'customers' && (
            <CustomersView
              tenant={currentTenant}
              customers={customers}
              orders={orders}
              onUpdateCustomer={(id, data) => {
                setCustomers(prev => prev.map(c => (c.id === id ? { ...c, ...data } : c)));
              }}
            />
          )}

          {currentView === 'ai-settings' && (
            <AiSettingsView
              tenant={currentTenant}
              settings={agentSettings || defaultAgentSettings(currentTenant.id)}
              knowledgeItems={knowledgeItems}
              onSaveSettings={handleSaveAiSettings}
              onAddKnowledge={handleAddKnowledge}
              onDeleteKnowledge={handleDeleteKnowledge}
              onOpenSimulator={() => setCurrentView('simulator')}
            />
          )}

          {currentView === 'whatsapp' && (
            <WhatsAppSettingsView
              tenant={currentTenant}
              account={whatsappAccount}
              phoneNumbers={phoneNumbers}
              onSaveManualConfig={handleSaveManualConfig}
              onSendTestMessage={handleSendTestMessage}
            />
          )}

          {currentView === 'team' && (
            <TeamView
              tenant={currentTenant}
              members={members}
              onInviteMember={handleInviteMember}
            />
          )}

          {currentView === 'billing' && (
            <BillingView
              tenant={currentTenant}
              subscription={subscription}
              onUpgradePlan={handleUpgradePlan}
            />
          )}

          {currentView === 'analytics' && (
            <DashboardOverview
              tenant={currentTenant}
              analytics={analytics}
              orders={orders}
              conversations={conversations}
              products={products}
              onNavigate={setCurrentView}
              onSelectOrder={setSelectedOrder}
              onRenameStore={handleRenameStore}
            />
          )}
        </main>
      </div>

      {/* Onboarding Wizard Modal */}
      <OnboardingModal
        tenant={currentTenant}
        isOpen={isOnboardingOpen}
        onClose={() => setIsOnboardingOpen(false)}
        onComplete={() => setIsOnboardingOpen(false)}
      />
    </div>
  );
}
