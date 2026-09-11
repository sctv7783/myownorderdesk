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
            setTenants(list);
            setCurrentTenant(list[0]);
          } else {
            setTenants(fallbackTenants);
            setCurrentTenant(fallbackTenants[0]);
          }
        }
      } catch (err) {
        console.warn('Error fetching tenants, using fallback:', err);
        if (isMounted) {
          setTenants(fallbackTenants);
          setCurrentTenant(fallbackTenants[0]);
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
          if (!res.ok) return null;
          return await res.json();
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
      setAgentSettings(aiRes?.settings || null);
      setKnowledgeItems(aiRes?.knowledgeItems || aiRes?.knowledge || []);
      setWhatsappAccount(waRes?.account);
      setPhoneNumbers(waRes?.phoneNumbers || []);
      setMembers(loadedMembers);
      setSubscription(subRes?.subscription);
      if (analyticsRes?.analytics || analyticsRes) setAnalytics(analyticsRes?.analytics || analyticsRes);

      // Auto-select first conversation if available
      if (loadedConvs.length > 0) {
        setSelectedConvId(prev => prev && loadedConvs.some((c: any) => c.id === prev) ? prev : loadedConvs[0].id);
      } else {
        setSelectedConvId(null);
      }
    } catch (err) {
      console.error('Error fetching tenant data:', err);
    }
  }, []);

  useEffect(() => {
    if (currentTenant) {
      loadTenantData(currentTenant.id);
    }
  }, [currentTenant, loadTenantData]);

  // Load messages whenever selected conversation changes
  useEffect(() => {
    if (!currentTenant || !selectedConvId) {
      setMessages([]);
      return;
    }

    async function loadMessages() {
      try {
        const res = await fetch(`/api/conversations/${selectedConvId}/messages`, {
          headers: { 'x-tenant-id': currentTenant!.id }
        });
        const data = await res.json();
        setMessages(data.messages || []);
      } catch (err) {
        console.error('Error loading messages:', err);
      }
    }
    loadMessages();
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
    try {
      const res = await fetch('/api/products', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-tenant-id': currentTenant.id
        },
        body: JSON.stringify(productData)
      });
      const data = await res.json();
      const newProd = data.product || (data.id ? data : null);
      if (newProd) {
        setProducts(prev => [newProd, ...prev]);
      }
    } catch (err) {
      console.error('Error creating product:', err);
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
      const data = await res.json();
      if (data.success && Array.isArray(data.products)) {
        setProducts(prev => [...data.products, ...prev]);
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

  // Handle Save Manual WhatsApp Config
  const handleSaveManualConfig = async (data: {
    wabaId: string;
    phoneNumberId: string;
    accessToken: string;
    displayNumber: string;
  }) => {
    if (!currentTenant) return;
    try {
      const res = await fetch('/api/whatsapp/config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-tenant-id': currentTenant.id
        },
        body: JSON.stringify(data)
      });
      const resData = await res.json();
      if (resData.account) setWhatsappAccount(resData.account);
      if (resData.phoneNumbers) setPhoneNumbers(resData.phoneNumbers);
    } catch (err) {
      console.error('Error saving WhatsApp configuration:', err);
    }
  };

  // Handle Send Test WhatsApp message
  const handleSendTestMessage = async (phoneNumber: string, text: string): Promise<boolean> => {
    if (!currentTenant) return false;
    try {
      const res = await fetch('/api/whatsapp/send-test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-tenant-id': currentTenant.id
        },
        body: JSON.stringify({ phoneNumber, text })
      });
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
          setCurrentTenant(tenant);
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

          {currentView === 'ai-settings' && agentSettings && (
            <AiSettingsView
              tenant={currentTenant}
              settings={agentSettings}
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
