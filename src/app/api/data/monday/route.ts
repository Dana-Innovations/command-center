import { NextResponse } from 'next/server';

const CORTEX_API_KEY = process.env.CORTEX_API_KEY!;
const CORTEX_URL = 'https://cortex-bice.vercel.app/mcp/cortex';

// ─── Cortex MCP client ────────────────────────────────────────────────────────

async function cortexInit(): Promise<string> {
  const res = await fetch(CORTEX_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': CORTEX_API_KEY,
      'mcp-protocol-version': '2024-11-05',
      'x-cortex-client': 'cortex-mcp-stdio',
    },
    body: JSON.stringify({
      jsonrpc: '2.0', id: 'init',
      method: 'initialize',
      params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'command-center', version: '1.0.0' } },
    }),
  });
  const sessionId = res.headers.get('mcp-session-id');
  if (!sessionId) {
    const body = await res.text();
    throw new Error(`Cortex init failed — no session ID. Status: ${res.status}. Body: ${body.slice(0, 200)}`);
  }
  return sessionId;
}

async function cortexCall(sessionId: string, id: string, tool: string, args: Record<string, unknown>) {
  const res = await fetch(CORTEX_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': CORTEX_API_KEY,
      'mcp-protocol-version': '2024-11-05',
      'x-cortex-client': 'cortex-mcp-stdio',
      'mcp-session-id': sessionId,
    },
    body: JSON.stringify({
      jsonrpc: '2.0', id,
      method: 'tools/call',
      params: { name: tool, arguments: args },
    }),
  });
  const data = await res.json() as { result?: { content?: { text?: string }[] } };
  const text = data?.result?.content?.[0]?.text ?? '{}';
  try { return JSON.parse(text); } catch { return {}; }
}

// ─── Column value helpers ─────────────────────────────────────────────────────

function colVal(item: Record<string, unknown>, colId: string): string {
  const cols = (item.column_values ?? []) as Record<string, unknown>[];
  const col = cols.find((c) => c.id === colId);
  if (!col) return '';
  // Monday returns text in either `text` or `value` (JSON-encoded)
  if (col.text) return String(col.text);
  if (col.value) {
    try {
      const parsed = typeof col.value === 'string' ? JSON.parse(col.value) : col.value;
      return parsed?.label ?? parsed?.text ?? String(col.value);
    } catch { return String(col.value); }
  }
  return '';
}

function colNum(item: Record<string, unknown>, colId: string): number {
  const v = colVal(item, colId);
  const n = parseFloat(v);
  return isNaN(n) ? 0 : n;
}

// ─── Fetch functions ──────────────────────────────────────────────────────────

const CUSTOM_ORDERS_BOARD = 9842349966;
const THROUGHPUT_BOARD = 18395553042;

async function fetchOrders(sessionId: string) {
  const result = await cortexCall(sessionId, 'mon_orders', 'monday__list_items', {
    board_id: CUSTOM_ORDERS_BOARD,
    limit: 100,
  });

  const items: Record<string, unknown>[] = result.items ?? [];
  return items
    .filter((item) => {
      const status = colVal(item, 'status');
      const groupTitle = ((item.group as Record<string, unknown>)?.title as string) || '';
      // Exclude items that are COMPLETE AND in Archive
      if (status === 'COMPLETE' && groupTitle.toLowerCase().includes('archive')) return false;
      return true;
    })
    .map((item) => ({
      id: String(item.id),
      name: (item.name as string) || '',
      status: colVal(item, 'status'),
      location: colVal(item, 'color_mktykvnc'),
      dealer: colVal(item, 'text_mktyasce'),
      sales_order: colVal(item, 'text_mktyspt7'),
      amount: colNum(item, 'numeric_mkty39mc'),
      due_date: colVal(item, 'date_mkty1b0k'),
      model: colVal(item, 'text_mkves9vz'),
      color: colVal(item, 'text_mktyhpp3'),
      group_title: ((item.group as Record<string, unknown>)?.title as string) || '',
      monday_url: `https://jamesloudspeaker.monday.com/boards/${CUSTOM_ORDERS_BOARD}/pulses/${item.id}`,
    }));
}

async function fetchThroughput(sessionId: string) {
  const result = await cortexCall(sessionId, 'mon_thru', 'monday__list_items', {
    board_id: THROUGHPUT_BOARD,
    limit: 100,
  });

  const items: Record<string, unknown>[] = result.items ?? [];
  return items.map((item) => ({
    id: String(item.id),
    name: (item.name as string) || '',
    station: ((item.group as Record<string, unknown>)?.title as string) || '',
    date: colVal(item, 'date'),
    value: colNum(item, 'numbers_1'),
    cycle_time: colNum(item, 'numbers2'),
  }));
}

// ─── Main handler ─────────────────────────────────────────────────────────────

export async function GET() {
  const errors: Record<string, string | null> = {};

  let sessionId = '';
  try {
    sessionId = await cortexInit();
  } catch (e) {
    errors.cortex = String(e);
  }

  const [ordersResult, throughputResult] = await Promise.allSettled([
    sessionId ? fetchOrders(sessionId) : Promise.resolve([]),
    sessionId ? fetchThroughput(sessionId) : Promise.resolve([]),
  ]);

  return NextResponse.json({
    orders: ordersResult.status === 'fulfilled' ? ordersResult.value : [],
    throughput: throughputResult.status === 'fulfilled' ? throughputResult.value : [],
    fetchedAt: new Date().toISOString(),
    errors,
  });
}
