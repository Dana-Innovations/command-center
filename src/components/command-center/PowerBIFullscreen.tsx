"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { X, Scissors, Send, Upload, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useChats } from "@/hooks/useChats";

interface Destination {
  type: "teams_chat" | "email";
  id?: string;
  name: string;
  address?: string;
}

interface Props {
  reportName: string;
  embedUrl: string;
  onClose: () => void;
}

const KNOWN_CONTACTS = [
  { name: "Jeana Ceglia", address: "jeanac@sonance.com" },
  { name: "Derick Dahl", address: "derick.dahl@sonance.com" },
  { name: "Rob Roland", address: "rob.roland@sonance.com" },
  { name: "Jorge Notni", address: "jorge.notni@sonance.com" },
  { name: "Pat McGaughan", address: "pat.mcgaughan@sonance.com" },
  { name: "Mike Sonntag", address: "mike.sonntag@sonance.com" },
  { name: "Jason Sloan", address: "jason.sloan@sonance.com" },
];

export function PowerBIFullscreen({ reportName, embedUrl, onClose }: Props) {
  const { chats } = useChats();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [clipMode, setClipMode] = useState(false);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [destination, setDestination] = useState<Destination | null>(null);
  const [destSearch, setDestSearch] = useState("");
  const [showDestPicker, setShowDestPicker] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [sendError, setSendError] = useState("");
  const [capturing, setCapturing] = useState(false);
  const [zoom, setZoom] = useState(0.75);

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (clipMode) setClipMode(false);
        else onClose();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [clipMode, onClose]);

  // Capture using Screen Capture API (getDisplayMedia) — works despite cross-origin iframe
  async function handleCapture() {
    setCapturing(true);
    setClipMode(true); // open panel immediately so user sees progress
    try {
      // Ask browser to capture the current tab
      const stream = await (navigator.mediaDevices as MediaDevices & {
        getDisplayMedia: (opts: object) => Promise<MediaStream>
      }).getDisplayMedia({
        video: { displaySurface: "browser" },
        audio: false,
        preferCurrentTab: true,
      });

      const track = stream.getVideoTracks()[0];
      // Use ImageCapture API via dynamic cast (not fully typed in TS)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const IC = (window as any).ImageCapture;
      if (!IC) throw new Error("ImageCapture not supported");
      const imageCapture = new IC(track);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const bitmap = await (imageCapture as any).grabFrame() as ImageBitmap;

      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(bitmap, 0, 0);
      const dataUrl = canvas.toDataURL("image/png");

      track.stop();
      stream.getTracks().forEach(t => t.stop());

      setImageBase64(dataUrl);
    } catch {
      // User cancelled or browser unsupported — leave empty for manual upload
      setImageBase64(null);
    } finally {
      setCapturing(false);
    }
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setImageBase64(ev.target?.result as string);
    };
    reader.readAsDataURL(file);
  }

  async function handleSend() {
    if (!destination) return;
    setSending(true);
    setSendError("");
    try {
      const res = await fetch("/api/actions/send-clip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note, imageBase64, destination, reportUrl: embedUrl, reportName }),
      });
      let data: Record<string, unknown> = {};
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        data = await res.json();
      } else {
        const text = await res.text();
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 100)}`);
      }
      if (!res.ok || data.error) throw new Error(String(data.error) || `HTTP ${res.status}`);
      setSent(true);
      setTimeout(() => {
        setSent(false);
        setClipMode(false);
        setImageBase64(null);
        setNote("");
        setDestination(null);
      }, 2500);
    } catch (err) {
      setSendError(err instanceof Error ? err.message : String(err));
    } finally {
      setSending(false);
    }
  }

  // Build destination list: Teams chats + known contacts (email)
  const destinations: Destination[] = [
    ...chats
      .filter(c => c.topic)
      .map(c => ({ type: "teams_chat" as const, id: c.id, name: c.topic || "Teams Chat" })),
    ...KNOWN_CONTACTS.map(c => ({ type: "email" as const, name: c.name, address: c.address })),
  ];

  const filtered = destinations.filter(d =>
    d.name.toLowerCase().includes(destSearch.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#0a0a0a]">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-[#111] border-b border-white/10 shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-white">{reportName}</span>
          <span className="text-[10px] text-white/40 uppercase tracking-wider">Power BI · Live</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleCapture}
            disabled={capturing}
            className={cn(
              "flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-medium transition-all cursor-pointer",
              clipMode
                ? "bg-accent-amber text-[#0d0d0d]"
                : "bg-white/10 text-white hover:bg-white/20"
            )}
          >
            <Scissors className="w-3.5 h-3.5" />
            {capturing ? "Capturing…" : "Clip this view"}
          </button>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-white/50 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            title="Close (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main area */}
      <div className="flex flex-1 min-h-0">
        {/* Report iframe */}
        <div className={cn("flex-1 min-w-0 transition-all duration-300 flex flex-col", clipMode ? "w-[60%]" : "w-full")}>
          {/* Zoom bar */}
          <div className="flex items-center gap-2 px-3 py-2 bg-[#0d0d0d] border-b border-white/10 shrink-0">
            <span className="text-[10px] text-white/40 uppercase tracking-wider">Zoom</span>
            <button onClick={() => setZoom(z => Math.max(0.25, parseFloat((z - 0.05).toFixed(2))))}
              className="w-6 h-6 rounded border border-white/10 text-white/50 hover:text-white transition-colors cursor-pointer text-sm font-bold flex items-center justify-center">−</button>
            <input type="range" min="0.25" max="1.5" step="0.05" value={zoom}
              onChange={e => setZoom(parseFloat(e.target.value))}
              className="w-36 cursor-pointer" />
            <button onClick={() => setZoom(z => Math.min(1.5, parseFloat((z + 0.05).toFixed(2))))}
              className="w-6 h-6 rounded border border-white/10 text-white/50 hover:text-white transition-colors cursor-pointer text-sm font-bold flex items-center justify-center">+</button>
            <span className="text-[11px] text-white/40 tabular-nums w-9">{Math.round(zoom * 100)}%</span>
            <button onClick={() => setZoom(0.75)} className="text-[10px] text-white/30 hover:text-white/70 cursor-pointer transition-colors">Reset</button>
          </div>
          {/* Scaled iframe */}
          <div className="flex-1 overflow-hidden relative">
            <div style={{
              width: `${Math.round(100 / zoom)}%`,
              height: `${Math.round(100 / zoom)}%`,
              transform: `scale(${zoom})`,
              transformOrigin: "top left",
              position: "absolute",
              top: 0,
              left: 0,
            }}>
              <iframe
                ref={iframeRef}
                src={embedUrl}
                style={{ width: "100%", height: "100%", border: "none", display: "block" }}
                allowFullScreen
                title={reportName}
              />
            </div>
          </div>
        </div>

        {/* Clip panel (slides in from right) */}
        {clipMode && (
          <div className="w-[40%] max-w-md bg-[#111] border-l border-white/10 flex flex-col overflow-y-auto">
            <div className="p-4 border-b border-white/10 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <Scissors className="w-4 h-4 text-accent-amber" />
                Clip &amp; Share
              </h3>
              <button
                onClick={() => { setClipMode(false); setImageBase64(null); }}
                className="text-white/40 hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 space-y-4 flex-1">
              {/* Screenshot area */}
              <div>
                <label className="text-[10px] uppercase tracking-wider text-white/40 mb-2 block">
                  Screenshot
                </label>
                {imageBase64 ? (
                  <div className="relative group">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={imageBase64}
                      alt="Clip preview"
                      className="w-full rounded-lg border border-white/10 object-cover"
                      style={{ maxHeight: 200 }}
                    />
                    <button
                      onClick={() => setImageBase64(null)}
                      className="absolute top-1.5 right-1.5 bg-black/70 text-white/70 hover:text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ) : (
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="border-2 border-dashed border-white/10 rounded-lg p-6 text-center cursor-pointer hover:border-accent-amber/40 transition-colors"
                  >
                    <Upload className="w-6 h-6 text-white/30 mx-auto mb-2" />
                    <p className="text-xs text-white/50">
                      Auto-capture blocked by browser security.<br />
                      Take a screenshot (⌘⇧4) then drop or click to upload.
                    </p>
                  </div>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleFileUpload}
                />
                {!imageBase64 && (
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="mt-2 text-[10px] text-accent-amber/70 hover:text-accent-amber cursor-pointer transition-colors"
                  >
                    + Upload screenshot
                  </button>
                )}
              </div>

              {/* Note */}
              <div>
                <label className="text-[10px] uppercase tracking-wider text-white/40 mb-2 block">
                  Your note
                </label>
                <textarea
                  className="w-full bg-[#1a1a1a] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-white/25 resize-none focus:outline-none focus:border-accent-amber/30 leading-relaxed"
                  placeholder="Add context about what you're seeing…"
                  rows={4}
                  value={note}
                  onChange={e => setNote(e.target.value)}
                />
              </div>

              {/* Recipient picker */}
              <div>
                <label className="text-[10px] uppercase tracking-wider text-white/40 mb-2 block">
                  Send to
                </label>
                {destination ? (
                  <div className="flex items-center gap-2">
                    <div className="flex-1 bg-[#1a1a1a] border border-accent-amber/30 rounded-lg px-3 py-2 text-sm text-white flex items-center gap-2">
                      <span className={cn(
                        "text-[9px] font-bold uppercase px-1.5 py-0.5 rounded",
                        destination.type === "teams_chat" ? "bg-[#5865f2]/20 text-[#5865f2]" : "bg-accent-teal/20 text-accent-teal"
                      )}>
                        {destination.type === "teams_chat" ? "Teams" : "Email"}
                      </span>
                      {destination.name}
                    </div>
                    <button
                      onClick={() => setDestination(null)}
                      className="text-white/40 hover:text-white cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div className="relative">
                    <input
                      className="w-full bg-[#1a1a1a] border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-accent-amber/30"
                      placeholder="Search chats, people, or type email…"
                      value={destSearch}
                      onChange={e => { setDestSearch(e.target.value); setShowDestPicker(true); }}
                      onFocus={() => setShowDestPicker(true)}
                    />
                    {showDestPicker && (
                      <div className="absolute top-full left-0 right-0 mt-1 bg-[#1a1a1a] border border-white/10 rounded-lg overflow-hidden z-10 max-h-48 overflow-y-auto">
                        {filtered.length === 0 && destSearch.includes("@") ? (
                          <button
                            className="w-full text-left px-3 py-2.5 text-sm text-white hover:bg-white/5 transition-colors cursor-pointer"
                            onClick={() => {
                              setDestination({ type: "email", name: destSearch, address: destSearch });
                              setShowDestPicker(false);
                              setDestSearch("");
                            }}
                          >
                            <span className="text-[9px] bg-accent-teal/20 text-accent-teal font-bold px-1.5 py-0.5 rounded mr-2 uppercase">Email</span>
                            Send to {destSearch}
                          </button>
                        ) : filtered.slice(0, 12).map((d, i) => (
                          <button
                            key={i}
                            className="w-full text-left px-3 py-2.5 text-sm text-white hover:bg-white/5 transition-colors cursor-pointer flex items-center gap-2"
                            onClick={() => {
                              setDestination(d);
                              setShowDestPicker(false);
                              setDestSearch("");
                            }}
                          >
                            <span className={cn(
                              "text-[9px] font-bold uppercase px-1.5 py-0.5 rounded shrink-0",
                              d.type === "teams_chat" ? "bg-[#5865f2]/20 text-[#5865f2]" : "bg-accent-teal/20 text-accent-teal"
                            )}>
                              {d.type === "teams_chat" ? "Teams" : "Email"}
                            </span>
                            <span className="truncate">{d.name}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Send button */}
            <div className="p-4 border-t border-white/10">
              {sendError && (
                <p className="text-xs text-red-400 mb-2">{sendError}</p>
              )}
              {sent ? (
                <div className="text-sm text-green-400 font-medium text-center py-2">✓ Drafted — check Outlook Drafts</div>
              ) : (
                <button
                  onClick={handleSend}
                  disabled={!destination || sending || (!note.trim() && !imageBase64)}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-accent-amber text-[#0d0d0d] font-semibold text-sm cursor-pointer hover:bg-accent-amber/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {sending ? (
                    <><span className="animate-spin w-4 h-4 border-2 border-current border-t-transparent rounded-full" /> Sending…</>
                  ) : (
                    <><Send className="w-4 h-4" /> Draft Email</>
                  )}
                </button>
              )}
              <p className="text-[10px] text-white/25 text-center mt-2">
                {destination?.type === "email"
                  ? "Sends via Outlook · screenshot inline · report link button"
                  : "Sends via Teams · screenshot link · report link"}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
