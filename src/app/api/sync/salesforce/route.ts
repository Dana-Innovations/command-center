import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { getCortexUserFromRequest } from '@/lib/cortex/user';

export async function POST(request: NextRequest) {
  const user = await getCortexUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  try {
    const { opportunities, reports } = await request.json();

    if (!opportunities && !reports) {
      return NextResponse.json(
        { error: 'Invalid payload: opportunities and/or reports array required' },
        { status: 400 }
      );
    }

    const supabase = createServiceClient();
    const now = new Date().toISOString();
    let totalSynced = 0;

    if (opportunities && Array.isArray(opportunities)) {
      const rows = opportunities.map((opp: Record<string, unknown>) => ({
        ...opp,
        user_id: user.sub,
        synced_at: now,
      }));

      const { data, error } = await supabase
        .from('salesforce_opportunities')
        .upsert(rows, { onConflict: 'user_id,sf_opportunity_id' })
        .select();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      totalSynced += data.length;
    }

    if (reports && Array.isArray(reports)) {
      const rows = reports.map((rep: Record<string, unknown>) => ({
        ...rep,
        user_id: user.sub,
        synced_at: now,
      }));

      const { data, error } = await supabase
        .from('salesforce_reports')
        .upsert(rows, { onConflict: 'user_id,sf_report_id' })
        .select();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      totalSynced += data.length;
    }

    await supabase.from('sync_log').insert({
      data_type: 'salesforce',
      items_synced: totalSynced,
      status: 'completed',
      user_id: user.sub,
      started_at: now,
      completed_at: new Date().toISOString(),
    });

    return NextResponse.json({ synced: totalSynced, timestamp: now });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
