"use client";
import { useState, useEffect, useCallback } from "react";

import {
  Flame, Eye, ThumbsUp, Sparkles, Rocket, Clock, ChevronDown,
  ChevronRight, Play, Loader2, CheckSquare, Square, Wand2,
  Upload, AlertCircle, ExternalLink, Calendar, RefreshCw,
  Zap, TrendingUp, TrendingDown, Minus, Send, Shield,
  Activity, Target, ArrowRight, Check, X, FileText, Hash,
  Video, FileVideo, CircleCheck, CircleX, Database,
} from "lucide-react";
import { StatusBadge } from "./ui/Badge";
import { useToast } from "./ui/Toast";
import { RainbowButton } from "./ui/rainbow-button";
import StatCard from "./ui/stat-card";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8001";

interface AITitle {
  id: number;
  title: string;
}

interface MultiplierShort {
  video_id: string;
  channel_id: string;
  channel_name: string;
  title: string;
  description: string;
  views_last_check: number;
  views_delta: number;
  likes: number;
  comments: number;
  duration: number;
  thumbnail: string;
  published_at: string;
  status: string;
  url: string;
  velocity_score: number;
  growth_rate: number;
  trend: string;
  ai_titles: AITitle[];
}

function thumbUrl(thumbnail: string | null | undefined, videoId: string): string {
  if (thumbnail) return thumbnail;
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

function fmt(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n || 0);
}

function fmtDate(d: string | null) {
  if (!d) return "\u2014";
  if (/^\d{8}$/.test(d)) return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
  try {
    return new Date(d).toLocaleDateString([], { month: "short", day: "numeric" });
  } catch {
    return d;
  }
}

function TrendIcon({ trend }: { trend: string }) {
  if (trend === "accelerating")
    return <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />;
  if (trend === "decelerating")
    return <TrendingDown className="w-3.5 h-3.5 text-red-400" />;
  if (trend === "stable")
    return <Minus className="w-3.5 h-3.5 text-amber-400" />;
  return <Minus className="w-3.5 h-3.5 text-[#444]" />;
}

