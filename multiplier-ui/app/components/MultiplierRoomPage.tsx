"use client";
import { useState, useEffect, useCallback } from "react";
import {
  Flame, Eye, ThumbsUp, Sparkles, Rocket, Clock, ChevronDown,
  ChevronRight, Play, Loader2, CheckSquare, Square, Wand2,
  Upload, AlertCircle, ExternalLink, Calendar, RefreshCw,
  Zap, TrendingUp, TrendingDown, Minus, Send, Shield, Timer,
  Activity, Target, ArrowRight, Check, X, FileText, Hash,
  Video, FileVideo, CircleCheck, CircleX, Database,
} from "lucide-react";
import { StatusBadge } from "./ui/Badge";
import { useToast } from "./ui/Toast";
import { RainbowButton } from "./ui/rainbow-button";

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
}: {
  short: MultiplierShort; selected: boolean; expanded: boolean;
  onSelect: () => void; onExpand: () => void;
  onGenerateTitles: () => void; generating: boolean;
}) {
  return (
    <div className={`bg-[#111] border rounded-2xl overflow-hidden transition-all ${
      selected ? "border-red-500/40 ring-1 ring-red-500/20 shadow-lg shadow-red-900/10" : "border-[#1C1C1C] hover:border-[#2A2A2A]"
    }`}>
      <div className="flex items-center gap-4 px-5 py-4">
        <button onClick={onSelect} className="flex-shrink-0">
          {selected ? (
            <CheckSquare className="w-5 h-5 text-red-400" />
          ) : (
            <Square className="w-5 h-5 text-[#333] hover:text-[#666]" />
          )}
        </button>

        <img src={thumbUrl(short.thumbnail, short.video_id)} alt="" className="w-24 h-16 rounded-xl object-cover flex-shrink-0 ring-1 ring-white/5" />

        <div className="flex-1 min-w-0">
          <p className="text-[13px] text-white font-medium truncate leading-tight">{short.title}</p>
          <p className="text-[11px] text-[#555] truncate mt-0.5">{short.channel_name || short.channel_id}</p>
          <div className="flex items-center gap-3 mt-2">
            <span className="flex items-center gap-1 text-[11px] text-[#666]">
              <Eye className="w-3 h-3" /> {fmt(short.views_last_check)}
            </span>
            <span className="text-[11px] text-red-400 font-bold">
              +{fmt(short.views_delta)}/24h
            </span>
            <span className="flex items-center gap-1 text-[11px] text-[#555]">
              <ThumbsUp className="w-3 h-3" /> {fmt(short.likes)}
            </span>
            <span className="text-[11px] text-[#555]">{short.duration}s</span>
            <span className="text-[11px] text-[#444]">{fmtDate(short.published_at)}</span>
          </div>
        </div>

        {/* Velocity + Trend */}
        <div className="flex flex-col items-end gap-1.5 flex-shrink-0 mr-2">
          <div className="flex items-center gap-2">
            <span className="text-[9px] uppercase tracking-wider text-[#444]">Velocity</span>
            <VelocityBar score={short.velocity_score || 0} />
          </div>
          <TrendBadge trend={short.trend || "flat"} />
        </div>

        {/* AI Titles */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {short.ai_titles.length > 0 ? (
            <span className="flex items-center gap-1 bg-violet-500/15 text-violet-400 text-[10px] font-bold px-2 py-1 rounded-full border border-violet-500/25">
              <Sparkles className="w-3 h-3" /> {short.ai_titles.length}
            </span>
          ) : (
            <button
              onClick={(e) => { e.stopPropagation(); onGenerateTitles(); }}
              disabled={generating}
              className="flex items-center gap-1 bg-violet-600/20 hover:bg-violet-600/30 text-violet-400 text-[10px] font-medium px-2.5 py-1 rounded-full border border-violet-500/25 transition-colors disabled:opacity-40"
            >
              {generating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />}
              AI
            </button>
          )}

          <button onClick={onExpand} className="text-[#444] hover:text-[#aaa] p-1 transition-colors">
            {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>

          <a href={short.url || `https://youtube.com/shorts/${short.video_id}`}
            target="_blank" rel="noopener noreferrer"
            className="text-[#444] hover:text-[#aaa] transition-colors">
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-[#1C1C1C] px-5 py-4">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <p className="text-[10px] text-[#444] uppercase tracking-wider mb-2">Original Info</p>
              <p className="text-[12px] text-[#aaa] font-medium">{short.title}</p>
              {short.description && (
                <p className="text-[11px] text-[#555] mt-1 line-clamp-3">{short.description}</p>
              )}
              <div className="flex items-center gap-3 mt-2">
                <div className="text-[10px]">
                  <span className="text-[#444]">Growth: </span>
                  <span className="text-white font-bold">{(short.growth_rate || 0).toFixed(1)}</span>
                  <span className="text-[#555]"> views/hr</span>
                </div>
                <div className="text-[10px]">
                  <span className="text-[#444]">Score: </span>
                  <span className="text-amber-400 font-bold">{(short.velocity_score || 0).toFixed(1)}</span>
                </div>
              </div>
            </div>

            <div className="col-span-2">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] text-[#444] uppercase tracking-wider">AI Generated Titles</p>
                <button
                  onClick={onGenerateTitles} disabled={generating}
                  className="text-[10px] text-violet-400 hover:text-violet-300 flex items-center gap-1 disabled:opacity-40"
                >
                  {generating ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                  {short.ai_titles.length > 0 ? "Regenerate" : "Generate 5 Titles"}
                </button>
              </div>
              {short.ai_titles.length === 0 ? (
                <p className="text-[11px] text-[#555] italic">Click generate to create niche-aware AI titles</p>
              ) : (
                <div className="space-y-1">
                  {short.ai_titles.map((t, i) => (
                    <div key={t.id} className="flex items-start gap-2 bg-[#0A0A0A] rounded-lg px-3 py-1.5 border border-[#1A1A1A]">
                      <span className="text-[10px] text-violet-400 font-bold flex-shrink-0 mt-0.5">#{i + 1}</span>
                      <p className="text-[11px] text-[#ccc]">{t.title}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
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
  const [moreGapHours, setMoreGapHours] = useState(2);
  const [moreProcessVideo, setMoreProcessVideo] = useState(true);
  const [moreUsePeak, setMoreUsePeak] = useState(true);
  const [multiplying, setMultiplying] = useState(false);

  const fetchVideos = useCallback(async () => {
    try {
      const data = await fetch(`${API}/upload/multiplied-videos`).then((r) => r.json());
      setVideos(Array.isArray(data) ? data : []);
    } catch {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchVideos(); }, [fetchVideos]);

  const handleBoost = async () => {
    if (!modalVideo) return;
    setMultiplying(true);
    try {
      const res = await fetch(`${API}/upload/multiply-via-webhook`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          video_ids: [modalVideo.video_id],
          n_channels: moreChannels,
          gap_hours: moreGapHours,
          process_video: moreProcessVideo,
          use_peak_hours: moreUsePeak,
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.detail || "Failed");
      success(`Boosting to ${d.total_webhooks} more channels...`);
      setModalVideo(null);
      const poll = async () => {
        try {
          const st = await fetch(`${API}/upload/multiply-via-webhook/status`).then((r) => r.json());
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
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-white font-bold text-lg">Multiplied Content Tracker</h3>
          <p className="text-[11px] text-[#555] mt-0.5">Monitor reposted content performance and incremental reach</p>
        </div>
        <div className="flex items-center gap-3">
          {lastUpdated && (
            <span className="text-[10px] text-[#444]">
              Stats updated {fmtTime(lastUpdated)}
            </span>
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
      </div>

      {/* Summary stat cards */}
      <div className="grid grid-cols-4 gap-3">
        {[
          {
            label: "REPOST VIEWS", value: hasRealStats ? fmt(totalUploadedViews) : fmt(totalOriginalViews),
            sub: hasRealStats ? "Real views from uploads" : "Original source views (no uploads tracked yet)",
            icon: <Eye className="w-5 h-5 text-emerald-400" />,
            bg: "bg-emerald-500/8 border-emerald-500/15",
          },
          {
            label: "ACTIVE CAMPAIGNS", value: String(videos.length), sub: `${videos.length} total`,
            icon: <Activity className="w-5 h-5 text-amber-400" />,
            bg: "bg-amber-500/8 border-amber-500/15",
          },
          {
            label: "AVG MULTIPLIER", value: `${avgMultiplier}x`, sub: "Channels per video avg",
            icon: <Zap className="w-5 h-5 text-orange-400" />,
            bg: "bg-orange-500/8 border-orange-500/15",
          },
          {
            label: "CHANNELS DEPLOYED", value: String(totalChannelsDeployed), sub: "Total channel uploads",
            icon: <TrendingUp className="w-5 h-5 text-sky-400" />,
            bg: "bg-sky-500/8 border-sky-500/15",
          },
        ].map((s) => (
          <div key={s.label} className={`${s.bg} border rounded-2xl px-5 py-4 flex items-center gap-4`}>
            <div className="p-2.5 rounded-xl bg-white/5 flex-shrink-0">{s.icon}</div>
            <div>
              <p className="text-[10px] uppercase tracking-widest text-[#555] font-medium">{s.label}</p>
              <p className="text-2xl font-black text-white tabular-nums leading-tight mt-0.5">{s.value}</p>
              <p className="text-[10px] text-[#444] mt-0.5">{s.sub}</p>
            </div>
          </div>
        ))}
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
        <div className="space-y-3">
          {videos.map((v) => {
            const daysAgo = v.channels[0]?.sent_at
              ? Math.floor((Date.now() - new Date(v.channels[0].sent_at).getTime()) / 86400000)
              : 0;
            const sentDate = v.channels[0]?.sent_at
              ? new Date(v.channels[0].sent_at).toLocaleDateString([], { year: "numeric", month: "2-digit", day: "2-digit" })
              : "—";
            // Use real uploaded views if available, else show 0 (honest — no fake numbers)
            const repostViews = v.total_uploaded_views || 0;
            const incrementalViews = Math.max(0, repostViews - v.original_views);
            const hasStats = repostViews > 0;
            const multiplierFloat = v.multiplier;

            const isExpanded = expandedChannels.has(v.video_id);
            return (
              <div key={v.video_id} className="bg-[#111] border border-[#1C1C1C] rounded-2xl overflow-hidden hover:border-[#2A2A2A] transition-all">
                {/* Main row */}
                <div className="flex items-center gap-6 px-6 py-5">
                  {/* Left: status + meta */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">Active</span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-500/15 text-red-400 border border-red-500/25">YouTube</span>
                      <span className="text-[11px] text-[#555]">YT Multiplier</span>
                    </div>
                    <a href={v.original_url} target="_blank" rel="noreferrer"
                      className="text-white font-semibold text-[14px] leading-snug hover:text-red-400 transition-colors flex items-start gap-1.5 group">
                      <span className="truncate">{v.title}</span>
                      <ExternalLink className="w-3 h-3 mt-0.5 flex-shrink-0 opacity-0 group-hover:opacity-40 transition-opacity" />
                    </a>
                    <p className="text-[11px] text-[#444] mt-1">
                      {daysAgo} day{daysAgo !== 1 ? "s" : ""} ago &middot; Started {sentDate}
                    </p>
                  </div>

                  {/* Stats columns */}
                  <div className="flex items-center gap-6 flex-shrink-0">
                    {/* Original */}
                    <div className="text-center min-w-[60px]">
                      <p className="text-[9px] uppercase tracking-widest text-[#555] font-medium mb-1">Original</p>
                      <p className="text-[15px] font-bold text-white tabular-nums">{fmt(v.original_views)}</p>
                    </div>
                    {/* Repost Views */}
                    <div className="text-center min-w-[72px]">
                      <p className="text-[9px] uppercase tracking-widest text-[#555] font-medium mb-1">Repost Views</p>
                      {hasStats
                        ? <p className="text-[15px] font-bold text-sky-400 tabular-nums">{fmt(repostViews)}</p>
                        : <p className="text-[13px] text-[#333] tabular-nums">—</p>}
                    </div>
                    {/* Incremental */}
                    <div className="text-center min-w-[72px]">
                      <p className="text-[9px] uppercase tracking-widest text-[#555] font-medium mb-1">Incremental</p>
                      {hasStats
                        ? <p className="text-[15px] font-bold text-emerald-400 tabular-nums">+{fmt(incrementalViews)}</p>
                        : <p className="text-[13px] text-[#333] tabular-nums">—</p>}
                    </div>
                    {/* Multiplier */}
                    <div className="text-center min-w-[56px]">
                      <p className="text-[9px] uppercase tracking-widest text-[#555] font-medium mb-1">Multiplier</p>
                      <p className="text-[15px] font-bold text-orange-400 tabular-nums">{multiplierFloat}x</p>
                    </div>
                    {/* Channels — expandable */}
                    <div className="text-center min-w-[80px]">
                      <p className="text-[9px] uppercase tracking-widest text-[#555] font-medium mb-1">Channels</p>
                      <button
                        onClick={() => setExpandedChannels((prev) => {
                          const next = new Set(prev);
                          next.has(v.video_id) ? next.delete(v.video_id) : next.add(v.video_id);
                          return next;
                        })}
                        className="flex items-center gap-1 justify-center text-violet-400 hover:text-violet-300 transition-colors mx-auto"
                      >
                        <span className="text-[13px] font-bold tabular-nums">{v.channels.length}</span>
                        {isExpanded
                          ? <ChevronDown className="w-3 h-3" />
                          : <ChevronRight className="w-3 h-3" />}
                      </button>
                    </div>
                  </div>

                  {/* Multiply button */}
                  <button
                    onClick={() => { setModalVideo(v); setMoreChannels(3); }}
                    className="flex items-center gap-1.5 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 text-white text-[12px] font-semibold px-4 py-2.5 rounded-xl transition-all flex-shrink-0"
                  >
                    <Rocket className="w-3.5 h-3.5" /> + Multiply
                  </button>
                </div>

                {/* Expandable channel list */}
                {isExpanded && (
                  <div className="border-t border-[#1A1A1A] px-6 py-3 space-y-2">
                    <p className="text-[9px] uppercase tracking-widest text-[#444] font-medium mb-2">Uploaded to these channels</p>
                    <div className="grid grid-cols-2 gap-2">
                      {v.channels.map((ch) => {
                        const mapped = CHANNEL_MAP[ch.channel_number];
                        return (
                          <a
                            key={ch.channel_number}
                            href={mapped?.url || "#"}
                            target="_blank" rel="noreferrer"
                            className="flex items-center gap-2.5 bg-[#0D0D0D] hover:bg-[#161616] border border-[#1C1C1C] hover:border-violet-500/30 rounded-xl px-3 py-2.5 transition-all group"
                          >
                            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-violet-600 to-purple-800 flex items-center justify-center text-[10px] text-white font-bold flex-shrink-0">
                              {ch.channel_number}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-[12px] text-white font-medium truncate group-hover:text-violet-400 transition-colors">
                                {mapped?.name || ch.channel_name || `YT${ch.channel_number}`}
                              </p>
                              <p className="text-[10px] text-[#444]">{fmtTime(ch.sent_at)}</p>
                            </div>
                            <ExternalLink className="w-3 h-3 text-[#444] group-hover:text-violet-400 transition-colors flex-shrink-0" />
                          </a>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
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

            {/* Gap slider */}
            <div>
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs text-[#777]">Gap between uploads</span>
                <span className="text-sm font-bold text-white">{moreGapHours}h</span>
              </div>
              <SliderTrack value={moreGapHours} min={0} max={12} step={0.5} onChange={setMoreGapHours}
                labels={["0h", "3h", "6h", "9h", "12h"]} />
            </div>

            {/* Toggles */}
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setMoreProcessVideo(!moreProcessVideo)}
                className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border transition-all text-left ${
                  moreProcessVideo ? "bg-emerald-500/10 border-emerald-500/25 text-emerald-400" : "bg-[#0A0A0A] border-[#1C1C1C] text-[#555]"
                }`}
              >
                <Shield className="w-3.5 h-3.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-medium">ffmpeg</p>
                  <p className="text-[9px] opacity-60">Anti-duplicate</p>
                </div>
                {moreProcessVideo ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
              </button>
              <button
                onClick={() => setMoreUsePeak(!moreUsePeak)}
                className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border transition-all text-left ${
                  moreUsePeak ? "bg-sky-500/10 border-sky-500/25 text-sky-400" : "bg-[#0A0A0A] border-[#1C1C1C] text-[#555]"
                }`}
              >
                <Timer className="w-3.5 h-3.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-medium">Peak Hours</p>
                  <p className="text-[9px] opacity-60">IST 12-2, 6-10 PM</p>
                </div>
                {moreUsePeak ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
              </button>
            </div>

            {/* Summary */}
            <div className="bg-[#0A0A0A] rounded-xl p-3 border border-[#1A1A1A] grid grid-cols-3 gap-3 text-center">
              <div>
                <p className="text-[10px] text-[#444]">New Uploads</p>
                <p className="text-lg font-bold text-orange-400">{moreChannels}</p>
              </div>
              <div>
                <p className="text-[10px] text-[#444]">New Multiplier</p>
                <p className="text-lg font-bold text-white">{modalVideo.multiplier + moreChannels}x</p>
              </div>
              <div>
                <p className="text-[10px] text-[#444]">Duration</p>
                <p className="text-lg font-bold text-sky-400">{(moreGapHours * moreChannels).toFixed(1)}h</p>
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
      const [logsRes, summaryRes] = await Promise.all([
        fetch(`${API}/upload/webhook-logs`).then((r) => r.json()),
        fetch(`${API}/upload/webhook-logs/summary`).then((r) => r.json()),
      ]);
      setLogs(Array.isArray(logsRes) ? logsRes : []);
      setSummary(summaryRes);
    } catch {}
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
        <div className="grid grid-cols-6 gap-3">
          {[
            { label: "Total Uploads", value: String(summary.total_uploads), icon: Upload, color: "text-white", bg: "bg-white/5" },
            { label: "Sent", value: String(summary.sent), icon: CircleCheck, color: "text-emerald-400", bg: "bg-emerald-500/5" },
            { label: "Failed", value: String(summary.failed), icon: CircleX, color: "text-red-400", bg: "bg-red-500/5" },
            { label: "Videos", value: String(summary.unique_videos), icon: Video, color: "text-sky-400", bg: "bg-sky-500/5" },
            { label: "Channels", value: String(summary.unique_channels), icon: Hash, color: "text-violet-400", bg: "bg-violet-500/5" },
            { label: "Data Sent", value: `${summary.total_data_sent_mb} MB`, icon: Database, color: "text-amber-400", bg: "bg-amber-500/5" },
          ].map((s) => (
            <div key={s.label} className={`${s.bg} border border-[#1C1C1C] rounded-xl px-3 py-3`}>
              <div className="flex items-center gap-1.5 mb-1">
                <s.icon className={`w-3 h-3 ${s.color}`} />
                <p className="text-[10px] uppercase tracking-wide text-[#444]">{s.label}</p>
              </div>
              <p className={`text-lg font-bold tabular-nums ${s.color}`}>{s.value}</p>
            </div>
          ))}
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
                      <tr className="text-[10px] uppercase tracking-wider text-[#444] border-b border-[#1A1A1A]">
                        <th className="w-10 px-3 py-2"></th>
                        <th className="text-left px-3 py-2 font-medium">Channel</th>
                        <th className="text-left px-3 py-2 font-medium">New Title</th>
                        <th className="text-left px-3 py-2 font-medium">Status</th>
                        <th className="text-right px-3 py-2 font-medium">Size</th>
                        <th className="text-left px-3 py-2 font-medium">ffmpeg</th>
                        <th className="text-left px-3 py-2 font-medium">Scheduled</th>
                        <th className="text-left px-5 py-2 font-medium">Sent At</th>
                      </tr>
                    </thead>
                    <tbody>
                      {videoLogs.map((log) => (
                        <tr
                          key={log.id}
                          onClick={() => setExpandedLog(expandedLog === log.id ? null : log.id)}
                          className="border-b border-[#141414] hover:bg-white/[0.02] cursor-pointer transition-colors"
                        >
                          <td className="px-3 py-2.5">
                            <img src={thumbUrl(log.thumbnail, log.video_id)} alt="" className="w-10 h-7 rounded-md object-cover ring-1 ring-white/5" />
                          </td>
                          <td className="px-3 py-2.5">
                            <div className="flex items-center gap-2">
                              <div className="w-6 h-6 rounded-full bg-gradient-to-br from-violet-600 to-purple-800 flex items-center justify-center text-[9px] text-white font-bold flex-shrink-0">
                                {log.channel_number}
                              </div>
                              <span className="text-white font-medium truncate max-w-[140px]">{log.channel_name}</span>
                            </div>
                          </td>
                          <td className="px-3 py-2.5">
                            <p className="text-[#aaa] truncate max-w-[200px]">{log.new_title}</p>
                          </td>
                          <td className="px-3 py-2.5">
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
                          <td className="px-3 py-2.5 text-right text-[#666] tabular-nums">
                            {fmtSize(log.file_size_bytes)}
                          </td>
                          <td className="px-3 py-2.5">
                            {log.video_processed ? (
                              <span className="text-emerald-400 text-[10px]">Yes</span>
                            ) : (
                              <span className="text-[#444] text-[10px]">No</span>
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-[#666]">{fmtTime(log.scheduled_at)}</td>
                          <td className="px-5 py-2.5 text-[#555]">{fmtTime(log.created_at)}</td>
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
                        <div className="grid grid-cols-4 gap-3 text-[11px]">
                          <div>
                            <span className="text-[#444]">Webhook: </span>
                            <span className="text-[#888]">HTTP {log.webhook_status}</span>
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
  const [generating, setGenerating] = useState<Set<string>>(new Set());
  const [generatingAll, setGeneratingAll] = useState(false);

  // Pagination
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 15;

  // Multiply config
  const [showMultiply, setShowMultiply] = useState(false);
  const [nChannels, setNChannels] = useState(5);
  const [gapHours, setGapHours] = useState(2);
  const [processVideo, setProcessVideo] = useState(true);
  const [usePeakHours, setUsePeakHours] = useState(true);
  const [multiplying, setMultiplying] = useState(false);
  const [multiplyResult, setMultiplyResult] = useState<any>(null);
  const [multiplyProgress, setMultiplyProgress] = useState<{ completed: number; total: number; errors: number } | null>(null);

  const fetchAll = useCallback(async () => {
    try {
      const s = await fetch(`${API}/shorts/multiplier-room`).then((r) => r.json());
      setShorts(Array.isArray(s) ? s : []);
    } catch { }
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

  const handleMultiply = async () => {
    if (selected.size === 0) { error("Select at least one Short"); return; }
    setMultiplying(true);
    setMultiplyResult(null);
    try {
      const res = await fetch(`${API}/upload/multiply-via-webhook`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          video_ids: Array.from(selected),
          n_channels: nChannels,
          gap_hours: gapHours,
          process_video: processVideo,
          use_peak_hours: usePeakHours,
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

      success(`Multiplying! Sending ${d.total_webhooks} new uploads to n8n...`);
      setMultiplyProgress({ completed: 0, total: d.total_webhooks, errors: 0 });

      const poll = async () => {
        try {
          const st = await fetch(`${API}/upload/multiply-via-webhook/status`).then((r) => r.json());
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

  const totalDelta = shorts.reduce((a, s) => a + (s.views_delta || 0), 0);
  const totalViews = shorts.reduce((a, s) => a + (s.views_last_check || 0), 0);
  const withTitles = shorts.filter((s) => s.ai_titles.length > 0).length;
  const avgVelocity = shorts.length > 0 ? shorts.reduce((a, s) => a + (s.velocity_score || 0), 0) / shorts.length : 0;
  const accelerating = shorts.filter((s) => s.trend === "accelerating").length;

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
              <RainbowButton
                onClick={handleGenerateAll}
                disabled={generatingAll || shorts.length === 0}
                className="flex items-center gap-1.5 text-[12px] font-medium px-3 py-2 h-auto"
              >
                {generatingAll ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />}
                Generate All Titles
              </RainbowButton>
              <RainbowButton
                onClick={() => setShowMultiply(!showMultiply)}
                disabled={selected.size === 0}
                className="flex items-center gap-1.5 text-[12px] font-semibold px-4 py-2 h-auto"
              >
                <Rocket className="w-3.5 h-3.5" />
                Multiply ({selected.size})
              </RainbowButton>
            </>
          )}
        </div>
      </div>

      {/* Sub-tabs */}
      <div className="flex items-center gap-1 bg-[#0D0D0D] border border-[#1C1C1C] rounded-xl p-1 w-fit">
        <button
          onClick={() => setSubTab("shorts")}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-[12px] font-medium transition-all ${
            subTab === "shorts"
              ? "bg-white/8 text-white shadow-sm"
              : "text-[#666] hover:text-[#aaa]"
          }`}
        >
          <Flame className="w-3.5 h-3.5" />
          Viral Shorts
          <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
            subTab === "shorts" ? "bg-red-500/20 text-red-400" : "bg-white/5 text-[#555]"
          }`}>{shorts.length}</span>
        </button>
        <button
          onClick={() => setSubTab("multiplied")}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-[12px] font-medium transition-all ${
            subTab === "multiplied"
              ? "bg-white/8 text-white shadow-sm"
              : "text-[#666] hover:text-[#aaa]"
          }`}
        >
          <Rocket className="w-3.5 h-3.5" />
          Multiplied
        </button>
        <button
          onClick={() => setSubTab("logs")}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-[12px] font-medium transition-all ${
            subTab === "logs"
              ? "bg-white/8 text-white shadow-sm"
              : "text-[#666] hover:text-[#aaa]"
          }`}
        >
          <FileText className="w-3.5 h-3.5" />
          Upload Log
        </button>
      </div>

      {/* Multiplied Videos sub-tab */}
      {subTab === "multiplied" && <MultipliedVideosTab />}

      {/* Upload Log sub-tab */}
      {subTab === "logs" && <UploadLogTab />}

      {/* Viral Shorts sub-tab content */}
      {subTab === "shorts" && <>

      {/* Stats row */}
      <div className="grid grid-cols-5 gap-3">
        {[
          { label: "In Room", value: String(shorts.length), icon: Target, color: "text-white", bg: "bg-white/5" },
          { label: "24h Delta", value: `+${fmt(totalDelta)}`, icon: TrendingUp, color: "text-red-400", bg: "bg-red-500/5" },
          { label: "Avg Velocity", value: `${Math.round(avgVelocity)}x`, icon: Activity, color: "text-amber-400", bg: "bg-amber-500/5" },
          { label: "Accelerating", value: String(accelerating), icon: Zap, color: "text-emerald-400", bg: "bg-emerald-500/5" },
          { label: "AI Ready", value: `${withTitles}/${shorts.length}`, icon: Sparkles, color: "text-violet-400", bg: "bg-violet-500/5" },
        ].map((s) => (
          <div key={s.label} className={`${s.bg} border border-[#1C1C1C] rounded-xl px-4 py-3`}>
            <div className="flex items-center gap-1.5 mb-1">
              <s.icon className={`w-3 h-3 ${s.color}`} />
              <p className="text-[10px] uppercase tracking-wide text-[#444]">{s.label}</p>
            </div>
            <p className={`text-xl font-bold tabular-nums ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Multiply Panel */}
      {showMultiply && selected.size > 0 && (
        <div className="bg-gradient-to-br from-[#111] to-[#0D0D0D] border border-red-500/20 rounded-2xl p-6 space-y-5 animate-fade-in">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-white font-semibold text-sm flex items-center gap-2">
                <Rocket className="w-4 h-4 text-orange-400" /> Multiply via n8n
              </h3>
              <p className="text-[11px] text-[#555] mt-0.5">
                Downloads video &rarr; ffmpeg processing &rarr; AI titles &rarr; sends MP4 + metadata to n8n webhook
              </p>
            </div>
            <div className="flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-2.5 py-1">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-[10px] text-emerald-400 font-medium">n8n handles YouTube upload</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-4">
              <div>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-xs text-[#777]">Channels per video</span>
                  <span className="text-sm font-bold text-white">{nChannels}</span>
                </div>
                <SliderTrack value={nChannels} min={1} max={30} onChange={setNChannels}
                  labels={["1", "5", "10", "15", "20", "25", "30"]} />
              </div>
              <div>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-xs text-[#777]">Gap between uploads</span>
                  <span className="text-sm font-bold text-white">{gapHours}h</span>
                </div>
                <SliderTrack value={gapHours} min={0} max={12} step={0.5} onChange={setGapHours}
                  labels={["0h", "3h", "6h", "9h", "12h"]} />
              </div>
            </div>

            <div className="space-y-3">
              <div className="space-y-2">
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
                <button
                  onClick={() => setUsePeakHours(!usePeakHours)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all text-left ${
                    usePeakHours ? "bg-sky-500/10 border-sky-500/25 text-sky-400" : "bg-[#0A0A0A] border-[#1C1C1C] text-[#555]"
                  }`}
                >
                  <Timer className="w-4 h-4 flex-shrink-0" />
                  <div className="flex-1">
                    <p className="text-[12px] font-medium">Peak Hour Scheduling</p>
                    <p className="text-[10px] opacity-60">Upload during 12-2 PM & 6-10 PM IST</p>
                  </div>
                  {usePeakHours ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
                </button>
              </div>

              <div className="bg-[#0A0A0A] rounded-xl p-3 border border-[#1A1A1A]">
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div>
                    <p className="text-[10px] text-[#444]">Videos</p>
                    <p className="text-lg font-bold text-white">{selected.size}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-[#444]">Total Uploads</p>
                    <p className="text-lg font-bold text-orange-400">{selected.size * nChannels}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-[#444]">Duration</p>
                    <p className="text-lg font-bold text-sky-400">{(gapHours * nChannels).toFixed(1)}h</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-[#0A0A0A] rounded-xl p-3 border border-[#1A1A1A]">
            <p className="text-[10px] text-[#555] font-medium mb-1.5">Each webhook payload contains:</p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[10px] text-[#666]">
              <p className="flex items-center gap-1"><Check className="w-2.5 h-2.5 text-emerald-500" /> Actual MP4 video file</p>
              <p className="flex items-center gap-1"><Check className="w-2.5 h-2.5 text-emerald-500" /> AI-generated title (unique per ch)</p>
              <p className="flex items-center gap-1"><Check className="w-2.5 h-2.5 text-emerald-500" /> Niche-aware caption</p>
              <p className="flex items-center gap-1"><Check className="w-2.5 h-2.5 text-emerald-500" /> Velocity score & trend data</p>
              <p className="flex items-center gap-1"><Check className="w-2.5 h-2.5 text-emerald-500" /> ffmpeg-processed (if enabled)</p>
              <p className="flex items-center gap-1"><Check className="w-2.5 h-2.5 text-emerald-500" /> Peak-hour scheduled time</p>
            </div>
          </div>

          {/* Progress bar — shown while multiplying */}
          {multiplying && multiplyProgress && (
            <div className="bg-[#0A0A0A] border border-[#1C1C1C] rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Loader2 className="w-3.5 h-3.5 text-orange-400 animate-spin" />
                  <span className="text-[12px] text-white font-medium">Uploading to n8n...</span>
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
              <><Loader2 className="w-4 h-4 animate-spin" /> Multiplying &mdash; sending to n8n...</>
            ) : (
              <><Send className="w-4 h-4" /> Multiply {selected.size} videos &times; {nChannels} channels = {selected.size * nChannels} uploads</>
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
          <div className="space-y-2">
            {paginatedShorts.map((s) => (
              <ShortCard
                key={s.video_id} short={s}
                selected={selected.has(s.video_id)}
                expanded={expanded.has(s.video_id)}
                onSelect={() => toggleSelect(s.video_id)}
                onExpand={() => toggleExpand(s.video_id)}
                onGenerateTitles={() => handleGenerateTitles(s.video_id)}
                generating={generating.has(s.video_id)}
              />
            ))}
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
