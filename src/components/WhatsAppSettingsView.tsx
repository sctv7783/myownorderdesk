import React, { useState } from 'react';
import {
  Smartphone,
  ShieldCheck,
  CheckCircle2,
  Copy,
  ExternalLink,
  Send,
  AlertCircle,
  Key,
  RefreshCw,
  HelpCircle,
  X
} from 'lucide-react';
import { WhatsAppAccount, WhatsAppPhoneNumber, Tenant } from '../types';

interface WhatsAppSettingsViewProps {
  tenant: Tenant;
  account?: WhatsAppAccount;
  phoneNumbers: WhatsAppPhoneNumber[];
  onSaveManualConfig: (data: { wabaId: string; phoneNumberId: string; accessToken: string; displayNumber: string }) => void;
  onSendTestMessage: (phoneNumber: string, text: string) => Promise<boolean>;
}

export const WhatsAppSettingsView: React.FC<WhatsAppSettingsViewProps> = ({
  tenant,
  account,
  phoneNumbers,
  onSaveManualConfig,
  onSendTestMessage
}) => {
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [testNumber, setTestNumber] = useState('+92 300 1234567');
  const [testText, setTestText] = useState('OrderDesk Test: WhatsApp Cloud API connection is active!');
  const [testSending, setTestSending] = useState(false);
  const [testSuccess, setTestSuccess] = useState<boolean | null>(null);

  // Manual configuration form state
  const [manualWaba, setManualWaba] = useState(account?.wabaId || '');
  const [manualPhoneId, setManualPhoneId] = useState(phoneNumbers[0]?.phoneNumberId || '');
  const [manualToken, setManualToken] = useState('EAABwz...meta_system_user_token');
  const [manualDisplayNum, setManualDisplayNum] = useState(phoneNumbers[0]?.displayPhoneNumber || '+92 300 1234567');

  const webhookUrl = `${window.location.origin}/api/whatsapp/webhook`;
  const verifyToken = 'orderdesk_webhook_verify_token_secure';

  const handleCopy = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2500);
  };

  const handleSendTest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testNumber.trim() || testSending) return;
    setTestSending(true);
    setTestSuccess(null);
    try {
      const ok = await onSendTestMessage(testNumber, testText);
      setTestSuccess(ok);
    } catch {
      setTestSuccess(false);
    } finally {
      setTestSending(false);
      setTimeout(() => setTestSuccess(null), 5000);
    }
  };

  const handleSaveManual = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveManualConfig({
      wabaId: manualWaba,
      phoneNumberId: manualPhoneId,
      accessToken: manualToken,
      displayNumber: manualDisplayNum
    });
    setIsManualModalOpen(false);
  };

  const primaryPhone = phoneNumbers[0];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-2xl font-bold text-white tracking-tight">WhatsApp Business API Connection</h1>
            <span className="bg-emerald-500/10 text-emerald-400 text-xs font-semibold px-2.5 py-0.5 rounded-full border border-emerald-500/20">
              Meta Cloud API
            </span>
          </div>
          <p className="text-sm text-slate-400 mt-1">
            Connect and configure official Meta WhatsApp Cloud API credentials for {tenant.name}.
          </p>
        </div>

        <button
          onClick={() => setIsManualModalOpen(true)}
          className="flex items-center space-x-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 px-4 py-2 rounded-xl text-sm font-medium transition-colors"
        >
          <Key className="w-4 h-4 text-emerald-400" />
          <span>Manual Meta Credentials</span>
        </button>
      </div>

      {/* Connection Status Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
          <div className="flex items-center space-x-4">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <Smartphone className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-base font-bold text-white">
                  {primaryPhone ? primaryPhone.displayPhoneNumber : 'No Phone Number Connected'}
                </h3>
                <span className="bg-emerald-500/20 text-emerald-400 text-[10px] font-bold px-2 py-0.5 rounded-full border border-emerald-500/30 flex items-center">
                  <CheckCircle2 className="w-3 h-3 mr-1" /> ACTIVE & VERIFIED
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Verified Name: <span className="text-slate-200 font-medium">{primaryPhone?.verifiedName || tenant.name}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-3 text-xs">
            <div className="bg-slate-800/80 px-3 py-1.5 rounded-xl border border-slate-700">
              <span className="text-slate-400 block text-[10px]">Quality Rating</span>
              <span className="text-emerald-400 font-bold">{primaryPhone?.qualityRating || 'GREEN (High)'}</span>
            </div>
            <div className="bg-slate-800/80 px-3 py-1.5 rounded-xl border border-slate-700">
              <span className="text-slate-400 block text-[10px]">Messaging Limit</span>
              <span className="text-white font-bold">{primaryPhone?.messagingLimitTier || 'TIER_1K (1,000 / 24h)'}</span>
            </div>
          </div>
        </div>

        {/* Technical IDs */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
          <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
            <span className="text-slate-500 block text-[10px] font-sans uppercase tracking-wider mb-1">
              WhatsApp Business Account ID (WABA)
            </span>
            <div className="flex items-center justify-between text-slate-300">
              <span className="truncate">{account?.wabaId || 'waba_khyber_1001'}</span>
              <button
                onClick={() => handleCopy(account?.wabaId || 'waba_khyber_1001', 'waba')}
                className="text-slate-400 hover:text-white ml-2"
              >
                <Copy className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
            <span className="text-slate-500 block text-[10px] font-sans uppercase tracking-wider mb-1">
              Phone Number ID (Webhook Resolver Key)
            </span>
            <div className="flex items-center justify-between text-slate-300">
              <span className="truncate">{primaryPhone?.phoneNumberId || 'phone_id_khyber_1001'}</span>
              <button
                onClick={() => handleCopy(primaryPhone?.phoneNumberId || 'phone_id_khyber_1001', 'phoneId')}
                className="text-slate-400 hover:text-white ml-2"
              >
                <Copy className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Webhook Configuration Guide */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
        <h3 className="text-base font-bold text-white flex items-center space-x-2">
          <ShieldCheck className="w-5 h-5 text-emerald-400" />
          <span>Meta App Webhook Configuration</span>
        </h3>
        <p className="text-xs text-slate-400 leading-relaxed">
          In your{' '}
          <a
            href="https://developers.facebook.com/apps"
            target="_blank"
            rel="noreferrer"
            className="text-emerald-400 underline hover:text-emerald-300"
          >
            Meta Developer Dashboard
          </a>
          , navigate to <span className="text-white font-medium">WhatsApp → Configuration</span> and set the Webhook URL and Verify Token:
        </p>

        <div className="space-y-3 text-xs">
          <div>
            <label className="block text-slate-400 mb-1 font-semibold">Callback URL (Webhook Endpoint)</label>
            <div className="flex items-center space-x-2">
              <input
                type="text"
                readOnly
                value={webhookUrl}
                className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-200 font-mono"
              />
              <button
                onClick={() => handleCopy(webhookUrl, 'url')}
                className="bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-2 rounded-xl flex items-center space-x-1.5 border border-slate-700 font-medium"
              >
                <Copy className="w-3.5 h-3.5 text-emerald-400" />
                <span>{copiedField === 'url' ? 'Copied!' : 'Copy'}</span>
              </button>
            </div>
          </div>

          <div>
            <label className="block text-slate-400 mb-1 font-semibold">Verify Token</label>
            <div className="flex items-center space-x-2">
              <input
                type="text"
                readOnly
                value={verifyToken}
                className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-200 font-mono"
              />
              <button
                onClick={() => handleCopy(verifyToken, 'token')}
                className="bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-2 rounded-xl flex items-center space-x-1.5 border border-slate-700 font-medium"
              >
                <Copy className="w-3.5 h-3.5 text-emerald-400" />
                <span>{copiedField === 'token' ? 'Copied!' : 'Copy'}</span>
              </button>
            </div>
          </div>

          <div className="pt-2 text-slate-400 text-[11px]">
            Subscribed Webhook Fields:{' '}
            <span className="font-mono text-emerald-400 font-semibold">messages</span>,{' '}
            <span className="font-mono text-emerald-400 font-semibold">message_deliveries</span>
          </div>
        </div>
      </div>

      {/* Test Message Dispatcher */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
        <h3 className="text-base font-bold text-white flex items-center space-x-2">
          <Send className="w-4 h-4 text-blue-400" />
          <span>Send Test WhatsApp Message</span>
        </h3>
        <p className="text-xs text-slate-400">
          Verify outbound delivery from this tenant's official WhatsApp Business number.
        </p>

        <form onSubmit={handleSendTest} className="space-y-3 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-400 mb-1 font-medium">Destination Phone Number (with Country Code)</label>
              <input
                type="text"
                value={testNumber}
                onChange={e => setTestNumber(e.target.value)}
                placeholder="+92 300 1234567"
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono focus:outline-none focus:border-emerald-500"
              />
            </div>
            <div>
              <label className="block text-slate-400 mb-1 font-medium">Message Body</label>
              <input
                type="text"
                value={testText}
                onChange={e => setTestText(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          <div className="flex items-center justify-between pt-1">
            <div>
              {testSuccess === true && (
                <span className="text-xs font-semibold text-emerald-400 flex items-center">
                  <CheckCircle2 className="w-4 h-4 mr-1" /> Test message dispatched successfully!
                </span>
              )}
              {testSuccess === false && (
                <span className="text-xs font-semibold text-rose-400 flex items-center">
                  <AlertCircle className="w-4 h-4 mr-1" /> Error dispatching message. Check configuration.
                </span>
              )}
            </div>
            <button
              type="submit"
              disabled={testSending}
              className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold px-4 py-2 rounded-xl transition-all shadow-md shadow-emerald-950 flex items-center space-x-1.5"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{testSending ? 'Dispatching...' : 'Send WhatsApp Message'}</span>
            </button>
          </div>
        </form>
      </div>

      {/* Manual Configuration Modal */}
      {isManualModalOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-lg w-full p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-base font-bold text-white">Manual Meta WhatsApp Configuration</h3>
              <button onClick={() => setIsManualModalOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveManual} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-400 mb-1 font-medium">WhatsApp Business Account ID (WABA ID) *</label>
                <input
                  type="text"
                  required
                  value={manualWaba}
                  onChange={e => setManualWaba(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1 font-medium">Phone Number ID *</label>
                <input
                  type="text"
                  required
                  value={manualPhoneId}
                  onChange={e => setManualPhoneId(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1 font-medium">Display Phone Number *</label>
                <input
                  type="text"
                  required
                  value={manualDisplayNum}
                  onChange={e => setManualDisplayNum(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1 font-medium">Permanent System User Access Token *</label>
                <textarea
                  rows={3}
                  required
                  value={manualToken}
                  onChange={e => setManualToken(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="flex justify-end space-x-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsManualModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 text-slate-300 hover:bg-slate-700 rounded-xl font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-semibold shadow-md shadow-emerald-950"
                >
                  Save Credentials
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