function TrendBadge({ trend }: { trend: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    accelerating: { label: "Accelerating", cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/25" },
    stable: { label: "Stable", cls: "bg-amber-500/15 text-amber-400 border-amber-500/25" },
    decelerating: { label: "Slowing", cls: "bg-red-500/15 text-red-400 border-red-500/25" },
    flat: { label: "Flat", cls: "bg-zinc-500/15 text-zinc-400 border-zinc-500/25" },
  };
  const s = map[trend] || map.flat;
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-medium border ${s.cls}`}>
      <TrendIcon trend={trend} />
      {s.label}
    </span>
  );
}

function VelocityBar({ score, max = 100 }: { score: number; max?: number }) {
  const pct = Math.min((score / max) * 100, 100);
  const color = score >= 50 ? "#22c55e" : score >= 20 ? "#f59e0b" : score >= 5 ? "#f97316" : "#6b7280";
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-1.5 bg-[#1C1C1C] rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
      <span className="text-[10px] font-bold tabular-nums" style={{ color }}>{Math.round(score)}x</span>
    </div>
  );
}

function SliderTrack({ value, min, max, step, onChange, labels }: {
  value: number; min: number; max: number; step?: number;
  onChange: (v: number) => void; labels: string[];
}) {
  return (
    <div>
      <input
        type="range" min={min} max={max} step={step || 1} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full"
      />
      <div className="flex justify-between mt-1">
        {labels.map((l, i) => (
          <span key={i} className="text-[9px] text-[#444]">{l}</span>
        ))}
      </div>
    </div>
  );
}

function ShortCard({
  short, selected, expanded, onSelect, onExpand, onGenerateTitles, generating,
  multiplyOpen, onOpenMultiply, onCloseMultiply,
  nChannels, setNChannels,
  processVideo, setProcessVideo,
  gapMinutes, setGapMinutes,
  onMultiply, multiplying, multiplyProgress, multiplyResult,
}: {
  short: MultiplierShort; selected: boolean; expanded: boolean;
  onSelect: () => void; onExpand: () => void;
  onGenerateTitles: () => void; generating: boolean;
  multiplyOpen: boolean; onOpenMultiply: () => void; onCloseMultiply: () => void;
  nChannels: number; setNChannels: (v: number) => void;
  processVideo: boolean; setProcessVideo: (v: boolean) => void;
  gapMinutes: number; setGapMinutes: (v: number) => void;
  onMultiply: () => void; multiplying: boolean;
  multiplyProgress: { completed: number; total: number; errors: number } | null;
  multiplyResult: any;
}) {
  const channelUrl = `https://www.youtube.com/channel/${short.channel_id}`;
  const shortUrl = short.url || `https://youtube.com/shorts/${short.video_id}`;
  const COLS = 8; // total colspan for expanded rows

  return (
    <>
      {/* Main row */}
      <tr
        className={`border-b border-[#181818] transition-colors hover:bg-white/[0.02] ${
          selected ? "bg-red-950/10" : ""
        } ${multiplyOpen ? "border-orange-500/20" : ""}`}
      >
        {/* Checkbox */}
        <td className="w-10 px-3 py-3.5 align-middle">
          <button onClick={onSelect} className="flex-shrink-0">
            {selected
              ? <CheckSquare className="w-4 h-4 text-red-400" />
              : <Square className="w-4 h-4 text-[#333] hover:text-[#666]" />}
          </button>
        </td>

        {/* Thumbnail + Short Name (hyperlinked) */}
        <td className="px-3 py-3.5 align-middle min-w-[220px] max-w-[260px]">
          <div className="flex items-center gap-2.5">
            <img
              src={thumbUrl(short.thumbnail, short.video_id)}
              alt=""
              className="w-16 h-10 rounded-lg object-cover flex-shrink-0 ring-1 ring-white/10"
            />
            <a
              href={shortUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[13px] text-white font-medium leading-tight line-clamp-2 hover:text-sky-400 transition-colors"
            >
              {short.title}
            </a>
          </div>
        </td>

        {/* Channel Name (hyperlinked) */}
        <td className="px-3 py-3.5 align-middle min-w-[130px] max-w-[170px]">
          <a
            href={channelUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[12px] text-[#aaa] hover:text-sky-400 transition-colors truncate block"
          >
            {short.channel_name || short.channel_id}
          </a>
        </td>

        {/* Total Views */}
        <td className="px-3 py-3.5 align-middle text-right">
          <span className="text-[13px] font-bold text-white tabular-nums">{fmt(short.views_last_check)}</span>
        </td>

        {/* 24h Delta */}
        <td className="px-3 py-3.5 align-middle text-right">
          <span className="text-[13px] font-bold text-red-400 tabular-nums">+{fmt(short.views_delta)}</span>
        </td>

        {/* Original Title */}
        <td className="px-3 py-3.5 align-middle min-w-[180px] max-w-[220px]">
          <p className="text-[12px] text-[#888] leading-snug line-clamp-2">{short.title}</p>
        </td>

        {/* New / AI Titles — shows first title + expand hint */}
        <td className="px-3 py-3.5 align-middle min-w-[180px] max-w-[220px]">
          {short.ai_titles.length > 0 ? (
            <div>
              <p className="text-[12px] text-violet-300 leading-snug line-clamp-2">{short.ai_titles[0].title}</p>
              {short.ai_titles.length > 1 && (
                <button
                  onClick={onExpand}
                  className="mt-1 text-[10px] text-violet-500 hover:text-violet-300 transition-colors flex items-center gap-0.5"
                >
                  {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                  {expanded ? "Hide" : `+${short.ai_titles.length - 1} more`}
                </button>
              )}
            </div>
          ) : (
            <span className="text-[11px] text-[#444] italic">No titles yet</span>
          )}
        </td>

        {/* Actions */}
        <td className="px-3 py-3.5 align-middle">
          <div className="flex items-center gap-1.5">
            {/* Expand chevron */}
            <button
              onClick={onExpand}
              className="p-1.5 text-[#555] hover:text-white rounded-lg border border-[#222] hover:border-[#444] transition-colors"
              title="Expand details"
            >
              {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            </button>

            {/* Multiply button */}
            <button
              onClick={(e) => { e.stopPropagation(); multiplyOpen ? onCloseMultiply() : onOpenMultiply(); }}
              className={`flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1.5 rounded-lg border transition-all whitespace-nowrap ${
                multiplyOpen
                  ? "bg-red-700 border-red-600 text-white"
                  : "bg-[#cc181e] hover:bg-red-600 border-red-700 text-white"
              }`}
            >
              Multiply
            </button>

            {/* Link to short */}
            <a
              href={shortUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1 text-[#555] hover:text-sky-400 transition-colors"
              title="Open Short"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </td>
      </tr>

      {/* Expanded panel — Original Title + AI Titles */}
      {expanded && (
        <tr className="border-b border-[#181818]">
          <td colSpan={COLS} className="p-0">
            <div className="bg-[#0A0A0A] border-t border-[#1C1C1C] px-5 py-4">
              <div className="flex gap-5">

                {/* Thumbnail + watch link */}
                <div className="flex-shrink-0 flex flex-col items-center gap-2">
                  <img
                    src={thumbUrl(short.thumbnail, short.video_id)}
                    alt=""
                    className="w-28 h-16 rounded-xl object-cover ring-1 ring-white/10"
                  />
                  <a
                    href={shortUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-[10px] text-[#555] hover:text-sky-400 transition-colors"
                  >
                    <Play className="w-2.5 h-2.5" /> Watch Short
                  </a>
                </div>

                {/* Original Title */}
                <div className="w-64 flex-shrink-0">
                  <p className="text-[10px] text-[#444] uppercase tracking-widest font-semibold mb-2">Original Title</p>
                  <div className="bg-[#111] rounded-xl border border-[#1C1C1C] px-3 py-2.5">
                    <p className="text-[12px] text-[#aaa] leading-relaxed">{short.title}</p>
                  </div>
                  <div className="mt-2 flex items-center gap-2 text-[10px] text-[#555]">
                    <span>{fmt(short.views_last_check)} views</span>
                    <span>·</span>
                    <span className="text-red-400">+{fmt(short.views_delta)} / 24h</span>
                  </div>
                </div>

                {/* New / AI Titles */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-3.5 h-3.5 text-violet-400" />
                      <p className="text-[10px] text-[#444] uppercase tracking-widest font-semibold">New Titles (AI)</p>
                      {short.ai_titles.length > 0 && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-violet-500/15 text-violet-400 border border-violet-500/25">
                          {short.ai_titles.length}
                        </span>
                      )}
                    </div>
                    <button
                      onClick={onGenerateTitles}
                      disabled={generating}
                      className="flex items-center gap-1.5 bg-violet-600/20 hover:bg-violet-600/35 text-violet-400 text-[11px] font-semibold px-3 py-1.5 rounded-lg border border-violet-500/25 transition-colors disabled:opacity-40"
                    >
                      {generating
                        ? <Loader2 className="w-3 h-3 animate-spin" />
                        : <RefreshCw className="w-3 h-3" />}
                      {short.ai_titles.length > 0 ? "Regenerate" : "Generate 5 Titles"}
                    </button>
                  </div>

                  {short.ai_titles.length === 0 ? (
                    <p className="text-[11px] text-[#444] italic px-1">
                      Click "Generate 5 Titles" to create niche-aware AI titles for this short.
                    </p>
                  ) : (
                    <div className="space-y-1.5">
                      {short.ai_titles.map((t, i) => (
                        <div
                          key={t.id}
                          className="flex items-start gap-2.5 bg-[#111] rounded-lg px-3 py-2 border border-[#1C1C1C] hover:border-violet-500/20 transition-colors"
                        >
                          <span className="text-[10px] text-violet-400 font-bold flex-shrink-0 mt-0.5 w-5 tabular-nums">
                            #{i + 1}
                          </span>
                          <p className="text-[12px] text-[#ccc] flex-1 leading-relaxed">{t.title}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

              </div>
            </div>
          </td>
        </tr>
      )}

      {/* Inline Multiply Panel */}
      {multiplyOpen && (
        <tr className="border-b border-[#1e1e1e]">
          <td colSpan={COLS} className="p-0">
            <div className="bg-[#0D0D0D] border-t border-[#1e1e1e] px-6 py-4 space-y-4">

              {/* Close button */}
              <div className="flex justify-end">
                <button
                  onClick={onCloseMultiply}
                  className="p-1 text-[#555] hover:text-white transition-colors rounded-md hover:bg-white/5"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Delay slider + target channels */}
              <div className="flex items-end gap-8">
                <div className="flex-1">
                  <div className="flex justify-between items-center mb-1.5">
                    <span className="text-xs text-[#777]">Delay between uploads</span>
                    <span className="text-sm font-bold text-white">{gapMinutes === 0 ? "No delay" : `${gapMinutes} min`}</span>
                  </div>
                  <SliderTrack value={gapMinutes} min={0} max={120} step={5} onChange={setGapMinutes}
                    labels={["0", "30", "60", "90", "120"]} />
                </div>
              </div>

              {/* Upload progress — shows which video is being multiplied */}
              {multiplying && multiplyProgress && (
                <div className="bg-[#0A0A0A] border border-red-500/20 rounded-xl p-4 space-y-3">
                  <div className="flex items-center gap-3">
                    <img
                      src={thumbUrl(short.thumbnail, short.video_id)}
                      alt=""
                      className="w-14 h-9 rounded-lg object-cover flex-shrink-0 ring-1 ring-red-500/30"
                    />
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <Loader2 className="w-3.5 h-3.5 text-red-400 animate-spin" />
                          <span className="text-[12px] text-white font-medium">Multiplying: <span className="text-red-400">{short.title.slice(0, 40)}{short.title.length > 40 ? "…" : ""}</span></span>
                        </div>
                        <span className="text-[12px] font-bold tabular-nums text-red-400">
                          {multiplyProgress.completed} / {multiplyProgress.total}
                        </span>
                      </div>
                      <div className="w-full h-2 bg-[#1C1C1C] rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${multiplyProgress.total > 0 ? (multiplyProgress.completed / multiplyProgress.total) * 100 : 0}%`,
                            background: "linear-gradient(90deg, #cc181e, #ef4444)",
                          }}
                        />
                      </div>
                      <div className="flex items-center justify-between text-[10px] text-[#555] mt-1">
                        <span>{Math.round(multiplyProgress.total > 0 ? (multiplyProgress.completed / multiplyProgress.total) * 100 : 0)}% complete</span>
                        <span className="flex items-center gap-3">
                          <span className="text-emerald-400">{multiplyProgress.completed - multiplyProgress.errors} sent</span>
                          {multiplyProgress.errors > 0 && <span className="text-red-400">{multiplyProgress.errors} failed</span>}
                          <span>{multiplyProgress.total - multiplyProgress.completed} remaining</span>
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Result */}
              {multiplyResult && !multiplying && (
                <div className={`rounded-xl p-3 text-[12px] border ${
                  multiplyResult.total_errors === 0
                    ? "bg-emerald-950/30 border-emerald-800/30 text-emerald-400"
                    : "bg-amber-950/30 border-amber-800/30 text-amber-400"
                }`}>
                  <p className="font-bold mb-1">Done — {multiplyResult.total_sent} sent, {multiplyResult.total_errors} errors</p>
                  {multiplyResult.results?.length > 0 && (
                    <div className="space-y-0.5 max-h-24 overflow-y-auto">
                      {multiplyResult.results.map((r: any, i: number) => (
                        <div key={i} className="flex items-center gap-2 text-[11px] text-[#aaa]">
                          <Check className="w-2.5 h-2.5 text-emerald-400 flex-shrink-0" />
                          <span className="truncate">{r.channel} — {r.title_used}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Multiply button */}
              <button
                onClick={onMultiply}
                disabled={multiplying}
                className="w-full flex items-center justify-center gap-2 disabled:opacity-50 text-white font-semibold text-sm py-3 rounded-xl transition-all"
                style={{ backgroundColor: "#cc181e" }}
                onMouseEnter={(e) => { if (!multiplying) (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#e01e25"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#cc181e"; }}
              >
                {multiplying ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Multiplying — uploading to YouTube...</>
                ) : (
                  <>Multiply to all {nChannels || "target"} channels{gapMinutes > 0 ? ` (${gapMinutes}min gap)` : ""}</>
                )}
              </button>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ── Channel Mapping ───────────────────────────────────────────────────────────

const CHANNEL_MAP: Record<number, { name: string; url: string }> = {
  1: { name: "OfflineYTTest", url: "https://www.youtube.com/channel/UC8lvGNOKoRzaNH4EY38denQ" },
  2: { name: "Keshavdumy2", url: "https://www.youtube.com/channel/UCaxURP3FtD3aOQGOHqkHWgA" },
  3: { name: "QATesting-f6s", url: "https://www.youtube.com/channel/UCUkfWHjeOsjvsk8y4oIXyuA" },
  4: { name: "keshavgoyal4701", url: "https://www.youtube.com/channel/UC2ImIFnKbCNBL5TqeG7C5vw" },
};

// ── Multiplied Videos Types & Component ──────────────────────────────────────

interface MultipliedChannel {
  channel_number: number;
  channel_name: string;
  new_title: string;
  scheduled_at: string;
  sent_at: string;
  uploaded_video_id: string | null;
  uploaded_views: number;
  uploaded_likes: number;
  stats_updated_at: string | null;
}

interface MultipliedVideo {
  video_id: string;
  title: string;
  thumbnail: string;
  original_url: string;
  original_views: number;
  original_likes: number;
  total_uploaded_views: number;
  total_uploaded_likes: number;
  stats_updated_at: string | null;
  velocity_score: number;
  trend: string;
  multiplier: number;
  channels: MultipliedChannel[];
}

function MultipliedVideosTab() {
  const { success, error } = useToast();
  const [videos, setVideos] = useState<MultipliedVideo[]>([]);
  const [loading, setLoading] = useState(true);

  // Boost modal state
  const [modalVideo, setModalVideo] = useState<MultipliedVideo | null>(null);
  const [moreChannels, setMoreChannels] = useState(3);
  const [moreProcessVideo, setMoreProcessVideo] = useState(true);
  const [multiplying, setMultiplying] = useState(false);

  const fetchVideos = useCallback(async () => {
    try {
      const res = await fetch(`${API}/upload/multiplied-videos`);
      if (!res.ok) throw new Error(`API error (${res.status})`);
      const data = await res.json();
      setVideos(Array.isArray(data) ? data : []);
    } catch (e: any) {
      console.error("Failed to fetch multiplied videos:", e);
    }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchVideos(); }, [fetchVideos]);

  const handleBoost = async () => {
    if (!modalVideo) return;
    setMultiplying(true);
    try {
      const res = await fetch(`${API}/upload/multiply-direct`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          video_ids: [modalVideo.video_id],
          n_channels: 0,
          process_video: moreProcessVideo,
          gap_minutes: gapMinutes,
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.detail || "Failed");
      success(`Uploading to ${d.total_webhooks} more channels...`);
      setModalVideo(null);
      const poll = async () => {
        try {
          const st = await fetch(`${API}/upload/multiply-direct/status`).then((r) => r.json());
          if (st.running) { setTimeout(poll, 3000); }
          else {
            setMultiplying(false);
            if (st.last_result) success(`Done! ${st.last_result.total_sent} new uploads sent.`);
            await fetchVideos();
          }
        } catch { setMultiplying(false); }
      };
      setTimeout(poll, 5000);
    } catch (e: any) { error(e.message); setMultiplying(false); }
  };

  const [refreshingStats, setRefreshingStats] = useState(false);
  const [expandedChannels, setExpandedChannels] = useState<Set<string>>(new Set());

  const handleRefreshStats = async () => {
    setRefreshingStats(true);
    try {
      await fetch(`${API}/upload/refresh-stats`, { method: "POST" });
      success("Stats refresh started — updating in background...");
      // Poll until done then reload
      const poll = async () => {
        await new Promise((r) => setTimeout(r, 4000));
        await fetchVideos();
        setRefreshingStats(false);
      };
      poll();
    } catch { setRefreshingStats(false); }
  };

  // Aggregate stats — use real uploaded views where available, fall back to original
  const totalChannelsDeployed = videos.reduce((a, v) => a + v.channels.length, 0);
  const totalUploadedViews = videos.reduce((a, v) => a + (v.total_uploaded_views || 0), 0);
  const totalOriginalViews = videos.reduce((a, v) => a + (v.original_views || 0), 0);
  const hasRealStats = totalUploadedViews > 0;
  const avgMultiplier = videos.length > 0
    ? (videos.reduce((a, v) => a + v.multiplier, 0) / videos.length).toFixed(1)
    : "0";
  const lastUpdated = videos
    .map((v) => v.stats_updated_at)
    .filter(Boolean)
    .sort()
    .pop();

  return (
    <div className="space-y-5">
      {/* Refresh controls */}
      <div className="flex items-center justify-end gap-3">
        {lastUpdated && (
          <span className="text-[10px] text-[#444]">Stats updated {fmtTime(lastUpdated)}</span>
        )}
        <button
          onClick={handleRefreshStats}
          disabled={refreshingStats}
          className="flex items-center gap-1.5 text-[11px] text-sky-500 hover:text-sky-400 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-3 h-3 ${refreshingStats ? "animate-spin" : ""}`} />
          {refreshingStats ? "Refreshing..." : "Refresh Stats"}
        </button>
        <button
          onClick={() => { setLoading(true); fetchVideos(); }}
          className="flex items-center gap-1.5 text-[11px] text-[#666] hover:text-white transition-colors"
        >
          <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} /> Reload
        </button>
      </div>

      {/* Summary stat cards */}
      <div className="grid grid-cols-3 gap-3">
        <StatCard value={String(videos.length)} label="Videos Multiplied" sub="total reposted videos" variant="grey" />
        <StatCard value={hasRealStats ? fmt(totalUploadedViews) : "—"} label="Repost Views" sub="views across all reposts" variant="grey" />
        <StatCard value={String(totalChannelsDeployed)} label="No. of Uploads" sub="total channel uploads" variant="grey" />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 text-[#444] animate-spin" />
        </div>
      ) : videos.length === 0 ? (
        <div className="bg-[#111] border border-dashed border-[#1C1C1C] rounded-2xl py-20 text-center">
          <Rocket className="w-10 h-10 text-[#333] mx-auto mb-3" />
          <p className="text-[#555] text-sm">No multiplied videos yet</p>
          <p className="text-[#333] text-xs mt-1">Select shorts and hit Multiply to start</p>
        </div>
      ) : (
        <div className="bg-[#111] border border-[#1C1C1C] rounded-2xl overflow-hidden">
          <table className="w-full text-left border-collapse table-fixed">
            <thead>
              <tr className="border-b border-[#222] bg-[#0D0D0D]">
                <th className="px-5 py-3.5 text-[11px] font-semibold uppercase tracking-widest text-[#ccc] w-[28%]">Video</th>
                <th className="px-5 py-3.5 text-[11px] font-semibold uppercase tracking-widest text-[#ccc] w-[12%]">Original Views</th>
                <th className="px-5 py-3.5 text-[11px] font-semibold uppercase tracking-widest text-[#ccc] w-[12%]">Repost Views</th>
                <th className="px-5 py-3.5 text-[11px] font-semibold uppercase tracking-widest text-[#ccc] w-[10%]">Multiplier</th>
                <th className="px-5 py-3.5 text-[11px] font-semibold uppercase tracking-widest text-[#ccc] w-[24%]">Target Channels</th>
                <th className="px-5 py-3.5 text-[11px] font-semibold uppercase tracking-widest text-[#ccc] w-[14%]">Actions</th>
              </tr>
            </thead>
            <tbody>
              {videos.map((v) => {
                const repostViews = v.total_uploaded_views || 0;
                const hasStats = repostViews > 0;
                const isExpanded = expandedChannels.has(v.video_id);
                const PILL_LIMIT = 2;
                const visibleChannels = v.channels.slice(0, PILL_LIMIT);
                const hiddenCount = v.channels.length - PILL_LIMIT;
                const toggleExpand = () => setExpandedChannels((prev) => {
                  const next = new Set(prev);
                  next.has(v.video_id) ? next.delete(v.video_id) : next.add(v.video_id);
                  return next;
                });
                return (
                  <>
                    <tr key={v.video_id} className="border-b border-[#1a1a1a] hover:bg-white/[0.02] transition-colors">
                      {/* Video */}
                      <td className="px-5 py-4 align-middle">
                        <div className="flex items-center gap-3">
                          <img src={thumbUrl(v.thumbnail, v.video_id)} alt="" className="w-14 h-9 rounded-lg object-cover flex-shrink-0 ring-1 ring-white/5" />
                          <a href={v.original_url} target="_blank" rel="noreferrer"
                            className="text-[13px] font-semibold text-white hover:text-red-400 transition-colors line-clamp-2 leading-snug">
                            {v.title}
                          </a>
                        </div>
                      </td>
                      {/* Original Views */}
                      <td className="px-5 py-4 align-middle">
                        <span className="text-[14px] font-bold text-white tabular-nums">{fmt(v.original_views)}</span>
                      </td>
                      {/* Repost Views */}
                      <td className="px-5 py-4 align-middle">
                        {hasStats
                          ? <span className="text-[14px] font-bold text-sky-400 tabular-nums">{fmt(repostViews)}</span>
                          : <span className="text-[13px] text-[#333]">—</span>}
                      </td>
                      {/* Multiplier */}
                      <td className="px-5 py-4 align-middle">
                        <span className="text-[14px] font-bold text-orange-400 tabular-nums">{v.multiplier}x</span>
                      </td>
                      {/* Channels — pills + expand */}
                      <td className="px-5 py-4 align-middle">
                        <div className="flex items-center gap-1 flex-nowrap overflow-hidden">
                          {visibleChannels.map((ch) => {
                            const mapped = CHANNEL_MAP[ch.channel_number];
                            const name = mapped?.name || ch.channel_name || `YT${ch.channel_number}`;
                            const label = name.length > 9 ? name.slice(0, 9) + "…" : name;
                            return (
                              <span key={ch.channel_number} className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-white/10 text-white border border-white/20 whitespace-nowrap flex-shrink-0">
                                <span className="w-3.5 h-3.5 rounded-full bg-white/20 flex items-center justify-center text-[7px] text-white font-bold flex-shrink-0">{ch.channel_number}</span>
                                {label}
                              </span>
                            );
                          })}
                          {hiddenCount > 0 && (
                            <button
                              onClick={toggleExpand}
                              className="inline-flex items-center gap-0.5 text-[10px] font-medium px-2 py-0.5 rounded-full bg-white/5 text-[#aaa] border border-[#333] hover:text-white hover:border-[#555] transition-colors whitespace-nowrap flex-shrink-0"
                            >
                              +{hiddenCount}
                              {isExpanded ? <ChevronDown className="w-2.5 h-2.5" /> : <ChevronRight className="w-2.5 h-2.5" />}
                            </button>
                          )}
                          {hiddenCount <= 0 && v.channels.length > 0 && (
                            <button onClick={toggleExpand} className="text-[#555] hover:text-[#888] transition-colors flex-shrink-0 ml-0.5">
                              {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                            </button>
                          )}
                        </div>
                      </td>
                      {/* Actions */}
                      <td className="px-5 py-4 align-middle">
                        <button
                          onClick={() => { setModalVideo(v); setMoreChannels(3); }}
                          className="text-[11px] font-semibold px-3 py-1.5 rounded-lg border transition-all whitespace-nowrap text-white border-red-700"
                          style={{ backgroundColor: "#cc181e" }}
                          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#e01e25"; }}
                          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#cc181e"; }}
                        >
                          + Multiply
                        </button>
                      </td>
                    </tr>

                    {/* Expanded channel detail */}
                    {isExpanded && (
                      <tr className="border-b border-[#1a1a1a]">
                        <td colSpan={6} className="px-5 py-4 bg-[#0A0A0A]">
                          <p className="text-[10px] uppercase tracking-widest text-[#555] font-semibold mb-3">Uploaded to {v.channels.length} channels</p>
                          <div className="grid grid-cols-4 gap-2">
                            {v.channels.map((ch) => {
                              const mapped = CHANNEL_MAP[ch.channel_number];
                              const name = mapped?.name || ch.channel_name || `YT${ch.channel_number}`;
                              return (
                                <div key={ch.channel_number} className="flex items-center gap-2.5 bg-[#111] border border-[#1C1C1C] rounded-xl px-3 py-2.5">
                                  <div className="w-7 h-7 rounded-full bg-white/15 border border-white/20 flex items-center justify-center text-[10px] text-white font-bold flex-shrink-0">
                                    {ch.channel_number}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-[12px] text-white font-semibold truncate">{name}</p>
                                    <p className="text-[10px] text-[#555] mt-0.5">{fmtTime(ch.sent_at)}</p>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Boost Modal */}
      {modalVideo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setModalVideo(null)} />
          <div className="relative bg-[#111] border border-[#2A2A2A] rounded-2xl p-6 w-full max-w-md shadow-2xl space-y-5">
            {/* Header */}
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <img src={modalVideo.thumbnail} alt="" className="w-14 h-10 rounded-lg object-cover ring-1 ring-white/10 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-white font-semibold text-[13px] leading-tight truncate">{modalVideo.title}</p>
                  <p className="text-[10px] text-[#555] mt-0.5">
                    Currently {modalVideo.multiplier}x &middot; {modalVideo.channels.length} channels
                  </p>
                </div>
              </div>
              <button onClick={() => setModalVideo(null)} className="text-[#555] hover:text-white transition-colors flex-shrink-0">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Channels slider */}
            <div>
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs text-[#777]">Boost to more channels</span>
                <span className="text-sm font-bold text-white">{moreChannels} channels</span>
              </div>
              <SliderTrack value={moreChannels} min={1} max={30} onChange={setMoreChannels}
                labels={["1", "5", "10", "15", "20", "25", "30"]} />
            </div>

            {/* Toggles */}
            <div>
              <button
                onClick={() => setMoreProcessVideo(!moreProcessVideo)}
                className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-xl border transition-all text-left ${
                  moreProcessVideo ? "bg-emerald-500/10 border-emerald-500/25 text-emerald-400" : "bg-[#0A0A0A] border-[#1C1C1C] text-[#555]"
                }`}
              >
                <Shield className="w-3.5 h-3.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-medium">ffmpeg Processing</p>
                  <p className="text-[9px] opacity-60">Unique video per channel (anti-duplicate)</p>
                </div>
                {moreProcessVideo ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
              </button>
            </div>

            {/* Summary */}
            <div className="bg-[#0A0A0A] rounded-xl p-3 border border-[#1A1A1A] grid grid-cols-2 gap-3 text-center">
              <div>
                <p className="text-[10px] text-[#444]">New Uploads</p>
                <p className="text-lg font-bold text-orange-400">{moreChannels}</p>
              </div>
              <div>
                <p className="text-[10px] text-[#444]">New Multiplier</p>
                <p className="text-lg font-bold text-white">{modalVideo.multiplier + moreChannels}x</p>
              </div>
            </div>

            <RainbowButton
              onClick={handleBoost}
              disabled={multiplying}
              className="w-full flex items-center justify-center gap-2 font-semibold text-sm py-3.5"
            >
              {multiplying ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Multiplying...</>
              ) : (
                <><Rocket className="w-4 h-4" /> Multiply to {moreChannels} More Channels</>
              )}
            </RainbowButton>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Upload Log Types & Component ─────────────────────────────────────────────

interface WebhookLog {
  id: number;
  video_id: string;
  original_title: string;
  new_title: string;
  caption: string;
  channel_number: number;
  channel_name: string;
  total_channels: number;
  file_size_bytes: number;
  video_processed: number;
  scheduled_at: string;
  webhook_status: number;
  webhook_url: string;
  velocity_score: number;
  trend: string;
  thumbnail: string;
  short_thumbnail: string;
  error_message: string | null;
  status: string;
  uploaded_video_id: string | null;
  uploaded_views: number;
  uploaded_likes: number;
  created_at: string;
}

interface LogSummary {
  total_uploads: number;
  sent: number;
  failed: number;
  unique_videos: number;
  unique_channels: number;
  total_data_sent_mb: number;
}

function fmtSize(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${bytes} B`;
}

function fmtTime(d: string | null) {
  if (!d) return "—";
  try {
    const dt = new Date(d);
    return dt.toLocaleString([], {
      month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
    });
  } catch { return d; }
}

function UploadLogTab() {
  const [logs, setLogs] = useState<WebhookLog[]>([]);
  const [summary, setSummary] = useState<LogSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedLog, setExpandedLog] = useState<number | null>(null);

  const fetchLogs = useCallback(async () => {
    try {
      const [logsResponse, summaryResponse] = await Promise.all([
        fetch(`${API}/upload/webhook-logs`),
        fetch(`${API}/upload/webhook-logs/summary`),
      ]);
      if (!logsResponse.ok) throw new Error(`Logs API error (${logsResponse.status})`);
      if (!summaryResponse.ok) throw new Error(`Summary API error (${summaryResponse.status})`);
      const logsData = await logsResponse.json();
      const summaryData = await summaryResponse.json();
      setLogs(Array.isArray(logsData) ? logsData : []);
      setSummary(summaryData);
    } catch (e: any) {
      console.error("Failed to fetch upload logs:", e);
    }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  // Group logs by video_id for nice display
  const grouped = logs.reduce<Record<string, WebhookLog[]>>((acc, log) => {
    if (!acc[log.video_id]) acc[log.video_id] = [];
    acc[log.video_id].push(log);
    return acc;
  }, {});

  return (
    <div className="space-y-5">
      {/* Summary Stats */}
      {summary && (
        <div className="grid grid-cols-4 gap-3">
          <StatCard value={String(summary.total_uploads)} label="Total Uploads" sub="all upload attempts" variant="grey" />
          <StatCard value={String(summary.sent)} label="Sent" sub="successfully delivered" variant="grey" />
          <StatCard value={String(summary.failed)} label="Failed" sub="errors encountered" variant="grey" />
          <StatCard value={String(summary.unique_channels)} label="Total Channels" sub="channels used" variant="grey" />
        </div>
      )}

      {/* Refresh button */}
      <div className="flex items-center justify-between">
        <p className="text-[11px] text-[#555]">
          {logs.length} upload logs &middot; grouped by video
        </p>
        <button
          onClick={() => { setLoading(true); fetchLogs(); }}
          className="flex items-center gap-1.5 text-[11px] text-[#666] hover:text-white transition-colors"
        >
          <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 text-[#444] animate-spin" />
        </div>
      ) : logs.length === 0 ? (
        <div className="bg-[#111] border border-dashed border-[#1C1C1C] rounded-2xl py-20 text-center">
          <FileText className="w-10 h-10 text-[#333] mx-auto mb-3" />
          <p className="text-[#555] text-sm">No uploads yet</p>
          <p className="text-[#333] text-xs mt-1">
            Select shorts in the Viral Shorts tab and hit Multiply to start uploading
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {Object.entries(grouped).map(([videoId, videoLogs]) => {
            const first = videoLogs[0];
            const sentCount = videoLogs.filter((l) => l.status === "sent").length;
            const failedCount = videoLogs.filter((l) => l.status === "failed").length;
            const isExpanded = expandedLog !== null && videoLogs.some((l) => l.id === expandedLog);

            return (
              <div key={videoId} className="bg-[#111] border border-[#1C1C1C] rounded-2xl overflow-hidden">
                {/* Video header */}
                <div className="flex items-center gap-4 px-5 py-4">
                  <img src={thumbUrl(first.short_thumbnail || first.thumbnail, videoId)} alt="" className="w-20 h-14 rounded-xl object-cover flex-shrink-0 ring-1 ring-white/5" />

                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] text-white font-medium truncate">{first.original_title}</p>
                    <p className="text-[10px] text-[#555] font-mono mt-0.5">{videoId}</p>
                  </div>

                  <div className="flex items-center gap-3 flex-shrink-0">
                    <div className="text-center">
                      <p className="text-lg font-bold text-white">{videoLogs.length}</p>
                      <p className="text-[9px] text-[#444] uppercase">Uploads</p>
                    </div>
                    <div className="text-center">
                      <p className="text-lg font-bold text-emerald-400">{sentCount}</p>
                      <p className="text-[9px] text-[#444] uppercase">Sent</p>
                    </div>
                    {failedCount > 0 && (
                      <div className="text-center">
                        <p className="text-lg font-bold text-red-400">{failedCount}</p>
                        <p className="text-[9px] text-[#444] uppercase">Failed</p>
                      </div>
                    )}
                    <TrendBadge trend={first.trend || "flat"} />
                  </div>
                </div>

                {/* Channel rows */}
                <div className="border-t border-[#1A1A1A]">
                  <table className="w-full text-[12px]">
                    <thead>
                      <tr className="text-[10px] uppercase tracking-wider text-[#ccc] border-b border-[#1A1A1A] bg-[#0D0D0D] font-semibold">
                        <th className="text-left px-4 py-3 w-[22%]">Channel</th>
                        <th className="text-left px-4 py-3 w-[28%]">New Title</th>
                        <th className="text-left px-4 py-3 w-[10%]">Status</th>
                        <th className="text-left px-4 py-3 w-[15%]">Uploaded Short</th>
                        <th className="text-left px-4 py-3 w-[12%]">Request Sent</th>
                        <th className="text-left px-4 py-3 w-[13%]">Sent At</th>
                      </tr>
                    </thead>
                    <tbody>
                      {videoLogs.map((log) => (
                        <tr
                          key={log.id}
                          onClick={() => setExpandedLog(expandedLog === log.id ? null : log.id)}
                          className="border-b border-[#141414] hover:bg-white/[0.02] cursor-pointer transition-colors"
                        >
                          <td className="px-4 py-3 align-middle">
                            <div className="flex items-center gap-2">
                              <div className="w-6 h-6 rounded-full bg-white/15 border border-white/20 flex items-center justify-center text-[9px] text-white font-bold flex-shrink-0">
                                {log.channel_number}
                              </div>
                              <span className="text-[13px] text-white font-medium truncate max-w-[150px]">{log.channel_name}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 align-middle">
                            <p className="text-[12px] text-[#aaa] truncate max-w-[240px]">{log.new_title}</p>
                          </td>
                          <td className="px-4 py-3 align-middle">
                            {log.status === "sent" ? (
                              <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-medium bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">
                                <CircleCheck className="w-2.5 h-2.5" /> Sent
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-medium bg-red-500/15 text-red-400 border border-red-500/25">
                                <CircleX className="w-2.5 h-2.5" /> Failed
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 align-middle">
                            {log.uploaded_video_id ? (
                              <a
                                href={`https://www.youtube.com/shorts/${log.uploaded_video_id}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded-lg font-medium bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-colors"
                              >
                                <ExternalLink className="w-2.5 h-2.5" /> Watch
                              </a>
                            ) : (
                              <span className="text-[10px] text-[#333]">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3 align-middle text-[11px] text-[#666] tabular-nums">{fmtTime(log.scheduled_at)}</td>
                          <td className="px-4 py-3 align-middle text-[11px] text-[#555] tabular-nums">{fmtTime(log.created_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {/* Expanded detail */}
                  {expandedLog !== null && videoLogs.find((l) => l.id === expandedLog) && (() => {
                    const log = videoLogs.find((l) => l.id === expandedLog)!;
                    return (
                      <div className="bg-[#0A0A0A] border-t border-[#1A1A1A] px-5 py-4 space-y-3">
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <p className="text-[10px] text-[#444] uppercase tracking-wider mb-1">AI Generated Title</p>
                            <p className="text-[12px] text-white font-medium">{log.new_title}</p>
                          </div>
                          <div>
                            <p className="text-[10px] text-[#444] uppercase tracking-wider mb-1">Original Title</p>
                            <p className="text-[12px] text-[#888]">{log.original_title}</p>
                          </div>
                        </div>
                        <div>
                          <p className="text-[10px] text-[#444] uppercase tracking-wider mb-1">Caption Sent</p>
                          <p className="text-[11px] text-[#777] bg-[#111] rounded-lg p-3 border border-[#1A1A1A] whitespace-pre-wrap max-h-28 overflow-y-auto">{log.caption}</p>
                        </div>
                        {log.uploaded_video_id && (
                          <div className="flex items-center gap-3 bg-red-950/20 border border-red-800/20 rounded-lg p-3">
                            <a
                              href={`https://www.youtube.com/shorts/${log.uploaded_video_id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-2 text-[12px] px-3 py-1.5 rounded-lg font-medium bg-red-500/15 text-red-400 border border-red-500/25 hover:bg-red-500/25 transition-colors"
                            >
                              <ExternalLink className="w-3 h-3" /> Watch on YouTube
                            </a>
                            <span className="text-[11px] text-[#555] font-mono">{log.uploaded_video_id}</span>
                            {(log.uploaded_views > 0 || log.uploaded_likes > 0) && (
                              <span className="text-[11px] text-[#666]">
                                {log.uploaded_views > 0 && <>{log.uploaded_views.toLocaleString()} views</>}
                                {log.uploaded_views > 0 && log.uploaded_likes > 0 && " · "}
                                {log.uploaded_likes > 0 && <>{log.uploaded_likes.toLocaleString()} likes</>}
                              </span>
                            )}
                          </div>
                        )}
                        <div className="grid grid-cols-4 gap-3 text-[11px]">
                          <div>
                            <span className="text-[#444]">Upload: </span>
                            <span className="text-[#888]">{log.webhook_url?.startsWith("youtube-direct") ? "Direct YouTube" : `HTTP ${log.webhook_status}`}</span>
                          </div>
                          <div>
                            <span className="text-[#444]">Velocity: </span>
                            <span className="text-amber-400 font-bold">{(log.velocity_score || 0).toFixed(1)}</span>
                          </div>
                          <div>
                            <span className="text-[#444]">Channels: </span>
                            <span className="text-[#888]">{log.channel_number} of {log.total_channels}</span>
                          </div>
                          <div>
                            <span className="text-[#444]">File: </span>
                            <span className="text-[#888]">{fmtSize(log.file_size_bytes)}</span>
                          </div>
                        </div>
                        {log.error_message && (
                          <div className="bg-red-950/30 border border-red-800/30 rounded-lg p-3">
                            <p className="text-[10px] text-red-400 font-medium mb-1">Error</p>
                            <p className="text-[11px] text-red-300">{log.error_message}</p>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}


// ── Main Component ───────────────────────────────────────────────────────────

export default function MultiplierRoomPage() {
  const { success, error } = useToast();
  const [subTab, setSubTab] = useState<"shorts" | "multiplied" | "logs">("shorts");
  const [shorts, setShorts] = useState<MultiplierShort[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [multiplyOpenFor, setMultiplyOpenFor] = useState<string | null>(null);
  const [generating, setGenerating] = useState<Set<string>>(new Set());
  const [generatingAll, setGeneratingAll] = useState(false);

  // Pagination
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 15;

  // Per-row multiply config (shared sliders, one panel open at a time)
  const [nChannels, setNChannels] = useState(0); // 0 = all target channels
  const [processVideo, setProcessVideo] = useState(true);
  const [gapMinutes, setGapMinutes] = useState(0); // delay between uploads in minutes
  const [targetChannels, setTargetChannels] = useState<{ id: number; channel_name: string; channel_id: string }[]>([]);
  // Per-video multiply state (keyed by video_id)
  const [multiplyingFor, setMultiplyingFor] = useState<string | null>(null);
  const [multiplyProgressFor, setMultiplyProgressFor] = useState<Record<string, { completed: number; total: number; errors: number }>>({});
  const [multiplyResultFor, setMultiplyResultFor] = useState<Record<string, any>>({});
  // Legacy bulk multiply state (kept for "Multiply (N)" top button)
  const [multiplying, setMultiplying] = useState(false);
  const [multiplyResult, setMultiplyResult] = useState<any>(null);
  const [multiplyProgress, setMultiplyProgress] = useState<{ completed: number; total: number; errors: number } | null>(null);
  const [showMultiply, setShowMultiply] = useState(false);
  const [scanning, setScanning] = useState(false);

  const handleScan = async () => {
    setScanning(true);
    try {
      const res = await fetch(`${API}/shorts/scan`, { method: "POST" });
      const data = await res.json();
      if (data.status === "already_running") {
        success("Scan already in progress...");
      }
      const poll = async () => {
        try {
          const st = await fetch(`${API}/shorts/scan/status`).then((r) => r.json());
          if (st.running) {
            setTimeout(poll, 2000);
          } else {
            await fetchAll();
            setScanning(false);
            const r = st.last_result;
            if (r?.error) {
              error(`Scan error: ${r.error}`);
            } else if (r) {
              success(`Scan done: ${r.new_shorts} new, ${r.queued_shorts} queued`);
            }
          }
        } catch {
          setScanning(false);
        }
      };
      setTimeout(poll, 2000);
    } catch {
      error("Could not start scan");
      setScanning(false);
    }
  };

  const fetchAll = useCallback(async () => {
    try {
      const [shortsRes, targetsRes] = await Promise.all([
        fetch(`${API}/shorts/multiplier-room`),
        fetch(`${API}/channels/target`),
      ]);
      if (shortsRes.ok) {
        const s = await shortsRes.json();
        setShorts(Array.isArray(s) ? s : []);
      }
      if (targetsRes.ok) {
        const t = await targetsRes.json();
        setTargetChannels(Array.isArray(t) ? t : []);
      }
    } catch (e: any) {
      console.error("Failed to fetch multiplier room data:", e);
    }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };
  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };
  const selectAll = () => {
    setSelected(selected.size === shorts.length ? new Set() : new Set(shorts.map((s) => s.video_id)));
  };

  const handleGenerateTitles = async (videoId: string) => {
    setGenerating((prev) => new Set(prev).add(videoId));
    try {
      const res = await fetch(`${API}/shorts/${videoId}/generate-titles`, { method: "POST" });
      if (!res.ok) throw new Error("Failed");
      success("5 niche-aware AI titles generated!");
      await fetchAll();
    } catch (e: any) { error(e.message); }
    finally {
      setGenerating((prev) => { const n = new Set(prev); n.delete(videoId); return n; });
    }
  };

  const handleGenerateAll = async () => {
    setGeneratingAll(true);
    try {
      await fetch(`${API}/shorts/generate-all-titles`, { method: "POST" });
      success("Generating niche-aware AI titles for all shorts...");
      const poll = setInterval(async () => { await fetchAll(); }, 5000);
      setTimeout(() => clearInterval(poll), 60000);
    } catch (e: any) { error(e.message); }
    finally { setGeneratingAll(false); }
  };

  const handleMultiplySingle = async (videoId: string) => {
    setMultiplyingFor(videoId);
    setMultiplyResultFor((prev) => ({ ...prev, [videoId]: null }));
    try {
      const res = await fetch(`${API}/upload/multiply-direct`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          video_ids: [videoId],
          n_channels: nChannels,
          process_video: processVideo,
          gap_minutes: gapMinutes,
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.detail || "Failed");
      if (d.total_webhooks === 0) { setMultiplyingFor(null); return; }
      success(`Multiplying! Uploading to ${d.channel_names?.join(", ") || d.total_webhooks + " channels"}...`);
      setMultiplyProgressFor((prev) => ({ ...prev, [videoId]: { completed: 0, total: d.total_webhooks, errors: 0 } }));
      const poll = async () => {
        try {
          const st = await fetch(`${API}/upload/multiply-direct/status`).then((r) => r.json());
          if (st.progress?.total_jobs) {
            setMultiplyProgressFor((prev) => ({
              ...prev,
              [videoId]: { completed: st.progress.completed || 0, total: st.progress.total_jobs, errors: st.progress.errors || 0 },
            }));
          }
          if (st.running) { setTimeout(poll, 2000); }
          else {
            setMultiplyingFor(null);
            setMultiplyResultFor((prev) => ({ ...prev, [videoId]: st.last_result }));
            if (st.last_result) success(`Done: ${st.last_result.total_sent} sent, ${st.last_result.total_errors} errors`);
            await fetchAll();
          }
        } catch { setMultiplyingFor(null); }
      };
      setTimeout(poll, 3000);
    } catch (e: any) { error(e.message); setMultiplyingFor(null); }
  };

  const handleMultiply = async () => {
    if (selected.size === 0) { error("Select at least one Short"); return; }
    setMultiplying(true);
    setMultiplyResult(null);
    try {
      const res = await fetch(`${API}/upload/multiply-direct`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          video_ids: Array.from(selected),
          n_channels: nChannels,
          process_video: processVideo,
          gap_minutes: gapMinutes,
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.detail || "Failed");

      // Warn about skipped (already uploaded) videos
      if (d.skipped && d.skipped.length > 0) {
        const skippedCount = d.skipped.length;
        error(`${skippedCount} video(s) skipped — already uploaded to all channels. Add more target channels.`);
      }

      if (d.total_webhooks === 0) {
        setMultiplying(false);
        return;
      }

      success(`Multiplying! Uploading to ${d.channel_names?.join(", ") || d.total_webhooks + " channels"}${d.gap_minutes > 0 ? ` (${d.gap_minutes}min gap)` : ""}...`);
      setMultiplyProgress({ completed: 0, total: d.total_webhooks, errors: 0 });

      const poll = async () => {
        try {
          const st = await fetch(`${API}/upload/multiply-direct/status`).then((r) => r.json());
          if (st.progress?.total_jobs) {
            setMultiplyProgress({
              completed: st.progress.completed || 0,
              total: st.progress.total_jobs,
              errors: st.progress.errors || 0,
            });
          }
          if (st.running) {
            setTimeout(poll, 2000);
          } else {
            setMultiplying(false);
            setMultiplyProgress(null);
            setMultiplyResult(st.last_result);
            if (st.last_result) {
              success(`Done: ${st.last_result.total_sent} sent, ${st.last_result.total_errors} errors`);
            }
          }
        } catch { setMultiplying(false); setMultiplyProgress(null); }
      };
      setTimeout(poll, 3000);
    } catch (e: any) { error(e.message); setMultiplying(false); }
  };


  // Pagination
  const totalPages = Math.max(1, Math.ceil(shorts.length / PAGE_SIZE));
  const paginatedShorts = shorts.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-white font-semibold text-base flex items-center gap-2">
            <Flame className="w-5 h-5 text-orange-400" /> Multiplier Room
          </h2>
          <p className="text-[11px] text-[#555] mt-0.5">
            Smart viral detection &middot; Velocity scoring &middot; Niche-aware AI titles
          </p>
        </div>
        <div className="flex items-center gap-2">
          {subTab === "shorts" && (
            <>
              <button
                onClick={handleScan}
                disabled={scanning}
                className="flex items-center gap-1.5 text-[12px] font-medium px-3 py-2 rounded-lg border border-[#3a3a3a] text-white transition-all disabled:opacity-40"
                style={{ background: "linear-gradient(to bottom, #2a2a2a, #161616)" }}
                title="Scan source channels for new Shorts"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${scanning ? "animate-spin" : ""}`} />
                {scanning ? "Scanning..." : "Scan"}
              </button>
              <button
                onClick={handleGenerateAll}
                disabled={generatingAll || shorts.length === 0}
                className="flex items-center gap-1.5 text-[12px] font-medium px-3 py-2 rounded-lg border border-[#3a3a3a] text-white transition-all disabled:opacity-40"
                style={{ background: "linear-gradient(to bottom, #2a2a2a, #161616)" }}
                onMouseEnter={(e) => { if (!generatingAll) (e.currentTarget as HTMLButtonElement).style.background = "linear-gradient(to bottom, #333, #1e1e1e)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "linear-gradient(to bottom, #2a2a2a, #161616)"; }}
              >
                {generatingAll ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />}
                Generate All Titles
              </button>
              <button
                onClick={() => setShowMultiply(!showMultiply)}
                disabled={selected.size === 0}
                className="flex items-center gap-1.5 text-[12px] font-semibold px-4 py-2 rounded-lg border border-red-700 text-white transition-all disabled:opacity-40"
                style={{ backgroundColor: "#cc181e" }}
                onMouseEnter={(e) => { if (selected.size > 0) (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#e01e25"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#cc181e"; }}
              >
                Multiply ({selected.size})
              </button>
            </>
          )}
        </div>
      </div>

      {/* Sub-tabs — centered */}
      <div className="flex justify-center">
        <div
          className="flex items-center gap-1 rounded-xl p-1 w-fit"
          style={{
            background: "linear-gradient(to bottom, #2a2a2a, #161616)",
            border: "1px solid #3a3a3a",
          }}
        >
          <button
            onClick={() => setSubTab("shorts")}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-[12px] font-medium transition-all ${
              subTab === "shorts"
                ? "bg-white/10 text-white"
                : "text-[#888] hover:text-[#ccc]"
            }`}
          >
            <Flame className={`w-3.5 h-3.5 ${subTab === "shorts" ? "text-red-400" : "text-[#666]"}`} />
            Picked Shorts
          </button>
          <button
            onClick={() => setSubTab("multiplied")}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-[12px] font-medium transition-all ${
              subTab === "multiplied"
                ? "bg-white/10 text-white"
                : "text-[#888] hover:text-[#ccc]"
            }`}
          >
            <Rocket className={`w-3.5 h-3.5 ${subTab === "multiplied" ? "text-orange-400" : "text-[#666]"}`} />
            Multiplied
          </button>
          <button
            onClick={() => setSubTab("logs")}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-[12px] font-medium transition-all ${
              subTab === "logs"
                ? "bg-white/10 text-white"
                : "text-[#888] hover:text-[#ccc]"
            }`}
          >
            <FileText className={`w-3.5 h-3.5 ${subTab === "logs" ? "text-sky-400" : "text-[#666]"}`} />
            Upload Log
          </button>
        </div>
      </div>

      {/* Multiplied Videos sub-tab */}
      {subTab === "multiplied" && <MultipliedVideosTab />}

      {/* Upload Log sub-tab */}
      {subTab === "logs" && <UploadLogTab />}

      {/* Viral Shorts sub-tab content */}
      {subTab === "shorts" && <>

      {/* Multiply Panel */}
      {showMultiply && selected.size > 0 && (
        <div className="bg-gradient-to-br from-[#111] to-[#0D0D0D] border border-red-500/20 rounded-2xl p-6 space-y-5 animate-fade-in">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-white font-semibold text-sm flex items-center gap-2">
                <Rocket className="w-4 h-4 text-orange-400" /> Direct YouTube Upload
              </h3>
              <p className="text-[11px] text-[#555] mt-0.5">
                Downloads video &rarr; ffmpeg processing &rarr; AI titles &rarr; uploads directly to your YouTube channels
              </p>
            </div>
            <div className="flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-2.5 py-1">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-[10px] text-emerald-400 font-medium">Direct upload via YouTube API</span>
            </div>
          </div>

          {/* Target Channels */}
          <div className="bg-[#0A0A0A] rounded-xl p-3 border border-[#1A1A1A]">
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs text-[#777]">Target Channels</span>
              <span className="text-sm font-bold text-emerald-400">{targetChannels.length} connected</span>
            </div>
            {targetChannels.length === 0 ? (
              <p className="text-[11px] text-red-400">No target channels. Add channels in Target Channels tab first.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {targetChannels.map((tc) => (
                  <span key={tc.id} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-[#1A1A1A] border border-[#2A2A2A] text-[11px] text-white">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    {tc.channel_name}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-4">
              {/* Upload Delay Slider */}
              <div>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-xs text-[#777]">Delay between uploads</span>
                  <span className="text-sm font-bold text-white">{gapMinutes === 0 ? "No delay" : `${gapMinutes} min`}</span>
                </div>
                <SliderTrack value={gapMinutes} min={0} max={120} step={5} onChange={setGapMinutes}
                  labels={["0", "15", "30", "60", "90", "120"]} />
                <p className="text-[10px] text-[#444] mt-1">
                  {gapMinutes === 0 ? "All uploads run back-to-back" : `~${Math.round((selected.size * targetChannels.length * gapMinutes) / 60)}h total for all uploads`}
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <button
                onClick={() => setProcessVideo(!processVideo)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all text-left ${
                  processVideo ? "bg-emerald-500/10 border-emerald-500/25 text-emerald-400" : "bg-[#0A0A0A] border-[#1C1C1C] text-[#555]"
                }`}
              >
                <Shield className="w-4 h-4 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-[12px] font-medium">ffmpeg Processing</p>
                  <p className="text-[10px] opacity-60">Unique video per channel (anti-duplicate)</p>
                </div>
                {processVideo ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
              </button>

              <div className="bg-[#0A0A0A] rounded-xl p-3 border border-[#1A1A1A]">
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div>
                    <p className="text-[10px] text-[#444]">Videos</p>
                    <p className="text-lg font-bold text-white">{selected.size}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-[#444]">Channels</p>
                    <p className="text-lg font-bold text-white">{targetChannels.length}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-[#444]">Total Uploads</p>
                    <p className="text-lg font-bold text-orange-400">{selected.size * targetChannels.length}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-[#0A0A0A] rounded-xl p-3 border border-[#1A1A1A]">
            <p className="text-[10px] text-[#555] font-medium mb-1.5">Each upload includes:</p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[10px] text-[#666]">
              <p className="flex items-center gap-1"><Check className="w-2.5 h-2.5 text-emerald-500" /> Actual MP4 video file</p>
              <p className="flex items-center gap-1"><Check className="w-2.5 h-2.5 text-emerald-500" /> AI-generated title (unique per ch)</p>
              <p className="flex items-center gap-1"><Check className="w-2.5 h-2.5 text-emerald-500" /> Niche-aware caption</p>
              <p className="flex items-center gap-1"><Check className="w-2.5 h-2.5 text-emerald-500" /> Velocity score & trend data</p>
              <p className="flex items-center gap-1"><Check className="w-2.5 h-2.5 text-emerald-500" /> ffmpeg-processed (if enabled)</p>
              <p className="flex items-center gap-1"><Check className="w-2.5 h-2.5 text-emerald-500" /> Direct YouTube API upload</p>
            </div>
          </div>

          {/* Progress bar — shown while multiplying */}
          {multiplying && multiplyProgress && (
            <div className="bg-[#0A0A0A] border border-[#1C1C1C] rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Loader2 className="w-3.5 h-3.5 text-orange-400 animate-spin" />
                  <span className="text-[12px] text-white font-medium">Uploading to YouTube...</span>
                </div>
                <span className="text-[12px] font-bold tabular-nums text-orange-400">
                  {multiplyProgress.completed} / {multiplyProgress.total}
                </span>
              </div>
              {/* Progress bar */}
              <div className="w-full h-2 bg-[#1C1C1C] rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${multiplyProgress.total > 0 ? (multiplyProgress.completed / multiplyProgress.total) * 100 : 0}%`,
                    background: "linear-gradient(90deg, #f97316, #ef4444)",
                  }}
                />
              </div>
              <div className="flex items-center justify-between text-[10px] text-[#555]">
                <span>{Math.round(multiplyProgress.total > 0 ? (multiplyProgress.completed / multiplyProgress.total) * 100 : 0)}% complete</span>
                <span className="flex items-center gap-3">
                  <span className="text-emerald-400">{multiplyProgress.completed - multiplyProgress.errors} sent</span>
                  {multiplyProgress.errors > 0 && <span className="text-red-400">{multiplyProgress.errors} failed</span>}
                  <span>{multiplyProgress.total - multiplyProgress.completed} remaining</span>
                </span>
              </div>
            </div>
          )}

          {multiplyResult && (
            <div className={`rounded-xl p-4 text-[12px] border ${
              multiplyResult.total_errors === 0
                ? "bg-emerald-950/30 border-emerald-800/30 text-emerald-400"
                : "bg-amber-950/30 border-amber-800/30 text-amber-400"
            }`}>
              <p className="font-bold mb-2">Multiply Result</p>
              <div className="flex items-center gap-4">
                <span>Sent: <strong>{multiplyResult.total_sent}</strong></span>
                <span>Errors: <strong>{multiplyResult.total_errors}</strong></span>
              </div>
              {multiplyResult.results?.length > 0 && (
                <div className="mt-2 space-y-1 max-h-32 overflow-y-auto">
                  {multiplyResult.results.map((r: any, i: number) => (
                    <div key={i} className="flex items-center gap-2 text-[11px] text-[#aaa]">
                      <Check className="w-3 h-3 text-emerald-400 flex-shrink-0" />
                      <span className="truncate">{r.channel} &mdash; {r.title_used}</span>
                      <span className="text-[#555] flex-shrink-0">{r.file_size_kb}KB</span>
                    </div>
                  ))}
                </div>
              )}
              {multiplyResult.errors?.length > 0 && (
                <div className="mt-2 space-y-0.5">
                  {multiplyResult.errors.slice(0, 3).map((e: string, i: number) => (
                    <p key={i} className="text-[11px] text-red-400">{e}</p>
                  ))}
                </div>
              )}
            </div>
          )}

          <RainbowButton
            onClick={handleMultiply}
            disabled={multiplying}
            className="w-full flex items-center justify-center gap-2 font-semibold text-sm py-3.5"
          >
            {multiplying ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Multiplying &mdash; uploading to YouTube...</>
            ) : (
              <><Send className="w-4 h-4" /> Multiply {selected.size} videos &times; {targetChannels.length} channels = {selected.size * targetChannels.length} uploads{gapMinutes > 0 ? ` (${gapMinutes}min gap)` : ""}</>
            )}
          </RainbowButton>
        </div>
      )}

      {/* Select all + list */}
      {shorts.length > 0 && (
        <div className="flex items-center gap-3">
          <button onClick={selectAll}
            className="flex items-center gap-2 text-[12px] text-[#666] hover:text-[#aaa] transition-colors">
            {selected.size === shorts.length
              ? <CheckSquare className="w-4 h-4 text-red-400" />
              : <Square className="w-4 h-4" />}
            {selected.size === shorts.length ? "Deselect all" : "Select all"}
          </button>
          <span className="text-[11px] text-[#444]">{selected.size} of {shorts.length} selected</span>
          <span className="text-[10px] text-[#333]">&middot;</span>
          <span className="text-[10px] text-[#444]">Sorted by velocity score (smartest first)</span>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 text-[#444] animate-spin" />
        </div>
      ) : shorts.length === 0 ? (
        <div className="bg-[#111] border border-dashed border-[#1C1C1C] rounded-2xl py-20 text-center">
          <Flame className="w-10 h-10 text-[#333] mx-auto mb-3" />
          <p className="text-[#555] text-sm">No shorts meeting threshold yet</p>
          <p className="text-[#333] text-xs mt-1">
            Run a scan from Source Channels &mdash; high-velocity shorts will appear here
          </p>
        </div>
      ) : (
        <>
          {/* Table */}
          <div className="bg-[#111] border border-[#1C1C1C] rounded-2xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#1C1C1C]">
                  <th className="w-10 px-3 py-3"></th>
                  <th className="px-3 py-3 text-left text-[10px] font-semibold uppercase tracking-widest text-white/50">Short</th>
                  <th className="px-3 py-3 text-left text-[10px] font-semibold uppercase tracking-widest text-white/50">Channel</th>
                  <th className="px-3 py-3 text-right text-[10px] font-semibold uppercase tracking-widest text-white/50">Total Views</th>
                  <th className="px-3 py-3 text-right text-[10px] font-semibold uppercase tracking-widest text-white/50">24h Delta</th>
                  <th className="px-3 py-3 text-left text-[10px] font-semibold uppercase tracking-widest text-white/50">Original Title</th>
                  <th className="px-3 py-3 text-left text-[10px] font-semibold uppercase tracking-widest text-white/50">New Titles</th>
                  <th className="px-3 py-3 text-left text-[10px] font-semibold uppercase tracking-widest text-white/50">Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginatedShorts.map((s) => (
                  <ShortCard
                    key={s.video_id} short={s}
                    selected={selected.has(s.video_id)}
                    expanded={expanded.has(s.video_id)}
                    onSelect={() => toggleSelect(s.video_id)}
                    onExpand={() => toggleExpand(s.video_id)}
                    onGenerateTitles={() => handleGenerateTitles(s.video_id)}
                    generating={generating.has(s.video_id)}
                    multiplyOpen={multiplyOpenFor === s.video_id}
                    onOpenMultiply={() => setMultiplyOpenFor(s.video_id)}
                    onCloseMultiply={() => setMultiplyOpenFor(null)}
                    nChannels={nChannels} setNChannels={setNChannels}
                    processVideo={processVideo} setProcessVideo={setProcessVideo}
                    gapMinutes={gapMinutes} setGapMinutes={setGapMinutes}
                    onMultiply={() => handleMultiplySingle(s.video_id)}
                    multiplying={multiplyingFor === s.video_id}
                    multiplyProgress={multiplyProgressFor[s.video_id] || null}
                    multiplyResult={multiplyResultFor[s.video_id] || null}
                  />
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-3 pt-4">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-4 py-2 rounded-xl border border-[#2A2A2A] text-sm text-[#777] hover:text-white hover:border-[#444] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                Previous
              </button>
              <div className="flex items-center gap-1">
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                  <button
                    key={p}
                    onClick={() => setPage(p)}
                    className={`w-8 h-8 rounded-lg text-[12px] font-medium transition-colors ${
                      p === page
                        ? "bg-red-600 text-white"
                        : "text-[#666] hover:text-white hover:bg-white/5"
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-4 py-2 rounded-xl border border-[#2A2A2A] text-sm text-[#777] hover:text-white hover:border-[#444] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                Next
              </button>
              <span className="text-[11px] text-[#444] ml-2">
                {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, shorts.length)} of {shorts.length}
              </span>
            </div>
          )}
        </>
      )}

      </>}
    </div>
  );
}
