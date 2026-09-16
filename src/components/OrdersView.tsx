import React, { useState } from 'react';
import {
  Search,
  Filter,
  ShoppingBag,
  Clock,
  Sparkles,
  CheckCircle2,
  XCircle,
  Truck,
  Package,
  MapPin,
  Phone,
  User,
  X
} from 'lucide-react';
import { Order, OrderStatus, Tenant } from '../types';

interface OrdersViewProps {
  tenant: Tenant;
  orders: Order[];
  selectedOrder: Order | null;
  onSelectOrder: (order: Order | null) => void;
  onUpdateStatus: (orderId: string, status: OrderStatus, note?: string) => void;
}

export const OrdersView: React.FC<OrdersViewProps> = ({
  tenant,
  orders,
  selectedOrder,
  onSelectOrder,
  onUpdateStatus
}) => {
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [search, setSearch] = useState('');
  const [statusNote, setStatusNote] = useState('');
  const [pendingChange, setPendingChange] = useState<{ orderId: string; status: OrderStatus } | null>(null);
  const [rowNote, setRowNote] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);

  const statusOptions: OrderStatus[] = [
    'PENDING_CONFIRMATION',
    'CONFIRMED',
    'PREPARING',
    'SHIPPED',
    'DELIVERED',
    'CANCELLED'
  ];

  const filteredOrders = orders.filter(o => {
    if (statusFilter !== 'ALL' && o.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        o.orderNumber.toLowerCase().includes(q) ||
        o.customerName.toLowerCase().includes(q) ||
        o.customerPhone.includes(q)
      );
    }
    return true;
  });

  const statuses: { id: string; label: string }[] = [
    { id: 'ALL', label: 'All Orders' },
    { id: 'PENDING_CONFIRMATION', label: 'Pending' },
    { id: 'CONFIRMED', label: 'Confirmed' },
    { id: 'PREPARING', label: 'Preparing' },
    { id: 'SHIPPED', label: 'Shipped' },
    { id: 'DELIVERED', label: 'Delivered' },
    { id: 'CANCELLED', label: 'Cancelled' }
  ];

  const handleStatusChange = (newStatus: OrderStatus) => {
    if (!selectedOrder) return;
    setSavingId(selectedOrder.id);
    onUpdateStatus(selectedOrder.id, newStatus, statusNote);
    setStatusNote('');
    setSavingId(null);
  };

  const sendRowUpdate = (orderId: string, status: OrderStatus, note?: string) => {
    setSavingId(orderId);
    onUpdateStatus(orderId, status, note);
    setPendingChange(null);
    setRowNote('');
    setSavingId(null);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Order Management</h1>
          <p className="text-sm text-slate-400 mt-1">
            Track and process orders placed through WhatsApp AI and human staff.
          </p>
        </div>
        <div className="text-right">
          <span className="text-xs text-slate-400">Total Orders</span>
          <p className="text-xl font-bold text-emerald-400 font-mono">{orders.length}</p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search by order #, customer, phone..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-9 pr-3 py-1.5 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-emerald-500"
          />
        </div>

        <div className="flex items-center space-x-1.5 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0">
          {statuses.map(s => (
            <button
              key={s.id}
              onClick={() => setStatusFilter(s.id)}
              className={`px-3 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                statusFilter === s.id
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Orders Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wider text-slate-500 border-b border-slate-800 bg-slate-900/60">
              <tr>
                <th className="py-3 px-4 font-semibold">Order Number</th>
                <th className="py-3 px-4 font-semibold">Customer</th>
                <th className="py-3 px-4 font-semibold">Items</th>
                <th className="py-3 px-4 font-semibold">Total Amount</th>
                <th className="py-3 px-4 font-semibold">Status</th>
                <th className="py-3 px-4 font-semibold">Source</th>
                <th className="py-3 px-4 font-semibold">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-xs text-slate-500">
                    No orders found matching the criteria.
                  </td>
                </tr>
              ) : (
                filteredOrders.map(order => (
                  <React.Fragment key={order.id}>
                  <tr
                    onClick={() => onSelectOrder(order)}
                    className="hover:bg-slate-800/40 cursor-pointer transition-colors"
                  >
                    <td className="py-3.5 px-4 font-mono font-medium text-xs text-emerald-400">
                      {order.orderNumber}
                    </td>
                    <td className="py-3.5 px-4">
                      <p className="font-medium text-white text-xs">{order.customerName}</p>
                      <p className="text-[11px] text-slate-400 font-mono">{order.customerPhone}</p>
                    </td>
                    <td className="py-3.5 px-4 text-xs text-slate-300 max-w-xs truncate">
                      {order.items.map(i => `${i.quantity}x ${i.productName}`).join(', ')}
                    </td>
                    <td className="py-3.5 px-4 font-semibold text-white text-xs">
                      {tenant.currency} {order.total.toLocaleString()}
                    </td>
                    <td className="py-3.5 px-4" onClick={e => e.stopPropagation()}>
                      <select
                        value={pendingChange?.orderId === order.id ? pendingChange.status : order.status}
                        disabled={savingId === order.id}
                        onChange={e => {
                          const next = e.target.value as OrderStatus;
                          if (next === order.status) {
                            setPendingChange(null);
                            return;
                          }
                          setPendingChange({ orderId: order.id, status: next });
                          setRowNote('');
                        }}
                        className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-[11px] text-white font-semibold focus:outline-none focus:border-emerald-500"
                      >
                        {statusOptions.map(st => (
                          <option key={st} value={st}>
                            {st}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-3.5 px-4 text-xs">
                      {order.source === 'whatsapp_ai' ? (
                        <span className="flex items-center text-emerald-400 font-medium text-[11px]">
                          <Sparkles className="w-3 h-3 mr-1" /> WhatsApp AI
                        </span>
                      ) : (
                        <span className="text-slate-400 font-medium text-[11px]">Manual / Dash</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-[11px] text-slate-400">
                      {new Date(order.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                  {pendingChange?.orderId === order.id && (
                    <tr className="bg-emerald-950/20">
                      <td colSpan={7} className="px-4 py-3" onClick={e => e.stopPropagation()}>
                        <p className="text-[11px] text-emerald-300 mb-2">
                          Status <span className="font-semibold">{pendingChange.status}</span> customer ko WhatsApp par turant milega. Optional note add karein:
                        </p>
                        <div className="flex flex-col sm:flex-row gap-2">
                          <input
                            type="text"
                            value={rowNote}
                            onChange={e => setRowNote(e.target.value)}
                            placeholder="e.g. Rider Ali, ETA 30 min, tracking..."
                            className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                          />
                          <button
                            type="button"
                            onClick={() => sendRowUpdate(order.id, pendingChange.status, rowNote)}
                            className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-500"
                          >
                            Send update
                          </button>
                          <button
                            type="button"
                            onClick={() => setPendingChange(null)}
                            className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold"
                          >
                            Cancel
                          </button>
                        </div>
                      </td>
                    </tr>
                  )}
                  </React.Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Order Details Modal */}
      {selectedOrder && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-2xl w-full p-6 shadow-2xl space-y-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div>
                <span className="text-xs font-mono text-emerald-400 font-semibold">{selectedOrder.orderNumber}</span>
                <h2 className="text-lg font-bold text-white mt-0.5">Order Details & Status</h2>
              </div>
              <button
                onClick={() => onSelectOrder(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Customer info card */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-800/40 p-4 rounded-2xl border border-slate-700/50 text-xs">
              <div>
                <span className="text-slate-400 block mb-0.5">Customer Name:</span>
                <p className="font-semibold text-white">{selectedOrder.customerName}</p>
                <p className="text-slate-300 font-mono mt-0.5">{selectedOrder.customerPhone}</p>
              </div>
              <div>
                <span className="text-slate-400 block mb-0.5">Delivery Address:</span>
                <p className="text-white">{selectedOrder.deliveryAddress || 'Address verified on WhatsApp'}</p>
                <p className="text-slate-400 mt-1">Payment Method: {selectedOrder.paymentMethod}</p>
              </div>
            </div>

            {/* Order Items Table */}
            <div>
              <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Ordered Items</h4>
              <div className="border border-slate-800 rounded-xl overflow-hidden divide-y divide-slate-800 text-xs">
                {selectedOrder.items.map(item => (
                  <div key={item.id} className="p-3 flex items-center justify-between bg-slate-900/60">
                    <div>
                      <p className="font-semibold text-white">{item.productName}</p>
                      <p className="text-slate-400 text-[11px]">SKU: {item.sku}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-slate-300">
                        {item.quantity} × {tenant.currency} {item.unitPrice.toLocaleString()}
                      </p>
                      <p className="font-semibold text-emerald-400">
                        {tenant.currency} {item.subtotal.toLocaleString()}
                      </p>
                    </div>
                  </div>
                ))}

                <div className="p-3 bg-slate-800/30 space-y-1 text-right">
                  <div className="flex justify-between text-slate-400">
                    <span>Subtotal:</span>
                    <span>{tenant.currency} {selectedOrder.subtotal.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-slate-400">
                    <span>Delivery Fee:</span>
                    <span>{tenant.currency} {selectedOrder.deliveryFee.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between font-bold text-sm text-white pt-1 border-t border-slate-700">
                    <span>Total:</span>
                    <span className="text-emerald-400">{tenant.currency} {selectedOrder.total.toLocaleString()}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Change Status Controls */}
            <div className="p-4 bg-slate-800/50 rounded-2xl border border-slate-700/50 space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-white block">Update Order Status</label>
                <span className="text-[11px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-0.5 rounded-full font-medium flex items-center">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mr-1.5 animate-pulse"></span>
                  Auto-sends WhatsApp message to customer
                </span>
              </div>

              <div>
                <input
                  type="text"
                  placeholder="Optional status note / rider tracking info (e.g. Rider Ali assigned, ETA 2pm)..."
                  value={statusNote}
                  onChange={e => setStatusNote(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="flex flex-wrap gap-2 pt-1">
                {(['CONFIRMED', 'PREPARING', 'SHIPPED', 'DELIVERED', 'CANCELLED'] as OrderStatus[]).map(st => (
                  <button
                    key={st}
                    onClick={() => handleStatusChange(st)}
                    className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-all ${
                      selectedOrder.status === st
                        ? 'bg-emerald-600 text-white shadow-md shadow-emerald-950 ring-2 ring-emerald-400'
                        : 'bg-slate-700 text-slate-200 hover:bg-slate-600 hover:text-white'
                    }`}
                  >
                    Set {st}
                  </button>
                ))}
              </div>
              {selectedOrder.status === 'CANCELLED' && (
                <p className="text-[11px] text-amber-400 mt-1">
                  ⚠️ Note: When an order is cancelled, inventory is automatically restored in the database.
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
