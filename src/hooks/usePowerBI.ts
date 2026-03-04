'use client';

import { useMemo } from 'react';
import { useLiveData } from '@/lib/live-data-context';
import type { PowerBIKPI, PowerBIReportConfig } from '@/lib/types';

export function usePowerBI() {
  const { powerbi, loading, error } = useLiveData();

  const kpis: PowerBIKPI[] = (powerbi?.kpis ?? []) as PowerBIKPI[];
  const reportConfigs: PowerBIReportConfig[] = (powerbi?.reports ?? []) as PowerBIReportConfig[];

  const kpisByCategory = useMemo(() => {
    const grouped: Record<string, PowerBIKPI[]> = {};
    for (const kpi of kpis) {
      if (!grouped[kpi.kpi_category]) grouped[kpi.kpi_category] = [];
      grouped[kpi.kpi_category].push(kpi);
    }
    return grouped;
  }, [kpis]);

  return { kpis, kpisByCategory, reportConfigs, loading, error };
}
