import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import { post, get, put } from '../services/api';
import JsBarcode from 'jsbarcode';

export default function Products() {
  const [showForm, setShowForm] = useState(false);
  const [productName, setProductName] = useState('');
  const [sku, setSku] = useState('');
  const [category, setCategory] = useState('');
  const [lowStockThreshold, setLowStockThreshold] = useState('');
  const [error, setError] = useState('');

  const navigate = useNavigate();
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [items, setItems] = useState<Array<{ product_id: number; product_name: string; sku: string | null; category: string | null; low_stock_threshold: number | null }>>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingMode, setEditingMode] = useState(false);
  const [barcodeProductId, setBarcodeProductId] = useState<number | ''>('');
  const [barcodeBrand, setBarcodeBrand] = useState('');
  const [barcodeInvoice, setBarcodeInvoice] = useState('');
  const [barcodeDate, setBarcodeDate] = useState('');
  const [barcodePrice, setBarcodePrice] = useState('');
  const [showInvoiceSuggest, setShowInvoiceSuggest] = useState(false);
  const [barcodeMode, setBarcodeMode] = useState<'premade' | 'view'>('premade');
  const [viewBarcodeProductId, setViewBarcodeProductId] = useState<number | ''>('');
  const [viewBarcodeProductQuery, setViewBarcodeProductQuery] = useState('');
  const [showViewProductSuggest, setShowViewProductSuggest] = useState(false);
  const [viewPurchaseDate, setViewPurchaseDate] = useState('');
  const [searchResults, setSearchResults] = useState<Array<{
    barcode_id: number;
    product_id: number;
    invoice_no: string | null;
    brand: string | null;
    purchase_date: string | null;
    barcode: string;
    created_at: string;
    product_name: string | null;
    sku: string | null;
  }>>([]);
  const [selectedViewBarcode, setSelectedViewBarcode] = useState<string | null>(null);
  const viewBarcodeRef = useRef<SVGSVGElement>(null);
  const [printerType, setPrinterType] = useState<'thermal' | 'normal'>('thermal');
  const [premadeBarcode, setPremadeBarcode] = useState('');
  const [premadeProductId, setPremadeProductId] = useState<number | ''>('');
  const [premadeProductQuery, setPremadeProductQuery] = useState('');
  const [showPremadeProductSuggest, setShowPremadeProductSuggest] = useState(false);
  const [premadeBrand, setPremadeBrand] = useState('');
  const [premadeInvoice, setPremadeInvoice] = useState('');
  const [premadeDate, setPremadeDate] = useState('');
  const [premadePrice, setPremadePrice] = useState('');
  const [showPremadeInvoiceSuggest, setShowPremadeInvoiceSuggest] = useState(false);
  const [filterText, setFilterText] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterSku, setFilterSku] = useState('');
  const [filterId, setFilterId] = useState('');
  const [page, setPage] = useState(0);
  const pageSize = 6;
  const barcodeRef = useRef<SVGSVGElement>(null);
  const categories = [
    'Building & Hardware',
    'Digital Goods',
    'Garden',
    'Indoor Living',
    'Kitchen Taps',
    'Lighting & Electrical',
    'Machinery',
    'Outdoor Living',
    'Paint & Decorating',
    'Plantation',
    'Sinks & Filtration',
    'Storage & Cleaning',
    'Tools'
  ];

  const roseGold = '#31a354';
  const roseGoldLight = '#e0e0e0';
  const gold = '#31a354';
  const goldHover = '#003366';

  function toggleForm() {
    setShowForm(v => !v);
    if (showForm) {
      // Reset editing state when closing form
      setEditingMode(false);
      setEditingId(null);
      setProductName('');
      setSku('');
      setCategory('');
      setLowStockThreshold('');
      setError('');
    }
  }

  function startEdit(product: { product_id: number; product_name: string; sku: string | null; category: string | null; low_stock_threshold: number | null }) {
    setEditingId(product.product_id);
    setEditingMode(true);
    setProductName(product.product_name || '');
    setSku(product.sku || '');
    setCategory(product.category || '');
    setLowStockThreshold(product.low_stock_threshold !== null ? String(product.low_stock_threshold) : '');
    setError('');
    setShowForm(true);
  }

  async function deleteProduct(productId: number, productName: string) {
    if (!window.confirm(`Are you sure you want to delete this product?\n\nProduct: ${productName}\nID: ${productId}\n\nWarning: This action cannot be undone!`)) {
      return;
    }
    
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`http://localhost:5000/api/products/${productId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || 'Failed to delete product');
      }
      
      alert('Product deleted successfully!');
      fetchProducts();
    } catch (err: any) {
      if (err?.message?.includes('401') || err?.message?.includes('Unauthorized')) {
        navigate('/login', { replace: true });
      } else {
        alert(err?.message || 'Failed to delete product');
      }
    }
  }



  async function fetchProducts() {
    try {
      const data = await get('/products');
      setItems(data.products || []);
    } catch (err: any) {
      if (err?.status === 401) {
        navigate('/login', { replace: true });
        return;
      }
    }
  }

  useEffect(() => { fetchProducts(); }, []);
  useEffect(() => {
    setPage(0);
  }, [filterText, filterId, filterCategory, filterSku]);

  const [barcodeProductQuery, setBarcodeProductQuery] = useState('');
  const [showBarcodeProductSuggest, setShowBarcodeProductSuggest] = useState(false);
  const [purchases, setPurchases] = useState<any[]>([]);
  const filteredBarcodeProducts = useMemo(() => {
    const q = barcodeProductQuery.toLowerCase();
    return items.filter(p => p.product_name.toLowerCase().includes(q) || String(p.product_id).includes(barcodeProductQuery.trim()));
  }, [items, barcodeProductQuery]);
  useEffect(() => {
    (async () => {
      try {
        const r = await get('/purchases');
        setPurchases(r.purchases || []);
      } catch (err: any) { if (err?.status === 401) navigate('/login', { replace: true }); }
    })();
  }, []);

  const invoiceSuggestions = useMemo(() => {
    if (!barcodeDate) return [] as Array<{ invoice_no: string; label: string }>;
    const dateStr = barcodeDate;
    const nameOf = (pid: number) => items.find(pr => pr.product_id === pid)?.product_name || `Product ${pid}`;
    const out: Array<{ invoice_no: string; label: string }> = [];
    for (const p of purchases) {
      if (String(p.date).slice(0,10) !== dateStr) continue;
      const its = p.items || [];
      const purchaseDate = String(p.date).slice(0,10);
      if (barcodeProductId) {
        const it = its.find((x: any) => x.product_id === barcodeProductId);
        if (!it) continue;
        out.push({ invoice_no: p.invoice_no || '', label: `${nameOf(it.product_id)}${it.brand ? ` (${it.brand})` : ''} (Purchased: ${purchaseDate})` });
      } else {
        const first = its[0];
        const nm = first ? nameOf(first.product_id) : '';
        out.push({ invoice_no: p.invoice_no || '', label: `${nm}${first?.brand ? ` (${first.brand})` : ''} (Purchased: ${purchaseDate})` });
      }
    }
    return out;
  }, [purchases, barcodeDate, barcodeProductId, items]);

  // Auto-show invoice suggestions when they become available
  useEffect(() => {
    console.log('Invoice Suggestions:', invoiceSuggestions);
    console.log('Purchases Data:', purchases);
    console.log('Selected Date:', barcodeDate);
    console.log('Selected Product ID:', barcodeProductId);
    
    if (invoiceSuggestions.length > 0) {
      setShowInvoiceSuggest(true);
    } else if (invoiceSuggestions.length === 0) {
      setShowInvoiceSuggest(false);
    }
  }, [invoiceSuggestions, purchases, barcodeDate, barcodeProductId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    try {
      if (editingMode && editingId !== null) {
        await put(`/products/${editingId}`, { 
          product_name: productName, 
          sku, 
          category, 
          low_stock_threshold: Number(lowStockThreshold) || 0 
        });
      } else {
        await post('/products', { 
          product_name: productName, 
          sku, 
          category, 
          low_stock_threshold: Number(lowStockThreshold) || 0 
        });
      }
      setConfirmVisible(true);
      setTimeout(() => setConfirmVisible(false), 700);
      setProductName('');
      setSku('');
      setCategory('');
      setLowStockThreshold('');
      setShowForm(false);
      setEditingMode(false);
      setEditingId(null);
      fetchProducts();
    } catch (err: any) {
      if (err?.status === 401 || /Unauthorized/i.test(err?.message || '')) {
        navigate('/login', { replace: true });
        return;
      }
      setError(err?.message || 'Failed to save product');
    }
  }

  // Generate barcode whenever inputs change
  const currentBarcodeValue = useMemo(() => {
    if (!barcodeProductId) return '';
    const pid = barcodeProductId;
    const b = (barcodeBrand || '').replace(/\s+/g, '');
    const inv = barcodeInvoice ? String(barcodeInvoice).replace(/\s+/g, '').toUpperCase() : '';
    const d = barcodeDate ? String(barcodeDate).replace(/-/g,'') : '';
    return `BC-${pid}${b ? '-' + b : ''}${inv ? '-' + inv : ''}${d ? '-' + d : ''}`;
  }, [barcodeProductId, barcodeBrand, barcodeInvoice, barcodeDate]);

  useEffect(() => {
    if (barcodeRef.current && currentBarcodeValue) {
      try {
        JsBarcode(barcodeRef.current, currentBarcodeValue, {
          format: 'CODE128',
          width: 2,
          height: 60,
          displayValue: true,
          fontSize: 14,
          margin: 10
        });
      } catch (err) {
        console.error('Barcode generation error:', err);
      }
    }
  }, [currentBarcodeValue]);

  async function printBarcode() {
    const pid = barcodeProductId === '' ? 0 : barcodeProductId;
    if (!pid) { 
      alert('Select product'); 
      return; 
    }
    
    const selectedProduct = items.find(p => p.product_id === pid);
    const productName = selectedProduct?.product_name || '';
    
    try {
      if (printerType === 'thermal') {
        // Call backend API to print directly to thermal printer
        const response = await post('/print/barcode', {
          product_name: productName,
          barcode_value: currentBarcodeValue,
          price: barcodePrice || undefined,
          printer_type: 'thermal',
        });
        
        alert('Barcode printed successfully to thermal printer!');
      } else {
        // Call backend API to get PDF for normal printer
        const token = localStorage.getItem('token');
        const response = await fetch('http://localhost:5000/api/print/barcode', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({
            product_name: productName,
            barcode_value: currentBarcodeValue,
            price: barcodePrice || undefined,
            printer_type: 'normal',
          }),
        });
        
        if (!response.ok) {
          throw new Error('Failed to generate PDF');
        }
        
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const printWindow = window.open(url, '_blank');
        
        if (printWindow) {
          printWindow.focus();
          // Wait for PDF to load, then trigger print dialog
          printWindow.onload = () => {
            printWindow.print();
          };
        }
        
        // Clean up the URL after a delay
        setTimeout(() => window.URL.revokeObjectURL(url), 30000);
      }
    } catch (err: any) {
      if (err?.status === 503) {
        alert('Printer not connected. Please check if XP-80C is online and try again.');
      } else {
        alert(err?.message || 'Failed to print barcode. Please check printer connection.');
      }
      console.error('Print error:', err);
    }
  }

  return (
    <Layout backgroundColor="#d0d0d0ff">
    <div style={{ padding: 24 }}>
      <style>
        {`
          @keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
        `}
      </style>
      {confirmVisible && (
        <div style={{ position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', zIndex: 9999, pointerEvents: 'none' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#fff', border: `1px solid ${roseGoldLight}`, borderRadius: 12, padding: '14px 18px', boxShadow: '0 8px 24px rgba(0,0,0,0.12)' }}>
            <span style={{ fontSize: 24 }}>💾</span>
            <span style={{ color: roseGold, fontWeight: 600 }}>Product saved</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <div style={{ width: 10, height: 18, background: roseGold, animation: 'blink 1s step-end infinite' }} />
            </div>
          </div>
        </div>
      )}
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ color: '#fff', margin: 0 }}>Products</h2>
      </div>

        {showForm && (
        <form onSubmit={submit} style={{
          borderRadius: 12,
          padding: 16,
          width: '100%',
          maxWidth: 520,
          background: '#444',
          boxShadow: '0 6px 18px rgba(0,0,0,0.08)',
          boxSizing: 'border-box',
          marginBottom: 16,
          color: '#fff'
        }}>
          {error && (<div style={{ color: 'red', marginBottom: 12 }}>{error}</div>)}

          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', marginBottom: 6 }}>Product Name</label>
            <input
              value={productName}
              onChange={e => setProductName(e.target.value)}
              style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #555', boxSizing: 'border-box', background: '#444', color: '#fff' }}
              required
            />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', marginBottom: 6 }}>SKU</label>
            <select
              value={sku}
              onChange={e => setSku(e.target.value)}
              style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #555', boxSizing: 'border-box', background: '#444', color: '#fff' }}
            >
              <option value="">Select...</option>
              <option value="Grams">Grams</option>
              <option value="KG">KG</option>
              <option value="PCS">PCS</option>
              <option value="FT">FT</option>
              <option value="INCH">INCH</option>
              <option value="Meters">Meters</option>
            </select>
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', marginBottom: 6 }}>Category</label>
            <select
              value={category}
              onChange={e => setCategory(e.target.value)}
              style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #555', boxSizing: 'border-box', background: '#444', color: '#fff' }}
            >
              <option value="">Select...</option>
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', marginBottom: 6 }}>Low Stock Threshold</label>
            <input
              type="number"
              value={lowStockThreshold}
              onChange={e => setLowStockThreshold(e.target.value)}
              placeholder="e.g. 10"
              style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #555', boxSizing: 'border-box', background: '#444', color: '#fff' }}
            />
          </div>
          <button type="submit" style={{ background: gold, color: '#fff', border: 'none', padding: '8px 16px', borderRadius: 8, fontWeight: 600, cursor: 'pointer', boxShadow: '0 2px 6px rgba(0,0,0,0.15)' }}
              onMouseEnter={e => { e.currentTarget.style.background = goldHover; e.currentTarget.style.color = '#fff' }}
              onMouseLeave={e => { e.currentTarget.style.background = gold; e.currentTarget.style.color = '#fff' }}
            >
              {editingMode ? 'Update Product' : 'Save Product'}
            </button>
        </form>
      )}
      
      <div style={{ marginBottom: 16 }}>
        <button
          onClick={toggleForm}
          style={{
            background: gold,
            color: '#fff',
            border: 'none',
            padding: '8px 16px',
            borderRadius: 8,
            fontWeight: 600,
            cursor: 'pointer',
            boxShadow: '0 2px 6px rgba(0,0,0,0.15)'
          }}
          onMouseEnter={e => { e.currentTarget.style.background = goldHover; e.currentTarget.style.color = '#fff' }}
          onMouseLeave={e => { e.currentTarget.style.background = gold; e.currentTarget.style.color = '#fff' }}
        >
          {showForm ? 'Close' : 'Add Product'}
        </button>
      </div>

      {!showForm && (
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, alignItems: 'start' }}>
        <div>

          <div style={{ marginTop: 0 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
              <input
                placeholder="Search by name"
                value={filterText}
                onChange={e => setFilterText(e.target.value)}
                style={{ flex: 2, padding: 10, borderRadius: 8, border: 'none', background: '#444', color: '#fff', boxSizing: 'border-box' }}
              />
              <input
                placeholder="Search by ID"
                value={filterId}
                onChange={e => setFilterId(e.target.value)}
                type="number"
                style={{ flex: 1, padding: 10, borderRadius: 8, border: 'none', background: '#444', color: '#fff', boxSizing: 'border-box' }}
              />
              <select
                value={filterCategory}
                onChange={e => setFilterCategory(e.target.value)}
                style={{ flex: 1, padding: 10, borderRadius: 8, border: 'none', boxSizing: 'border-box', background: '#444', color: '#fff' }}
              >
                <option value="">All Categories</option>
                {categories.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <select
                value={filterSku}
                onChange={e => setFilterSku(e.target.value)}
                style={{ flex: 1, padding: 10, borderRadius: 8, border: 'none', boxSizing: 'border-box', background: '#444', color: '#fff' }}
              >
                <option value="">All SKUs</option>
                <option value="Grams">Grams</option>
                <option value="KG">KG</option>
                <option value="PCS">PCS</option>
                <option value="FT">FT</option>
                <option value="INCH">INCH</option>
                <option value="Meters">Meters</option>
              </select>
            </div>

            {items.length === 0 ? (
              <p>No products yet.</p>
            ) : (
              (() => {
                const filtered = items
                  .filter(it => !filterText || it.product_name.toLowerCase().includes(filterText.toLowerCase()))
                  .filter(it => !filterId || it.product_id === Number(filterId))
                  .filter(it => !filterCategory || it.category === filterCategory)
                  .filter(it => !filterSku || it.sku === filterSku);
                const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
                const curPage = Math.min(page, totalPages - 1);
                const start = curPage * pageSize;
                const end = start + pageSize;
                const pageItems = filtered.slice(start, end);
                return (
                  <div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 10 }}>
                      {pageItems.map(it => (
                        <div key={it.product_id} style={{ borderRadius: 8, padding: 12, background: '#444', color: '#fff', position: 'relative' }}>
                          <div style={{ fontWeight: 700, color: '#fff', marginBottom: 4 }}>{it.product_name}</div>
                          <div style={{ fontSize: 12, color: '#ccc' }}>SKU: {it.sku || '-'}</div>
                          <div style={{ fontSize: 12, color: '#ccc', marginBottom: 8 }}>Category: {it.category || '-'}</div>
                          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                            <button
                              onClick={() => startEdit(it)}
                              style={{
                                background: gold,
                                color: '#fff',
                                border: 'none',
                                padding: '6px 12px',
                                borderRadius: 6,
                                fontSize: 12,
                                fontWeight: 600,
                                cursor: 'pointer',
                                boxShadow: '0 2px 4px rgba(0,0,0,0.15)',
                                flex: 1
                              }}
                              onMouseEnter={e => { e.currentTarget.style.background = goldHover; }}
                              onMouseLeave={e => { e.currentTarget.style.background = gold; }}
                            >
                              ✏️ Edit
                            </button>
                            <button
                              onClick={() => deleteProduct(it.product_id, it.product_name)}
                              style={{
                                background: '#dc3545',
                                color: '#fff',
                                border: 'none',
                                padding: '6px 12px',
                                borderRadius: 6,
                                fontSize: 12,
                                fontWeight: 600,
                                cursor: 'pointer',
                                boxShadow: '0 2px 4px rgba(0,0,0,0.15)',
                                flex: 1
                              }}
                              onMouseEnter={e => { e.currentTarget.style.background = '#c82333'; }}
                              onMouseLeave={e => { e.currentTarget.style.background = '#dc3545'; }}
                            >
                              🗑️ Delete
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 }}>
                      <button
                        onClick={() => setPage(p => Math.max(0, p - 1))}
                        disabled={curPage === 0}
                        style={{ background: gold, color: '#fff', border: 'none', padding: '8px 12px', borderRadius: 8, fontWeight: 600, cursor: curPage===0 ? 'not-allowed' : 'pointer', opacity: curPage===0 ? 0.6 : 1 }}
                        onMouseEnter={e => { if (curPage!==0) { e.currentTarget.style.background = goldHover; e.currentTarget.style.color = '#fff'; } }}
                        onMouseLeave={e => { e.currentTarget.style.background = gold; e.currentTarget.style.color = '#fff'; }}
                      >
                        Prev
                      </button>
                      <div style={{ fontSize: 12, color: '#555' }}>Page {curPage + 1} of {totalPages}</div>
                      <button
                        onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                        disabled={curPage >= totalPages - 1}
                        style={{ background: gold, color: '#fff', border: 'none', padding: '8px 12px', borderRadius: 8, fontWeight: 600, cursor: curPage>=totalPages-1 ? 'not-allowed' : 'pointer', opacity: curPage>=totalPages-1 ? 0.6 : 1 }}
                        onMouseEnter={e => { if (curPage<totalPages-1) { e.currentTarget.style.background = goldHover; e.currentTarget.style.color = '#fff'; } }}
                        onMouseLeave={e => { e.currentTarget.style.background = gold; e.currentTarget.style.color = '#fff'; }}
                      >
                        Next
                      </button>
                    </div>
                  </div>
                );
              })()
            )}
          </div>
        </div>
        <div>
          <div style={{ borderRadius: 12, padding: 16, background: '#444', boxShadow: '0 6px 18px rgba(0,0,0,0.08)', color: '#fff' }}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <button
                onClick={() => setBarcodeMode('premade')}
                style={{
                  background: barcodeMode === 'premade' ? gold : '#555',
                  color: '#fff',
                  border: 'none',
                  padding: '8px 16px',
                  borderRadius: 8,
                  fontWeight: 600,
                  cursor: 'pointer',
                  flex: 1
                }}
              >
                Pre-Made Barcodes
              </button>
              <button
                onClick={() => setBarcodeMode('view')}
                style={{
                  background: barcodeMode === 'view' ? gold : '#555',
                  color: '#fff',
                  border: 'none',
                  padding: '8px 16px',
                  borderRadius: 8,
                  fontWeight: 600,
                  cursor: 'pointer',
                  flex: 1
                }}
              >
                View Barcode
              </button>
            </div>

            {barcodeMode === 'premade' && (
            <>
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', marginBottom: 6 }}>Barcode</label>
              <input
                placeholder="Scan or enter barcode"
                value={premadeBarcode}
                onChange={e => setPremadeBarcode(e.target.value)}
                style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #555', background: '#444', color: '#fff', boxSizing: 'border-box' }}
              />
            </div>
            
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', marginBottom: 6 }}>Search Product (name or ID)</label>
              <div style={{ position: 'relative' }}>
                <input
                  placeholder="Search product"
                  value={premadeProductQuery}
                  onChange={e=>{ 
                    const v = e.target.value; 
                    setPremadeProductQuery(v); 
                    setShowPremadeProductSuggest(true);
                    const num = Number(v);
                    if (!isNaN(num) && num > 0) {
                      const p = items.find(pp => pp.product_id === num);
                      if (p) { setPremadeProductId(p.product_id); setPremadeProductQuery(p.product_name); setShowPremadeProductSuggest(false); }
                    }
                  }}
                  onFocus={()=>setShowPremadeProductSuggest(true)}
                  onBlur={()=>setTimeout(()=>setShowPremadeProductSuggest(false), 150)}
                  onKeyDown={e=>{ 
                    if (e.key === 'Enter') {
                      const filtered = items.filter(p => p.product_name.toLowerCase().includes(premadeProductQuery.toLowerCase()) || String(p.product_id).includes(premadeProductQuery.trim()));
                      if (filtered[0]) { 
                        const p=filtered[0]; 
                        setPremadeProductId(p.product_id); 
                        setPremadeProductQuery(p.product_name); 
                        setShowPremadeProductSuggest(false); 
                      } 
                    }
                  }}
                  style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #555', boxSizing: 'border-box', background: '#444', color: '#fff' }}
                />
                {showPremadeProductSuggest && premadeProductQuery && (
                  <div style={{ position: 'absolute', left: 0, right: 0, top: '100%', background: '#444', border: '1px solid #555', borderRadius: 8, boxShadow: '0 6px 18px rgba(0,0,0,0.08)', zIndex: 10, maxHeight: 180, overflowY: 'auto' }}>
                    {items.filter(p => p.product_name.toLowerCase().includes(premadeProductQuery.toLowerCase()) || String(p.product_id).includes(premadeProductQuery.trim())).map(p => (
                      <div key={p.product_id} onMouseDown={()=>{ setPremadeProductId(p.product_id); setPremadeProductQuery(p.product_name); setShowPremadeProductSuggest(false); }} style={{ padding: '8px 12px', cursor: 'pointer', color: '#fff' }} onMouseEnter={e=>{ e.currentTarget.style.background = '#555'; }} onMouseLeave={e=>{ e.currentTarget.style.background = '#444'; }}>
                        {p.product_name} [ID: {p.product_id}]
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', marginBottom: 6 }}>Invoice No (optional)</label>
              <div style={{ position: 'relative' }}>
                <input
                  value={premadeInvoice}
                  onChange={e=>setPremadeInvoice(e.target.value)}
                  onFocus={()=>setShowPremadeInvoiceSuggest(true)}
                  onBlur={()=>setTimeout(()=>setShowPremadeInvoiceSuggest(false), 160)}
                  onKeyDown={e=>{ 
                    if (e.key === 'Enter') {
                      const suggestions = (() => {
                        if (!premadeDate) return [] as Array<{ invoice_no: string; label: string }>;
                        const dateStr = premadeDate;
                        const nameOf = (pid: number) => items.find(pr => pr.product_id === pid)?.product_name || `Product ${pid}`;
                        const out: Array<{ invoice_no: string; label: string }> = [];
                        for (const p of purchases) {
                          if (String(p.date).slice(0,10) !== dateStr) continue;
                          const its = p.items || [];
                          const purchaseDate = String(p.date).slice(0,10);
                          if (premadeProductId) {
                            const it = its.find((x: any) => x.product_id === premadeProductId);
                            if (!it) continue;
                            out.push({ invoice_no: p.invoice_no || '', label: `${nameOf(it.product_id)}${it.brand ? ` (${it.brand})` : ''} (Purchased: ${purchaseDate})` });
                          } else {
                            const first = its[0];
                            const nm = first ? nameOf(first.product_id) : '';
                            out.push({ invoice_no: p.invoice_no || '', label: `${nm}${first?.brand ? ` (${first.brand})` : ''} (Purchased: ${purchaseDate})` });
                          }
                        }
                        return out;
                      })();
                      if (suggestions[0]) { 
                        setPremadeInvoice(suggestions[0].invoice_no); 
                        setShowPremadeInvoiceSuggest(false); 
                      } 
                    }
                  }}
                  placeholder="e.g., INV-123"
                  style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #555', boxSizing: 'border-box', background: '#444', color: '#fff' }}
                />
                {showPremadeInvoiceSuggest && (() => {
                  if (!premadeDate) return null;
                  const dateStr = premadeDate;
                  const nameOf = (pid: number) => items.find(pr => pr.product_id === pid)?.product_name || `Product ${pid}`;
                  const suggestions: Array<{ invoice_no: string; label: string }> = [];
                  for (const p of purchases) {
                    if (String(p.date).slice(0,10) !== dateStr) continue;
                    const its = p.items || [];
                    const purchaseDate = String(p.date).slice(0,10);
                    if (premadeProductId) {
                      const it = its.find((x: any) => x.product_id === premadeProductId);
                      if (!it) continue;
                      suggestions.push({ invoice_no: p.invoice_no || '', label: `${nameOf(it.product_id)}${it.brand ? ` (${it.brand})` : ''} (Purchased: ${purchaseDate})` });
                    } else {
                      const first = its[0];
                      const nm = first ? nameOf(first.product_id) : '';
                      suggestions.push({ invoice_no: p.invoice_no || '', label: `${nm}${first?.brand ? ` (${first.brand})` : ''} (Purchased: ${purchaseDate})` });
                    }
                  }
                  return suggestions.length > 0 ? (
                    <div style={{ position: 'absolute', left: 0, right: 0, top: '100%', background: '#444', border: '1px solid #555', borderRadius: 8, boxShadow: '0 6px 18px rgba(0,0,0,0.08)', zIndex: 10, maxHeight: 180, overflowY: 'auto' }}>
                      {suggestions.map(s => (
                        <div
                          key={`${s.invoice_no}-${s.label}`}
                          onMouseDown={()=>{ setPremadeInvoice(s.invoice_no); setShowPremadeInvoiceSuggest(false); }}
                          style={{ padding: '8px 12px', cursor: 'pointer', color: '#fff' }}
                          onMouseEnter={e=>{ e.currentTarget.style.background = '#555'; }}
                          onMouseLeave={e=>{ e.currentTarget.style.background = '#444'; }}
                        >
                          {s.label}
                        </div>
                      ))}
                    </div>
                  ) : null;
                })()}
              </div>
            </div>
            
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', marginBottom: 6 }}>Date</label>
              <input type="date" value={premadeDate} onChange={e=>setPremadeDate(e.target.value)} style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #555', background: '#444', color: '#fff', boxSizing: 'border-box' }} />
            </div>
            
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', marginBottom: 6 }}>Brand (optional)</label>
              <input value={premadeBrand} onChange={e=>setPremadeBrand(e.target.value)} placeholder="e.g., Astra" style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #555', background: '#444', color: '#fff', boxSizing: 'border-box' }} />
            </div>
            
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', marginBottom: 6 }}>Price of item (optional)</label>
              <input 
                type="number" 
                step="0.01" 
                value={premadePrice} 
                onChange={e=>setPremadePrice(e.target.value)} 
                placeholder="e.g., 1250.00" 
                style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #555', background: '#444', color: '#fff', boxSizing: 'border-box' }} 
              />
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', marginBottom: 6 }}>Printer Type</label>
              <select
                value={printerType}
                onChange={e=>setPrinterType(e.target.value as 'thermal' | 'normal')}
                style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #555', background: '#444', color: '#fff', boxSizing: 'border-box' }}
              >
                <option value="thermal">Thermal Printer (XP-80C)</option>
                <option value="normal">Normal Printer</option>
              </select>
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={async () => {
                  const pid = premadeProductId === '' ? 0 : premadeProductId;
                  if (!pid) { alert('Select product'); return; }
                  if (!premadeBarcode.trim()) { alert('Enter barcode'); return; }
                  try {
                    const data = await post('/barcode', { 
                      product_id: pid, 
                      invoice_no: premadeInvoice || undefined, 
                      brand: premadeBrand || undefined, 
                      date: premadeDate || undefined, 
                      barcode: premadeBarcode.trim() 
                    });
                    setConfirmVisible(true);
                    setTimeout(() => setConfirmVisible(false), 700);
                    setPremadeBarcode('');
                    setPremadeProductId('');
                    setPremadeProductQuery('');
                    setPremadeBrand('');
                    setPremadeInvoice('');
                    setPremadeDate('');
                    setPremadePrice('');
                  } catch (err: any) {
                    alert(err?.message || 'Failed to save barcode');
                  }
                }}
                style={{
                  background: gold,
                  color: '#fff',
                  border: 'none',
                  padding: '8px 16px',
                  borderRadius: 8,
                  fontWeight: 600,
                  cursor: 'pointer',
                  boxShadow: '0 2px 6px rgba(0,0,0,0.15)'
                }}
                onMouseEnter={e => { e.currentTarget.style.background = goldHover; e.currentTarget.style.color = '#fff' }}
                onMouseLeave={e => { e.currentTarget.style.background = gold; e.currentTarget.style.color = '#fff' }}
              >
                Save Barcode
              </button>
              <button
                onClick={async () => {
                  const pid = premadeProductId === '' ? 0 : premadeProductId;
                  if (!pid) { alert('Select product'); return; }
                  if (!premadeBarcode.trim()) { alert('Enter barcode'); return; }
                  
                  const selectedProduct = items.find(p => p.product_id === pid);
                  const productName = selectedProduct?.product_name || '';
                  
                  try {
                    if (printerType === 'thermal') {
                      await post('/print/barcode', {
                        product_name: productName,
                        barcode_value: premadeBarcode.trim(),
                        price: premadePrice || undefined,
                        printer_type: 'thermal',
                      });
                      alert('Barcode printed successfully to thermal printer!');
                    } else {
                      const token = localStorage.getItem('token');
                      const response = await fetch('http://localhost:5000/api/print/barcode', {
                        method: 'POST',
                        headers: {
                          'Content-Type': 'application/json',
                          'Authorization': `Bearer ${token}`,
                        },
                        body: JSON.stringify({
                          product_name: productName,
                          barcode_value: premadeBarcode.trim(),
                          price: premadePrice || undefined,
                          printer_type: 'normal',
                        }),
                      });
                      
                      if (!response.ok) {
                        throw new Error('Failed to generate PDF');
                      }
                      
                      const blob = await response.blob();
                      const url = window.URL.createObjectURL(blob);
                      const printWindow = window.open(url, '_blank');
                      
                      if (printWindow) {
                        printWindow.focus();
                        printWindow.onload = () => {
                          printWindow.print();
                        };
                      }
                      
                      setTimeout(() => window.URL.revokeObjectURL(url), 30000);
                    }
                  } catch (err: any) {
                    if (err?.status === 503) {
                      alert('Printer not connected. Please check if XP-80C is online and try again.');
                    } else {
                      alert(err?.message || 'Failed to print barcode. Please check printer connection.');
                    }
                    console.error('Print error:', err);
                  }
                }}
                disabled={!premadeProductId || !premadeBarcode.trim()}
                style={{
                  background: premadeProductId && premadeBarcode.trim() ? gold : '#ccc',
                  color: '#fff',
                  border: 'none',
                  padding: '8px 16px',
                  borderRadius: 8,
                  fontWeight: 600,
                  cursor: premadeProductId && premadeBarcode.trim() ? 'pointer' : 'not-allowed',
                  boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
                  opacity: premadeProductId && premadeBarcode.trim() ? 1 : 0.6
                }}
                onMouseEnter={e => { if (premadeProductId && premadeBarcode.trim()) { e.currentTarget.style.background = goldHover; e.currentTarget.style.color = '#fff' }}}
                onMouseLeave={e => { if (premadeProductId && premadeBarcode.trim()) { e.currentTarget.style.background = gold; e.currentTarget.style.color = '#fff' }}}
              >
                Print Barcode
              </button>
            </div>
            </>
            )}

            {barcodeMode === 'view' && (
            <>
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', marginBottom: 6, color: '#fff' }}>Search Product (name or ID)</label>
              <div style={{ position: 'relative' }}>
                <input
                  placeholder="Search product"
                  value={viewBarcodeProductQuery}
                  onChange={e=>{ 
                    const v = e.target.value; 
                    setViewBarcodeProductQuery(v); 
                    setShowViewProductSuggest(true);
                    const num = Number(v);
                    if (!isNaN(num) && num > 0) {
                      const p = items.find(pp => pp.product_id === num);
                      if (p) { setViewBarcodeProductId(p.product_id); setViewBarcodeProductQuery(p.product_name); setShowViewProductSuggest(false); }
                    }
                  }}
                  onFocus={()=>setShowViewProductSuggest(true)}
                  onBlur={()=>setTimeout(()=>setShowViewProductSuggest(false), 150)}
                  style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #555', boxSizing: 'border-box', background: '#444', color: '#fff' }}
                />
                {showViewProductSuggest && viewBarcodeProductQuery && (
                  <div style={{ position: 'absolute', left: 0, right: 0, top: '100%', background: '#444', border: '1px solid #555', borderRadius: 8, boxShadow: '0 6px 18px rgba(0,0,0,0.08)', zIndex: 10, maxHeight: 180, overflowY: 'auto' }}>
                    {items.filter(p => p.product_name.toLowerCase().includes(viewBarcodeProductQuery.toLowerCase()) || String(p.product_id).includes(viewBarcodeProductQuery.trim())).map(p => (
                      <div key={p.product_id} onMouseDown={()=>{ setViewBarcodeProductId(p.product_id); setViewBarcodeProductQuery(p.product_name); setShowViewProductSuggest(false); }} style={{ padding: '8px 12px', cursor: 'pointer', color: '#fff' }} onMouseEnter={e=>{ e.currentTarget.style.background = '#555'; }} onMouseLeave={e=>{ e.currentTarget.style.background = '#444'; }}>
                        {p.product_name} [ID: {p.product_id}]
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', marginBottom: 6, color: '#fff' }}>Purchase Date</label>
              <input 
                type="date" 
                value={viewPurchaseDate} 
                onChange={e=>setViewPurchaseDate(e.target.value)} 
                style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #555', background: '#444', color: '#fff', boxSizing: 'border-box' }} 
              />
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', marginBottom: 6, color: '#fff' }}>Printer Type</label>
              <select
                value={printerType}
                onChange={e=>setPrinterType(e.target.value as 'thermal' | 'normal')}
                style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #555', background: '#444', color: '#fff', boxSizing: 'border-box' }}
              >
                <option value="thermal">Thermal Printer (XP-80C)</option>
                <option value="normal">Normal Printer</option>
              </select>
            </div>

            <button
              onClick={async () => {
                if (!viewBarcodeProductId && !viewPurchaseDate) {
                  alert('Please select a product or purchase date');
                  return;
                }
                try {
                  const params = new URLSearchParams();
                  if (viewBarcodeProductId) params.append('product_id', String(viewBarcodeProductId));
                  if (viewPurchaseDate) params.append('purchase_date', viewPurchaseDate);
                  
                  const data = await get(`/barcode/search?${params.toString()}`);
                  setSearchResults(data.barcodes || []);
                  setSelectedViewBarcode(null);
                } catch (err: any) {
                  alert(err?.message || 'Failed to search barcodes');
                }
              }}
              style={{
                background: gold,
                color: '#fff',
                border: 'none',
                padding: '8px 16px',
                borderRadius: 8,
                fontWeight: 600,
                cursor: 'pointer',
                boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
                marginBottom: 12,
                width: '100%'
              }}
              onMouseEnter={e => { e.currentTarget.style.background = goldHover; e.currentTarget.style.color = '#fff' }}
              onMouseLeave={e => { e.currentTarget.style.background = gold; e.currentTarget.style.color = '#fff' }}
            >
              Search Barcodes
            </button>

            {searchResults.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <div style={{ fontWeight: 600, marginBottom: 8, color: '#fff' }}>
                  Found {searchResults.length} barcode{searchResults.length !== 1 ? 's' : ''}
                </div>
                <div style={{ display: 'grid', gap: 8, maxHeight: 400, overflowY: 'auto' }}>
                  {searchResults.map(result => (
                    <div 
                      key={result.barcode_id} 
                      style={{ 
                        borderRadius: 8, 
                        padding: 12, 
                        background: selectedViewBarcode === result.barcode ? '#444' : '#222',
                        border: `1px solid ${selectedViewBarcode === result.barcode ? gold : '#555'}`,
                        cursor: 'pointer',
                        position: 'relative'
                      }}
                      onClick={() => {
                        setSelectedViewBarcode(result.barcode);
                        if (viewBarcodeRef.current) {
                          try {
                            JsBarcode(viewBarcodeRef.current, result.barcode, {
                              format: 'CODE128',
                              width: 2,
                              height: 60,
                              displayValue: true,
                              fontSize: 14,
                              margin: 10
                            });
                          } catch (err) {
                            console.error('Barcode generation error:', err);
                          }
                        }
                      }}
                    >
                      <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4, color: '#fff' }}>
                        {result.product_name || `Product ${result.product_id}`}
                      </div>
                      <div style={{ fontSize: 12, color: '#ccc', marginBottom: 2 }}>
                        Barcode: {result.barcode}
                      </div>
                      {result.brand && (
                        <div style={{ fontSize: 12, color: '#ccc', marginBottom: 2 }}>
                          Brand: {result.brand}
                        </div>
                      )}
                      {result.invoice_no && (
                        <div style={{ fontSize: 12, color: '#ccc', marginBottom: 2 }}>
                          Invoice: {result.invoice_no}
                        </div>
                      )}
                      {result.purchase_date && (
                        <div style={{ fontSize: 12, color: '#ccc', marginBottom: 2 }}>
                          Purchase Date: {new Date(result.purchase_date).toLocaleDateString()}
                        </div>
                      )}
                      <button
                        onClick={async (e) => {
                          e.stopPropagation();
                          if (!window.confirm(`Are you sure you want to delete this barcode?\n\nBarcode: ${result.barcode}\nProduct: ${result.product_name || `Product ${result.product_id}`}`)) {
                            return;
                          }
                          try {
                            const token = localStorage.getItem('token');
                            const response = await fetch(`http://localhost:5000/api/barcode/${result.barcode_id}`, {
                              method: 'DELETE',
                              headers: {
                                'Authorization': `Bearer ${token}`,
                              },
                            });
                            if (!response.ok) {
                              const errorText = await response.text();
                              throw new Error(errorText || 'Failed to delete barcode');
                            }
                            setSearchResults(prev => prev.filter(r => r.barcode_id !== result.barcode_id));
                            if (selectedViewBarcode === result.barcode) {
                              setSelectedViewBarcode(null);
                            }
                            alert('Barcode deleted successfully!');
                          } catch (err: any) {
                            alert(err?.message || 'Failed to delete barcode');
                          }
                        }}
                        style={{
                          position: 'absolute',
                          top: 8,
                          right: 8,
                          background: '#dc3545',
                          color: '#fff',
                          border: 'none',
                          padding: '4px 12px',
                          borderRadius: 6,
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: 'pointer',
                          boxShadow: '0 2px 4px rgba(0,0,0,0.15)'
                        }}
                        onMouseEnter={e => { e.currentTarget.style.background = '#c82333'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = '#dc3545'; }}
                      >
                        Delete
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {selectedViewBarcode && (
              <div style={{ marginTop: 16 }}>
                <div style={{ fontWeight: 600, marginBottom: 8, color: '#fff' }}>
                  Barcode Preview
                </div>
                <div style={{ padding: 16, background: '#444', borderRadius: 8, border: '2px solid #555', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', marginBottom: 8 }}>
                    {searchResults.find(r => r.barcode === selectedViewBarcode)?.product_name || 'Product'}
                  </div>
                  <div style={{ background: '#fff', padding: 8, borderRadius: 4 }}>
                    <svg ref={viewBarcodeRef}></svg>
                  </div>
                  <button
                    onClick={async () => {
                      const result = searchResults.find(r => r.barcode === selectedViewBarcode);
                      if (!result) return;
                      
                      try {
                        if (printerType === 'thermal') {
                          await post('/print/barcode', {
                            product_name: result.product_name || '',
                            barcode_value: result.barcode,
                            price: undefined,
                            printer_type: 'thermal',
                          });
                          alert('Barcode printed successfully to thermal printer!');
                        } else {
                          const token = localStorage.getItem('token');
                          const response = await fetch('http://localhost:5000/api/print/barcode', {
                            method: 'POST',
                            headers: {
                              'Content-Type': 'application/json',
                              'Authorization': `Bearer ${token}`,
                            },
                            body: JSON.stringify({
                              product_name: result.product_name || '',
                              barcode_value: result.barcode,
                              price: undefined,
                              printer_type: 'normal',
                            }),
                          });
                          
                          if (!response.ok) {
                            throw new Error('Failed to generate PDF');
                          }
                          
                          const blob = await response.blob();
                          const url = window.URL.createObjectURL(blob);
                          const printWindow = window.open(url, '_blank');
                          
                          if (printWindow) {
                            printWindow.focus();
                            // Wait for PDF to load, then trigger print dialog
                            printWindow.onload = () => {
                              printWindow.print();
                            };
                          }
                          
                          setTimeout(() => window.URL.revokeObjectURL(url), 30000);
                        }
                      } catch (err: any) {
                        if (err?.status === 503) {
                          alert('Printer not connected. Please check if XP-80C is online and try again.');
                        } else {
                          alert(err?.message || 'Failed to print barcode.');
                        }
                      }
                    }}
                    style={{
                      background: gold,
                      color: '#fff',
                      border: 'none',
                      padding: '8px 16px',
                      borderRadius: 8,
                      fontWeight: 600,
                      cursor: 'pointer',
                      boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
                      marginTop: 12
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = goldHover; e.currentTarget.style.color = '#fff' }}
                    onMouseLeave={e => { e.currentTarget.style.background = gold; e.currentTarget.style.color = '#fff' }}
                  >
                    Print This Barcode
                  </button>
                </div>
              </div>
            )}
            </>
            )}
          </div>
        </div>
      </div>
      )}
    </div>
    </Layout>
  );
}
