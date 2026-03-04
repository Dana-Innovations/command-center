'use client';
import { useState, useEffect, useCallback } from 'react';

interface MondayOrder {
  id: string;
  name: string;
  status: string;
  location: string;
  dealer: string;
  sales_order: string;
  amount: number;
  due_date: string;
  model: string;
  color: string;
  group_title: string;
  monday_url: string;
}

interface ThroughputItem {
  id: string;
  name: string;
  station: string;
  date: string;
  value: number;
  cycle_time: number;
}

interface MondayData {
  orders: MondayOrder[];
  throughput: ThroughputItem[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useMonday(): MondayData {
  const [orders, setOrders] = useState<MondayOrder[]>([]);
  const [throughput, setThroughput] = useState<ThroughputItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/data/monday');
      if (!res.ok) throw new Error(`Monday fetch failed: ${res.status}`);
      const data = await res.json();
      setOrders(data.orders ?? []);
      setThroughput(data.throughput ?? []);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  return { orders, throughput, loading, error, refetch: fetchData };
}
