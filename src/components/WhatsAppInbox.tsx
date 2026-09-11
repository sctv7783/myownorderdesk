import React, { useState } from 'react';
import {
  Search,
  Bot,
  User,
  Send,
  CheckCheck,
  Phone,
  Calendar,
  DollarSign,
  Package,
  Sparkles,
  UserCheck,
  RotateCcw,
  Shield,
  MessageCircle,
  Tag
} from 'lucide-react';
import { Conversation, ConversationMessage, Customer, Order, Tenant } from '../types';

interface WhatsAppInboxProps {
  tenant: Tenant;
  conversations: Conversation[];
  selectedConvId: string | null;
  onSelectConversation: (id: string) => void;
  messages: ConversationMessage[];
  currentCustomer: Customer | null;
  customerOrders: Order[];
  onSendMessage: (text: string) => void;
  onToggleMode: (newStatus: Conversation['status']) => void;
  isSending: boolean;
}

export const WhatsAppInbox: React.FC<WhatsAppInboxProps> = ({
  tenant,
  conversations,
  selectedConvId,
  onSelectConversation,
  messages,
  currentCustomer,
  customerOrders,
  onSendMessage,
  onToggleMode,
  isSending
}) => {
  const [filter, setFilter] = useState<'ALL' | 'AI_ACTIVE' | 'HUMAN_ACTIVE'>('ALL');
  const [search, setSearch] = useState('');
  const [replyText, setReplyText] = useState('');

  const selectedConv = conversations.find(c => c.id === selectedConvId) || conversations[0];

  const filteredConversations = conversations.filter(c => {
    if (filter === 'AI_ACTIVE' && c.status !== 'AI_ACTIVE') return false;
    if (filter === 'HUMAN_ACTIVE' && c.status !== 'HUMAN_ACTIVE') return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        c.customerName.toLowerCase().includes(q) ||
        c.customerPhone.includes(q) ||
        c.lastMessageText.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyText.trim() || isSending) return;
    onSendMessage(replyText.trim());
    setReplyText('');
  };

  return (
    <div className="h-[calc(100vh-8.5rem)] bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl flex">
      {/* LEFT COLUMN: Conversation List */}
      <div className="w-80 border-r border-slate-800 flex flex-col bg-slate-900/90 shrink-0">
        <div className="p-3 border-b border-slate-800">
          <div className="relative mb-2">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search chat or phone..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700/80 rounded-xl pl-9 pr-3 py-1.5 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div className="flex space-x-1">
            <button
              onClick={() => setFilter('ALL')}
              className={`flex-1 py-1 text-[11px] font-semibold rounded-lg transition-colors ${
                filter === 'ALL' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              All ({conversations.length})
            </button>
            <button
              onClick={() => setFilter('AI_ACTIVE')}
              className={`flex-1 py-1 text-[11px] font-semibold rounded-lg transition-colors ${
                filter === 'AI_ACTIVE' ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/60' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              AI Active
            </button>
            <button
              onClick={() => setFilter('HUMAN_ACTIVE')}
              className={`flex-1 py-1 text-[11px] font-semibold rounded-lg transition-colors ${
                filter === 'HUMAN_ACTIVE' ? 'bg-amber-950/60 text-amber-400 border border-amber-800/60' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Human Staff
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-slate-800/50">
          {filteredConversations.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-500">No conversations match your filter</div>
          ) : (
            filteredConversations.map(conv => {
              const isSelected = selectedConv?.id === conv.id;
              return (
                <div
                  key={conv.id}
                  onClick={() => onSelectConversation(conv.id)}
                  className={`p-3 cursor-pointer transition-colors ${
                    isSelected ? 'bg-slate-800/90 border-l-4 border-emerald-500' : 'hover:bg-slate-800/40'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold text-xs text-white truncate max-w-[150px]">{conv.customerName}</span>
                    <span className="text-[10px] text-slate-400">
                      {new Date(conv.lastMessageAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>

                  <p className="text-xs text-slate-300 truncate mb-1.5">{conv.lastMessageText || 'Chat started'}</p>

                  <div className="flex items-center justify-between">
                    <span
                      className={`text-[9px] font-bold px-1.5 py-0.5 rounded flex items-center space-x-1 ${
                        conv.status === 'AI_ACTIVE'
                          ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                          : 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                      }`}
                    >
                      {conv.status === 'AI_ACTIVE' ? <Bot className="w-2.5 h-2.5 mr-0.5 inline" /> : <User className="w-2.5 h-2.5 mr-0.5 inline" />}
                      <span>{conv.status === 'AI_ACTIVE' ? 'Groq AI' : 'Human Staff'}</span>
                    </span>

                    <span className="text-[10px] font-mono text-slate-400">{conv.customerPhone}</span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* CENTER COLUMN: WhatsApp Chat Window */}
      {selectedConv ? (
        <div className="flex-1 flex flex-col bg-slate-950">
          {/* Header */}
          <div className="h-14 px-4 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-9 h-9 rounded-full bg-slate-700 flex items-center justify-center font-bold text-xs text-white">
                {selectedConv.customerName.slice(0, 2).toUpperCase()}
              </div>
              <div>
                <h3 className="text-sm font-bold text-white flex items-center space-x-2">
                  <span>{selectedConv.customerName}</span>
                  <span className="text-xs font-mono font-normal text-slate-400">({selectedConv.customerPhone})</span>
                </h3>
                <p className="text-[11px] text-emerald-400 flex items-center">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mr-1.5" />
                  Meta WhatsApp Cloud API Connected
                </p>
              </div>
            </div>

            {/* Mode Toggle Controls */}
            <div className="flex items-center space-x-2">
              {selectedConv.status === 'AI_ACTIVE' ? (
                <button
                  onClick={() => onToggleMode('HUMAN_ACTIVE')}
                  className="flex items-center space-x-1.5 bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 border border-amber-500/40 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
                >
                  <UserCheck className="w-3.5 h-3.5" />
                  <span>Take Over (Handoff to Human)</span>
                </button>
              ) : (
                <button
                  onClick={() => onToggleMode('AI_ACTIVE')}
                  className="flex items-center space-x-1.5 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/40 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Resume Groq AI Agent</span>
                </button>
              )}
            </div>
          </div>

          {/* Messages Feed */}
          <div className="flex-1 p-4 overflow-y-auto space-y-3 bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:16px_16px]">
            {/* Banner for Mode status */}
            <div className="text-center my-2">
              <span className={`inline-flex items-center space-x-1.5 px-3 py-1 rounded-full text-[11px] font-medium border ${
                selectedConv.status === 'AI_ACTIVE'
                  ? 'bg-emerald-950/60 text-emerald-300 border-emerald-800'
                  : 'bg-amber-950/60 text-amber-300 border-amber-800'
              }`}>
                {selectedConv.status === 'AI_ACTIVE' ? (
                  <>
                    <Sparkles className="w-3 h-3 text-emerald-400" />
                    <span>AI Agent Active (Model: {tenant.businessType} Groq openai/gpt-oss-20b)</span>
                  </>
                ) : (
                  <>
                    <User className="w-3 h-3 text-amber-400" />
                    <span>Human Mode Active — AI auto-replies are paused</span>
                  </>
                )}
              </span>
            </div>

            {messages.map(msg => {
              const isCustomer = msg.sender === 'CUSTOMER';
              return (
                <div
                  key={msg.id}
                  className={`flex ${isCustomer ? 'justify-start' : 'justify-end'}`}
                >
                  <div
                    className={`max-w-[75%] rounded-2xl px-4 py-2.5 shadow-md text-sm ${
                      isCustomer
                        ? 'bg-slate-800 text-slate-100 rounded-tl-none border border-slate-700/60'
                        : msg.sender === 'AI'
                        ? 'bg-emerald-800/90 text-white rounded-tr-none border border-emerald-700'
                        : 'bg-blue-700 text-white rounded-tr-none border border-blue-600'
                    }`}
                  >
                    <div className="flex items-center justify-between text-[10px] opacity-75 mb-1 space-x-2">
                      <span className="font-bold uppercase tracking-wider">
                        {msg.sender === 'CUSTOMER' ? selectedConv.customerName : msg.sender === 'AI' ? 'Groq AI Agent' : 'Staff Reply'}
                      </span>
                      <span>{new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>

                    <p className="whitespace-pre-wrap leading-relaxed">{msg.text}</p>

                    {!isCustomer && (
                      <div className="flex justify-end mt-1">
                        <CheckCheck className="w-3.5 h-3.5 text-emerald-300 opacity-90" />
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Input Box */}
          <form onSubmit={handleSend} className="p-3 bg-slate-900 border-t border-slate-800 flex items-center space-x-2">
            <input
              type="text"
              placeholder={
                selectedConv.status === 'HUMAN_ACTIVE'
                  ? 'Type a message to send directly to customer via WhatsApp...'
                  : 'Send a human reply (will be delivered to customer WhatsApp)...'
              }
              value={replyText}
              onChange={e => setReplyText(e.target.value)}
              className="flex-1 bg-slate-800 border border-slate-700/80 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-400 focus:outline-none focus:border-emerald-500"
            />
            <button
              type="submit"
              disabled={isSending || !replyText.trim()}
              className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white p-2.5 rounded-xl transition-colors shadow-md shadow-emerald-950"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-slate-500 text-sm">
          Select a conversation from the left to view messages
        </div>
      )}

      {/* RIGHT COLUMN: Customer Profile & Order History */}
      {currentCustomer && (
        <div className="w-72 border-l border-slate-800 bg-slate-900/80 p-4 shrink-0 overflow-y-auto space-y-4">
          <div className="text-center pb-3 border-b border-slate-800">
            <div className="w-14 h-14 rounded-full bg-emerald-600/20 text-emerald-400 flex items-center justify-center font-bold text-lg mx-auto mb-2 border border-emerald-500/30">
              {currentCustomer.name.slice(0, 2).toUpperCase()}
            </div>
            <h4 className="font-bold text-sm text-white">{currentCustomer.name}</h4>
            <p className="text-xs font-mono text-slate-400">{currentCustomer.phone}</p>
            <span className="inline-block mt-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              {currentCustomer.status} Customer
            </span>
          </div>

          <div className="space-y-2 text-xs">
            <div className="flex justify-between text-slate-300">
              <span className="text-slate-400">Total Spend:</span>
              <span className="font-bold text-emerald-400">{tenant.currency} {currentCustomer.totalSpend.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-slate-300">
              <span className="text-slate-400">Total Orders:</span>
              <span className="font-bold text-white">{currentCustomer.orderCount}</span>
            </div>
            {currentCustomer.address && (
              <div className="pt-2 border-t border-slate-800">
                <span className="text-slate-400 block mb-0.5">Address:</span>
                <span className="text-slate-200">{currentCustomer.address}</span>
              </div>
            )}
            {currentCustomer.notes && (
              <div className="pt-2 border-t border-slate-800">
                <span className="text-slate-400 block mb-0.5">Notes:</span>
                <span className="text-slate-300 italic">{currentCustomer.notes}</span>
              </div>
            )}
          </div>

          {/* Customer Orders */}
          <div className="pt-3 border-t border-slate-800">
            <h5 className="font-semibold text-xs text-white mb-2 flex items-center justify-between">
              <span>Order History</span>
              <span className="text-[10px] text-slate-400">{customerOrders.length} orders</span>
            </h5>
            <div className="space-y-2">
              {customerOrders.length === 0 ? (
                <p className="text-[11px] text-slate-500">No previous orders recorded</p>
              ) : (
                customerOrders.map(ord => (
                  <div key={ord.id} className="p-2.5 rounded-lg bg-slate-800/60 border border-slate-700/60 text-xs">
                    <div className="flex justify-between font-mono font-medium text-emerald-400">
                      <span>{ord.orderNumber}</span>
                      <span className="text-white">{tenant.currency} {ord.total.toLocaleString()}</span>
                    </div>
                    <p className="text-[11px] text-slate-300 truncate mt-0.5">
                      {ord.items.map(i => `${i.quantity}x ${i.productName}`).join(', ')}
                    </p>
                    <div className="flex justify-between text-[10px] text-slate-400 mt-1">
                      <span>{new Date(ord.createdAt).toLocaleDateString()}</span>
                      <span className="text-emerald-400 font-semibold">{ord.status}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
