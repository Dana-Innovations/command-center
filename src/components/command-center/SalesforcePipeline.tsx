"use client";
import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { useSalesforce } from "@/hooks/useSalesforce";
import type { SalesforceOpportunity } from "@/lib/types";
import { EmptyState } from "@/components/ui/EmptyState";
import { ConnectPrompt } from "@/components/ui/ConnectPrompt";
import { SFLink } from "@/components/ui/icons";
import { useConnections } from "@/hooks/useConnections";

interface Deal {
  name: string;
  account: string;
  stage: string;
  amount: number;
  probability: number;
  daysToClose: number;
  lastActivityDays: number;
  sfUrl: string;
  nextStep: string | null;
}

function oppToDeal(opp: SalesforceOpportunity): Deal {
  const lastActivityDays = opp.last_activity_date
    ? Math.max(0, Math.floor((Date.now() - new Date(opp.last_activity_date).getTime()) / 86400000))
    : 0;
  return {
    name: opp.name,
    account: opp.account_name,
    stage: opp.stage,
    amount: opp.amount,
    probability: opp.probability,
    daysToClose: opp.days_to_close,
    lastActivityDays,
    sfUrl: opp.sf_url,
    nextStep: opp.next_step,
  };
}

const STAGE_COLORS: Record<string, string> = {
  Prospecting: "bg-[rgba(102,102,102,0.75)]",
  Qualification: "bg-accent-amber",
  Proposal: "bg-accent-teal",
  Negotiation: "bg-accent-red",
};

const STAGE_TEXT: Record<string, string> = {
  Prospecting: "text-[#999]",
  Qualification: "text-accent-amber",
  Proposal: "text-accent-teal",
  Negotiation: "text-accent-red",
};

function stageBadge(stage: string) {
  return (
    <span className={cn(
      "text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded",
      stage === "Negotiation" && "bg-accent-red/15 text-accent-red",
      stage === "Proposal" && "bg-accent-teal/15 text-accent-teal",
      stage === "Qualification" && "bg-accent-amber/15 text-accent-amber",
      stage === "Prospecting" && "bg-[rgba(102,102,102,0.15)] text-[#999]",
    )}>
      {stage}
    </span>
  );
}

