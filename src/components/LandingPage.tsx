import React from 'react';
import {
  MessageSquare,
  Sparkles,
  Zap,
  ShieldCheck,
  Smartphone,
  TrendingUp,
  CheckCircle2,
  Clock,
  ArrowRight,
  Bot,
  Users,
  Building2
} from 'lucide-react';

interface LandingPageProps {
  onEnterDashboard: () => void;
  onOpenSimulator: () => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({ onEnterDashboard, onOpenSimulator }) => {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Header Bar */}
      <header className="border-b border-slate-800 bg-slate-900/80 sticky top-0 z-30 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-600 flex items-center justify-center text-white shadow-lg shadow-emerald-900/40">
              <MessageSquare className="w-6 h-6" />
            </div>
            <div>
              <span className="font-bold text-lg text-white">WhatsApp OrderDesk</span>
              <p className="text-[10px] text-emerald-400 font-mono">Powered by Groq openai/gpt-oss-20b</p>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            <button
              onClick={onOpenSimulator}
              className="text-xs text-slate-300 hover:text-white px-3 py-1.5 rounded-lg hover:bg-slate-800 transition-colors"
            >
              Test AI Simulator
            </button>
            <button
              onClick={onEnterDashboard}
              className="text-xs text-slate-300 hover:text-white px-3 py-1.5 rounded-lg hover:bg-slate-800 transition-colors"
            >
              Login
            </button>
            <button
              onClick={onEnterDashboard}
              className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold px-4 py-2 rounded-xl transition-all shadow-md shadow-emerald-950 flex items-center space-x-1.5"
            >
              <span>Sign up / Open store</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="py-16 md:py-24 px-4 text-center max-w-4xl mx-auto space-y-6">
        <div className="inline-flex items-center space-x-2 bg-emerald-950/60 border border-emerald-800/80 px-3 py-1 rounded-full text-xs text-emerald-300">
          <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
          <span>Next-Gen WhatsApp Order Automation for Restaurants & Retail</span>
        </div>

        <h1 className="text-4xl sm:text-6xl font-extrabold text-white tracking-tight leading-tight">
          Turn WhatsApp Into an <br className="hidden sm:inline" />
          <span className="text-emerald-400 bg-clip-text text-transparent bg-gradient-to-r from-emerald-400 to-teal-300">
            Automated 24/7 Cash Register
          </span>
        </h1>

        <p className="text-base sm:text-lg text-slate-400 max-w-2xl mx-auto leading-relaxed">
          Stop losing orders to delayed replies. OrderDesk connects your official WhatsApp Business number
          to an ultra-fast Groq AI agent that understands English, Urdu, and Roman Urdu, checks live inventory,
          and collects confirmed orders atomically.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-4">
          <button
            onClick={onEnterDashboard}
            className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-6 py-3 rounded-xl transition-all shadow-lg shadow-emerald-950 flex items-center justify-center space-x-2 text-sm"
          >
            <span>Start Free 14-Day Trial</span>
            <ArrowRight className="w-4 h-4" />
          </button>
          <button
            onClick={onOpenSimulator}
            className="w-full sm:w-auto bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-semibold px-6 py-3 rounded-xl transition-colors text-sm flex items-center justify-center space-x-2"
          >
            <Bot className="w-4 h-4 text-emerald-400" />
            <span>Simulate Customer Chat</span>
          </button>
        </div>

        <div className="pt-6 flex items-center justify-center space-x-6 text-xs text-slate-400">
          <span className="flex items-center"><CheckCircle2 className="w-4 h-4 text-emerald-400 mr-1.5" /> No credit card needed</span>
          <span className="flex items-center"><CheckCircle2 className="w-4 h-4 text-emerald-400 mr-1.5" /> Official Meta Cloud API</span>
          <span className="flex items-center"><CheckCircle2 className="w-4 h-4 text-emerald-400 mr-1.5" /> Zero data cross-leakage</span>
        </div>
      </section>

