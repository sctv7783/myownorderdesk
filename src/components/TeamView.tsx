import React, { useState } from 'react';
import {
  Users,
  UserPlus,
  Shield,
  CheckCircle2,
  Mail,
  X
} from 'lucide-react';
import { TenantMember, Tenant, UserRole } from '../types';

interface TeamViewProps {
  tenant: Tenant;
  members: TenantMember[];
  onInviteMember: (email: string, role: UserRole) => void;
}

export const TeamView: React.FC<TeamViewProps> = ({ tenant, members, onInviteMember }) => {
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<UserRole>('STAFF');

  const handleInvite = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    onInviteMember(email.trim(), role);
    setEmail('');
    setIsInviteOpen(false);
  };

  return (
    <div className="space-y-6">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Team Members & Access Control</h1>
          <p className="text-sm text-slate-400 mt-1">
            Manage who has access to {tenant.name}'s WhatsApp inbox, orders, and AI configuration.
          </p>
        </div>
        <button
          onClick={() => setIsInviteOpen(true)}
          className="flex items-center space-x-2 bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-xl text-sm font-semibold transition-all shadow-md shadow-emerald-950"
        >
          <UserPlus className="w-4 h-4" />
          <span>Invite Member</span>
        </button>
      </div>

      {/* Members Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wider text-slate-500 border-b border-slate-800 bg-slate-900/60">
              <tr>
                <th className="py-3 px-4 font-semibold">User</th>
                <th className="py-3 px-4 font-semibold">Role</th>
                <th className="py-3 px-4 font-semibold">Status</th>
                <th className="py-3 px-4 font-semibold">Joined At</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {members.map(m => (
                <tr key={m.id} className="hover:bg-slate-800/40 transition-colors">
                  <td className="py-3.5 px-4">
                    <div className="flex items-center space-x-3">
                      <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-xs text-white">
                        {m.profile?.fullName ? m.profile.fullName.slice(0, 2).toUpperCase() : 'US'}
                      </div>
                      <div>
                        <p className="font-semibold text-white text-xs">{m.profile?.fullName || 'Invited User'}</p>
                        <p className="text-[11px] text-slate-400">{m.profile?.email || 'Pending Acceptance'}</p>
                      </div>
                    </div>
                  </td>
                  <td className="py-3.5 px-4">
                    <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${
                      m.role === 'OWNER'
                        ? 'bg-purple-500/10 text-purple-400 border-purple-500/30'
                        : m.role === 'ADMIN'
                        ? 'bg-blue-500/10 text-blue-400 border-blue-500/30'
                        : m.role === 'MANAGER'
                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                        : 'bg-slate-800 text-slate-300 border-slate-700'
                    }`}>
                      {m.role}
                    </span>
                  </td>
                  <td className="py-3.5 px-4">
                    <span className="text-[11px] font-semibold text-emerald-400 flex items-center">
                      <CheckCircle2 className="w-3 h-3 mr-1" /> {m.status}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 text-[11px] text-slate-400">
                    {new Date(m.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Role Matrix Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 text-xs text-slate-300 space-y-3">
        <h3 className="font-bold text-white flex items-center space-x-2">
          <Shield className="w-4 h-4 text-emerald-400" />
          <span>Role Permissions Matrix</span>
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-1">
          <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
            <span className="font-bold text-purple-400 block mb-1">OWNER</span>
            <p className="text-slate-400">Full tenant control, billing, WhatsApp WABA ownership, member management.</p>
          </div>
          <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
            <span className="font-bold text-blue-400 block mb-1">ADMIN</span>
            <p className="text-slate-400">Can modify products, AI settings, view all orders and analytics.</p>
          </div>
          <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
            <span className="font-bold text-emerald-400 block mb-1">MANAGER</span>
            <p className="text-slate-400">Can update order statuses, manage stock adjustments, and handle conversations.</p>
          </div>
          <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
            <span className="font-bold text-slate-300 block mb-1">STAFF</span>
            <p className="text-slate-400">Can reply to customer WhatsApp messages and view active orders.</p>
          </div>
        </div>
      </div>

      {/* Invite Modal */}
      {isInviteOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-base font-bold text-white">Invite Team Member</h3>
              <button onClick={() => setIsInviteOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleInvite} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-400 mb-1 font-medium">Email Address *</label>
                <input
                  type="email"
                  required
                  placeholder="colleague@yourbusiness.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1 font-medium">Assign Role *</label>
                <select
                  value={role}
                  onChange={e => setRole(e.target.value as UserRole)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
                >
                  <option value="STAFF">STAFF (Inbox & Orders view)</option>
                  <option value="MANAGER">MANAGER (Stock & Order updates)</option>
                  <option value="ADMIN">ADMIN (Full configuration)</option>
                </select>
              </div>

              <div className="flex justify-end space-x-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsInviteOpen(false)}
                  className="px-4 py-2 bg-slate-800 text-slate-300 hover:bg-slate-700 rounded-xl font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-semibold shadow-md shadow-emerald-950"
                >
                  Send Invitation
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
