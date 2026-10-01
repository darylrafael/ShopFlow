import { NextResponse } from 'next/server';
import { getDevelopmentOrgId } from '@/lib/orgContext';
import { generateAndPersistSchedule, getCurrentSchedule } from '@/lib/services/schedulingService';

export async function POST(request: Request) {
  try {
    const orgId = await getDevelopmentOrgId();
    let body: { triggerReason?: string } = {};
    try {
      body = await request.json();
    } catch {
      // An empty body is valid and uses the default trigger reason.
    }

    const schedule = await generateAndPersistSchedule(
      orgId,
      typeof body.triggerReason === 'string' && body.triggerReason.trim()
        ? body.triggerReason.trim().slice(0, 200)
        : 'Manual planner trigger',
    );
    const details = await getCurrentSchedule(orgId);
    return NextResponse.json(details ?? { schedule }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unable to generate schedule';
    if (
      message === 'No schedulable jobs found.' ||
      message.startsWith('Cannot schedule operation') ||
      message.startsWith('Schedule validation failed')
    ) {
      return NextResponse.json({ error: message }, { status: 422 });
    }
    return NextResponse.json({ error: 'Unable to generate schedule' }, { status: 500 });
  }
}