      {/* Real-world Urdu Dialogue Showcase */}
      <section className="py-12 px-4 max-w-5xl mx-auto w-full">
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl">
          <div className="text-center max-w-xl mx-auto mb-8">
            <h2 className="text-xl sm:text-2xl font-bold text-white">Full Urdu & Roman Urdu Fluency</h2>
            <p className="text-xs text-slate-400 mt-1">
              Engineered with Groq's high-speed <code className="text-emerald-400 font-mono">openai/gpt-oss-20b</code> model to grasp local nuances, slang, and order variations.
            </p>
          </div>

          <div className="max-w-md mx-auto bg-slate-950 rounded-2xl border border-slate-800 p-4 space-y-3 font-sans text-xs shadow-inner">
            <div className="flex justify-end">
              <div className="bg-emerald-700 text-white rounded-2xl rounded-tr-none px-3.5 py-2 max-w-[80%] shadow">
                <p>Assalam o alaikum bhai, 2 zinger burger chahiye DHA Phase 5 me delivery hojayegi?</p>
              </div>
            </div>

            <div className="flex justify-start">
              <div className="bg-slate-800 text-slate-100 rounded-2xl rounded-tl-none px-3.5 py-2 max-w-[85%] border border-slate-700/60 shadow">
                <p>Walaikum Assalam! Ji bilkul, DHA Phase 5 me deliver hojayega 🛵</p>
                <div className="my-1.5 p-2 bg-slate-900/80 rounded-lg border border-slate-800 font-mono text-[11px]">
                  <p>• 2x Crispy Zinger Burger: Rs. 1,100</p>
                  <p>• Delivery fee: Rs. 150</p>
                  <p className="text-emerald-400 font-bold mt-0.5">Kul Total: Rs. 1,250</p>
                </div>
                <p>Kya main aapka order confirm kardon? Please apna contact number aur complete address verify karden.</p>
              </div>
            </div>

            <div className="flex justify-end">
              <div className="bg-emerald-700 text-white rounded-2xl rounded-tr-none px-3.5 py-2 max-w-[80%] shadow">
                <p>Haan bilkul confirm kardo! House 12, Street 4, Sector G.</p>
              </div>
            </div>

            <div className="flex justify-start">
              <div className="bg-slate-800 text-slate-100 rounded-2xl rounded-tl-none px-3.5 py-2 max-w-[85%] border border-slate-700/60 shadow">
                <p className="text-emerald-400 font-bold">Zabardast! Aapka order #ORD-2026-9041 confirm ho chuka hai! 🎉</p>
                <p className="text-slate-300 mt-1">Kitchen me tayyari shuru ho chuki hai. Rider 30-40 minutes me pohanch jayega.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Feature Grid */}
      <section className="py-16 px-4 max-w-7xl mx-auto">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <h2 className="text-2xl sm:text-3xl font-bold text-white">Engineered for Multi-Tenant Reliability</h2>
          <p className="text-sm text-slate-400 mt-2">
            Every business has isolated catalogs, orders, customers, and official WhatsApp numbers.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/15 text-emerald-400 flex items-center justify-center">
              <Building2 className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-white">Multi-Tenant Architecture</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Strict database isolation with PostgreSQL Row-Level Security. Tenancy is resolved dynamically via Meta Phone Number IDs.
            </p>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/15 text-blue-400 flex items-center justify-center">
              <Zap className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-white">Atomic Order Transactions</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Stored procedures verify and deduct stock synchronously. Zero overselling, zero race conditions, and automatic rollback on cancel.
            </p>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-3">
            <div className="w-10 h-10 rounded-xl bg-purple-500/15 text-purple-400 flex items-center justify-center">
              <Users className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-white">Seamless Human Handoff</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              When a customer has a dispute or asks for human staff, the AI pauses automatically, notifies staff, and enables live web replies.
            </p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="mt-auto border-t border-slate-800 py-8 text-center text-xs text-slate-500">
        <p>© 2026 WhatsApp OrderDesk SaaS. All rights reserved. Meta WhatsApp Cloud API Partner Architecture.</p>
      </footer>
    </div>
  );
};
