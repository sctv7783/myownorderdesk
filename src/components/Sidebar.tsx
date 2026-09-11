import React from 'react';
import {
  LayoutDashboard,
  MessageSquare,
  ShoppingBag,
  Package,
  Users,
  Bot,
  Smartphone,
  BarChart3,
  UserCheck,
  CreditCard,
  Sparkles,
  HelpCircle
} from 'lucide-react';

interface SidebarProps {
  currentView: string;
  onNavigate: (view: string) => void;
  unreadCount: number;
}

export const Sidebar: React.FC<SidebarProps> = ({ currentView, onNavigate, unreadCount }) => {
  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'inbox', label: 'WhatsApp Inbox', icon: MessageSquare, badge: unreadCount > 0 ? unreadCount : undefined },
    { id: 'orders', label: 'Orders', icon: ShoppingBag },
    { id: 'products', label: 'Products & Stock', icon: Package },
    { id: 'customers', label: 'Customers CRM', icon: Users },
    { id: 'ai-settings', label: 'AI Agent (Groq)', icon: Bot },
    { id: 'whatsapp', label: 'WhatsApp Connect', icon: Smartphone },
    { id: 'analytics', label: 'Analytics', icon: BarChart3 },
    { id: 'team', label: 'Team & Roles', icon: UserCheck },
    { id: 'billing', label: 'Plans & Billing', icon: CreditCard }
  ];

  return (
    <aside className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col justify-between py-6 px-3 shrink-0">
      <div className="space-y-1">
        <div className="px-3 pb-2 mb-2 border-b border-slate-800/80">
          <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Main Navigation</p>
        </div>
        {navItems.map(item => {
          const Icon = item.icon;
          const isActive = currentView === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                isActive
                  ? 'bg-emerald-600/15 text-emerald-400 border border-emerald-500/30 font-semibold shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <div className="flex items-center space-x-3">
                <Icon className={`w-4 h-4 ${isActive ? 'text-emerald-400' : 'text-slate-400'}`} />
                <span>{item.label}</span>
              </div>
              {item.badge !== undefined && (
                <span className="bg-emerald-500 text-slate-950 font-bold text-[11px] px-2 py-0.5 rounded-full">
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Simulator quick-launch promo card in sidebar */}
      <div className="mt-6 px-2">
        <div className="bg-gradient-to-br from-slate-800 to-slate-850 border border-slate-700/80 rounded-2xl p-3.5 text-center shadow-lg">
          <div className="w-8 h-8 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto mb-2">
            <Sparkles className="w-4 h-4" />
          </div>
          <h4 className="text-xs font-bold text-white mb-1">WhatsApp AI Simulator</h4>
          <p className="text-[11px] text-slate-400 mb-3">Test customer ordering & Urdu support with Groq model</p>
          <button
            onClick={() => onNavigate('simulator')}
            className="w-full bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold py-2 px-3 rounded-lg transition-colors shadow-sm"
          >
            Launch Test Bench
          </button>
        </div>
      </div>
    </aside>
  );
};
