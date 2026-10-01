'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

type Assignment = {
  id: string;
  jobOperationId: string;
  jobId: string;
  jobNumber: string;
  customerName: string;
  priority: string;
  jobStatus: string;
  dueDate: string;
  operationType: string;
  sequenceNumber: number;
  machineId: string;
  machineName: string;
  setupStart: string;
  processingStart: string;
  processingEnd: string;
  candidateAnalysis: Array<{
    machineId: string;
    machineName: string;
    setupMinutes: number;
    earliestStart: string | null;
    completionTime: string | null;
    feasible: boolean;
    reason?: string | null;
  }>;
};

type ScheduleData = {
  schedule: {
    id: string;
    version: number;
    algorithm: string;
    weightedTardiness: number;
    totalSetupMinutes: number;
    makespanMinutes: number;
    numLateJobs: number;
    machineUtilization: Record<string, number>;
    createdAt: string;
  };
  assignments: Assignment[];
  jobs: Array<{ id: string; jobNumber: string; priority: string; dueDate: string }>;
  machines: Array<{ id: string; name: string }>;
};

type Explanation = {
  answer: string;
  evidence: Array<{ label: string; value: string }>;
  limitations: string[];
};

const DAY_MS = 24 * 60 * 60 * 1000;

function getRange() {
  const from = new Date();
  const to = new Date(from.getTime() + 7 * DAY_MS);
  return { from, to };
}

function formatTime(value: string) {
  return new Date(value).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });
}

function formatDuration(minutes: number) {
  if (minutes < 60) return `${Math.round(minutes)}m`;
  return `${Math.floor(minutes / 60)}h ${Math.round(minutes % 60)}m`;
}

