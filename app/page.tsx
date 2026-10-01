import Link from 'next/link';
import prisma from '@/lib/prisma';
import { getDevelopmentOrgId } from '@/lib/orgContext';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const orgId = await getDevelopmentOrgId();
  const [openJobs, machineCount, latestSchedule, releasedJobs] = await Promise.all([
    prisma.job.count({ where: { orgId, status: { in: ['released', 'in_progress', 'on_hold'] } } }),
    prisma.machine.count({ where: { orgId } }),
    prisma.schedule.findFirst({ where: { orgId, status: 'active' }, orderBy: { version: 'desc' } }),
    prisma.job.count({ where: { orgId, status: 'released' } }),
  ]);

  return <div>
    <div className="page-header dashboard-header">
      <div><p className="eyebrow">Operations overview</p><h1 className="page-title">Production control center</h1><p className="page-subtitle">Turn released work into a feasible plan for every machine.</p></div>
      <Link className="btn btn-primary" href="/schedule">Open schedule</Link>
    </div>

    <div className="dashboard-metrics">
      <div className="metric-card"><span>Open jobs</span><strong>{openJobs}</strong><small>Released or in progress</small></div>
      <div className="metric-card"><span>Released to plan</span><strong>{releasedJobs}</strong><small>Ready for scheduling</small></div>
      <div className="metric-card"><span>Machines</span><strong>{machineCount}</strong><small>Available in this workspace</small></div>
      <div className="metric-card"><span>Active plan</span><strong>{latestSchedule ? `v${latestSchedule.version}` : '—'}</strong><small>{latestSchedule ? 'Latest generated schedule' : 'No schedule generated'}</small></div>
    </div>

    <div className="dashboard-grid">
      <section className="card dashboard-primary">
        <div><p className="eyebrow">Planner workflow</p><h2 className="section-title">What needs attention?</h2></div>
        <div className="action-list">
          <Link href="/jobs" className="action-item"><span className="action-icon">01</span><span><strong>Review and release jobs</strong><small>Only released jobs enter the scheduling engine.</small></span><span aria-hidden="true">→</span></Link>
          <Link href="/schedule" className="action-item"><span className="action-icon">02</span><span><strong>Generate the next plan</strong><small>Respect machine capability, downtime, setup, and precedence constraints.</small></span><span aria-hidden="true">→</span></Link>
          <Link href="/machines" className="action-item"><span className="action-icon">03</span><span><strong>Check machine capacity</strong><small>Keep capabilities and planned unavailability current.</small></span><span aria-hidden="true">→</span></Link>
        </div>
      </section>
      <section className="card dashboard-secondary">
        <p className="eyebrow">Why ShopFlow</p><h2 className="section-title">A plan people can explain</h2>
        <p className="muted">The deterministic scheduler owns feasibility. The assistant explains the resulting assignments using schedule evidence, so planners can act without handing production decisions to a black box.</p>
        <div className="dashboard-note"><strong>Next best step</strong><span>{releasedJobs > 0 ? 'Generate a schedule from your released jobs.' : 'Release a job to start planning.'}</span></div>
        <Link href={releasedJobs > 0 ? '/schedule' : '/jobs'} className="text-link">{releasedJobs > 0 ? 'View planning board →' : 'Go to jobs →'}</Link>
      </section>
    </div>
  </div>;
}
