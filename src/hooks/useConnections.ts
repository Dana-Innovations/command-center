'use client';

import { useLiveData, type ConnectionStatus } from '@/lib/live-data-context';

export function useConnections(): ConnectionStatus {
  const { connections } = useLiveData();
  return connections;
}
