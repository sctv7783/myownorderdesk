import React, { useState } from 'react';
import {
  Users,
  Search,
  Phone,
  Calendar,
  ShoppingBag,
  DollarSign,
  Star,
  ShieldAlert,
  Tag,
  X,
  FileText,
  Clock
} from 'lucide-react';
import { Customer, Order, Tenant } from '../types';

interface CustomersViewProps {
  tenant: Tenant;
  customers: Customer[];
  orders: Order[];
  onUpdateCustomer: (customerId: string, data: Partial<Customer>) => void;
}

export const CustomersView: React.FC<CustomersViewProps> = ({
  tenant,
  customers,
  orders,
  onUpdateCustomer
}) => {
  const [search, setSearch] = useState('');
  const [selectedCust, setSelectedCust] = useState<Customer | null>(null);
  const [editNotes, setEditNotes] = useState('');
  const [editAddress, setEditAddress] = useState('');

  const filtered = customers.filter(c => {
    if (search) {
      const q = search.toLowerCase();
      return c.name.toLowerCase().includes(q) || c.phone.includes(q);
    }
    return true;
  });

  const handleSelect = (cust: Customer) => {
    setSelectedCust(cust);
    setEditNotes(cust.notes || '');
    setEditAddress(cust.address || '');
  };

  const handleSaveCust = () => {
    if (!selectedCust) return;
    onUpdateCustomer(selectedCust.id, {
      notes: editNotes,
      address: editAddress
    });
    setSelectedCust(prev => prev ? { ...prev, notes: editNotes, address: editAddress } : null);
  };

  const custOrders = selectedCust
    ? orders.filter(o => o.customerId === selectedCust.id)
    : [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Customer Relationship Management</h1>
          <p className="text-sm text-slate-400 mt-1">
            Verified WhatsApp customer profiles, order frequency, addresses, and lifetime values.
          </p>
        </div>
        <div className="text-right">
          <span className="text-xs text-slate-400">Total Registered Customers</span>
          <p className="text-xl font-bold text-emerald-400 font-mono">{customers.length}</p>
        </div>
      </div>

      {/* Search Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex items-center justify-between">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search customers by name or phone..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-9 pr-3 py-1.5 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-emerald-500"
          />
        </div>
        <span className="text-xs text-slate-400">
          Showing <span className="font-semibold text-white">{filtered.length}</span> customers
        </span>
      </div>

      {/* Customers Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wider text-slate-500 border-b border-slate-800 bg-slate-900/60">
              <tr>
                <th className="py-3 px-4 font-semibold">Customer Name</th>
                <th className="py-3 px-4 font-semibold">WhatsApp Phone</th>
                <th className="py-3 px-4 font-semibold">Orders Count</th>
                <th className="py-3 px-4 font-semibold">Lifetime Spend</th>
                <th className="py-3 px-4 font-semibold">Status</th>
                <th className="py-3 px-4 font-semibold">Last Interaction</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-xs text-slate-500">
                    No customers found matching search.
                  </td>
                </tr>
              ) : (
                filtered.map(cust => (
                  <tr
                    key={cust.id}
                    onClick={() => handleSelect(cust)}
                    className="hover:bg-slate-800/40 cursor-pointer transition-colors"
                  >
                    <td className="py-3.5 px-4">
                      <div className="flex items-center space-x-3">
                        <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-xs text-emerald-400">
                          {cust.name.slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-semibold text-white text-xs">{cust.name}</p>
                          <p className="text-[11px] text-slate-400 truncate max-w-xs">{cust.address || 'No saved address'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 font-mono text-xs text-slate-300">{cust.phone}</td>
                    <td className="py-3.5 px-4 text-xs font-semibold text-white">{cust.orderCount} orders</td>
                    <td className="py-3.5 px-4 font-semibold text-emerald-400 text-xs">
                      {tenant.currency} {cust.totalSpend.toLocaleString()}
                    </td>
                    <td className="py-3.5 px-4">
                      <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${
                        cust.status === 'VIP'
                          ? 'bg-purple-500/10 text-purple-400 border-purple-500/30'
                          : cust.status === 'BLOCKED'
                          ? 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                          : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                      }`}>
                        {cust.status}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-[11px] text-slate-400">
                      {new Date(cust.updatedAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Customer Drawer Modal */}
      {selectedCust && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-xl w-full p-6 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-full bg-emerald-600/20 text-emerald-400 flex items-center justify-center font-bold text-sm border border-emerald-500/30">
                  {selectedCust.name.slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <h2 className="text-base font-bold text-white">{selectedCust.name}</h2>
                  <p className="text-xs font-mono text-slate-400">{selectedCust.phone}</p>
                </div>
              </div>
              <button onClick={() => setSelectedCust(null)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 bg-slate-800/40 p-3.5 rounded-2xl text-xs">
              <div>
                <span className="text-slate-400 block mb-0.5">Total Orders Placed:</span>
                <span className="font-bold text-white text-sm">{selectedCust.orderCount}</span>
              </div>
              <div>
                <span className="text-slate-400 block mb-0.5">Lifetime Value:</span>
                <span className="font-bold text-emerald-400 text-sm">
                  {tenant.currency} {selectedCust.totalSpend.toLocaleString()}
                </span>
              </div>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-400 mb-1 font-medium">Default Delivery Address</label>
                <textarea
                  rows={2}
                  value={editAddress}
                  onChange={e => setEditAddress(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1 font-medium">Internal Staff Notes</label>
                <textarea
                  rows={2}
                  placeholder="e.g. Regular customer, likes extra spicy, prefer evening delivery"
                  value={editNotes}
                  onChange={e => setEditNotes(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="flex justify-end">
                <button
                  onClick={handleSaveCust}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold px-4 py-2 rounded-xl transition-colors shadow-md shadow-emerald-950"
                >
                  Save Changes
                </button>
              </div>
            </div>

            {/* Past orders by this customer */}
            <div className="pt-3 border-t border-slate-800">
              <h4 className="font-semibold text-xs text-white mb-2">Order History ({custOrders.length})</h4>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {custOrders.length === 0 ? (
                  <p className="text-xs text-slate-500">No previous orders recorded for this customer.</p>
                ) : (
                  custOrders.map(o => (
                    <div key={o.id} className="p-3 bg-slate-800/50 rounded-xl text-xs border border-slate-700/50 flex justify-between items-center">
                      <div>
                        <span className="font-mono text-emerald-400 font-medium">{o.orderNumber}</span>
                        <p className="text-[11px] text-slate-300 truncate mt-0.5">
                          {o.items.map(i => `${i.quantity}x ${i.productName}`).join(', ')}
                        </p>
                      </div>
                      <div className="text-right">
                        <span className="font-bold text-white">{tenant.currency} {o.total.toLocaleString()}</span>
                        <p className="text-[10px] text-emerald-400 font-semibold">{o.status}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
