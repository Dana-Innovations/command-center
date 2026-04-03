import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { getCortexUserFromRequest } from '@/lib/cortex/user';

export async function POST(request: NextRequest) {
  const user = await getCortexUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  try {
    const { channels } = await request.json();

    if (!channels || !Array.isArray(channels)) {
      return NextResponse.json({ error: 'Invalid payload: channels array required' }, { status: 400 });
    }

    const supabase = createServiceClient();
    const now = new Date().toISOString();

    const rows = channels.map((channel: Record<string, unknown>) => ({
      ...channel,
      user_id: user.sub,
    }));

    const { data, error } = await supabase
      .from('teams_channels')
      .upsert(rows, { onConflict: 'user_id,channel_id' })
      .select();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    await supabase.from('sync_log').insert({
      data_type: 'teams_channels',
      items_synced: data.length,
      status: 'completed',
      user_id: user.sub,
      started_at: now,
      completed_at: new Date().toISOString(),
    });

    return NextResponse.json({ synced: data.length, timestamp: now });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
