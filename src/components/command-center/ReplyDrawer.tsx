"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { cn } from "@/lib/utils";
import { SENTIMENT_CHIPS } from "@/lib/constants";
import { buildOutlookComposeUrl, type ReplyQueueItem } from "@/lib/reply-center";
import { useToast } from "@/components/ui/toast";

interface ReplyDrawerProps {
  item: ReplyQueueItem;
  onSent: () => void;
  onClose: () => void;
}

type SendState = "idle" | "sending" | "sent" | "error";

const CHANNEL_LABELS: Record<string, string> = {
  email: "Copy Draft",
  teams: "Send via Teams",
  asana_comment: "Post Comment",
  slack_context: "Send via Slack",
};

const CHANNEL_SEND_LABELS: Record<string, string> = {
  email: "Open in Outlook",
  teams: "Open in Teams",
  asana_comment: "Open in Asana",
  slack_context: "Open in Slack",
};

export function ReplyDrawer({ item, onSent, onClose }: ReplyDrawerProps) {
  const [draft, setDraft] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [activeSentiment, setActiveSentiment] = useState<string | null>(null);
  const [sendState, setSendState] = useState<SendState>("idle");
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const { addToast } = useToast();

  // Cleanup abort controller on unmount
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  // Auto-collapse after sent
  useEffect(() => {
    if (sendState === "sent") {
      const timer = setTimeout(() => {
        onSent();
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [sendState, onSent]);

  const handleSentimentTap = useCallback(
    async (chipId: string, prompt: string) => {
      // Abort any in-flight stream
      abortRef.current?.abort();

      setActiveSentiment(chipId);
      setIsStreaming(true);
      setDraft("");
      setError(null);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const res = await fetch("/api/ai/draft-reply", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt,
            channel:
              item.source === "asana_comment"
                ? "asana"
                : item.source === "slack_context"
                  ? "slack"
                  : item.source,
            messageId: item.messageId || item.id,
            message: item.message,
            sender: item.sender,
            senderEmail: item.senderEmail,
            subject: item.title,
            chatId: item.chatId,
            threadTs: item.threadTs,
            taskGid: item.taskGid,
          }),
          signal: controller.signal,
        });

        if (!res.ok) {
          const text = await res.text();
          throw new Error(text || `HTTP ${res.status}`);
        }

        // Stream the response
        const reader = res.body?.getReader();
        if (!reader) throw new Error("No response stream");

        const decoder = new TextDecoder();
        let accumulated = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          accumulated += decoder.decode(value, { stream: true });
          setDraft(accumulated);
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(
          err instanceof Error ? err.message : "Unable to draft right now."
        );
      } finally {
        setIsStreaming(false);
        abortRef.current = null;
      }
    },
    [item]
  );

  const handleSend = useCallback(async () => {
    const text = draft.trim();
    if (!text || sendState === "sending") return;

    setSendState("sending");
    setError(null);

    try {
      if (item.source === "email") {
        // Hard Lock: draft only — copy to clipboard
        try {
          await navigator.clipboard.writeText(text);
          addToast("Draft copied to clipboard", "success");
        } catch {
          addToast("Could not copy — please select and copy manually", "error");
        }
        setSendState("sent");
        return;
      }

      let endpoint: string;
      let payload: Record<string, string | undefined>;

      if (item.source === "teams") {
        endpoint = "/api/actions/send-teams-reply";
        payload = { chatId: item.chatId, message: text };
      } else if (item.source === "slack_context") {
        endpoint = "/api/actions/send-slack-reply";
        payload = {
          channelId: item.channelId,
          message: text,
          threadTs: item.threadTs,
        };
      } else if (item.source === "asana_comment") {
        endpoint = "/api/actions/asana-comment";
        payload = { taskGid: item.taskGid, text };
      } else {
        throw new Error(`Unknown source: ${item.source}`);
      }

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      addToast("Sent!", "success");
      setSendState("sent");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send");
      setSendState("error");
    }
  }, [draft, sendState, item, addToast]);

  const isEmail = item.source === "email";
  const primaryLabel = isEmail ? "Copy Draft" : CHANNEL_LABELS[item.source] || "Send";

  return (
    <div className="border-t-2 border-accent-amber/30 bg-[rgba(212,164,76,0.03)] px-4 py-4 space-y-3">
      {/* Sentiment chips */}
      <div className="flex flex-wrap gap-1.5">
        {SENTIMENT_CHIPS.map((chip) => (
          <button
            key={chip.id}
            disabled={isStreaming}
            className={cn(
              "rounded-full border px-3 py-1 text-[11px] transition-all cursor-pointer",
              activeSentiment === chip.id
                ? "border-accent-amber bg-accent-amber/15 text-accent-amber"
                : "border-[var(--bg-card-border)] text-text-muted hover:border-accent-amber/30 hover:text-text-body"
            )}
            onClick={() => void handleSentimentTap(chip.id, chip.prompt)}
          >
            {chip.label}
          </button>
        ))}
      </div>

      {/* Streaming textarea */}
      <div className="relative">
        <textarea
          ref={textareaRef}
          className={cn(
            "min-h-[100px] w-full rounded-lg border bg-[rgba(0,0,0,0.15)] p-3 text-[13px] leading-relaxed text-text-body outline-none transition-colors resize-none",
            isStreaming
              ? "border-accent-amber/40"
              : "border-[var(--bg-card-border)] focus:border-accent-amber/40"
          )}
          placeholder="Tap a sentiment above or type your reply..."
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        {isStreaming && (
          <div className="absolute bottom-3 right-3 flex items-center gap-1.5">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-accent-amber animate-pulse" />
            <span className="text-[10px] text-accent-amber/70">Drafting…</span>
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <p className="text-[11px] text-accent-red">{error}</p>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2">
        {sendState === "sent" ? (
          <span className="text-[12px] font-medium text-green-400">
            ✓ {isEmail ? "Copied!" : "Sent!"}
          </span>
        ) : (
          <button
            className={cn(
              "rounded-lg px-4 py-1.5 text-[12px] font-semibold transition-colors cursor-pointer",
              isEmail
                ? "bg-accent-amber text-[#0d0d0d] hover:bg-accent-amber/90"
                : "bg-green-600/80 text-white hover:bg-green-600"
            )}
            disabled={!draft.trim() || sendState === "sending" || isStreaming}
            onClick={() => void handleSend()}
          >
            {sendState === "sending" ? "Sending…" : primaryLabel}
          </button>
        )}

        {isEmail && item.senderEmail && sendState !== "sent" && (
          <a
            className="rounded-lg border border-blue-500/30 px-3 py-1.5 text-[12px] text-blue-400 hover:text-blue-300 transition-colors"
            href={buildOutlookComposeUrl({
              to: item.senderEmail,
              subject: item.title,
              body: draft || undefined,
            })}
            target="_blank"
            rel="noopener noreferrer"
          >
            Open in Outlook
          </a>
        )}

        {!isEmail && item.url && sendState !== "sent" && (
          <a
            className="rounded-lg border border-[var(--bg-card-border)] px-3 py-1.5 text-[11px] text-text-muted hover:text-text-body transition-colors"
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            {CHANNEL_SEND_LABELS[item.source] || "Open in app"}
          </a>
        )}

        <button
          className="ml-auto text-[11px] text-text-muted hover:text-text-body transition-colors cursor-pointer"
          onClick={onClose}
        >
          Discard
        </button>
      </div>
    </div>
  );
}