export function SalesforcePipeline() {
  const { openOpps, loading } = useSalesforce();
  const { salesforce: sfConnected } = useConnections();

  const deals = useMemo(() => {
    return openOpps.map(oppToDeal);
  }, [openOpps]);

  const stages = useMemo(() => {
    const unique = [...new Set(deals.map((d) => d.stage))];
    return unique.sort();
  }, [deals]);

  const totalPipeline = useMemo(() => deals.reduce((s, d) => s + d.amount, 0), [deals]);
  const quota = 2_000_000;
  const quotaPct = Math.round((totalPipeline / quota) * 100);

  const stageData = useMemo(() => stages.map((stage) => {
    const stageDeals = deals.filter((d) => d.stage === stage);
    const value = stageDeals.reduce((s, d) => s + d.amount, 0);
    return { stage, count: stageDeals.length, value };
  }), [deals, stages]);
  const maxStageValue = Math.max(...stageData.map((s) => s.value), 1);

  const atRisk = useMemo(() => deals.filter(
    (d) => d.daysToClose <= 7 || d.lastActivityDays > 14
  ), [deals]);

  const topDeals = useMemo(() => [...deals].sort((a, b) => b.amount - a.amount).slice(0, 5), [deals]);

  return (
    <section className="glass-card anim-card" style={{ animationDelay: "360ms" }}>
      <h2 className="flex items-center gap-2 text-sm font-semibold text-text-heading mb-4">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0070D2" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2L2 7l10 5 10-5-10-5z" />
          <path d="M2 17l10 5 10-5" />
          <path d="M2 12l10 5 10-5" />
        </svg>
        Salesforce Pipeline
        {loading && <span className="text-[10px] text-text-muted font-normal">(loading…)</span>}
      </h2>

      {!sfConnected ? (
        <ConnectPrompt service="Salesforce" />
      ) : deals.length === 0 && !loading ? (
        <EmptyState />
      ) : deals.length === 0 ? null : (
      <>
      {/* Pipeline Header Stats */}
      <div className="flex flex-wrap gap-6 mb-5">
        <div>
          <div className="text-xs text-text-muted uppercase tracking-wider mb-0.5">Total Pipeline</div>
          <div className="text-2xl font-bold text-text-heading">
            ${totalPipeline >= 1_000_000 ? `${(totalPipeline / 1_000_000).toFixed(1)}M` : `${(totalPipeline / 1000).toFixed(0)}K`}
          </div>
        </div>
        <div>
          <div className="text-xs text-text-muted uppercase tracking-wider mb-0.5">Quota Coverage</div>
          <div className={cn("text-2xl font-bold", quotaPct >= 100 ? "text-accent-green" : quotaPct >= 70 ? "text-accent-amber" : "text-accent-red")}>
            {quotaPct}%
          </div>
        </div>
        <div>
          <div className="text-xs text-text-muted uppercase tracking-wider mb-0.5">Open Deals</div>
          <div className="text-2xl font-bold text-text-heading">{deals.length}</div>
        </div>
      </div>

      {/* Stage Breakdown */}
      <div className="mb-5">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-text-muted mb-3">Stage Breakdown</h3>
        <div className="space-y-2.5">
          {stageData.map((s) => (
            <div key={s.stage}>
              <div className="flex justify-between text-xs mb-1">
                <span className={cn("font-medium", STAGE_TEXT[s.stage] || "text-text-body")}>
                  {s.stage} <span className="text-text-muted">({s.count})</span>
                </span>
                <span className="font-bold tabular-nums text-text-body">
                  ${(s.value / 1000).toFixed(0)}K
                </span>
              </div>
              <div className="h-2 rounded-full bg-[var(--progress-bg)]">
                <div
                  className={cn("h-full rounded-full transition-all", STAGE_COLORS[s.stage] || "bg-text-muted")}
                  style={{ width: `${Math.min((s.value / maxStageValue) * 100, 100)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* At-Risk Deals */}
      {atRisk.length > 0 && (
        <div className="mb-5">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-accent-red mb-3">
            At-Risk Deals ({atRisk.length})
          </h3>
          <div className="space-y-2">
            {atRisk.map((deal, i) => (
              <div key={`${deal.name}-${i}`} className="flex items-center justify-between text-xs p-2 rounded-lg bg-accent-red/5 border border-accent-red/10">
                <div className="min-w-0 flex items-center gap-2">
                  <SFLink url={deal.sfUrl} />
                  <div>
                    {deal.sfUrl ? (
                      <a className="hot-link font-medium text-text-heading truncate block" href={deal.sfUrl} target="_blank" rel="noopener noreferrer">
                        {deal.name}
                      </a>
                    ) : (
                      <div className="font-medium text-text-heading truncate">{deal.name}</div>
                    )}
                    <div className="text-text-muted">
                      {deal.daysToClose <= 7 && <span className="text-accent-red font-semibold">Closes in {deal.daysToClose}d</span>}
                      {deal.daysToClose <= 7 && deal.lastActivityDays > 14 && <span className="mx-1">·</span>}
                      {deal.lastActivityDays > 14 && <span className="text-accent-amber">Stalled {deal.lastActivityDays}d</span>}
                    </div>
                  </div>
                </div>
                <span className="font-bold tabular-nums text-text-heading shrink-0 ml-3">
                  ${(deal.amount / 1000).toFixed(0)}K
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Top 5 Deals */}
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-text-muted mb-3">Top Deals</h3>
        <div className="space-y-2">
          {topDeals.map((deal, i) => (
            <div key={`${deal.name}-${i}`} className="flex items-center gap-3 text-xs">
              <SFLink url={deal.sfUrl} />
              <div className="min-w-0 flex-1">
                {deal.sfUrl ? (
                  <a className="hot-link font-medium text-text-heading truncate block" href={deal.sfUrl} target="_blank" rel="noopener noreferrer">
                    {deal.name}
                  </a>
                ) : (
                  <span className="font-medium text-text-heading truncate block">{deal.name}</span>
                )}
                <span className="text-text-muted">{deal.account}</span>
              </div>
              {stageBadge(deal.stage)}
              <span className="text-text-muted tabular-nums shrink-0">{deal.daysToClose}d</span>
              <span className="font-bold tabular-nums text-text-heading shrink-0">
                ${(deal.amount / 1000).toFixed(0)}K
              </span>
            </div>
          ))}
        </div>
      </div>
      </>
      )}
    </section>
  );
}
