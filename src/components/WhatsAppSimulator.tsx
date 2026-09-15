import React, { useState } from 'react';
import {
  Smartphone,
  Send,
  Sparkles,
  Bot,
  User,
  CheckCheck,
  RefreshCw,
  Zap,
  ShieldCheck,
  Code2,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { Tenant } from '../types';
import { authHeaders } from '../authSession';

interface WhatsAppSimulatorProps {
  tenant: Tenant;
  greeting?: string;
  onRefreshData: () => void;
}

interface SimMessage {
  id: string;
  sender: 'CUSTOMER' | 'AI';
  text: string;
  timestamp: string;
}

export const WhatsAppSimulator: React.FC<WhatsAppSimulatorProps> = ({ tenant, greeting, onRefreshData }) => {
  const [customerPhone, setCustomerPhone] = useState('+92 333 7788990');
  const [customerName, setCustomerName] = useState('Kamran Tariq');
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [messages, setMessages] = useState<SimMessage[]>([
    {
      id: 'init_1',
      sender: 'AI',
      text: `Wa Alaikum Assalam! Ji, batayein ${tenant.name} se kya lena hai?`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
  ]);
  const [lastApiLog, setLastApiLog] = useState<any>(null);
  const [showLogs, setShowLogs] = useState(false);

  const presets = [
    { label: 'Salam', text: 'Assalamualaikum' },
    { label: 'Product', text: 'M10 earbuds chahiye' },
    { label: 'Quantity', text: '2 chahiyein' },
    { label: 'Address', text: 'Kashmir Block, Allama Iqbal Town, Lahore' },
    { label: 'Confirm', text: 'haan' }
  ];

  const handleSendMessage = async (msgToSend?: string) => {
    const text = (msgToSend || inputMessage).trim();
    if (!text || isLoading) return;

    const userMsg: SimMessage = {
      id: `msg_u_${Date.now()}`,
      sender: 'CUSTOMER',
      text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setMessages(prev => [...prev, userMsg]);
    setInputMessage('');
    setIsLoading(true);

    try {
      const res = await fetch('/api/ai/simulate', {
        method: 'POST',
        headers: authHeaders(tenant.id),
        body: JSON.stringify({
          message: text,
          customerPhone,
          customerName,
          businessName: tenant.name,
          greeting
        })
      });

      const raw = await res.text();
      let data: any = {};
      try {
        data = JSON.parse(raw);
      } catch {
        throw new Error(raw.slice(0, 120) || 'Invalid AI response');
      }
      setLastApiLog(data);

      if (!res.ok) {
        throw new Error(data.error || `AI HTTP ${res.status}`);
      }

      const aiReply: SimMessage = {
        id: `msg_a_${Date.now()}`,
        sender: 'AI',
        text: data.aiResponse || data.error || 'Aapka order desk update ho gaya hai.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };

      setMessages(prev => [...prev, aiReply]);
      onRefreshData();
    } catch (err: any) {
      const errMsg: SimMessage = {
        id: `msg_err_${Date.now()}`,
        sender: 'AI',
        text: err?.message
          ? `AI error: ${String(err.message).slice(0, 180)}`
          : 'Error connecting to AI service. Please try again.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      setMessages(prev => [...prev, errMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClear = () => {
    setMessages([
      {
        id: `init_${Date.now()}`,
        sender: 'AI',
        text: `Wa Alaikum Assalam! Ji, batayein.`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }
    ]);
    setLastApiLog(null);
  };

  return (
    <div className="space-y-6">
      {/* Header Info */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-2xl font-bold text-white tracking-tight">WhatsApp AI Simulator</h1>
            <span className="bg-emerald-500/20 text-emerald-400 font-mono text-xs font-semibold px-2.5 py-0.5 rounded-full border border-emerald-500/30">
              openai/gpt-oss-20b
            </span>
          </div>
          <p className="text-sm text-slate-400 mt-1">
            Test customer interactions directly against the active tenant database ({tenant.name}).
            Simulates incoming webhooks, tool calls, and order creation.
          </p>
        </div>

        <button
          onClick={handleClear}
          className="flex items-center space-x-2 text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 px-3.5 py-2 rounded-xl transition-colors border border-slate-700"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Reset Simulator</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 1 Col: Test Parameters & Preset Prompts */}
        <div className="space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
            <h3 className="text-sm font-bold text-white flex items-center space-x-2">
              <User className="w-4 h-4 text-emerald-400" />
              <span>Simulated WhatsApp Customer</span>
            </h3>

            <div>
              <label className="text-xs font-medium text-slate-400 block mb-1">Customer Phone Number</label>
              <input
                type="text"
                value={customerPhone}
                onChange={e => setCustomerPhone(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-emerald-500"
              />
              <span className="text-[10px] text-slate-500 mt-1 block">
                Scoped strictly to {tenant.name}. Isolated from other tenants.
              </span>
            </div>

            <div>
              <label className="text-xs font-medium text-slate-400 block mb-1">Customer Name</label>
              <input
                type="text"
                value={customerName}
                onChange={e => setCustomerName(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          {/* Quick Presets */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
            <h3 className="text-sm font-bold text-white mb-2 flex items-center space-x-2">
              <Zap className="w-4 h-4 text-amber-400" />
              <span>Instant Test Scenarios</span>
            </h3>
            <p className="text-xs text-slate-400 mb-3">Click any scenario to simulate customer message:</p>
            <div className="space-y-2">
              {presets.map((preset, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSendMessage(preset.text)}
                  disabled={isLoading}
                  className="w-full text-left p-2.5 rounded-xl bg-slate-800/60 hover:bg-slate-800 border border-slate-700/60 text-xs transition-colors group"
                >
                  <span className="font-semibold text-emerald-400 block mb-0.5">{preset.label}</span>
                  <span className="text-slate-300 group-hover:text-white leading-relaxed">{preset.text}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right 2 Cols: WhatsApp Phone Frame Screen */}
        <div className="lg:col-span-2 flex flex-col h-[650px] bg-slate-950 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl">
          {/* WhatsApp Header bar */}
          <div className="h-16 px-4 bg-emerald-800 text-white flex items-center justify-between shadow-md">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-full bg-emerald-900 border border-emerald-700 flex items-center justify-center font-bold text-sm">
                OD
              </div>
              <div>
                <div className="flex items-center space-x-1.5">
                  <h4 className="font-bold text-sm tracking-tight">{tenant.name}</h4>
                  <ShieldCheck className="w-4 h-4 text-emerald-300" />
                </div>
                <p className="text-[11px] text-emerald-200">Official WhatsApp Business Account</p>
              </div>
            </div>

            <span className="bg-emerald-900/60 text-[10px] font-semibold px-2 py-0.5 rounded-full border border-emerald-600/40">
              Live Groq Model
            </span>
          </div>

          {/* Chat Messages Body */}
          <div className="flex-1 p-4 overflow-y-auto space-y-3 bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:16px_16px]">
            <div className="text-center my-1">
              <span className="bg-slate-900/90 text-slate-400 text-[10px] px-3 py-1 rounded-full border border-slate-800">
                🔒 Messages are end-to-end encrypted via WhatsApp Cloud API
              </span>
            </div>

            {messages.map(msg => {
              const isUser = msg.sender === 'CUSTOMER';
              return (
                <div key={msg.id} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[80%] rounded-2xl px-4 py-2.5 shadow-md text-sm ${
                      isUser
                        ? 'bg-emerald-700 text-white rounded-tr-none'
                        : 'bg-slate-800 text-slate-100 rounded-tl-none border border-slate-700/60'
                    }`}
                  >
                    <div className="flex items-center justify-between text-[10px] opacity-75 mb-1 space-x-2">
                      <span className="font-bold uppercase tracking-wider">
                        {isUser ? customerName : `${tenant.name} AI`}
                      </span>
                      <span>{msg.timestamp}</span>
                    </div>

                    <p className="whitespace-pre-wrap leading-relaxed">{msg.text}</p>

                    {isUser && (
                      <div className="flex justify-end mt-1">
                        <CheckCheck className="w-3.5 h-3.5 text-emerald-200" />
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-slate-800 border border-slate-700 rounded-2xl rounded-tl-none px-4 py-3 flex items-center space-x-2 text-xs text-emerald-400">
                  <div className="w-2 h-2 rounded-full bg-emerald-400 animate-bounce" />
                  <div className="w-2 h-2 rounded-full bg-emerald-400 animate-bounce [animation-delay:0.2s]" />
                  <div className="w-2 h-2 rounded-full bg-emerald-400 animate-bounce [animation-delay:0.4s]" />
                  <span className="text-slate-400 ml-1">Groq openai/gpt-oss-20b reasoning...</span>
                </div>
              </div>
            )}
          </div>

          {/* Chat Input Bar */}
          <form
            onSubmit={e => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="p-3 bg-slate-900 border-t border-slate-800 flex items-center space-x-2"
          >
            <input
              type="text"
              placeholder="Type message in English, Urdu, or Roman Urdu..."
              value={inputMessage}
              onChange={e => setInputMessage(e.target.value)}
              disabled={isLoading}
              className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-400 focus:outline-none focus:border-emerald-500"
            />
            <button
              type="submit"
              disabled={isLoading || !inputMessage.trim()}
              className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white p-2.5 rounded-xl transition-colors shadow-md shadow-emerald-950"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>

          {/* Expandable Debug / Tool Calling Drawer */}
          {lastApiLog && (
            <div className="bg-slate-900/95 border-t border-slate-800 p-3">
              <button
                onClick={() => setShowLogs(!showLogs)}
                className="w-full flex items-center justify-between text-xs text-slate-400 hover:text-white"
              >
                <div className="flex items-center space-x-2">
                  <Code2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Execution & Tool Calling Telemetry</span>
                  {lastApiLog.isHandoff && (
                    <span className="bg-amber-500/20 text-amber-400 text-[10px] px-1.5 py-0.2 rounded">
                      Human Handoff Triggered
                    </span>
                  )}
                </div>
                {showLogs ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
              </button>

              {showLogs && (
                <div className="mt-2 text-[11px] font-mono bg-slate-950 p-2.5 rounded-xl text-slate-300 max-h-36 overflow-y-auto border border-slate-800">
                  <pre>{JSON.stringify(lastApiLog, null, 2)}</pre>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
