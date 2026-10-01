import { NextResponse } from 'next/server';
import { getDevelopmentOrgId } from '@/lib/orgContext';
import { getCurrentSchedule } from '@/lib/services/schedulingService';
import { getExplanationProvider } from '@/lib/ai/gemini';

export async function POST(request: Request) {
  let body: { scheduleId?: string; question?: string; assignmentId?: string; timeZone?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const question = typeof body.question === 'string' ? body.question.trim() : '';
  if (!body.scheduleId || !question) {
    return NextResponse.json({ error: 'scheduleId and question are required' }, { status: 400 });
  }
  if (question.length > 500) {
    return NextResponse.json({ error: 'Question must be 500 characters or fewer' }, { status: 400 });
  }
  const timeZone = typeof body.timeZone === 'string' && body.timeZone.length <= 100 ? body.timeZone : 'UTC';
  if (!body.assignmentId && /\b(operation|machine|assignment|block)\b/i.test(question)) {
    return NextResponse.json({ error: 'Select a schedule block before asking about a specific operation or machine' }, { status: 400 });
  }

  const provider = getExplanationProvider();
  if (!provider) {
    return NextResponse.json({ error: 'AI assistant unavailable. Configure GEMINI_API_KEY.' }, { status: 503 });
  }

  try {
    const orgId = await getDevelopmentOrgId();
    const details = await getCurrentSchedule(orgId);
    if (!details || details.schedule.id !== body.scheduleId) {
      return NextResponse.json({ error: 'Schedule not found or is no longer active' }, { status: 404 });
    }

    const selectedAssignment = body.assignmentId
      ? details.assignments.find((assignment) => assignment.id === body.assignmentId)
      : undefined;
    if (body.assignmentId && !selectedAssignment) {
      return NextResponse.json({ error: 'Assignment not found in schedule' }, { status: 404 });
    }

    const explanation = await provider.explain(question, {
      schedule: details.schedule,
      assignments: selectedAssignment
        ? [{
            ...selectedAssignment,
            schedulingRationale: 'SA-EDD selected this eligible machine because it produced the earliest feasible completion time after considering setup, machine availability, processing duration, and operation precedence.',
          }]
        : details.assignments,
      jobs: details.jobs,
      machines: details.machines,
      timeZone,
    });
    return NextResponse.json(explanation);
  } catch (error) {
    console.error('Schedule explanation failed:', error);
    return NextResponse.json({ error: 'AI assistant failed to produce an explanation' }, { status: 502 });
  }
}
