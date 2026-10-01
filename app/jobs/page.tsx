'use client';

import { useState, useEffect } from 'react';

type JobData = {
  id: string;
  jobNumber: string;
  customerName: string;
  dueDate: string;
  status: string;
  quantity: number;
  product?: { name: string };
  jobOperations?: { id: string; sequenceNumber: number; operationType: string; eligibleMachineIds: string[]; estimatedDurationMinutes: number; status: string }[];
};

type ProductData = {
  id: string;
  name: string;
};

export default function JobsPage() {
  const [jobs, setJobs] = useState<JobData[]>([]);
  const [products, setProducts] = useState<ProductData[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [selectedJob, setSelectedJob] = useState<JobData | null>(null);
  
  const [formData, setFormData] = useState({ jobNumber: '', customerName: '', productId: '', quantity: 1, dueDate: '' });

  const fetchJobs = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/jobs');
      if (res.ok) {
        const data = await res.json();
        setJobs(data);
      } else {
        const err = await res.json();
        setError(err.error || 'Unable to load jobs');
      }
    } catch {
      setError('Network error while loading jobs');
    } finally {
      setLoading(false);
    }
  };

  const fetchProducts = async () => {
    try {
      const res = await fetch('/api/products');
      if (res.ok) {
        const data = await res.json();
        setProducts(data);
      }
    } catch {
      console.error('Failed to fetch products');
    }
  };

  useEffect(() => {
    fetchJobs();
    fetchProducts();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...formData, dueDate: new Date(formData.dueDate).toISOString() })
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Unable to create job');
      setShowModal(false);
      setFormData({ jobNumber: '', customerName: '', productId: '', quantity: 1, dueDate: '' });
      await fetchJobs();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Unable to create job');
    } finally {
      setSaving(false);
    }
  };

  const viewOperations = async (jobId: string) => {
    const res = await fetch(`/api/jobs/${jobId}`);
    if (res.ok) {
      const data = await res.json();
      setSelectedJob(data);
    }
  };

  const releaseJob = async (jobId: string) => {
    setError('');
    const res = await fetch(`/api/jobs/${jobId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'released' }),
    });
    if (!res.ok) {
      const err = await res.json();
      setError(err.error || 'Unable to release job');
      return;
    }
    fetchJobs();
  };

  return (
    <div>
      <div className="page-header">
        <div><h1 className="page-title">Jobs</h1><p className="page-subtitle">Release work only when its routing and due date are ready for planning.</p></div>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>+ New Job</button>
      </div>

      {error && <div className="alert alert-error" role="alert">{error}</div>}

      {loading ? (
        <p>Loading jobs...</p>
      ) : (
        jobs.length === 0 ? <div className="card empty-state"><h2>No jobs yet</h2><p>Create a job from a product routing to start planning production.</p><button className="btn btn-primary" onClick={() => setShowModal(true)}>Create first job</button></div> : <div className="grid">
          {jobs.map(j => (
            <div key={j.id} className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 600 }}>{j.jobNumber}</h2>
                <span className={`badge ${j.status === 'draft' ? '' : 'badge-success'}`}>{j.status}</span>
              </div>
              
              <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                <p style={{ color: 'var(--text-secondary)' }}>Customer: <span style={{ color: 'var(--text-primary)' }}>{j.customerName}</span></p>
                <p style={{ color: 'var(--text-secondary)' }}>Product: <span style={{ color: 'var(--text-primary)' }}>{j.product?.name}</span></p>
                <p style={{ color: 'var(--text-secondary)' }}>Quantity: <span style={{ color: 'var(--text-primary)' }}>{j.quantity}</span></p>
                <p style={{ color: 'var(--text-secondary)' }}>Due: <span style={{ color: 'var(--text-primary)' }}>{new Date(j.dueDate).toLocaleDateString()}</span></p>
              </div>

               <div style={{ marginTop: '1.5rem', borderTop: '1px solid var(--border-color)', paddingTop: '1rem', display: 'flex', gap: '0.5rem' }}>
                <button className="btn btn-secondary" style={{ width: '100%' }} onClick={() => viewOperations(j.id)}>View Operations</button>
                 {j.status === 'draft' && <button className="btn btn-primary" style={{ width: '100%' }} onClick={() => releaseJob(j.id)}>Release</button>}
              </div>
            </div>
          ))}
        </div>
      )}

      {selectedJob && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '600px' }}>
            <h2 className="modal-title">Job Operations for {selectedJob.jobNumber}</h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
              These operations were automatically generated from the product template. Released jobs are eligible for schedule generation.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {selectedJob.jobOperations?.map((op) => (
                <div key={op.id} style={{ display: 'flex', alignItems: 'center', backgroundColor: 'var(--bg-color)', padding: '0.75rem', borderRadius: '0.5rem', border: '1px solid var(--border-color)' }}>
                  <div style={{ fontWeight: 600, color: 'var(--accent-color)', width: '30px' }}>{op.sequenceNumber}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 500 }}>{op.operationType}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                      {op.eligibleMachineIds.length} eligible machine{op.eligibleMachineIds.length === 1 ? '' : 's'} • Duration: {op.estimatedDurationMinutes}m • Status: {op.status}
                    </div>
                  </div>
                </div>
              ))}
              {selectedJob.jobOperations?.length === 0 && <p>No operations generated.</p>}
            </div>

            <div className="modal-actions">
              <button className="btn btn-primary" onClick={() => setSelectedJob(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {showModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h2 className="modal-title">Create Job</h2>
            <form onSubmit={handleCreate}>
              <div className="form-group">
                <label className="form-label">Job Number</label>
                <input required className="form-input" value={formData.jobNumber} onChange={e => setFormData({...formData, jobNumber: e.target.value})} placeholder="e.g. JOB-1002" />
              </div>
              <div className="form-group">
                <label className="form-label">Customer Name</label>
                <input required className="form-input" value={formData.customerName} onChange={e => setFormData({...formData, customerName: e.target.value})} placeholder="e.g. Acme Corp" />
              </div>
              <div className="form-group">
                <label className="form-label">Product</label>
                <select required className="form-input" value={formData.productId} onChange={e => setFormData({...formData, productId: e.target.value})}>
                  <option value="">Select a product...</option>
                  {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Quantity</label>
                <input required type="number" min="1" className="form-input" value={formData.quantity} onChange={e => setFormData({...formData, quantity: parseInt(e.target.value)})} />
              </div>
              <div className="form-group">
                <label className="form-label">Due Date</label>
                <input required type="datetime-local" className="form-input" value={formData.dueDate} onChange={e => setFormData({...formData, dueDate: e.target.value})} />
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Creating...' : 'Create Job'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
