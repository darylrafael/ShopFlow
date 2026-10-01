'use client';

import { useState, useEffect } from 'react';

type ProductData = {
  id: string;
  name: string;
  sku: string;
  operationTemplates?: { id: string; sequenceNumber: number; operationType: string; eligibleMachineTypes: string[]; estimatedDurationMinutes: number }[];
};

export default function ProductsPage() {
  const [products, setProducts] = useState<ProductData[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  
  const [formData, setFormData] = useState({ name: '', sku: '' });
  const [templates, setTemplates] = useState<{operationType: string, eligibleMachineTypes: string, estimatedDurationMinutes: number}[]>([]);

  const fetchProducts = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/products');
      if (res.ok) {
        const data = await res.json();
        setProducts(data);
      } else {
        const err = await res.json();
        alert(`Failed to load products: ${err.error || 'Unknown error'}`);
      }
    } catch {
      alert(`Network error loading products`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const formattedTemplates = templates.map(t => ({
      ...t,
      eligibleMachineTypes: t.eligibleMachineTypes.split(',').map(c => c.trim()).filter(c => c)
    }));
    
    const res = await fetch('/api/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: formData.name,
        sku: formData.sku,
        operationTemplates: formattedTemplates
      })
    });

    if (res.ok) {
      setShowModal(false);
      setFormData({ name: '', sku: '' });
      setTemplates([]);
      fetchProducts();
    } else {
      const err = await res.json();
      alert(`Error: ${err.error}`);
    }
  };

  const addTemplateRow = () => {
    setTemplates([...templates, { operationType: '', eligibleMachineTypes: '', estimatedDurationMinutes: 0 }]);
  };

  const updateTemplate = (index: number, field: keyof typeof templates[0], value: string | number) => {
    const newTemplates = [...templates];
    (newTemplates[index] as Record<string, unknown>)[field] = value;
    setTemplates(newTemplates);
  };

  const removeTemplate = (index: number) => {
    setTemplates(templates.filter((_, i) => i !== index));
  };

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Products & Routings</h1>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>+ New Product</button>
      </div>

      {loading ? (
        <p>Loading products...</p>
      ) : (
        <div className="grid">
          {products.map(p => (
            <div key={p.id} className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 600 }}>{p.name}</h2>
                {p.sku && <span className="badge">{p.sku}</span>}
              </div>
              
              <div style={{ marginTop: '1.5rem' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 500, marginBottom: '1rem', color: 'var(--text-secondary)' }}>Operation Sequence</h3>
                {p.operationTemplates?.length === 0 && <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>No operations defined.</p>}
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {p.operationTemplates?.map((t) => (
                    <div key={t.id} style={{ display: 'flex', alignItems: 'center', backgroundColor: 'var(--bg-color)', padding: '0.75rem', borderRadius: '0.5rem', border: '1px solid var(--border-color)' }}>
                      <div style={{ fontWeight: 600, color: 'var(--accent-color)', width: '30px' }}>{t.sequenceNumber}</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 500 }}>{t.operationType}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                          Eligible: {t.eligibleMachineTypes.join(', ')} • {t.estimatedDurationMinutes} min batch
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '700px' }}>
            <h2 className="modal-title">Create Product & Routing</h2>
            <form onSubmit={handleCreate}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="form-group">
                  <label className="form-label">Name</label>
                  <input required className="form-input" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} placeholder="e.g. Aluminum Widget" />
                </div>
                <div className="form-group">
                  <label className="form-label">SKU</label>
                  <input className="form-input" value={formData.sku} onChange={e => setFormData({...formData, sku: e.target.value})} placeholder="e.g. AW-100" />
                </div>
              </div>

              <div style={{ marginTop: '1.5rem', marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 600 }}>Operation Templates</h3>
                <button type="button" className="btn btn-secondary" onClick={addTemplateRow}>+ Add Operation</button>
              </div>

              {templates.map((t, idx) => (
                <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 100px auto', gap: '0.5rem', marginBottom: '0.5rem', alignItems: 'end' }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label" style={{ fontSize: '0.75rem' }}>Type</label>
                    <input required className="form-input" value={t.operationType} onChange={e => updateTemplate(idx, 'operationType', e.target.value)} placeholder="e.g. mill" />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label" style={{ fontSize: '0.75rem' }}>Eligible Machine Types (csv)</label>
                    <input required className="form-input" value={t.eligibleMachineTypes} onChange={e => updateTemplate(idx, 'eligibleMachineTypes', e.target.value)} placeholder="e.g. mill, 5axis" />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label" style={{ fontSize: '0.75rem' }}>Mins</label>
                    <input required type="number" min="1" className="form-input" value={t.estimatedDurationMinutes} onChange={e => updateTemplate(idx, 'estimatedDurationMinutes', parseInt(e.target.value))} />
                  </div>
                  <button type="button" className="btn btn-danger" onClick={() => removeTemplate(idx)}>X</button>
                </div>
              ))}

              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Create Product</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
