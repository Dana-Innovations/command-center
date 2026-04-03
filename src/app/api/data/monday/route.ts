import { NextRequest, NextResponse } from "next/server";
import { getCortexToken, cortexInit, cortexCall } from "@/lib/cortex/client";
import { getConnections } from "@/lib/cortex/connections";

// ─── Column value helpers ─────────────────────────────────────────────────────

function colVal(item: Record<string, unknown>, colId: string): string {
  const cols = (item.column_values ?? []) as Record<string, unknown>[];
  const col = cols.find((c) => c.id === colId);
  if (!col) return "";
  if (col.text) return String(col.text);
  if (col.value) {
    try {
      const parsed =
        typeof col.value === "string" ? JSON.parse(col.value) : col.value;
      return parsed?.label ?? parsed?.text ?? String(col.value);
    } catch {
      return String(col.value);
    }
  }
  return "";
}

function colNum(item: Record<string, unknown>, colId: string): number {
  const v = colVal(item, colId);
  const n = parseFloat(v);
  return isNaN(n) ? 0 : n;
}

// ─── Fetch functions ──────────────────────────────────────────────────────────

const CUSTOM_ORDERS_BOARD = 9842349966;
const THROUGHPUT_BOARD = 18395553042;

async function fetchOrders(token: string, sessionId: string) {
  const result = await cortexCall(
    token,
    sessionId,
    "mon_orders",
    "monday__list_items",
    { board_id: CUSTOM_ORDERS_BOARD, limit: 100 }
  );

  const items: Record<string, unknown>[] = result.items ?? [];
  return items
    .filter((item) => {
      const status = colVal(item, "status");
      const groupTitle =
        ((item.group as Record<string, unknown>)?.title as string) || "";
      if (
        status === "COMPLETE" &&
        groupTitle.toLowerCase().includes("archive")
      )
        return false;
      return true;
    })
    .map((item) => ({
      id: String(item.id),
      name: (item.name as string) || "",
      status: colVal(item, "status"),
      location: colVal(item, "color_mktykvnc"),
      dealer: colVal(item, "text_mktyasce"),
      sales_order: colVal(item, "text_mktyspt7"),
      amount: colNum(item, "numeric_mkty39mc"),
      due_date: colVal(item, "date_mkty1b0k"),
      model: colVal(item, "text_mkves9vz"),
      color: colVal(item, "text_mktyhpp3"),
      group_title:
        ((item.group as Record<string, unknown>)?.title as string) || "",
      monday_url: `https://jamesloudspeaker.monday.com/boards/${CUSTOM_ORDERS_BOARD}/pulses/${item.id}`,
    }));
}

async function fetchThroughput(token: string, sessionId: string) {
  const result = await cortexCall(
    token,
    sessionId,
    "mon_thru",
    "monday__list_items",
    { board_id: THROUGHPUT_BOARD, limit: 100 }
  );

  const items: Record<string, unknown>[] = result.items ?? [];
  return items.map((item) => ({
    id: String(item.id),
    name: (item.name as string) || "",
    station:
      ((item.group as Record<string, unknown>)?.title as string) || "",
    date: colVal(item, "date"),
    value: colNum(item, "numbers_1"),
    cycle_time: colNum(item, "numbers2"),
  }));
}

// ─── Main handler ─────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const cortexToken = getCortexToken(request);
  if (!cortexToken) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // Check if Monday.com is connected
  const { connections } = await getConnections(cortexToken);
  const hasMonday = connections.some(
    (c) => (c.mcp_name === "monday" || c.provider === "monday") && c.connected
  );

  if (!hasMonday) {
    return NextResponse.json({
      orders: [],
      throughput: [],
      connected: false,
      fetchedAt: new Date().toISOString(),
    });
  }

  const errors: Record<string, string | null> = {};

  let sessionId = "";
  try {
    sessionId = await cortexInit(cortexToken);
  } catch (e) {
    errors.cortex = String(e);
  }

  const [ordersResult, throughputResult] = await Promise.allSettled([
    sessionId
      ? fetchOrders(cortexToken, sessionId)
      : Promise.resolve([]),
    sessionId
      ? fetchThroughput(cortexToken, sessionId)
      : Promise.resolve([]),
  ]);

  return NextResponse.json({
    orders:
      ordersResult.status === "fulfilled" ? ordersResult.value : [],
    throughput:
      throughputResult.status === "fulfilled"
        ? throughputResult.value
        : [],
    connected: true,
    fetchedAt: new Date().toISOString(),
    errors,
  });
}
