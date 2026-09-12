import React, { useState } from 'react';
import {
  Bot,
  Sparkles,
  Sliders,
  Globe,
  BookOpen,
  ShieldCheck,
  CheckCircle2,
  Plus,
  Trash2,
  Save
} from 'lucide-react';
import { AgentSettings, AgentKnowledgeItem, Tenant } from '../types';

interface AiSettingsViewProps {
  tenant: Tenant;
  settings: AgentSettings;
  knowledgeItems: AgentKnowledgeItem[];
  onSaveSettings: (settings: Partial<AgentSettings>) => void;
  onAddKnowledge: (item: { title: string; content: string; category: string }) => void;
  onDeleteKnowledge: (id: string) => void;
  onOpenSimulator: () => void;
}

export const AiSettingsView: React.FC<AiSettingsViewProps> = ({
  tenant,
  settings,
  knowledgeItems,
  onSaveSettings,
  onAddKnowledge,
  onDeleteKnowledge,
  onOpenSimulator
}) => {
  const [model] = useState('openai/gpt-oss-20b'); // Mandatory requirement
  const [temperature, setTemperature] = useState(settings?.temperature ?? 0.3);
  const [primaryLang, setPrimaryLang] = useState(settings?.primaryLanguage ?? 'URDU_ROMAN');
  const [tone, setTone] = useState(settings?.tone ?? 'POLITE_WELCOMING');
  const [greeting, setGreeting] = useState(
    settings?.greetingMessage ??
      'Assalam-o-Alaikum! Welcome to our official WhatsApp store. Main aapki kya madad kar sakta hoon?'
  );
  const [customInstructions, setCustomInstructions] = useState(
    settings?.customInstructions ??
      'Be polite, friendly, and always confirm delivery address and item counts before finalizing any order.'
  );
  const [minOrder, setMinOrder] = useState(settings?.minOrderAmount ?? 300);
  const [isSaved, setIsSaved] = useState(false);

  // New FAQ form
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  const [newCategory, setNewCategory] = useState('general');

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveSettings({
      modelName: 'openai/gpt-oss-20b',
      temperature,
      primaryLanguage: primaryLang,
      tone,
      greetingMessage: greeting,
      customInstructions,
      minOrderAmount: Number(minOrder)
    });
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 3000);
  };

  const handleCreateFAQ = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newContent.trim()) return;
    onAddKnowledge({
      title: newTitle.trim(),
      content: newContent.trim(),
      category: newCategory
    });
    setNewTitle('');
    setNewContent('');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-2xl font-bold text-white tracking-tight">Groq AI Agent Configuration</h1>
            <span className="bg-emerald-500/10 text-emerald-400 text-xs font-semibold px-2.5 py-0.5 rounded-full border border-emerald-500/20">
              Groq API
            </span>
          </div>
          <p className="text-sm text-slate-400 mt-1">
            AI replies <span className="font-mono text-emerald-400">GROQ_API_KEY</span> se chalti hain, model{' '}
            <span className="text-emerald-400 font-mono">openai/gpt-oss-20b</span>. Meta token sirf WhatsApp send/receive ke liye hai.
          </p>
        </div>

        <button
          onClick={onOpenSimulator}
          className="flex items-center space-x-2 bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-xl text-sm font-semibold transition-all shadow-md shadow-emerald-950"
        >
          <Sparkles className="w-4 h-4" />
          <span>Launch AI Test Simulator</span>
        </button>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {/* Model & Temperature */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
          <h3 className="text-base font-bold text-white flex items-center space-x-2">
            <Bot className="w-5 h-5 text-emerald-400" />
            <span>LLM Engine & Reasoning Core</span>
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">
                Active Groq Model <span className="text-emerald-400">(Required Architecture)</span>
              </label>
              <div className="relative">
                <input
                  type="text"
                  disabled
                  value={model}
                  className="w-full bg-slate-950 border border-emerald-600/50 rounded-xl px-4 py-2.5 text-emerald-300 font-mono text-sm cursor-not-allowed"
                />
                <span className="absolute right-3 top-2.5 bg-emerald-900/60 text-emerald-400 text-[10px] font-bold px-2 py-0.5 rounded border border-emerald-500/40">
                  LOCKED: openai/gpt-oss-20b
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                Powered by Groq API key env <span className="font-mono text-emerald-400">GROQ_API_KEY</span>. Meta WhatsApp token is not used for AI.
              </p>
            </div>

            <div>
              <div className="flex justify-between text-xs font-semibold text-slate-400 mb-1">
                <span>Temperature (Creativity vs Determinism)</span>
                <span className="text-white font-mono">{temperature}</span>
              </div>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={temperature}
                onChange={e => setTemperature(parseFloat(e.target.value))}
                className="w-full accent-emerald-500 bg-slate-800 cursor-pointer mt-2"
              />
              <div className="flex justify-between text-[10px] text-slate-500 mt-1">
                <span>0.0 (Strict transactional)</span>
                <span>0.3 (Recommended)</span>
                <span>1.0 (Creative)</span>
              </div>
            </div>
          </div>
        </div>

        {/* Persona, Language & Tone */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
          <h3 className="text-base font-bold text-white flex items-center space-x-2">
            <Globe className="w-5 h-5 text-blue-400" />
            <span>Language & Persona</span>
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">Primary Dialogue Language</label>
              <select
                value={primaryLang}
                onChange={e => setPrimaryLang(e.target.value as any)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
              >
                <option value="URDU_ROMAN">Roman Urdu (e.g., "Aapka order confirm hogya")</option>
                <option value="URDU_SCRIPT">Urdu Script (اردو)</option>
                <option value="ENGLISH">English (Formal / Professional)</option>
                <option value="BILINGUAL">Bilingual (Auto-detect user language)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">Brand Voice & Tone</label>
              <select
                value={tone}
                onChange={e => setTone(e.target.value as any)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
              >
                <option value="POLITE_WELCOMING">Polite & Warm ("Ji bilkul, bohot shukriya")</option>
                <option value="PROFESSIONAL_CONCISE">Professional & Concise (Fast checkout)</option>
                <option value="ENERGETIC">Energetic & Enthusiastic ("Zabardast choice!")</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1">Custom WhatsApp Greeting</label>
            <textarea
              rows={2}
              value={greeting}
              onChange={e => setGreeting(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1">System Instructions & Guardrails</label>
            <textarea
              rows={3}
              value={customInstructions}
              onChange={e => setCustomInstructions(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500 font-mono text-xs"
            />
          </div>
        </div>

        {/* Business Confirmation Rules */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
          <h3 className="text-base font-bold text-white flex items-center space-x-2">
            <ShieldCheck className="w-5 h-5 text-emerald-400" />
            <span>Safety Guardrails & Order Rules</span>
          </h3>

          <div className="bg-emerald-950/30 border border-emerald-800/40 rounded-xl p-4 text-xs space-y-2 text-slate-300">
            <div className="flex items-center space-x-2 text-emerald-400 font-semibold">
              <CheckCircle2 className="w-4 h-4" />
              <span>Mandatory Customer Confirmation Enforced</span>
            </div>
            <p className="leading-relaxed">
              The AI agent is structurally prohibited from invoking the <code className="bg-slate-950 px-1.5 py-0.5 rounded text-emerald-400 font-mono">create_order</code> tool
              until the customer has explicitly answered "Yes", "Haan", "Confirm", or given direct affirmative consent to the order summary, total price, and delivery location.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="block font-semibold text-slate-400 mb-1">Minimum Order Value ({tenant.currency})</label>
              <input
                type="number"
                value={minOrder}
                onChange={e => setMinOrder(Number(e.target.value))}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            {isSaved && (
              <span className="flex items-center text-xs font-semibold text-emerald-400 bg-emerald-950/60 px-3 py-1 rounded-lg border border-emerald-800">
                <CheckCircle2 className="w-4 h-4 mr-1.5" /> Settings saved successfully!
              </span>
            )}
          </div>
          <button
            type="submit"
            className="flex items-center space-x-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold px-6 py-2.5 rounded-xl transition-all shadow-md shadow-emerald-950"
          >
            <Save className="w-4 h-4" />
            <span>Save AI Agent Settings</span>
          </button>
        </div>
      </form>

      {/* Store Knowledge Base / FAQs */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-white flex items-center space-x-2">
              <BookOpen className="w-5 h-5 text-amber-400" />
              <span>Store Knowledge Base (FAQs)</span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Domain information the AI references to answer customer inquiries on WhatsApp.
            </p>
          </div>
        </div>

        {/* Existing FAQ items */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {knowledgeItems.length === 0 ? (
            <p className="text-xs text-slate-500 col-span-2">No knowledge base items yet.</p>
          ) : (
            knowledgeItems.map(item => (
              <div key={item.id} className="p-3.5 bg-slate-800/60 rounded-xl border border-slate-700/60 text-xs flex justify-between items-start">
                <div>
                  <span className="text-[10px] uppercase font-bold text-amber-400 tracking-wider block mb-1">
                    {item.category}
                  </span>
                  <p className="font-semibold text-white">{item.title}</p>
                  <p className="text-slate-300 mt-1 leading-relaxed">{item.content}</p>
                </div>
                <button
                  onClick={() => onDeleteKnowledge(item.id)}
                  className="text-slate-500 hover:text-rose-400 ml-2"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))
          )}
        </div>

        {/* Add Knowledge Item Form */}
        <form onSubmit={handleCreateFAQ} className="pt-4 border-t border-slate-800 space-y-3 text-xs">
          <h4 className="font-semibold text-white">Add Knowledge Article / FAQ</h4>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-slate-400 mb-1">Question / Title</label>
              <input
                type="text"
                required
                placeholder="e.g. Do you deliver to Gulberg Lahore?"
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
              />
            </div>
            <div>
              <label className="block text-slate-400 mb-1">Category</label>
              <select
                value={newCategory}
                onChange={e => setNewCategory(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
              >
                <option value="delivery">Delivery</option>
                <option value="halal">Certification / Halal</option>
                <option value="hours">Hours & Location</option>
                <option value="payment">Payment & Refunds</option>
                <option value="general">General</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-slate-400 mb-1">Answer / Content</label>
            <textarea
              rows={2}
              required
              placeholder="e.g. Yes, we deliver to Gulberg, DHA, and Model Town within 40 minutes."
              value={newContent}
              onChange={e => setNewContent(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
            />
          </div>
          <button
            type="submit"
            className="flex items-center space-x-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-semibold px-4 py-2 rounded-xl transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Add to Knowledge Base</span>
          </button>
        </form>
      </div>
    </div>
  );
};
