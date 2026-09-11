import React, { useState } from 'react';
import {
  MessageSquare,
  Building2,
  ChevronDown,
  Bell,
  Sparkles,
  ExternalLink,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  X
} from 'lucide-react';
import { Tenant, Notification } from '../types';

interface NavbarProps {
  tenants: Tenant[];
  currentTenant: Tenant;
  onSelectTenant: (tenant: Tenant) => void;
  onOpenSimulator: () => void;
  notifications: Notification[];
  onMarkNotificationRead: (id: string) => void;
  connectionStatus: 'CONNECTED' | 'DISCONNECTED' | 'ATTENTION_REQUIRED';
  onNavigate: (view: string) => void;
  currentView: string;
}

export const Navbar: React.FC<NavbarProps> = ({
  tenants,
  currentTenant,
  onSelectTenant,
  onOpenSimulator,
  notifications,
  onMarkNotificationRead,
  connectionStatus,
  onNavigate,
  currentView
}) => {
  const [tenantDropdownOpen, setTenantDropdownOpen] = useState(false);
  const [notifDropdownOpen, setNotifDropdownOpen] = useState(false);

  const unreadNotifs = notifications.filter(n => !n.isRead);

  return (
    <header className="bg-slate-900 border-b border-slate-800 text-white sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand & Logo */}
        <div className="flex items-center space-x-6">
          <button
            onClick={() => onNavigate('dashboard')}
            className="flex items-center space-x-2 text-left group focus:outline-none"
          >
            <div className="w-10 h-10 rounded-xl bg-emerald-600 flex items-center justify-center text-white shadow-lg shadow-emerald-900/40">
              <MessageSquare className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center space-x-1.5">
                <span className="font-bold text-lg tracking-tight text-white">WhatsApp OrderDesk</span>
                <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  SaaS
                </span>
              </div>
              <p className="text-xs text-slate-400">Groq AI Agent • openai/gpt-oss-20b</p>
            </div>
          </button>

          {/* Tenant Switcher */}
          <div className="relative">
            <button
              onClick={() => setTenantDropdownOpen(!tenantDropdownOpen)}
              className="flex items-center space-x-2.5 bg-slate-800/80 hover:bg-slate-800 border border-slate-700/80 px-3 py-1.5 rounded-lg text-sm transition-colors text-slate-200"
            >
              <Building2 className="w-4 h-4 text-emerald-400" />
              <div className="text-left">
                <span className="block font-medium text-xs text-slate-400 leading-tight">Active Tenant</span>
                <span className="block font-semibold text-white leading-tight max-w-[140px] truncate">{currentTenant.name}</span>
              </div>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
            </button>

            {tenantDropdownOpen && (
              <div className="absolute left-0 mt-2 w-64 bg-slate-800 border border-slate-700 rounded-xl shadow-2xl py-2 z-50">
                <div className="px-3 py-1.5 border-b border-slate-700/60 mb-1">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Switch Business Tenant</p>
                  <p className="text-[11px] text-slate-400">All data & WhatsApp connections are 100% isolated</p>
                </div>
                {tenants.map(t => (
                  <button
                    key={t.id}
                    onClick={() => {
                      onSelectTenant(t);
                      setTenantDropdownOpen(false);
                    }}
                    className={`w-full text-left px-3 py-2 flex items-center justify-between text-sm hover:bg-slate-700/50 transition-colors ${
                      t.id === currentTenant.id ? 'bg-emerald-950/40 text-emerald-300 font-medium' : 'text-slate-300'
                    }`}
                  >
                    <div>
                      <p className="text-sm font-medium">{t.name}</p>
                      <p className="text-xs text-slate-400">{t.businessType} • {t.currency}</p>
                    </div>
                    {t.id === currentTenant.id && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Action Controls & Indicators */}
        <div className="flex items-center space-x-3">
          {/* WhatsApp Status Pill */}
          <button
            onClick={() => onNavigate('whatsapp')}
            className={`hidden sm:flex items-center space-x-1.5 px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
              connectionStatus === 'CONNECTED'
                ? 'bg-emerald-950/50 text-emerald-300 border-emerald-800/80 hover:bg-emerald-900/50'
                : connectionStatus === 'ATTENTION_REQUIRED'
                ? 'bg-amber-950/50 text-amber-300 border-amber-800/80 hover:bg-amber-900/50'
                : 'bg-rose-950/50 text-rose-300 border-rose-800/80 hover:bg-rose-900/50'
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                connectionStatus === 'CONNECTED'
                  ? 'bg-emerald-400 animate-pulse'
                  : connectionStatus === 'ATTENTION_REQUIRED'
                  ? 'bg-amber-400'
                  : 'bg-rose-400'
              }`}
            />
            <span>
              {connectionStatus === 'CONNECTED'
                ? 'WhatsApp Active'
                : connectionStatus === 'ATTENTION_REQUIRED'
                ? 'Attention Needed'
                : 'WhatsApp Disconnected'}
            </span>
          </button>

          {/* Interactive Simulator Button */}
          <button
            onClick={onOpenSimulator}
            className="flex items-center space-x-1.5 bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 rounded-lg text-xs font-semibold transition-all shadow-md shadow-emerald-950"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Test WhatsApp AI</span>
          </button>

          {/* Landing page link */}
          <button
            onClick={() => onNavigate(currentView === 'landing' ? 'dashboard' : 'landing')}
            className="text-xs text-slate-400 hover:text-white px-2.5 py-1.5 rounded-md hover:bg-slate-800 transition-colors"
          >
            {currentView === 'landing' ? 'Back to Dashboard' : 'View Landing Page'}
          </button>

          {/* Notifications */}
          <div className="relative">
            <button
              onClick={() => setNotifDropdownOpen(!notifDropdownOpen)}
              className="relative p-2 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
            >
              <Bell className="w-5 h-5" />
              {unreadNotifs.length > 0 && (
                <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-rose-500 rounded-full ring-2 ring-slate-900" />
              )}
            </button>

            {notifDropdownOpen && (
              <div className="absolute right-0 mt-2 w-80 bg-slate-800 border border-slate-700 rounded-xl shadow-2xl py-2 z-50">
                <div className="px-3 py-2 border-b border-slate-700/60 flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-300">Notifications</span>
                  <span className="text-[11px] text-slate-400">{unreadNotifs.length} unread</span>
                </div>
                <div className="max-h-72 overflow-y-auto divide-y divide-slate-700/40">
                  {notifications.length === 0 ? (
                    <div className="p-4 text-center text-xs text-slate-400">No notifications yet</div>
                  ) : (
                    notifications.map(n => (
                      <div
                        key={n.id}
                        onClick={() => onMarkNotificationRead(n.id)}
                        className={`p-3 text-xs cursor-pointer hover:bg-slate-700/40 transition-colors ${
                          !n.isRead ? 'bg-slate-750/40' : 'opacity-70'
                        }`}
                      >
                        <div className="flex items-start justify-between">
                          <p className="font-semibold text-white">{n.title}</p>
                          <span className="text-[10px] text-slate-400">{new Date(n.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                        <p className="text-slate-300 mt-0.5">{n.message}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {/* User Profile */}
          <div className="flex items-center space-x-2 pl-2 border-l border-slate-800">
            <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center font-bold text-xs text-emerald-400">
              ST
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};
