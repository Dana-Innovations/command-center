import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { getCortexUserFromRequest } from '@/lib/cortex/user';

export async function POST(request: NextRequest) {
  const user = await getCortexUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  try {
    const { messages } = await request.json();

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: 'Invalid payload: messages array required' }, { status: 400 });
    }

    const supabase = createServiceClient();
    const now = new Date().toISOString();

    const rows = messages.map((msg: Record<string, unknown>) => ({
      ...msg,
      synced_at: now,
    }));

    const { data, error } = await supabase
      .from('slack_feed')
      .upsert(rows, { onConflict: 'message_ts' })
      .select('id');

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Fire-and-forget: sync log is auxiliary, don't block the response
    supabase.from('sync_log').insert({
      data_type: 'slack_feed',
      items_synced: data.length,
      status: 'completed',
      started_at: now,
      completed_at: new Date().toISOString(),
    });

    return NextResponse.json({ synced: data.length, timestamp: now });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
