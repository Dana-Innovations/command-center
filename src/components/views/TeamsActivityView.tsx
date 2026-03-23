"use client";

import { useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import { AttentionFeedbackControl } from "@/components/ui/AttentionFeedbackControl";
import { ConnectPrompt } from "@/components/ui/ConnectPrompt";
import { useChats } from "@/hooks/useChats";
import { useTeamsChannelMessages } from "@/hooks/useTeamsChannelMessages";
import { useAuth } from "@/hooks/useAuth";
import { useConnections } from "@/hooks/useConnections";
import { useAttention } from "@/lib/attention/client";
import {
  buildTeamsChatAttentionTarget,
  buildTeamsChannelMessageAttentionTarget,
} from "@/lib/attention/targets";
import type { Chat, TeamsChannelMessage } from "@/lib/types";

// ── Filter types ─────────────────────────────────────────────────────────

type TeamsFilter = "all" | "dms" | "groups" | "channels";

const FILTER_OPTIONS: Array<{ id: TeamsFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "dms", label: "DMs" },
  { id: "groups", label: "Groups" },
  { id: "channels", label: "Channels" },
];

// ── Helpers ──────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `${days}d`;
}

function initials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

// ── Chat item component ─────────────────────────────────────────────────

function ChatItem({
  chat,
  target,
  attention,
}: {
  chat: Chat;
  target: ReturnType<typeof buildTeamsChatAttentionTarget>;
  attention: { finalScore: number; hidden: boolean; explanation: string[] };
}) {
  const topic = chat.topic || "Teams Chat";
  const preview = chat.last_message_preview || "";
  const from = chat.last_message_from || "";
  const isGroup =
    chat.chat_type === "group" || chat.chat_type === "meeting";
  const isDM = chat.chat_type === "oneOnOne";
  const memberCount = chat.members?.length || 0;

  return (
    <div className="py-3 flex items-start gap-3">
      <div
        className={cn(
          "w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-[11px] font-bold mt-0.5",
          isDM
            ? "bg-[#5865f2]/20 text-[#5865f2]"
            : "bg-[#7c3aed]/20 text-[#7c3aed]"
        )}
      >
        {initials(topic)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-text-heading truncate">
            {topic}
          </span>
          {isGroup && (
            <span className="text-[9px] bg-white/5 text-text-muted px-1.5 py-0.5 rounded shrink-0">
              group{memberCount > 0 ? ` · ${memberCount}` : ""}
            </span>
          )}
          {isDM && (
            <span className="text-[9px] bg-[#5865f2]/10 text-[#5865f2] px-1.5 py-0.5 rounded shrink-0">
              DM
            </span>
          )}
        </div>
        {from && (
          <div className="text-[11px] text-text-muted mt-0.5">{from}</div>
        )}
        {preview && (
          <div className="text-xs text-text-muted/80 mt-1 line-clamp-2 leading-snug">
            {preview}
          </div>
        )}
        {attention.explanation.length > 0 && (
          <div className="mt-1 text-[11px] text-text-muted">
            {attention.explanation.join(" · ")}
          </div>
        )}
      </div>
      <div className="flex flex-col items-end gap-1.5 shrink-0">
        <span className="text-[10px] text-text-muted">
          {timeAgo(chat.last_activity)}
        </span>
        <AttentionFeedbackControl target={target} surface="signals" compact />
        {chat.web_url && (
          <a
            href={chat.web_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] text-text-muted hover:text-accent-amber transition-colors"
          >
            Open
          </a>
        )}
      </div>
    </div>
  );
}

// ── Channel message group ───────────────────────────────────────────────

function ChannelGroup({
  teamName,
  channelName,
  messages,
}: {
  teamName: string;
  channelName: string;
  messages: Array<{
    message: TeamsChannelMessage;
    target: ReturnType<typeof buildTeamsChannelMessageAttentionTarget>;
    attention: { finalScore: number; hidden: boolean; explanation: string[] };
  }>;
}) {
  return (
    <div className="space-y-0">
      <div className="flex items-center gap-2 py-2">
        <span className="text-xs font-semibold text-text-heading">
          {teamName}
        </span>
        <span className="text-[10px] rounded-full bg-white/5 px-2 py-0.5 text-text-muted">
          #{channelName}
        </span>
        <span className="text-[10px] text-text-muted">
          {messages.length} message{messages.length !== 1 ? "s" : ""}
        </span>
      </div>
      <div className="divide-y divide-[var(--bg-card-border)]">
        {messages.map(({ message, target, attention }) => (
          <div key={message.id} className="py-2.5 flex items-start gap-3">
            <div className="w-7 h-7 rounded-full bg-white/5 flex items-center justify-center shrink-0 text-[10px] font-bold text-text-muted mt-0.5">
              {initials(message.author_name)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-text-heading">
                  {message.author_name}
                </span>
                <span className="text-[10px] text-text-muted">
                  {timeAgo(message.timestamp)}
                </span>
                {message.reply_count > 0 && (
                  <span className="text-[9px] bg-accent-amber/10 text-accent-amber px-1.5 py-0.5 rounded">
                    {message.reply_count} repl
                    {message.reply_count === 1 ? "y" : "ies"}
                  </span>
                )}
              </div>
              <div className="mt-0.5 text-xs text-text-muted/80 line-clamp-2 leading-snug">
                {message.text}
              </div>
              {attention.explanation.length > 0 && (
                <div className="mt-1 text-[11px] text-text-muted">
                  {attention.explanation.join(" · ")}
                </div>
              )}
            </div>
            <div className="flex flex-col items-end gap-1.5 shrink-0">
              <AttentionFeedbackControl
                target={target}
                surface="signals"
                compact
              />
              {message.web_url && (
                <a
                  href={message.web_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] text-text-muted hover:text-accent-amber transition-colors"
                >
                  Open
                </a>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main view ───────────────────────────────────────────────────────────

export function TeamsActivityView() {
  const [filter, setFilter] = useState<TeamsFilter>("all");
  const { chats, loading: chatsLoading } = useChats();
  const { messages: channelMessages, loading: channelsLoading } =
    useTeamsChannelMessages();
  const { user } = useAuth();
  const { m365: m365Connected } = useConnections();
  const { applyTarget } = useAttention();
  const fullName = user?.user_metadata?.full_name ?? "";

  // Rank and filter chats
  const rankedChats = useMemo(() => {
    return chats
      .filter((chat) => {
        if (
          fullName &&
          chat.topic === fullName &&
          chat.last_message_from === fullName
        )
          return false;
        if (
          chat.topic === "Teams Chat" &&
          !chat.last_message_preview &&
          !chat.last_message_from
        )
          return false;
        return true;
      })
      .map((chat) => {
        const target = buildTeamsChatAttentionTarget(chat, "signals", 40);
        const attention = applyTarget(target);
        return { chat, target, attention };
      })
      .filter((item) => !item.attention.hidden)
      .sort(
        (a, b) =>
          b.attention.finalScore - a.attention.finalScore ||
          new Date(b.chat.last_activity).getTime() -
            new Date(a.chat.last_activity).getTime()
      );
  }, [chats, fullName, applyTarget]);

  const dms = useMemo(
    () => rankedChats.filter((c) => c.chat.chat_type === "oneOnOne"),
    [rankedChats]
  );
  const groups = useMemo(
    () =>
      rankedChats.filter(
        (c) =>
          c.chat.chat_type === "group" || c.chat.chat_type === "meeting"
      ),
    [rankedChats]
  );

  // Rank and group channel messages
  const rankedChannelMessages = useMemo(() => {
    return channelMessages
      .map((message) => {
        const target = buildTeamsChannelMessageAttentionTarget(
          message,
          "signals",
          34
        );
        const attention = applyTarget(target);
        return { message, target, attention };
      })
      .filter((item) => !item.attention.hidden)
      .sort(
        (a, b) =>
          b.attention.finalScore - a.attention.finalScore ||
          new Date(b.message.timestamp).getTime() -
            new Date(a.message.timestamp).getTime()
      );
  }, [channelMessages, applyTarget]);

  // Group by team → channel
  const channelGroups = useMemo(() => {
    const map = new Map<
      string,
      {
        teamName: string;
        channelName: string;
        messages: typeof rankedChannelMessages;
      }
    >();
    for (const item of rankedChannelMessages) {
      const key = `${item.message.team_id}:${item.message.channel_id}`;
      if (!map.has(key)) {
        map.set(key, {
          teamName: item.message.team_name,
          channelName: item.message.channel_name,
          messages: [],
        });
      }
      map.get(key)!.messages.push(item);
    }
    return [...map.values()];
  }, [rankedChannelMessages]);

  const loading = chatsLoading || channelsLoading;

  if (!m365Connected) {
    return <ConnectPrompt service="Microsoft 365" />;
  }

  const showChats = filter === "all" || filter === "dms" || filter === "groups";
  const showDMs = filter === "all" || filter === "dms";
  const showGroups = filter === "all" || filter === "groups";
  const showChannels = filter === "all" || filter === "channels";

  return (
    <div className="space-y-4">
      {/* Filter pills */}
      <div className="flex gap-2">
        {FILTER_OPTIONS.map((opt) => (
          <button
            key={opt.id}
            onClick={() => setFilter(opt.id)}
            className={cn(
              "px-3 py-1.5 rounded-full text-xs font-medium transition-colors",
              filter === opt.id
                ? "bg-accent-amber/15 text-accent-amber"
                : "bg-white/5 text-text-muted hover:bg-white/10"
            )}
          >
            {opt.label}
            {opt.id === "dms" && dms.length > 0 && (
              <span className="ml-1.5 text-[10px] opacity-60">
                {dms.length}
              </span>
            )}
            {opt.id === "groups" && groups.length > 0 && (
              <span className="ml-1.5 text-[10px] opacity-60">
                {groups.length}
              </span>
            )}
            {opt.id === "channels" && channelGroups.length > 0 && (
              <span className="ml-1.5 text-[10px] opacity-60">
                {channelGroups.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-sm text-text-muted animate-pulse py-8 text-center">
          Loading Teams activity...
        </div>
      ) : (
        <>
          {/* DMs section */}
          {showDMs && dms.length > 0 && (
            <section className="glass-card anim-card p-5">
              <h3 className="text-xs font-semibold text-text-heading mb-3 flex items-center gap-2 uppercase tracking-wider">
                Direct Messages
                <span className="text-[10px] bg-white/5 text-text-muted px-2 py-0.5 rounded-full normal-case tracking-normal">
                  {dms.length}
                </span>
              </h3>
              <div className="divide-y divide-[var(--bg-card-border)]">
                {dms.map(({ chat, target, attention }) => (
                  <ChatItem
                    key={chat.id}
                    chat={chat}
                    target={target}
                    attention={attention}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Groups section */}
          {showGroups && groups.length > 0 && (
            <section className="glass-card anim-card p-5">
              <h3 className="text-xs font-semibold text-text-heading mb-3 flex items-center gap-2 uppercase tracking-wider">
                Group Chats
                <span className="text-[10px] bg-white/5 text-text-muted px-2 py-0.5 rounded-full normal-case tracking-normal">
                  {groups.length}
                </span>
              </h3>
              <div className="divide-y divide-[var(--bg-card-border)]">
                {groups.map(({ chat, target, attention }) => (
                  <ChatItem
                    key={chat.id}
                    chat={chat}
                    target={target}
                    attention={attention}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Channels section */}
          {showChannels && channelGroups.length > 0 && (
            <section className="glass-card anim-card p-5">
              <h3 className="text-xs font-semibold text-text-heading mb-3 flex items-center gap-2 uppercase tracking-wider">
                Channel Activity
                <span className="text-[10px] bg-white/5 text-text-muted px-2 py-0.5 rounded-full normal-case tracking-normal">
                  {rankedChannelMessages.length}
                </span>
              </h3>
              <div className="space-y-4">
                {channelGroups.map((group) => (
                  <ChannelGroup
                    key={`${group.teamName}:${group.channelName}`}
                    teamName={group.teamName}
                    channelName={group.channelName}
                    messages={group.messages}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Empty states */}
          {showChats && dms.length === 0 && groups.length === 0 && !showChannels && (
            <div className="text-sm text-text-muted text-center py-8">
              No Teams chats found.
            </div>
          )}
          {showChannels && channelGroups.length === 0 && !showChats && (
            <div className="text-sm text-text-muted text-center py-8">
              No channel activity yet. Set up focus preferences to choose which
              channels to monitor.
            </div>
          )}
          {filter === "all" &&
            dms.length === 0 &&
            groups.length === 0 &&
            channelGroups.length === 0 && (
              <div className="text-sm text-text-muted text-center py-8">
                No Teams activity found.
              </div>
            )}
        </>
      )}
    </div>
  );
}
