import React, { useEffect, useRef, useState } from 'react';
import {
  Search,
  Bot,
  User,
  Send,
  CheckCheck,
  Sparkles,
  UserCheck,
  RotateCcw,
  Paperclip,
  Mic,
  Image as ImageIcon
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
  onSendMessage: (text: string, media?: { mediaUrl: string; mediaType: string }) => void;
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
  const [pendingFile, setPendingFile] = useState<{ name: string; mediaUrl: string; mediaType: string } | null>(null);
  const [recording, setRecording] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const selectedConv = conversations.find(c => c.id === selectedConvId) || conversations[0];

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, selectedConvId]);

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

  const readFile = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  const attachFile = async (file?: File | null) => {
    if (!file) return;
    const mediaUrl = await readFile(file);
    const mediaType = file.type.startsWith('video')
      ? 'video'
      : file.type.startsWith('audio')
        ? 'audio'
        : 'image';
    setPendingFile({ name: file.name, mediaUrl, mediaType });
  };

  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (isSending) return;
    if (!replyText.trim() && !pendingFile) return;
    await onSendMessage(replyText.trim(), pendingFile || undefined);
    setReplyText('');
    setPendingFile(null);
  };

  const toggleVoice = async () => {
    if (recording && recorderRef.current) {
      recorderRef.current.stop();
      setRecording(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (ev) => {
        if (ev.data.size) chunksRef.current.push(ev.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        const file = new File([blob], 'voice.webm', { type: blob.type });
        await attachFile(file);
      };
      recorderRef.current = recorder;
      recorder.start();
      setRecording(true);
    } catch (err) {
      console.warn('Microphone unavailable', err);
    }
  };

  return (
    <div className="h-[calc(100vh-8.5rem)] bg-[#111b21] border border-slate-800 rounded-2xl overflow-hidden shadow-xl flex">
      {/* LEFT COLUMN: Conversation List */}
      <div className="w-80 border-r border-[#2a3942] flex flex-col bg-[#111b21] shrink-0">
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
        <div className="flex-1 flex flex-col bg-[#0b141a]">
          <div className="h-14 px-4 bg-[#202c33] border-b border-[#2a3942] flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-9 h-9 rounded-full bg-[#6a7175] flex items-center justify-center font-bold text-xs text-white">
                {selectedConv.customerName.slice(0, 2).toUpperCase()}
              </div>
              <div>
                <h3 className="text-sm font-semibold text-[#e9edef] flex items-center space-x-2">
                  <span>{selectedConv.customerName}</span>
                  <span className="text-xs font-mono font-normal text-[#8696a0]">({selectedConv.customerPhone})</span>
                </h3>
                <p className="text-[11px] text-[#00a884] flex items-center">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#00a884] mr-1.5" />
                  WhatsApp Cloud API
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              {selectedConv.status === 'AI_ACTIVE' ? (
                <button
                  onClick={() => onToggleMode('HUMAN_ACTIVE')}
                  className="flex items-center space-x-1.5 bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 border border-amber-500/40 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
                >
                  <UserCheck className="w-3.5 h-3.5" />
                  <span>Take Over</span>
                </button>
              ) : (
                <button
                  onClick={() => onToggleMode('AI_ACTIVE')}
                  className="flex items-center space-x-1.5 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/40 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Resume AI</span>
                </button>
              )}
            </div>
          </div>

          <div
            className="flex-1 p-4 overflow-y-auto space-y-1.5"
            style={{
              backgroundColor: '#0b141a',
              backgroundImage:
                'url("data:image/svg+xml,%3Csvg width=\'60\' height=\'60\' viewBox=\'0 0 60 60\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'none\' fill-rule=\'evenodd\'%3E%3Cg fill=\'%23ffffff\' fill-opacity=\'0.03\'%3E%3Cpath d=\'M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z\'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")'
            }}
          >
            <div className="text-center my-2">
              <span className={`inline-flex items-center space-x-1.5 px-3 py-1 rounded-full text-[11px] font-medium ${
                selectedConv.status === 'AI_ACTIVE'
                  ? 'bg-[#182229] text-[#8696a0]'
                  : 'bg-amber-950/60 text-amber-300'
              }`}>
                {selectedConv.status === 'AI_ACTIVE' ? (
                  <>
                    <Sparkles className="w-3 h-3 text-[#00a884]" />
                    <span>AI agent active</span>
                  </>
                ) : (
                  <>
                    <User className="w-3 h-3" />
                    <span>Human mode — AI paused</span>
                  </>
                )}
              </span>
            </div>

            {messages.map(msg => {
              const isCustomer = msg.sender === 'CUSTOMER';
              const mediaType = String(msg.mediaType || '').toLowerCase();
              const mediaUrl = msg.mediaUrl || '';
              return (
                <div
                  key={msg.id}
                  className={`flex ${isCustomer ? 'justify-start' : 'justify-end'}`}
                >
                  <div
                    className={`max-w-[75%] rounded-lg px-2 py-1.5 shadow text-sm ${
                      isCustomer
                        ? 'bg-[#202c33] text-[#e9edef] rounded-tl-none'
                        : 'bg-[#005c4b] text-[#e9edef] rounded-tr-none'
                    }`}
                  >
                    <div className="flex items-center justify-between text-[10px] text-[#8696a0] mb-1 space-x-2">
                      <span>
                        {msg.sender === 'CUSTOMER' ? selectedConv.customerName : msg.sender === 'AI' ? 'AI' : 'You'}
                      </span>
                      <span>{new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                    {mediaUrl && mediaType.startsWith('image') && (
                      <img src={mediaUrl} alt={msg.text || 'Photo'} className="max-w-[240px] rounded-md mb-1" />
                    )}
                    {mediaUrl && mediaType.startsWith('video') && (
                      <video src={mediaUrl} controls className="max-w-[240px] rounded-md mb-1" />
                    )}
                    {mediaUrl && mediaType.startsWith('audio') && (
                      <audio src={mediaUrl} controls className="w-[220px] mb-1" />
                    )}
                    {msg.text && <p className="whitespace-pre-wrap leading-relaxed px-1">{msg.text}</p>}
                    {!isCustomer && (
                      <div className="flex justify-end mt-0.5">
                        <CheckCheck className="w-3.5 h-3.5 text-[#53bdeb]" />
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>

          {pendingFile && (
            <div className="px-4 py-2 bg-[#202c33] text-xs text-[#e9edef] flex items-center justify-between">
              <span className="truncate flex items-center gap-2">
                <ImageIcon className="w-3.5 h-3.5" />
                {pendingFile.name} attached
              </span>
              <button type="button" className="text-[#8696a0]" onClick={() => setPendingFile(null)}>
                Remove
              </button>
            </div>
          )}

          <form onSubmit={handleSend} className="p-2 bg-[#202c33] flex items-center space-x-2">
            <input
              ref={fileRef}
              type="file"
              accept="image/*,video/*,audio/*"
              className="hidden"
              onChange={e => attachFile(e.target.files?.[0])}
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="text-[#8696a0] hover:text-[#e9edef] p-2"
              title="Photo, video, or voice file"
            >
              <Paperclip className="w-5 h-5" />
            </button>
            <input
              type="text"
              placeholder="Type a message"
              value={replyText}
              onChange={e => setReplyText(e.target.value)}
              className="flex-1 bg-[#2a3942] border-0 rounded-lg px-4 py-2.5 text-sm text-[#e9edef] placeholder-[#8696a0] focus:outline-none"
            />
            <button
              type="button"
              onClick={toggleVoice}
              className={`p-2 rounded-full ${recording ? 'bg-red-600 text-white' : 'text-[#8696a0] hover:text-[#e9edef]'}`}
              title="Voice note"
            >
              <Mic className="w-5 h-5" />
            </button>
            <button
              type="submit"
              disabled={isSending || (!replyText.trim() && !pendingFile)}
              className="bg-[#00a884] hover:bg-[#06cf9c] disabled:opacity-50 text-[#111b21] p-2.5 rounded-full"
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