export default function SchedulePage() {
  const [data, setData] = useState<ScheduleData | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [machineFilter, setMachineFilter] = useState('all');
  const [viewDays, setViewDays] = useState<1 | 3 | 7>(7);
  const [jobFilter, setJobFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [lateOnly, setLateOnly] = useState(false);
  const [selected, setSelected] = useState<Assignment | null>(null);
  const [question, setQuestion] = useState('How was this schedule generated?');
  const [explanation, setExplanation] = useState<Explanation | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');

  const loadSchedule = useCallback(async () => {
    setLoading(true);
    setError('');
    const { from, to } = getRange();
    try {
      const response = await fetch(`/api/schedules/current?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`);
      if (response.status === 404) {
        setData(null);
        return;
      }
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Unable to load schedule');
      setData(result);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load schedule');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadSchedule(); }, [loadSchedule]);

  const generateSchedule = async () => {
    setGenerating(true);
    setError('');
    try {
      const response = await fetch('/api/schedules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ triggerReason: 'Planner generated from schedule board' }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Unable to generate schedule');
      await loadSchedule();
    } catch (generationError) {
      setError(generationError instanceof Error ? generationError.message : 'Unable to generate schedule');
    } finally {
      setGenerating(false);
    }
  };

  const filteredAssignments = useMemo(() => {
    if (!data) return [];
    const viewStart = new Date();
    const viewEnd = new Date(viewStart.getTime() + viewDays * DAY_MS);
    return data.assignments.filter((assignment) => {
      const late = new Date(assignment.processingEnd) > new Date(assignment.dueDate);
      const inView = new Date(assignment.setupStart) < viewEnd && new Date(assignment.processingEnd) > viewStart;
      return inView
        && (machineFilter === 'all' || assignment.machineId === machineFilter)
        && (jobFilter === 'all' || assignment.jobId === jobFilter)
        && (priorityFilter === 'all' || assignment.priority === priorityFilter)
        && (!lateOnly || late);
    });
  }, [data, machineFilter, jobFilter, priorityFilter, lateOnly, viewDays]);

  const visibleMachines = useMemo(() => {
    if (!data) return [];
    const ids = new Set(filteredAssignments.map((assignment) => assignment.machineId));
    return data.machines.filter((machine) => ids.has(machine.id));
  }, [data, filteredAssignments]);

  const askAssistant = async () => {
    if (!data || !question.trim()) return;
    setAiLoading(true);
    setAiError('');
    setExplanation(null);
    try {
      const response = await fetch('/api/schedules/explain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scheduleId: data.schedule.id,
          question,
          assignmentId: selected?.id,
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Unable to ask the assistant');
      setExplanation(result);
    } catch (assistantError) {
      setAiError(assistantError instanceof Error ? assistantError.message : 'Unable to ask the assistant');
    } finally {
      setAiLoading(false);
    }
  };

  const { from } = getRange();
  const to = new Date(from.getTime() + viewDays * DAY_MS);
  const horizonStart = from.getTime();
  const horizonDuration = to.getTime() - horizonStart;
  const dayLabels = Array.from({ length: viewDays }, (_, index) => new Date(horizonStart + index * DAY_MS));
  const averageUtilization = data
    ? Object.values(data.schedule.machineUtilization).reduce((sum, value) => sum + value, 0) / Math.max(Object.values(data.schedule.machineUtilization).length, 1)
    : 0;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Production Schedule</h1>
          <p className="page-subtitle">Plan the next seven days with constraint-aware assignments.</p>
        </div>
        <button className="btn btn-primary" onClick={generateSchedule} disabled={generating}>
          {generating ? 'Generating...' : 'Generate Schedule'}
        </button>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {loading && <p>Loading schedule...</p>}

      {!loading && !data && !error && (
        <div className="card empty-state">
          <h2>No active schedule</h2>
          <p>Release at least one job, then generate a schedule for the planner board.</p>
        </div>
      )}

      {data && (
        <>
          <div className="metric-grid">
            <div className="metric-card"><span>Version</span><strong>#{data.schedule.version}</strong></div>
            <div className="metric-card"><span>Jobs scheduled</span><strong>{data.jobs.length}</strong></div>
            <div className="metric-card"><span>Late jobs</span><strong className={data.schedule.numLateJobs ? 'metric-danger' : ''}>{data.schedule.numLateJobs}</strong></div>
            <div className="metric-card"><span>Setup time</span><strong>{formatDuration(data.schedule.totalSetupMinutes)}</strong></div>
            <div className="metric-card"><span>Makespan</span><strong>{formatDuration(data.schedule.makespanMinutes)}</strong></div>
            <div className="metric-card"><span>Avg. utilization</span><strong>{Math.round(averageUtilization)}%</strong></div>
          </div>

          <div className="card schedule-card">
            <div className="schedule-toolbar">
              <div>
                <strong>SA-EDD schedule v{data.schedule.version}</strong>
                <span className="toolbar-muted">Generated {formatTime(data.schedule.createdAt)}</span>
              </div>
              <div className="filter-row">
                <div className="view-toggle" aria-label="Timeline range">
                  {[1, 3, 7].map((days) => <button key={days} className={`view-button ${viewDays === days ? 'view-button-active' : ''}`} onClick={() => setViewDays(days as 1 | 3 | 7)}>{days}d</button>)}
                </div>
                <select className="form-input compact-input" value={machineFilter} onChange={(event) => setMachineFilter(event.target.value)}>
                  <option value="all">All machines</option>
                  {data.machines.map((machine) => <option key={machine.id} value={machine.id}>{machine.name}</option>)}
                </select>
                <select className="form-input compact-input" value={jobFilter} onChange={(event) => setJobFilter(event.target.value)}>
                  <option value="all">All jobs</option>
                  {data.jobs.map((job) => <option key={job.id} value={job.id}>{job.jobNumber}</option>)}
                </select>
                <select className="form-input compact-input" value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value)}>
                  <option value="all">All priorities</option>
                  <option value="urgent">Urgent</option><option value="high">High</option><option value="normal">Normal</option><option value="low">Low</option>
                </select>
                <label className="checkbox-label"><input type="checkbox" checked={lateOnly} onChange={(event) => setLateOnly(event.target.checked)} /> Late only</label>
              </div>
            </div>

            <div className="gantt-scroll">
              <div className="gantt" style={{ minWidth: `${Math.max(900, viewDays * 170)}px` }}>
                <div className="gantt-header">
                  <div className="machine-label">Machine</div>
                  <div className="timeline-header" style={{ gridTemplateColumns: `repeat(${viewDays}, 1fr)` }}>
                    {dayLabels.map((day) => <div key={day.toISOString()}>{day.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}</div>)}
                  </div>
                </div>
                {visibleMachines.length === 0 && <div className="gantt-empty">No assignments match the selected filters.</div>}
                {visibleMachines.map((machine) => (
                  <div className="gantt-row" key={machine.id}>
                    <div className="machine-label"><strong>{machine.name}</strong><span>{data.schedule.machineUtilization[machine.id] ?? 0}% utilized</span></div>
                    <div className="timeline" style={{ backgroundSize: `${100 / viewDays}% 100%` }}>
                      {filteredAssignments.filter((assignment) => assignment.machineId === machine.id).map((assignment) => {
                        const left = Math.max(0, ((new Date(assignment.setupStart).getTime() - horizonStart) / horizonDuration) * 100);
                        const right = Math.min(100, ((new Date(assignment.processingEnd).getTime() - horizonStart) / horizonDuration) * 100);
                        const width = Math.max(1.5, right - left);
                        const late = new Date(assignment.processingEnd) > new Date(assignment.dueDate);
                        return <button className={`gantt-block ${late ? 'gantt-block-late' : ''} ${selected?.id === assignment.id ? 'gantt-block-selected' : ''}`} key={assignment.id} style={{ left: `${left}%`, width: `${width}%` }} onClick={() => { setSelected(assignment); setExplanation(null); setAiError(''); setQuestion('Why is this operation scheduled on this machine?'); }} title={`${assignment.jobNumber} · ${assignment.operationType}`}>
                          <span>{assignment.jobNumber}</span><small>{assignment.operationType}</small>
                        </button>;
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="schedule-legend"><span><i className="legend-swatch processing-swatch" /> Processing</span><span><i className="legend-swatch setup-swatch" /> Setup included</span><span><i className="legend-swatch late-swatch" /> Late at completion</span></div>
          </div>

          <div className="planner-grid">
            <div className="card">
              <h2 className="section-title">Assignment details</h2>
              {!selected ? <p className="muted">Select a block on the schedule to inspect its timing.</p> : <div className="detail-list">
                <div><span>Job</span><strong>{selected.jobNumber} · {selected.customerName}</strong></div>
                <div><span>Operation</span><strong>{selected.sequenceNumber} · {selected.operationType}</strong></div>
                <div><span>Machine</span><strong>{selected.machineName}</strong></div>
                <div><span>Setup</span><strong>{formatTime(selected.setupStart)} → {formatTime(selected.processingStart)}</strong></div>
                <div><span>Processing</span><strong>{formatTime(selected.processingStart)} → {formatTime(selected.processingEnd)}</strong></div>
                <div><span>Due date</span><strong>{formatTime(selected.dueDate)}</strong></div>
                <div><span>Result</span><strong className={new Date(selected.processingEnd) > new Date(selected.dueDate) ? 'metric-danger' : 'metric-success'}>{new Date(selected.processingEnd) > new Date(selected.dueDate) ? 'Late' : 'On time'}</strong></div>
              </div>}
            </div>

            <div className="card assistant-card">
              <div className="assistant-heading"><div><h2 className="section-title">Schedule assistant</h2><p className="muted">Read-only explanation grounded in this schedule.</p></div><span className="ai-badge">AI</span></div>
              {!selected && <p className="assistant-hint">Select a schedule block to ask about a specific operation or machine.</p>}
              <textarea className="form-input assistant-input" value={question} onChange={(event) => setQuestion(event.target.value)} maxLength={500} />
              <button className="btn btn-primary" onClick={askAssistant} disabled={aiLoading || !question.trim()}>{aiLoading ? 'Thinking...' : 'Ask assistant'}</button>
              {aiError && <div className="alert alert-error assistant-alert">{aiError}</div>}
              {explanation && <div className="assistant-result"><p>{explanation.answer}</p>{explanation.evidence.length > 0 && <div className="evidence-list"><strong>Evidence</strong>{explanation.evidence.map((item) => <div key={`${item.label}-${item.value}`}><span>{item.label}</span><strong>{item.value}</strong></div>)}</div>}{explanation.limitations.length > 0 && <p className="muted">Limitations: {explanation.limitations.join(' ')}</p>}</div>}
              {selected && selected.candidateAnalysis.length > 0 && <div className="candidate-table"><strong>Candidate comparison</strong><div className="candidate-header"><span>Machine</span><span>Setup</span><span>Completion</span><span>Status</span></div>{selected.candidateAnalysis.map((candidate) => <div className="candidate-row" key={candidate.machineId}><span>{candidate.machineName}</span><span>{candidate.setupMinutes}m</span><span>{candidate.completionTime ? formatTime(candidate.completionTime) : '—'}</span><span className={candidate.feasible ? 'metric-success' : 'metric-danger'}>{candidate.feasible ? 'Feasible' : candidate.reason || 'Rejected'}</span></div>)}</div>}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
