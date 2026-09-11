import React, { useState } from 'react';
import {
  CheckCircle2,
  ChevronRight,
  ChevronLeft,
  Building2,
  Smartphone,
  Package,
  Bot,
  Send,
  Sparkles,
  X
} from 'lucide-react';
import { Tenant } from '../types';

interface OnboardingModalProps {
  tenant: Tenant;
  isOpen: boolean;
  onClose: () => void;
  onComplete: () => void;
}

export const OnboardingModal: React.FC<OnboardingModalProps> = ({
  tenant,
  isOpen,
  onClose,
  onComplete
}) => {
  const [step, setStep] = useState(1);

  if (!isOpen) return null;

  const totalSteps = 6;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-xl w-full p-6 sm:p-8 shadow-2xl space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800">
                Step {step} of {totalSteps}
              </span>
              <h2 className="text-base font-bold text-white">Merchant Setup Wizard</h2>
            </div>
            <p className="text-xs text-slate-400 mt-1">Get your store ready for automated WhatsApp orders</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Wizard Steps Content */}
        <div className="py-2 text-xs text-slate-300">
          {step === 1 && (
            <div className="space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/15 text-emerald-400 flex items-center justify-center mb-2">
                <Building2 className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-bold text-white">1. Verify Business Profile & Currency</h3>
              <p className="text-slate-400 leading-relaxed">
                Your tenant <strong className="text-white">{tenant.name}</strong> is configured as a{' '}
                <strong className="text-white">{tenant.businessType}</strong> using currency{' '}
                <strong className="text-emerald-400 font-mono">{tenant.currency}</strong>.
              </p>
              <div className="p-3 bg-slate-800/60 rounded-xl border border-slate-700/60 space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-400">Business Name:</span>
                  <span className="font-semibold text-white">{tenant.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Tenant Slug:</span>
                  <span className="font-mono text-emerald-400">{tenant.slug}</span>
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-blue-500/15 text-blue-400 flex items-center justify-center mb-2">
                <Smartphone className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-bold text-white">2. WhatsApp Business Account Connection</h3>
              <p className="text-slate-400 leading-relaxed">
                OrderDesk uses Meta WhatsApp Cloud API. A WhatsApp Business Account (WABA) and official phone number
                have been linked to this tenant with active Webhook subscriptions.
              </p>
              <div className="p-3 bg-slate-800/60 rounded-xl border border-slate-700/60 text-emerald-400 flex items-center space-x-2 font-semibold">
                <CheckCircle2 className="w-4 h-4" />
                <span>Connected & Verified with Meta</span>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/15 text-amber-400 flex items-center justify-center mb-2">
                <Package className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-bold text-white">3. Product Catalog Pre-loaded</h3>
              <p className="text-slate-400 leading-relaxed">
                We have populated your tenant with initial starter products and live stock inventory so you can test
                real transactions immediately.
              </p>
              <div className="p-3 bg-slate-800/60 rounded-xl border border-slate-700/60 text-slate-300">
                ✅ Live stock inventory tracking is enabled with atomic deductions.
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-purple-500/15 text-purple-400 flex items-center justify-center mb-2">
                <Bot className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-bold text-white">4. Groq AI Agent Active</h3>
              <p className="text-slate-400 leading-relaxed">
                Your AI agent is running on <code className="text-emerald-400 font-mono">openai/gpt-oss-20b</code> with
                multi-lingual Roman Urdu and Urdu understanding.
              </p>
              <div className="p-3 bg-slate-800/60 rounded-xl border border-slate-700/60 text-slate-300">
                ✅ Strict safety rule enforced: The agent will never confirm orders without affirmative customer consent.
              </div>
            </div>
          )}

          {step === 5 && (
            <div className="space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/15 text-emerald-400 flex items-center justify-center mb-2">
                <Send className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-bold text-white">5. Interactive Simulator Ready</h3>
              <p className="text-slate-400 leading-relaxed">
                You don't need to spend WhatsApp Meta messaging fees during development. Use the built-in
                <strong> WhatsApp AI Simulator</strong> to test conversations and order creation as a customer!
              </p>
            </div>
          )}

          {step === 6 && (
            <div className="space-y-3 text-center py-4">
              <div className="w-16 h-16 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto mb-3 border border-emerald-500/30">
                <Sparkles className="w-8 h-8" />
              </div>
              <h3 className="text-base font-bold text-white">You're All Set!</h3>
              <p className="text-slate-400 max-w-sm mx-auto">
                {tenant.name} is configured and ready to automate WhatsApp orders.
              </p>
            </div>
          )}
        </div>

        {/* Footer controls */}
        <div className="flex items-center justify-between pt-4 border-t border-slate-800">
          {step > 1 ? (
            <button
              onClick={() => setStep(s => s - 1)}
              className="flex items-center space-x-1.5 text-xs text-slate-400 hover:text-white px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Back</span>
            </button>
          ) : (
            <div />
          )}

          {step < totalSteps ? (
            <button
              onClick={() => setStep(s => s + 1)}
              className="flex items-center space-x-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs px-4 py-2 rounded-xl shadow-md shadow-emerald-950"
            >
              <span>Next Step</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={() => {
                onComplete();
                onClose();
              }}
              className="flex items-center space-x-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs px-6 py-2.5 rounded-xl shadow-lg shadow-emerald-950"
            >
              <span>Enter OrderDesk</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
