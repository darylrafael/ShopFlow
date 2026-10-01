'use client';

import { useState, useEffect } from 'react';

type MachineData = {
  id: string;
  name: string;
  type: string;
  capabilities: string[];
  unavailabilities?: { id: string; startTime: string; endTime?: string; reason: string }[];
};

export default function MachinesPage() {
  const [machines, setMachines] = useState<MachineData[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  
  const [formData, setFormData] = useState({ name: '', type: '', capabilities: '' });

  const fetchMachines = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/machines');
      if (res.ok) {
        const data = await res.json();
        setMachines(data);
      } else {
        const err = await res.json();
        alert(`Failed to load machines: ${err.error || 'Unknown error'}`);
      }
    } catch {
      alert(`Network error loading machines`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMachines();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const caps = formData.capabilities.split(',').map(c => c.trim()).filter(c => c);
    
    const res = await fetch('/api/machines', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: formData.name,
        type: formData.type,
        capabilities: caps
      })
    });

    if (res.ok) {
      setShowModal(false);
      setFormData({ name: '', type: '', capabilities: '' });
      fetchMachines();
    } else {
      const err = await res.json();
      alert(`Error: ${err.error}`);
    }
  };

  const addUnavailability = async (machineId: string) => {
    const startStr = prompt('Enter start time (YYYY-MM-DD HH:mm):');
    if (!startStr) return;
    
    const reason = prompt('Enter reason:');
    if (!reason) return;

    // Optional end time
    const endStr = prompt('Enter end time (optional, YYYY-MM-DD HH:mm) or leave blank:');

    const body: Record<string, string> = {
      startTime: new Date(startStr).toISOString(),
      reason
    };
    if (endStr) body['endTime'] = new Date(endStr).toISOString();

    const res = await fetch(`/api/machines/${machineId}/unavailability`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (res.ok) {
      fetchMachines();
    } else {
      const err = await res.json();
      alert(`Error: ${err.error}`);
    }
  };

  const deleteUnavailability = async (machineId: string, uid: string) => {
    if (!confirm('Delete unavailability?')) return;
    
    const res = await fetch(`/api/machines/${machineId}/unavailability/${uid}`, {
      method: 'DELETE'
    });

    if (res.ok) fetchMachines();
    else {
      const err = await res.json();
      alert(`Error: ${err.error}`);
    }
  };

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Machines</h1>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>+ New Machine</button>
      </div>

      {loading ? (
        <p>Loading machines...</p>
      ) : (
        <div className="grid">
          {machines.map(m => (
            <div key={m.id} className="card">
              <h2 style={{ fontSize: '1.25rem', fontWeight: 600 }}>{m.name}</h2>
              <p style={{ color: 'var(--text-secondary)', marginBottom: '1rem' }}>{m.type}</p>
              
              <div style={{ marginBottom: '1rem' }}>
                <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Capabilities: </span>
                {m.capabilities.map((c: string) => (
                  <span key={c} className="badge" style={{ marginLeft: '0.5rem' }}>{c}</span>
                ))}
              </div>

              <div style={{ marginTop: '1.5rem', borderTop: '1px solid var(--border-color)', paddingTop: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <h3 style={{ fontSize: '1rem', fontWeight: 500 }}>Unavailability</h3>
                  <button className="btn btn-secondary" style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }} onClick={() => addUnavailability(m.id)}>+ Add</button>
                </div>
                
                {m.unavailabilities?.length === 0 && <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>None scheduled.</p>}
                <ul style={{ listStyle: 'none', fontSize: '0.875rem' }}>
                  {m.unavailabilities?.map((u) => (
                    <li key={u.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', backgroundColor: 'rgba(0,0,0,0.2)', padding: '0.5rem', borderRadius: '0.25rem' }}>
                      <div>
                        <div>{new Date(u.startTime).toLocaleString()} - {u.endTime ? new Date(u.endTime).toLocaleString() : 'Indefinite'}</div>
                        <div style={{ color: 'var(--text-secondary)' }}>{u.reason}</div>
                      </div>
                      <button className="btn btn-danger" style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }} onClick={() => deleteUnavailability(m.id, u.id)}>X</button>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h2 className="modal-title">Create Machine</h2>
            <form onSubmit={handleCreate}>
              <div className="form-group">
                <label className="form-label">Name</label>
                <input required className="form-input" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} placeholder="e.g. Haas VF-2" />
              </div>
              <div className="form-group">
                <label className="form-label">Type</label>
                <input required className="form-input" value={formData.type} onChange={e => setFormData({...formData, type: e.target.value})} placeholder="e.g. Mill" />
              </div>
              <div className="form-group">
                <label className="form-label">Capabilities (comma separated)</label>
                <input required className="form-input" value={formData.capabilities} onChange={e => setFormData({...formData, capabilities: e.target.value})} placeholder="e.g. mill, drill" />
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Create</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
