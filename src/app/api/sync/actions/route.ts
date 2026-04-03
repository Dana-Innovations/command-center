import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { getCortexUserFromRequest } from '@/lib/cortex/user';

export async function POST(request: NextRequest) {
  const user = await getCortexUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  try {
    const { action_id } = await request.json();

    if (!action_id) {
      return NextResponse.json({ error: 'Invalid payload: action_id required' }, { status: 400 });
    }

    const supabase = createServiceClient();

    const { data: action, error: fetchError } = await supabase
      .from('action_queue')
      .select('*')
      .eq('id', action_id)
      .single();

    if (fetchError || !action) {
      return NextResponse.json({ error: 'Action not found' }, { status: 404 });
    }

    const { error: updateError } = await supabase
      .from('action_queue')
      .update({ status: 'processing' })
      .eq('id', action_id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    try {
      // Process the action based on its type
      // This is where integration-specific logic would go
      const { error: completeError } = await supabase
        .from('action_queue')
        .update({
          status: 'completed',
          processed_at: new Date().toISOString(),
        })
        .eq('id', action_id);

      if (completeError) {
        throw completeError;
      }

      return NextResponse.json({ status: 'completed', action_id });
    } catch (processErr) {
      const message = processErr instanceof Error ? processErr.message : 'Processing failed';
      await supabase
        .from('action_queue')
        .update({
          status: 'failed',
          error_message: message,
          processed_at: new Date().toISOString(),
        })
        .eq('id', action_id);

      return NextResponse.json({ status: 'failed', error: message }, { status: 500 });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
