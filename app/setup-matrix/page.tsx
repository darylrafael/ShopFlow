'use client';

import { useState, useEffect } from 'react';

type TransitionData = {
  id: string;
  machineId?: string | null;
  machine?: { name: string };
  fromOpType?: string | null;
  toOpType: string;
  durationMinutes: number;
};

type MachineData = {
  id: string;
  name: string;
};

export default function SetupMatrixPage() {
  const [transitions, setTransitions] = useState<TransitionData[]>([]);
  const [machines, setMachines] = useState<MachineData[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  
  const [formData, setFormData] = useState({ machineId: '', fromOpType: '', toOpType: '', durationMinutes: 15 });

  const fetchTransitions = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/setup-matrix');
      if (res.ok) {
        const data = await res.json();
        setTransitions(data);
      } else {
        const err = await res.json();
        alert(`Failed to load transitions: ${err.error || 'Unknown error'}`);
      }
    } catch {
      alert(`Network error loading transitions`);
    } finally {
      setLoading(false);
    }
  };

  const fetchMachines = async () => {
    try {
      const res = await fetch('/api/machines');
      if (res.ok) {
        const data = await res.json();
        setMachines(data);
      }
    } catch {
      console.error('Failed to fetch machines');
    }
  };

  useEffect(() => {
    fetchTransitions();
    fetchMachines();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const body: Record<string, string | number> = {
      toOpType: formData.toOpType,
      durationMinutes: formData.durationMinutes
    };
    if (formData.machineId) body['machineId'] = formData.machineId;
    if (formData.fromOpType) body['fromOpType'] = formData.fromOpType;

    const res = await fetch('/api/setup-matrix', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (res.ok) {
      setShowModal(false);
      setFormData({ machineId: '', fromOpType: '', toOpType: '', durationMinutes: 15 });
      fetchTransitions();
    } else {
      const err = await res.json();
      alert(`Error: ${err.error}`);
    }
  };

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Setup Matrix</h1>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>+ New Transition Rule</button>
      </div>

      {loading ? (
        <p>Loading setup matrix...</p>
      ) : (
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Machine</th>
                <th>From Operation</th>
                <th>To Operation</th>
                <th>Setup Time (min)</th>
              </tr>
            </thead>
            <tbody>
              {transitions.map(t => (
                <tr key={t.id}>
                  <td>{t.machine?.name || <span style={{ color: 'var(--text-secondary)' }}>Any (Global)</span>}</td>
                  <td>{t.fromOpType || <span style={{ color: 'var(--text-secondary)' }}>None (First on machine)</span>}</td>
                  <td style={{ fontWeight: 500 }}>{t.toOpType}</td>
                  <td>{t.durationMinutes}</td>
                </tr>
              ))}
              {transitions.length === 0 && (
                <tr>
                  <td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>No setup transitions defined.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h2 className="modal-title">Create Setup Transition Rule</h2>
            <form onSubmit={handleCreate}>
              <div className="form-group">
                <label className="form-label">Machine (Optional)</label>
                <select className="form-input" value={formData.machineId} onChange={e => setFormData({...formData, machineId: e.target.value})}>
                  <option value="">Any Machine (Global Rule)</option>
                  {machines.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">From Operation Type (Optional)</label>
                <input className="form-input" value={formData.fromOpType} onChange={e => setFormData({...formData, fromOpType: e.target.value})} placeholder="e.g. mill (Leave blank for first-on-machine)" />
              </div>
              <div className="form-group">
                <label className="form-label">To Operation Type (Required)</label>
                <input required className="form-input" value={formData.toOpType} onChange={e => setFormData({...formData, toOpType: e.target.value})} placeholder="e.g. drill" />
              </div>
              <div className="form-group">
                <label className="form-label">Setup Duration (Minutes)</label>
                <input required type="number" min="0" className="form-input" value={formData.durationMinutes} onChange={e => setFormData({...formData, durationMinutes: parseInt(e.target.value)})} />
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Create Rule</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
