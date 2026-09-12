import React from 'react';
import {
  TrendingUp,
  ShoppingBag,
  MessageSquare,
  AlertTriangle,
  ArrowUpRight,
  Sparkles,
  Smartphone,
  CheckCircle2,
  Clock,
  User,
  Plus,
  Pencil,
  Check,
  X
} from 'lucide-react';
import { Tenant, Order, Conversation, Product } from '../types';

interface DashboardOverviewProps {
  tenant: Tenant;
  analytics: {
    totalRevenue: number;
    totalOrders: number;
    avgOrderValue: number;
    totalCustomers: number;
    totalConvs: number;
    aiHandled: number;
    humanHandoffs: number;
    lowStockCount: number;
    conversionRate: string;
  };
  orders: Order[];
  conversations: Conversation[];
  products: Product[];
  onNavigate: (view: string) => void;
  onSelectOrder: (order: Order) => void;
  onRenameStore?: (name: string, businessType?: string) => Promise<boolean>;
}

export const DashboardOverview: React.FC<DashboardOverviewProps> = ({
  tenant,
  analytics,
  orders,
  conversations,
  products,
  onNavigate,
  onSelectOrder,
  onRenameStore
}) => {
  const [isEditingName, setIsEditingName] = React.useState(false);
  const [draftName, setDraftName] = React.useState(tenant.name);
  const [draftType, setDraftType] = React.useState(tenant.businessType);
  const [savingName, setSavingName] = React.useState(false);

  React.useEffect(() => {
    setDraftName(tenant.name);
    setDraftType(tenant.businessType);
  }, [tenant.id, tenant.name, tenant.businessType]);

  const saveStoreName = async () => {
    if (!draftName.trim() || !onRenameStore) return;
    setSavingName(true);
    const ok = await onRenameStore(draftName.trim(), draftType.trim());
    setSavingName(false);
    if (ok) setIsEditingName(false);
  };

  const recentOrders = orders.slice(0, 5);
  const activeChats = conversations.slice(0, 4);
  const lowStock = products.filter(p => p.stockQuantity <= p.lowStockThreshold);

  return (
    <div className="space-y-6">
      {/* Top Banner & Quick Controls */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            {isEditingName ? (
              <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                <input
                  autoFocus
                  value={draftName}
                  onChange={e => setDraftName(e.target.value)}
                  className="bg-slate-800 border border-emerald-500/50 rounded-xl px-3 py-1.5 text-lg font-bold text-white focus:outline-none"
                  placeholder="Store name"
                />
                <input
                  value={draftType}
                  onChange={e => setDraftType(e.target.value)}
                  className="bg-slate-800 border border-slate-600 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none"
                  placeholder="Business type"
                />
                <button
                  type="button"
                  onClick={saveStoreName}
                  disabled={savingName || !draftName.trim()}
                  className="p-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-50"
                >
                  <Check className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDraftName(tenant.name);
                    setDraftType(tenant.businessType);
                    setIsEditingName(false);
                  }}
                  className="p-2 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <>
                <h1 className="text-2xl font-bold text-white tracking-tight">{tenant.name}</h1>
                <span className="bg-emerald-500/10 text-emerald-400 text-xs font-semibold px-2.5 py-0.5 rounded-full border border-emerald-500/20">
                  {tenant.businessType}
                </span>
                {onRenameStore && (
                  <button
                    type="button"
                    onClick={() => setIsEditingName(true)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
                    title="Change store name"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                )}
              </>
            )}
          </div>
          <p className="text-sm text-slate-400 mt-1">
            WhatsApp Order Automation active • Real-time AI Agent powered by Groq (<span className="text-emerald-400 font-mono text-xs">openai/gpt-oss-20b</span>)
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={() => onNavigate('simulator')}
            className="flex items-center space-x-2 bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-xl text-sm font-semibold transition-all shadow-md shadow-emerald-950"
          >
            <Sparkles className="w-4 h-4" />
            <span>Open AI Simulator</span>
          </button>
          <button
            onClick={() => onNavigate('whatsapp')}
            className="flex items-center space-x-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 px-4 py-2 rounded-xl text-sm font-medium transition-colors"
          >
            <Smartphone className="w-4 h-4 text-emerald-400" />
            <span>WhatsApp Settings</span>
          </button>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Total Sales</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-bold text-white mt-2">
            {tenant.currency} {analytics.totalRevenue.toLocaleString()}
          </p>
          <p className="text-xs text-emerald-400 flex items-center mt-1">
            <ArrowUpRight className="w-3.5 h-3.5 mr-0.5" />
            <span>Avg {tenant.currency} {analytics.avgOrderValue.toLocaleString()} per order</span>
          </p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Confirmed Orders</span>
            <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-400 flex items-center justify-center">
              <ShoppingBag className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-bold text-white mt-2">{analytics.totalOrders}</p>
          <p className="text-xs text-slate-400 mt-1">
            Conversion: <span className="text-white font-medium">{analytics.conversionRate}%</span> of chats
          </p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">AI WhatsApp Chats</span>
            <div className="w-8 h-8 rounded-lg bg-purple-500/10 text-purple-400 flex items-center justify-center">
              <MessageSquare className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-bold text-white mt-2">{analytics.totalConvs}</p>
          <p className="text-xs text-slate-400 mt-1">
            <span className="text-emerald-400 font-medium">{analytics.aiHandled} AI Automated</span> • {analytics.humanHandoffs} Handoffs
          </p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Low Stock Items</span>
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
              analytics.lowStockCount > 0 ? 'bg-amber-500/10 text-amber-400' : 'bg-slate-800 text-slate-400'
            }`}>
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-bold text-white mt-2">{analytics.lowStockCount}</p>
          <p className="text-xs text-slate-400 mt-1">
            {analytics.lowStockCount > 0 ? 'Restock recommended' : 'Inventory levels healthy'}
          </p>
        </div>
      </div>

      {/* Main 2-Column Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Recent Orders */}
        <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-bold text-white">Recent WhatsApp Orders</h2>
              <p className="text-xs text-slate-400">Real-time transactional log with inventory deduction</p>
            </div>
            <button
              onClick={() => onNavigate('orders')}
              className="text-xs font-semibold text-emerald-400 hover:text-emerald-300 transition-colors"
            >
              View All Orders →
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-wider text-slate-500 border-b border-slate-800">
                <tr>
                  <th className="pb-3 font-semibold">Order #</th>
                  <th className="pb-3 font-semibold">Customer</th>
                  <th className="pb-3 font-semibold">Items</th>
                  <th className="pb-3 font-semibold">Total</th>
                  <th className="pb-3 font-semibold">Status</th>
                  <th className="pb-3 font-semibold">Source</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {recentOrders.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-xs text-slate-500">
                      No orders placed yet. Test ordering in the WhatsApp Simulator!
                    </td>
                  </tr>
                ) : (
                  recentOrders.map(order => (
                    <tr
                      key={order.id}
                      onClick={() => onSelectOrder(order)}
                      className="hover:bg-slate-800/40 cursor-pointer transition-colors"
                    >
                      <td className="py-3 font-mono font-medium text-xs text-emerald-400">{order.orderNumber}</td>
                      <td className="py-3">
                        <p className="font-medium text-white">{order.customerName}</p>
                        <p className="text-xs text-slate-400">{order.customerPhone}</p>
                      </td>
                      <td className="py-3 text-xs text-slate-300">
                        {order.items.map(i => `${i.quantity}x ${i.productName}`).join(', ')}
                      </td>
                      <td className="py-3 font-semibold text-white">
                        {tenant.currency} {order.total.toLocaleString()}
                      </td>
                      <td className="py-3">
                        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${
                          order.status === 'CONFIRMED'
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                            : order.status === 'PREPARING'
                            ? 'bg-blue-500/10 text-blue-400 border-blue-500/30'
                            : order.status === 'DELIVERED'
                            ? 'bg-purple-500/10 text-purple-400 border-purple-500/30'
                            : 'bg-slate-800 text-slate-400 border-slate-700'
                        }`}>
                          {order.status}
                        </span>
                      </td>
                      <td className="py-3 text-xs text-slate-400">
                        {order.source === 'whatsapp_ai' ? (
                          <span className="flex items-center text-emerald-400 font-medium text-[11px]">
                            <Sparkles className="w-3 h-3 mr-1" /> WhatsApp AI
                          </span>
                        ) : (
                          <span>Manual</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right Col: Live WhatsApp Chats & Low Stock Alerts */}
        <div className="space-y-6">
          {/* Active Chats preview */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-white">Active WhatsApp Chats</h3>
              <button
                onClick={() => onNavigate('inbox')}
                className="text-xs text-emerald-400 hover:text-emerald-300 font-medium"
              >
                Open Inbox →
              </button>
            </div>

            <div className="space-y-2.5">
              {activeChats.length === 0 ? (
                <p className="text-xs text-slate-500 text-center py-4">No active conversations</p>
              ) : (
                activeChats.map(c => (
                  <div
                    key={c.id}
                    onClick={() => onNavigate('inbox')}
                    className="p-3 rounded-xl bg-slate-800/40 hover:bg-slate-800/80 border border-slate-700/40 cursor-pointer transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold text-white">{c.customerName}</p>
                      <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded ${
                        c.status === 'AI_ACTIVE' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-amber-500/15 text-amber-400'
                      }`}>
                        {c.status === 'AI_ACTIVE' ? 'AI Active' : 'Human Staff'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-300 truncate mt-1">{c.lastMessageText || 'No message'}</p>
                    <p className="text-[10px] text-slate-500 mt-1">{new Date(c.lastMessageAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Low Stock Warning */}
          {lowStock.length > 0 && (
            <div className="bg-amber-950/20 border border-amber-900/40 rounded-2xl p-4">
              <div className="flex items-center space-x-2 text-amber-400 font-semibold text-xs mb-2">
                <AlertTriangle className="w-4 h-4" />
                <span>Low Stock Warning ({lowStock.length})</span>
              </div>
              <ul className="space-y-1 text-xs text-slate-300">
                {lowStock.map(p => (
                  <li key={p.id} className="flex justify-between">
                    <span>{p.name}</span>
                    <span className="text-amber-400 font-bold">{p.stockQuantity} remaining</span>
                  </li>
                ))}
              </ul>
              <button
                onClick={() => onNavigate('products')}
                className="mt-3 text-xs text-amber-300 underline hover:text-amber-200"
              >
                Manage stock in inventory →
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
