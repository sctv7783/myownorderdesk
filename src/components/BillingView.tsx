import React, { useState } from 'react';
import {
  CreditCard,
  CheckCircle2,
  Zap,
  TrendingUp,
  ShieldCheck,
  Sparkles
} from 'lucide-react';
import { Tenant, TenantSubscription } from '../types';

interface BillingViewProps {
  tenant: Tenant;
  subscription?: TenantSubscription;
  onUpgradePlan: (plan: string) => void;
}

export const BillingView: React.FC<BillingViewProps> = ({ tenant, subscription, onUpgradePlan }) => {
  const currentPlan = subscription?.plan || 'PRO';

  const plans = [
    {
      id: 'STARTER',
      name: 'Starter Tier',
      price: '$29 / mo',
      localPrice: 'PKR 7,900 / mo',
      features: [
        '500 Automated AI Orders / month',
        '1 Official WhatsApp Business Number',
        'Groq openai/gpt-oss-20b Agent',
        'Urdu & Roman Urdu understanding',
        '2 Team seats',
        'Basic Inventory Tracking'
      ]
    },
    {
      id: 'PRO',
      name: 'Pro Tier',
      price: '$79 / mo',
      localPrice: 'PKR 21,500 / mo',
      popular: true,
      features: [
        '2,500 Automated AI Orders / month',
        '2 Official WhatsApp Numbers',
        'Groq openai/gpt-oss-20b High-Priority',
        'Instant Human Staff Handoff',
        'Atomic Stock Deductions & Alerts',
        '5 Team Member seats',
        'Live CRM & Customer History'
      ]
    },
    {
      id: 'BUSINESS',
      name: 'Business Enterprise',
      price: '$199 / mo',
      localPrice: 'PKR 54,000 / mo',
      features: [
        '10,000 Automated AI Orders / month',
        'Unlimited WhatsApp Numbers',
        'Dedicated Groq Token Rate Limits',
        'Unlimited Team Seats',
        'Custom POS & Webhook Integrations',
        '24/7 SLA Priority WhatsApp Support'
      ]
    }
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Subscription Plans & Usage</h1>
          <p className="text-sm text-slate-400 mt-1">
            Current subscription plan for {tenant.name}. Scalable as your WhatsApp order volume grows.
          </p>
        </div>
        <div className="text-right">
          <span className="text-xs text-slate-400">Current Active Plan</span>
          <p className="text-lg font-bold text-emerald-400 font-mono">{currentPlan}</p>
        </div>
      </div>

      {/* Usage Meter Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
        <h3 className="text-base font-bold text-white flex items-center space-x-2">
          <Zap className="w-5 h-5 text-amber-400" />
          <span>Current Billing Cycle Usage</span>
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2">
            <div className="flex justify-between text-xs text-slate-400">
              <span>AI Automated Orders</span>
              <span className="text-white font-bold font-mono">148 / 2,500</span>
            </div>
            <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
              <div className="bg-emerald-500 h-2 rounded-full w-[6%]" />
            </div>
            <p className="text-[10px] text-slate-500">Resets on 1st of next month</p>
          </div>

          <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2">
            <div className="flex justify-between text-xs text-slate-400">
              <span>Connected Phone Numbers</span>
              <span className="text-white font-bold font-mono">1 / 2 Active</span>
            </div>
            <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
              <div className="bg-blue-500 h-2 rounded-full w-[50%]" />
            </div>
            <p className="text-[10px] text-slate-500">1 spare line available</p>
          </div>

          <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2">
            <div className="flex justify-between text-xs text-slate-400">
              <span>Team Seats</span>
              <span className="text-white font-bold font-mono">2 / 5 Used</span>
            </div>
            <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
              <div className="bg-purple-500 h-2 rounded-full w-[40%]" />
            </div>
            <p className="text-[10px] text-slate-500">3 seats remaining</p>
          </div>
        </div>
      </div>

      {/* Plans Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {plans.map(p => {
          const isCurrent = p.id === currentPlan;
          return (
            <div
              key={p.id}
              className={`rounded-3xl p-6 flex flex-col justify-between transition-all ${
                isCurrent
                  ? 'bg-slate-850 border-2 border-emerald-500 shadow-xl shadow-emerald-950/30 relative'
                  : 'bg-slate-900 border border-slate-800 hover:border-slate-700'
              }`}
            >
              {p.popular && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-emerald-500 text-slate-950 font-bold text-[10px] uppercase px-3 py-0.5 rounded-full tracking-wider shadow">
                  Most Popular
                </span>
              )}

              <div>
                <h4 className="text-lg font-bold text-white mb-1">{p.name}</h4>
                <div className="mt-3 mb-4">
                  <span className="text-3xl font-extrabold text-white">{p.price}</span>
                  <span className="text-xs text-slate-400 block mt-0.5 font-mono">({p.localPrice})</span>
                </div>

                <div className="space-y-2.5 pt-4 border-t border-slate-800 text-xs text-slate-300">
                  {p.features.map((feat, idx) => (
                    <div key={idx} className="flex items-start space-x-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                      <span>{feat}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-8">
                {isCurrent ? (
                  <button
                    disabled
                    className="w-full py-2.5 rounded-xl bg-emerald-600/20 border border-emerald-500/40 text-emerald-400 font-bold text-xs cursor-default"
                  >
                    Current Active Plan
                  </button>
                ) : (
                  <button
                    onClick={() => onUpgradePlan(p.id)}
                    className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs transition-colors border border-slate-700"
                  >
                    Switch to {p.name}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
