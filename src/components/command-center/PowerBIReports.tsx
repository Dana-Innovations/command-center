"use client";

import { useState, useEffect } from "react";
import { usePowerBI } from "@/hooks/usePowerBI";
import { cn } from "@/lib/utils";
import { ExternalLink, ChevronDown, ChevronUp, BarChart3 } from "lucide-react";

const STORAGE_KEY = "pbi_embed_urls";

function loadStoredUrls(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

function saveStoredUrls(urls: Record<string, string>) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(urls));
}

export function PowerBIReports() {
  const { reportConfigs, loading } = usePowerBI();
  const [expandedReport, setExpandedReport] = useState<string | null>("trends-auto");
  const [embedUrls, setEmbedUrls] = useState<Record<string, string>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftUrl, setDraftUrl] = useState("");

  // Load saved embed URLs from localStorage on mount
  useEffect(() => {
    setEmbedUrls(loadStoredUrls());
  }, []);

  // Auto-expand the first report (Trends) once loaded
  useEffect(() => {
    if (reportConfigs.length > 0 && expandedReport === "trends-auto") {
      const trends = reportConfigs.find(r =>
        r.report_name?.toLowerCase().includes("trend")
      );
      setExpandedReport(trends?.report_id ?? reportConfigs[0].report_id);
    }
  }, [reportConfigs]);

  function handleSaveUrl(reportId: string) {
    const url = draftUrl.trim();
    if (!url) return;
    const updated = { ...embedUrls, [reportId]: url };
    setEmbedUrls(updated);
    saveStoredUrls(updated);
    setEditingId(null);
    setDraftUrl("");
    setExpandedReport(reportId);
  }

  function handleRemoveUrl(reportId: string) {
    const updated = { ...embedUrls };
    delete updated[reportId];
    setEmbedUrls(updated);
    saveStoredUrls(updated);
  }

  const reports = loading
    ? []
    : reportConfigs.length > 0
    ? reportConfigs
    : [];

  return (
    <section className="glass-card anim-card">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-accent-teal" />
          <h2 className="text-sm font-semibold text-text-heading">Power BI Reports</h2>
        </div>
        {!loading && reports.length > 0 && (
          <a
            href={`https://app.powerbi.com/groups/05fd9b2f-5d90-443f-8927-ebc2a507c0d9/reports`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] text-text-muted hover:text-text-body flex items-center gap-1 transition-colors"
          >
            Open workspace <ExternalLink className="w-3 h-3" />
          </a>
        )}
      </div>

      {loading ? (
        <div className="text-sm text-text-muted animate-pulse">Loading reports…</div>
      ) : reports.length === 0 ? (
        <div className="text-sm text-text-muted">No Power BI reports found.</div>
      ) : (
        <div className="space-y-2">
          {reports.map((report) => {
            const isExpanded = expandedReport === report.report_id;
            const isEditing = editingId === report.report_id;
            const embedUrl = embedUrls[report.report_id];
            const pbiUrl = `https://app.powerbi.com/groups/${report.workspace_id}/reports/${report.report_id}`;

            return (
              <div
                key={report.report_id}
                className="border border-[var(--bg-card-border)] rounded-lg overflow-hidden"
              >
                {/* Report header row */}
                <div className="flex items-center justify-between px-3 py-2.5">
                  <button
                    className="flex-1 text-left text-sm font-medium text-text-heading truncate cursor-pointer hover:text-accent-teal transition-colors"
                    onClick={() => setExpandedReport(isExpanded ? null : report.report_id)}
                  >
                    {report.report_name}
                  </button>
                  <div className="flex items-center gap-1 ml-2 shrink-0">
                    {embedUrl && (
                      <button
                        className="text-[10px] text-text-muted hover:text-accent-red transition-colors px-1 cursor-pointer"
                        title="Remove embed URL"
                        onClick={() => handleRemoveUrl(report.report_id)}
                      >
                        ×
                      </button>
                    )}
                    <button
                      className={cn(
                        "text-[10px] px-2 py-1 rounded border transition-colors cursor-pointer",
                        embedUrl
                          ? "border-accent-teal/30 text-accent-teal hover:bg-accent-teal/10"
                          : "border-[var(--bg-card-border)] text-text-muted hover:border-accent-amber/30 hover:text-text-body"
                      )}
                      onClick={() => {
                        setEditingId(isEditing ? null : report.report_id);
                        setDraftUrl(embedUrl || "");
                        if (!isEditing) setExpandedReport(report.report_id);
                      }}
                      title={embedUrl ? "Change embed URL" : "Add Publish-to-Web URL"}
                    >
                      {embedUrl ? "embedded ✓" : "+ embed"}
                    </button>
                    <a
                      href={pbiUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1.5 rounded hover:bg-white/5 transition-colors"
                      title="Open in Power BI"
                    >
                      <ExternalLink className="w-3.5 h-3.5 text-text-muted" />
                    </a>
                    <button
                      onClick={() => setExpandedReport(isExpanded ? null : report.report_id)}
                      className="p-1.5 rounded hover:bg-white/5 transition-colors cursor-pointer"
                    >
                      {isExpanded
                        ? <ChevronUp className="w-3.5 h-3.5 text-text-muted" />
                        : <ChevronDown className="w-3.5 h-3.5 text-text-muted" />
                      }
                    </button>
                  </div>
                </div>

                {/* URL input for Publish-to-Web */}
                {isEditing && (
                  <div className="border-t border-[var(--bg-card-border)] p-3 bg-[var(--tab-bg)]">
                    <p className="text-xs text-text-muted mb-2">
                      In Power BI: <strong className="text-text-body">File → Publish to web → Create embed code</strong>, then paste the iframe <code className="bg-white/5 px-1 rounded">src=</code> URL below.
                    </p>
                    <input
                      className="w-full bg-[var(--bg-card)] border border-[var(--bg-card-border)] rounded-lg px-3 py-2 text-xs text-text-body focus:outline-none focus:border-accent-amber/30 placeholder:text-text-muted"
                      placeholder="https://app.powerbi.com/view?r=..."
                      value={draftUrl}
                      onChange={e => setDraftUrl(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && handleSaveUrl(report.report_id)}
                      autoFocus
                    />
                    <div className="flex gap-2 mt-2">
                      <button
                        className="text-[10px] px-3 py-1.5 rounded bg-accent-amber text-[#0d0d0d] font-semibold cursor-pointer hover:bg-accent-amber/90 transition-colors disabled:opacity-40"
                        disabled={!draftUrl.trim()}
                        onClick={() => handleSaveUrl(report.report_id)}
                      >
                        Save & Embed
                      </button>
                      <button
                        className="text-[10px] px-2.5 py-1.5 rounded border border-[var(--bg-card-border)] text-text-muted hover:text-text-body transition-colors cursor-pointer"
                        onClick={() => { setEditingId(null); setDraftUrl(""); }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {/* Expanded: iframe embed or placeholder */}
                {isExpanded && !isEditing && (
                  <div className="border-t border-[var(--bg-card-border)]">
                    {embedUrl ? (
                      <iframe
                        src={embedUrl}
                        className="w-full border-0"
                        style={{ height: 500 }}
                        allowFullScreen
                        title={report.report_name}
                      />
                    ) : (
                      <div className="p-6 text-center">
                        <BarChart3 className="w-8 h-8 text-text-muted mx-auto mb-3 opacity-40" />
                        <p className="text-sm text-text-muted mb-1">
                          No embed URL set for <strong className="text-text-body">{report.report_name}</strong>
                        </p>
                        <p className="text-xs text-text-muted mb-3">
                          In Power BI, open the report → <strong>File → Publish to web → Create embed code</strong>.<br />
                          Copy the iframe <code className="bg-white/5 px-1 rounded">src</code> URL and click "+ embed" above.
                        </p>
                        <div className="flex items-center justify-center gap-2">
                          <a
                            href={pbiUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs px-3 py-1.5 rounded border border-accent-teal/30 text-accent-teal hover:bg-accent-teal/10 transition-colors flex items-center gap-1.5"
                          >
                            Open {report.report_name} in Power BI <ExternalLink className="w-3 h-3" />
                          </a>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
