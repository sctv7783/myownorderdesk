import React, { useState } from 'react';
import { MessageSquare, Mail, Lock, User, Building2, ArrowRight, Loader2 } from 'lucide-react';

interface AuthViewProps {
  onAuth: (payload: any) => void;
  onBack: () => void;
}

export const AuthView: React.FC<AuthViewProps> = ({ onAuth, onBack }) => {
  const [mode, setMode] = useState<'login' | 'signup'>('signup');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const res = await fetch(mode === 'signup' ? '/api/auth/register' : '/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          password,
          fullName,
          businessName,
          businessType: 'E-Commerce'
        })
      });
      const raw = await res.text();
      let data: any = {};
      try {
        data = JSON.parse(raw);
      } catch {
        throw new Error('Auth API ne HTML return ki. Latest deploy ke baad dobara try karein.');
      }
      if (!res.ok || !data.accessToken) {
        throw new Error(data.error || 'Login/signup fail ho gaya.');
      }
      onAuth(data);
    } catch (err: any) {
      setError(err?.message || 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <button onClick={onBack} className="text-xs text-slate-400 hover:text-white mb-6">
          ← Back to home
        </button>
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-11 h-11 rounded-xl bg-emerald-600 flex items-center justify-center">
              <MessageSquare className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white">
                {mode === 'signup' ? 'Create merchant account' : 'Sign in'}
              </h1>
              <p className="text-xs text-slate-400">Email se apna store, products aur WhatsApp AI manage karein.</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-1 bg-slate-800/80 p-1 rounded-xl mb-6">
            <button
              type="button"
              onClick={() => setMode('signup')}
              className={`text-xs font-semibold py-2 rounded-lg ${
                mode === 'signup' ? 'bg-emerald-600 text-white' : 'text-slate-400'
              }`}
            >
              Sign up
            </button>
            <button
              type="button"
              onClick={() => setMode('login')}
              className={`text-xs font-semibold py-2 rounded-lg ${
                mode === 'login' ? 'bg-emerald-600 text-white' : 'text-slate-400'
              }`}
            >
              Login
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            {mode === 'signup' && (
              <>
                <label className="block text-xs text-slate-400">
                  Your name
                  <div className="mt-1 flex items-center gap-2 bg-slate-800 border border-slate-700 rounded-xl px-3">
                    <User className="w-4 h-4 text-slate-500" />
                    <input
                      required
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      className="w-full bg-transparent py-2.5 text-sm text-white outline-none"
                      placeholder="Ali Khan"
                    />
                  </div>
                </label>
                <label className="block text-xs text-slate-400">
                  Store name
                  <div className="mt-1 flex items-center gap-2 bg-slate-800 border border-slate-700 rounded-xl px-3">
                    <Building2 className="w-4 h-4 text-slate-500" />
                    <input
                      required
                      value={businessName}
                      onChange={(e) => setBusinessName(e.target.value)}
                      className="w-full bg-transparent py-2.5 text-sm text-white outline-none"
                      placeholder="My WhatsApp Store"
                    />
                  </div>
                </label>
              </>
            )}
            <label className="block text-xs text-slate-400">
              Email
              <div className="mt-1 flex items-center gap-2 bg-slate-800 border border-slate-700 rounded-xl px-3">
                <Mail className="w-4 h-4 text-slate-500" />
                <input
                  required
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-transparent py-2.5 text-sm text-white outline-none"
                  placeholder="you@store.com"
                />
              </div>
            </label>
            <label className="block text-xs text-slate-400">
              Password
              <div className="mt-1 flex items-center gap-2 bg-slate-800 border border-slate-700 rounded-xl px-3">
                <Lock className="w-4 h-4 text-slate-500" />
                <input
                  required
                  type="password"
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-transparent py-2.5 text-sm text-white outline-none"
                  placeholder="At least 6 characters"
                />
              </div>
            </label>

            {error && (
              <p className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-xl px-3 py-2">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={busy}
              className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white font-semibold py-3 rounded-xl flex items-center justify-center gap-2"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
              {mode === 'signup' ? 'Create account' : 'Login'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
