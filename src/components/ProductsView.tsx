import React, { useState } from 'react';
import {
  Package,
  Plus,
  Search,
  AlertTriangle,
  ArrowUpDown,
  X,
  Edit2,
  Trash2,
  Globe,
  Sparkles,
  Loader2,
  CheckCircle2,
  ExternalLink,
  DollarSign,
  ImagePlus,
  Upload
} from 'lucide-react';
import { Product, Tenant } from '../types';

function fileToCompressedDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read image'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Invalid image file'));
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const max = 1100;
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(String(reader.result));
          return;
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const tryFormat = (type: string, quality: number) => canvas.toDataURL(type, quality);
        let dataUrl = tryFormat('image/webp', 0.72);
        if (!dataUrl.startsWith('data:image/webp')) dataUrl = tryFormat('image/jpeg', 0.72);
        const bytes = (value: string) => Math.ceil((value.length - value.indexOf(',') - 1) * 0.75);
        let quality = 0.7;
        while (bytes(dataUrl) > 450000 && quality > 0.42) {
          quality -= 0.08;
          dataUrl = dataUrl.startsWith('data:image/webp')
            ? tryFormat('image/webp', quality)
            : tryFormat('image/jpeg', quality);
        }
        resolve(dataUrl);
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

const ProductImagesField: React.FC<{
  values: string[];
  onChange: (values: string[]) => void;
}> = ({ values, onChange }) => {
  const [busy, setBusy] = useState(false);
  const photos = values.filter(Boolean).slice(0, 8);

  const onFiles = async (files?: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    try {
      const next = [...photos];
      for (const file of Array.from(files).slice(0, 8 - next.length)) {
        next.push(await fileToCompressedDataUrl(file));
      }
      onChange(next);
    } catch (err) {
      console.error(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      <label className="block text-slate-400 mb-1 font-medium">Product photos (multiple)</label>
      <label className="flex items-center justify-center gap-2 w-full cursor-pointer bg-slate-800 hover:bg-slate-700 border border-dashed border-slate-600 rounded-xl px-3 py-3 text-slate-200">
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4 text-emerald-400" />}
        <span>{busy ? 'Compressing to ~300–500KB…' : 'Add photos (gallery / camera)'}</span>
        <input
          type="file"
          accept="image/*"
          multiple
          capture="environment"
          className="hidden"
          onChange={e => onFiles(e.target.files)}
        />
      </label>
      <input
        type="text"
        placeholder="Or paste an image link and press Enter"
        onKeyDown={e => {
          if (e.key !== 'Enter') return;
          const value = (e.target as HTMLInputElement).value.trim();
          if (!value) return;
          onChange([...photos, value].slice(0, 8));
          (e.target as HTMLInputElement).value = '';
        }}
        className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
      />
      {photos.length ? (
        <div className="flex flex-wrap gap-2">
          {photos.map((src, index) => (
            <div key={`${src.slice(0, 24)}-${index}`} className="relative">
              <img src={src} alt={`Product ${index + 1}`} className="w-16 h-16 rounded-xl object-cover border border-slate-700" />
              <button
                type="button"
                onClick={() => onChange(photos.filter((_, i) => i !== index))}
                className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-rose-600 text-white text-[10px]"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-[11px] text-slate-500 flex items-center gap-1">
          <ImagePlus className="w-3 h-3" /> Ek se zyada photos add karein — compress ho kar Supabase pe jayengi.
        </p>
      )}
    </div>
  );
};

interface ProductsViewProps {
  tenant: Tenant;
  products: Product[];
  onCreateProduct: (data: Partial<Product>) => void;
  onUpdateProduct: (productId: string, data: Partial<Product>) => Promise<boolean | void>;
  onDeleteProduct: (productId: string) => Promise<boolean | void>;
  onImportFromUrl: (url: string) => Promise<{ success: boolean; count?: number; error?: string }>;
  onAdjustStock: (productId: string, changeQuantity: number, notes?: string) => void;
}

export const ProductsView: React.FC<ProductsViewProps> = ({
  tenant,
  products,
  onCreateProduct,
  onUpdateProduct,
  onDeleteProduct,
  onImportFromUrl,
  onAdjustStock
}) => {
  const [search, setSearch] = useState('');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [selectedProductForEdit, setSelectedProductForEdit] = useState<Product | null>(null);
  const [selectedProductForAdjust, setSelectedProductForAdjust] = useState<Product | null>(null);
  const [adjustQty, setAdjustQty] = useState<number>(10);
  const [adjustNote, setAdjustNote] = useState<string>('Inventory Restock');

  // New product form state
  const [newName, setNewName] = useState('');
  const [newSku, setNewSku] = useState('');
  const [newPrice, setNewPrice] = useState<number>(1500);
  const [newSalePrice, setNewSalePrice] = useState<string>('');
  const [newStock, setNewStock] = useState<number>(30);
  const [newLowStock, setNewLowStock] = useState<number>(5);
  const [newCategory, setNewCategory] = useState('General');
  const [newImageUrls, setNewImageUrls] = useState<string[]>([]);
  const [newDesc, setNewDesc] = useState('');

  // Edit product form state
  const [editName, setEditName] = useState('');
  const [editSku, setEditSku] = useState('');
  const [editPrice, setEditPrice] = useState<number>(0);
  const [editSalePrice, setEditSalePrice] = useState<string>('');
  const [editStock, setEditStock] = useState<number>(0);
  const [editLowStock, setEditLowStock] = useState<number>(5);
  const [editCategory, setEditCategory] = useState('');
  const [editImageUrls, setEditImageUrls] = useState<string[]>([]);
  const [editDesc, setEditDesc] = useState('');
  const [editIsActive, setEditIsActive] = useState<boolean>(true);
  const [isUpdating, setIsUpdating] = useState(false);

  // Scraper import state
  const [importUrl, setImportUrl] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ success: boolean; count?: number; error?: string } | null>(null);

  const filteredProducts = products.filter(p => {
    if (search) {
      const q = search.toLowerCase();
      return (
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        (p.categoryName && p.categoryName.toLowerCase().includes(q))
      );
    }
    return true;
  });

  const handleOpenEdit = (p: Product) => {
    setSelectedProductForEdit(p);
    setEditName(p.name);
    setEditSku(p.sku);
    setEditPrice(p.price);
    setEditSalePrice(p.salePrice ? String(p.salePrice) : '');
    setEditStock(p.stockQuantity);
    setEditLowStock(p.lowStockThreshold || 5);
    setEditCategory(p.categoryName || 'General');
    setEditImageUrls(p.imageUrls?.length ? p.imageUrls : p.imageUrl ? [p.imageUrl] : []);
    setEditDesc(p.description || '');
    setEditIsActive(p.isActive !== undefined ? p.isActive : true);
  };

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !newSku.trim()) return;

    onCreateProduct({
      name: newName.trim(),
      sku: newSku.trim(),
      price: Number(newPrice),
      salePrice: newSalePrice ? Number(newSalePrice) : undefined,
      stockQuantity: Number(newStock),
      lowStockThreshold: Number(newLowStock),
      categoryName: newCategory.trim() || 'General',
      imageUrl: newImageUrls[0],
      imageUrls: newImageUrls,
      description: newDesc.trim()
    });

    setIsAddModalOpen(false);
    setNewName('');
    setNewSku('');
    setNewPrice(1500);
    setNewSalePrice('');
    setNewStock(30);
    setNewDesc('');
    setNewImageUrls([]);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProductForEdit || !editName.trim()) return;

    setIsUpdating(true);
    try {
      const ok = await onUpdateProduct(selectedProductForEdit.id, {
        name: editName.trim(),
        sku: editSku.trim(),
        price: Number(editPrice),
        salePrice: editSalePrice ? Number(editSalePrice) : undefined,
        stockQuantity: Number(editStock),
        lowStockThreshold: Number(editLowStock),
        categoryName: editCategory.trim() || 'General',
        imageUrl: editImageUrls[0],
        imageUrls: editImageUrls,
        description: editDesc.trim(),
        isActive: editIsActive
      });
      if (ok) setSelectedProductForEdit(null);
    } catch (err) {
      console.error('Failed to update product:', err);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDelete = async (p: Product) => {
    if (confirm(`Are you sure you want to delete "${p.name}"? This action cannot be undone.`)) {
      await onDeleteProduct(p.id);
    }
  };

  const handleImportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!importUrl.trim()) return;

    setIsImporting(true);
    setImportResult(null);

    const res = await onImportFromUrl(importUrl.trim());
    setIsImporting(false);
    setImportResult(res);

    if (res.success) {
      setTimeout(() => {
        setIsImportModalOpen(false);
        setImportUrl('');
        setImportResult(null);
      }, 2500);
    }
  };

  const handleAdjustSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProductForAdjust || adjustQty === 0) return;
    onAdjustStock(selectedProductForAdjust.id, Number(adjustQty), adjustNote);
    setSelectedProductForAdjust(null);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Products & Catalog</h1>
          <p className="text-sm text-slate-400 mt-1">
            Real-time catalog synced with Supabase and active Groq AI WhatsApp order desk.
          </p>
        </div>

        <div className="flex items-center flex-wrap gap-3">
          {/* Website URL Importer Button */}
          <button
            onClick={() => {
              setIsImportModalOpen(true);
              setImportResult(null);
            }}
            className="flex items-center space-x-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white px-4 py-2 rounded-xl text-sm font-semibold transition-all shadow-md shadow-indigo-950"
          >
            <Sparkles className="w-4 h-4 text-purple-200" />
            <span>Import via Link (Groq AI)</span>
          </button>

          {/* Add Product Button */}
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="flex items-center space-x-2 bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-xl text-sm font-semibold transition-all shadow-md shadow-emerald-950"
          >
            <Plus className="w-4 h-4" />
            <span>Add Product</span>
          </button>
        </div>
      </div>

      {/* Search & Stats Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search products by title, SKU, or keyword..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-9 pr-3 py-1.5 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-emerald-500"
          />
        </div>

        <div className="flex items-center space-x-4 text-xs text-slate-400">
          <span>
            Total Catalog: <span className="font-semibold text-white">{products.length}</span> items
          </span>
          <span className="text-slate-600">|</span>
          <span>
            Showing: <span className="font-semibold text-emerald-400">{filteredProducts.length}</span>
          </span>
        </div>
      </div>

      {/* Products Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wider text-slate-500 border-b border-slate-800 bg-slate-900/60">
              <tr>
                <th className="py-3.5 px-4 font-semibold">Product Name</th>
                <th className="py-3.5 px-4 font-semibold">SKU</th>
                <th className="py-3.5 px-4 font-semibold">Price</th>
                <th className="py-3.5 px-4 font-semibold">Stock Available</th>
                <th className="py-3.5 px-4 font-semibold">Status</th>
                <th className="py-3.5 px-4 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-xs text-slate-500">
                    <Package className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                    No products found matching your search. Click "Add Product" or "Import via Link" to add inventory.
                  </td>
                </tr>
              ) : (
                filteredProducts.map(prod => {
                  const isLow = prod.stockQuantity <= prod.lowStockThreshold && prod.stockQuantity > 0;
                  const isOut = prod.stockQuantity === 0;
                  return (
                    <tr key={prod.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="py-3 px-4">
                        <div className="flex items-center space-x-3">
                          {(prod.imageUrls?.[0] || prod.imageUrl) ? (
                            <img
                              src={prod.imageUrls?.[0] || prod.imageUrl}
                              alt={prod.name}
                              referrerPolicy="no-referrer"
                              className="w-11 h-11 rounded-xl object-cover border border-slate-700 shrink-0 bg-slate-800"
                            />
                          ) : (
                            <div className="w-11 h-11 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-400 shrink-0">
                              <Package className="w-5 h-5" />
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="font-semibold text-white text-xs truncate max-w-sm">{prod.name}</p>
                            <p className="text-[11px] text-slate-400 truncate max-w-sm">{prod.description || 'No description'}</p>
                            {prod.categoryName && (
                              <span className="text-[10px] text-indigo-400 font-mono">{prod.categoryName}</span>
                            )}
                          </div>
                        </div>
                      </td>

                      <td className="py-3 px-4 font-mono text-xs text-emerald-400">{prod.sku}</td>

                      <td className="py-3 px-4 text-xs font-semibold text-white whitespace-nowrap">
                        {prod.salePrice ? (
                          <div>
                            <span className="text-emerald-400 font-bold">{tenant.currency} {prod.salePrice.toLocaleString()}</span>
                            <span className="text-slate-500 line-through text-[10px] ml-1.5">{prod.price.toLocaleString()}</span>
                          </div>
                        ) : (
                          <span>{tenant.currency} {prod.price.toLocaleString()}</span>
                        )}
                      </td>

                      <td className="py-3 px-4">
                        <div className="flex items-center space-x-2">
                          <span
                            className={`font-bold font-mono text-xs ${
                              isOut ? 'text-rose-400' : isLow ? 'text-amber-400' : 'text-emerald-400'
                            }`}
                          >
                            {prod.stockQuantity} units
                          </span>
                          {isLow && (
                            <span className="flex items-center text-amber-400 text-[10px]">
                              <AlertTriangle className="w-3 h-3 mr-0.5" /> Low
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="py-3 px-4">
                        <span
                          className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full border whitespace-nowrap ${
                            !prod.isActive
                              ? 'bg-slate-800 text-slate-400 border-slate-700'
                              : isOut
                              ? 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                              : isLow
                              ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                              : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                          }`}
                        >
                          {!prod.isActive ? 'Inactive' : isOut ? 'Out of Stock' : isLow ? 'Low Stock' : 'In Stock'}
                        </span>
                      </td>

                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end space-x-1.5">
                          {/* Edit Product Button */}
                          <button
                            onClick={() => handleOpenEdit(prod)}
                            title="Edit product details & prices"
                            className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 p-1.5 rounded-lg transition-colors inline-flex items-center space-x-1"
                          >
                            <Edit2 className="w-3.5 h-3.5 text-indigo-400" />
                            <span className="hidden sm:inline">Edit</span>
                          </button>

                          {/* Adjust Stock Button */}
                          <button
                            onClick={() => setSelectedProductForAdjust(prod)}
                            title="Adjust inventory level"
                            className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 p-1.5 rounded-lg transition-colors inline-flex items-center space-x-1"
                          >
                            <ArrowUpDown className="w-3.5 h-3.5 text-emerald-400" />
                            <span className="hidden sm:inline">Stock</span>
                          </button>

                          {/* Delete Product Button */}
                          <button
                            onClick={() => handleDelete(prod)}
                            title="Delete product"
                            className="text-xs bg-slate-800 hover:bg-rose-950/60 text-slate-400 hover:text-rose-400 border border-slate-700 hover:border-rose-900/50 p-1.5 rounded-lg transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* 1. Website Link Catalog Importer Modal (Groq AI)              */}
      {/* ------------------------------------------------------------- */}
      {isImportModalOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-lg w-full p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center space-x-2.5">
                <div className="p-2 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20">
                  <Globe className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-white">Import Products from Any Website</h2>
                  <p className="text-[11px] text-slate-400">Powered by Groq AI Catalog Scraping</p>
                </div>
              </div>
              <button
                onClick={() => {
                  if (!isImporting) setIsImportModalOpen(false);
                }}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-slate-800/50 border border-slate-700/60 rounded-2xl p-4 text-xs text-slate-300 space-y-2">
              <p className="font-semibold text-white flex items-center">
                <Sparkles className="w-3.5 h-3.5 text-purple-400 mr-1.5" />
                How Website Auto-Import Works:
              </p>
              <p className="text-slate-400 leading-relaxed">
                Paste any e-commerce product link or catalog page URL (Shopify, WooCommerce, custom online store).
                Groq AI will fetch the page, extract titles, prices, descriptions, images, and stock, and automatically add them to your store and Supabase database.
              </p>
            </div>

            <form onSubmit={handleImportSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-400 mb-1 font-medium">E-Commerce Website / Product Link *</label>
                <input
                  type="url"
                  required
                  placeholder="https://example-store.com/products/wireless-earbuds"
                  value={importUrl}
                  disabled={isImporting}
                  onChange={e => setImportUrl(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 disabled:opacity-60"
                />
              </div>

              {/* Status or Result message */}
              {isImporting && (
                <div className="bg-purple-950/30 border border-purple-800/40 rounded-xl p-3 flex items-center space-x-3 text-purple-300">
                  <Loader2 className="w-5 h-5 animate-spin text-purple-400 shrink-0" />
                  <div>
                    <p className="font-semibold">Fetching website & running Groq AI extraction...</p>
                    <p className="text-[11px] text-purple-400/80">Extracting product schemas, pricing, and high-res images.</p>
                  </div>
                </div>
              )}

              {importResult && (
                <div
                  className={`rounded-xl p-3.5 text-xs border ${
                    importResult.success
                      ? 'bg-emerald-950/30 border-emerald-800/40 text-emerald-300'
                      : 'bg-rose-950/30 border-rose-800/40 text-rose-300'
                  }`}
                >
                  {importResult.success ? (
                    <div className="flex items-center space-x-2">
                      <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                      <div>
                        <p className="font-bold">Successfully imported {importResult.count} products!</p>
                        <p className="text-[11px] text-emerald-400/80">Added to your catalog and synced with WhatsApp AI agent.</p>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <p className="font-bold">Import failed:</p>
                      <p className="text-[11px]">{importResult.error || 'Check that the URL is public and contains products.'}</p>
                    </div>
                  )}
                </div>
              )}

              <div className="flex justify-end space-x-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  disabled={isImporting}
                  onClick={() => setIsImportModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 text-slate-300 hover:bg-slate-700 rounded-xl font-medium"
                >
                  Close
                </button>
                <button
                  type="submit"
                  disabled={isImporting || !importUrl.trim()}
                  className="px-5 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white rounded-xl font-semibold shadow-md shadow-purple-950 flex items-center space-x-1.5 disabled:opacity-50"
                >
                  {isImporting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Extracting Products...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      <span>Start Groq Import</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* 2. Edit Product Modal                                          */}
      {/* ------------------------------------------------------------- */}
      {selectedProductForEdit && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-lg w-full p-6 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center space-x-2">
                <div className="p-2 bg-indigo-500/10 text-indigo-400 rounded-xl border border-indigo-500/20">
                  <Edit2 className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-white">Edit Product</h2>
                  <p className="text-[11px] text-slate-400 font-mono">{selectedProductForEdit.sku}</p>
                </div>
              </div>
              <button onClick={() => setSelectedProductForEdit(null)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-400 mb-1 font-medium">Product Name *</label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1 font-medium">SKU (Identifier) *</label>
                  <input
                    type="text"
                    required
                    value={editSku}
                    onChange={e => setEditSku(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1 font-medium">Category</label>
                  <input
                    type="text"
                    value={editCategory}
                    onChange={e => setEditCategory(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1 font-medium">Regular Price ({tenant.currency}) *</label>
                  <input
                    type="number"
                    required
                    min={0}
                    value={editPrice}
                    onChange={e => setEditPrice(Number(e.target.value))}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1 font-medium">Discount / Sale Price</label>
                  <input
                    type="number"
                    min={0}
                    placeholder="Optional"
                    value={editSalePrice}
                    onChange={e => setEditSalePrice(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1 font-medium">Stock Quantity *</label>
                  <input
                    type="number"
                    required
                    min={0}
                    value={editStock}
                    onChange={e => setEditStock(Number(e.target.value))}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1 font-medium">Low Stock Alert Threshold</label>
                  <input
                    type="number"
                    min={1}
                    value={editLowStock}
                    onChange={e => setEditLowStock(Number(e.target.value))}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <ProductImagesField values={editImageUrls} onChange={setEditImageUrls} />

              <div>
                <label className="block text-slate-400 mb-1 font-medium">Description (Used by Groq AI Agent)</label>
                <textarea
                  rows={3}
                  value={editDesc}
                  onChange={e => setEditDesc(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="flex items-center space-x-3 bg-slate-800/40 p-3 rounded-xl border border-slate-700/60">
                <input
                  type="checkbox"
                  id="editIsActive"
                  checked={editIsActive}
                  onChange={e => setEditIsActive(e.target.checked)}
                  className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 bg-slate-800 border-slate-700"
                />
                <label htmlFor="editIsActive" className="text-slate-300 font-medium cursor-pointer select-none">
                  Active in WhatsApp Catalog (AI can recommend and sell this product)
                </label>
              </div>

              <div className="flex justify-end space-x-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setSelectedProductForEdit(null)}
                  className="px-4 py-2 bg-slate-800 text-slate-300 hover:bg-slate-700 rounded-xl font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isUpdating}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-semibold shadow-md shadow-indigo-950 flex items-center space-x-1.5"
                >
                  {isUpdating ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  <span>Save Changes</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* 3. Add Product Modal                                           */}
      {/* ------------------------------------------------------------- */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-lg w-full p-6 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h2 className="text-base font-bold text-white">Add New Product to Store</h2>
              <button onClick={() => setIsAddModalOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-400 mb-1 font-medium">Product Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. M10 Bluetooth Wireless Earbuds"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1 font-medium">SKU (Stock Keeping Unit) *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. EARBUDS-M10"
                    value={newSku}
                    onChange={e => setNewSku(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1 font-medium">Category</label>
                  <input
                    type="text"
                    placeholder="e.g. Electronics, Clothing"
                    value={newCategory}
                    onChange={e => setNewCategory(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1 font-medium">Price ({tenant.currency}) *</label>
                  <input
                    type="number"
                    required
                    min={0}
                    value={newPrice}
                    onChange={e => setNewPrice(Number(e.target.value))}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1 font-medium">Discount / Sale Price</label>
                  <input
                    type="number"
                    min={0}
                    placeholder="Optional"
                    value={newSalePrice}
                    onChange={e => setNewSalePrice(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1 font-medium">Initial Stock Quantity *</label>
                  <input
                    type="number"
                    required
                    min={0}
                    value={newStock}
                    onChange={e => setNewStock(Number(e.target.value))}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1 font-medium">Low-Stock Alert Threshold</label>
                  <input
                    type="number"
                    min={1}
                    value={newLowStock}
                    onChange={e => setNewLowStock(Number(e.target.value))}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <ProductImagesField values={newImageUrls} onChange={setNewImageUrls} />

              <div>
                <label className="block text-slate-400 mb-1 font-medium">Product Description (Used by AI)</label>
                <textarea
                  rows={3}
                  placeholder="Color, specifications, sizing, or key features..."
                  value={newDesc}
                  onChange={e => setNewDesc(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="flex justify-end space-x-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 text-slate-300 hover:bg-slate-700 rounded-xl font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-semibold shadow-md shadow-emerald-950"
                >
                  Save Product
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* 4. Adjust Stock Modal                                          */}
      {/* ------------------------------------------------------------- */}
      {selectedProductForAdjust && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-base font-bold text-white">Adjust Stock: {selectedProductForAdjust.name}</h3>
              <button onClick={() => setSelectedProductForAdjust(null)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-slate-800/50 p-3 rounded-xl text-xs space-y-1">
              <div className="flex justify-between text-slate-400">
                <span>Current Stock:</span>
                <span className="font-bold text-white">{selectedProductForAdjust.stockQuantity} units</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>SKU:</span>
                <span className="font-mono text-emerald-400">{selectedProductForAdjust.sku}</span>
              </div>
            </div>

            <form onSubmit={handleAdjustSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-400 mb-1 font-medium">Quantity Adjustment (+ for Restock, - for Reduction)</label>
                <input
                  type="number"
                  value={adjustQty}
                  onChange={e => setAdjustQty(Number(e.target.value))}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono text-sm focus:outline-none focus:border-emerald-500"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  New resulting stock will be:{' '}
                  <span className="font-bold text-emerald-400">
                    {Math.max(0, selectedProductForAdjust.stockQuantity + Number(adjustQty))}
                  </span>{' '}
                  units
                </p>
              </div>

              <div>
                <label className="block text-slate-400 mb-1 font-medium">Adjustment Reason / Notes</label>
                <input
                  type="text"
                  value={adjustNote}
                  onChange={e => setAdjustNote(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="flex justify-end space-x-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setSelectedProductForAdjust(null)}
                  className="px-4 py-2 bg-slate-800 text-slate-300 hover:bg-slate-700 rounded-xl font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-semibold shadow-md shadow-emerald-950"
                >
                  Confirm Adjustment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
