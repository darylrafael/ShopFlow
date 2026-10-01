import { NextRequest, NextResponse } from 'next/server';
import { getDevelopmentOrgId } from '@/lib/orgContext';
import { getCurrentSchedule } from '@/lib/services/schedulingService';

function parseDate(value: string | null) {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function GET(request: NextRequest) {
  const from = parseDate(request.nextUrl.searchParams.get('from'));
  const to = parseDate(request.nextUrl.searchParams.get('to'));

  if (from === null || to === null) {
    return NextResponse.json({ error: 'from and to must be valid ISO dates' }, { status: 400 });
  }
  if (from && to && from >= to) {
    return NextResponse.json({ error: 'from must be earlier than to' }, { status: 400 });
  }

  try {
    const orgId = await getDevelopmentOrgId();
    const range = {
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
    };
    const details = await getCurrentSchedule(orgId, range);
    if (!details) return NextResponse.json({ error: 'No active schedule found' }, { status: 404 });
    return NextResponse.json(details);
  } catch {
    return NextResponse.json({ error: 'Unable to load current schedule' }, { status: 500 });
  }
}
