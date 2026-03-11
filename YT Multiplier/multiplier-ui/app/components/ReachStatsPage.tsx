"use client";
import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { RefreshCw, TrendingUp, Eye, Zap, ExternalLink, BarChart3 } from "lucide-react";
import { useToast } from "./ui/Toast";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8001";

interface Upload {
  job_id: number;
  channel_name: string;
  youtube_video_id: string;
  uploaded_at: string;
  views: number;
}

interface StatEntry {
  video_id: string;
  title: string;
  thumbnail: string;
  original_views: number;
  uploaded_views: number;
  multiplier: number;
  uploads: Upload[];
}

function fmt(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n || 0);
}

function MultiplierGauge({ value }: { value: number }) {
  const pct = Math.min((value / 10) * 100, 100);
  const color =
    value >= 8 ? "#22c55e"
    : value >= 5 ? "#10b981"
    : value >= 3 ? "#f97316"
    : value >= 1.5 ? "#ef4444"
    : "#6b7280";

  return (
    <div className="flex items-center gap-3 mt-2">
      <div className="flex-1 h-2 bg-[#1C1C1C] rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
      <span className="text-sm font-bold tabular-nums min-w-[40px] text-right" style={{ color }}>
        {value.toFixed(1)}×
      </span>
    </div>
  );
}

function SummaryCard({ label, value, sub, accent }: {
  label: string; value: string; sub: string; accent?: boolean;
}) {
  return (
    <div className={`bg-[#111] rounded-2xl px-5 py-4 border ${accent ? "border-red-500/20" : "border-[#1C1C1C]"}`}>
      <p className="text-[10px] uppercase tracking-wider text-[#444] mb-2">{label}</p>
      <p className={`text-3xl font-bold tabular-nums ${accent ? "text-red-400" : "text-white"}`}>{value}</p>
      <p className="text-[11px] text-[#555] mt-1">{sub}</p>
    </div>
  );
}

export default function ReachStatsPage() {
  const { data: session } = useSession();
  const userEmail = session?.user?.email || "";
  const { success, error } = useToast();
  const [stats, setStats] = useState<StatEntry[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [expandedVideo, setExpandedVideo] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch(`${API}/reach/stats`, { headers: { "x-user-email": userEmail } });
      const data = await res.json();
      setStats(Array.isArray(data) ? data : []);
      setLastRefresh(new Date());
    } catch {
      // silently ignore — no toast spam on auto-refresh
    }
  }, [userEmail]);

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 30 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchStats]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await fetch(`${API}/reach/refresh`, { method: "POST", headers: { "x-user-email": userEmail } });
      success("Stats refresh triggered — reloading in 5s");
      setTimeout(async () => { await fetchStats(); setRefreshing(false); }, 5000);
    } catch {
      error("Refresh failed");
      setRefreshing(false);
    }
  };

  const totalOriginal = stats.reduce((a, s) => a + (s.original_views || 0), 0);
  const totalUploaded = stats.reduce((a, s) => a + (s.uploaded_views || 0), 0);
  const overallMult = totalOriginal > 0 ? totalUploaded / totalOriginal : 0;
  const totalUploads = stats.reduce((a, s) => a + s.uploads.length, 0);

  return (
    <div className="space-y-6">
      {/* ── Top bar ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-white font-semibold text-base flex items-center gap-2">
            <Zap className="w-4 h-4 text-amber-400" /> Reach Multiplier
          </h2>
          <p className="text-[11px] text-[#555] mt-0.5">
            {lastRefresh
              ? `Last updated ${lastRefresh.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · auto-refreshes every 30 min`
              : "Loading…"}
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center gap-2 bg-[#161616] hover:bg-[#1C1C1C] border border-[#2A2A2A] hover:border-[#333] text-[#aaa] hover:text-white text-sm px-4 py-2.5 rounded-xl disabled:opacity-40 transition-all"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
          {refreshing ? "Refreshing…" : "Refresh Now"}
        </button>
      </div>

      {/* ── Summary cards ── */}
      <div className="grid grid-cols-4 gap-3">
        <SummaryCard
          label="Original Views"
          value={fmt(totalOriginal)}
          sub={`across ${stats.length} source videos`}
        />
        <SummaryCard
          label="Your Total Reach"
          value={fmt(totalUploaded)}
          sub={`from ${totalUploads} re-uploads`}
        />
        <SummaryCard
          label="Overall Multiplier"
          value={overallMult > 0 ? `${overallMult.toFixed(1)}×` : "—"}
          sub="total reach amplification"
          accent
        />
        <SummaryCard
          label="Avg per Video"
          value={stats.length > 0 ? `${(overallMult / Math.max(stats.length, 1)).toFixed(1)}×` : "—"}
          sub="average amplification"
        />
      </div>

      {/* ── Per-video cards ── */}
      {stats.length === 0 ? (
        <div className="bg-[#111] border border-dashed border-[#1C1C1C] rounded-2xl py-20 text-center">
          <BarChart3 className="w-10 h-10 text-[#333] mx-auto mb-3" />
          <p className="text-[#555] text-sm">No uploaded videos yet</p>
          <p className="text-[#333] text-xs mt-1">Start a campaign in Upload Queue</p>
        </div>
      ) : (
        <div className="space-y-3">
          {stats.map((entry) => {
            const isExpanded = expandedVideo === entry.video_id;
            return (
              <div
                key={entry.video_id}
                className="bg-[#111] border border-[#1C1C1C] hover:border-[#2A2A2A] rounded-2xl overflow-hidden transition-colors"
              >
                {/* Video summary row */}
                <div
                  className="flex items-start gap-4 p-5 cursor-pointer"
                  onClick={() => setExpandedVideo(isExpanded ? null : entry.video_id)}
                >
                  {/* Thumbnail */}
                  {entry.thumbnail ? (
                    <img
                      src={entry.thumbnail}
                      alt=""
                      className="w-28 h-18 rounded-xl object-cover flex-shrink-0 ring-1 ring-[#2A2A2A]"
                      style={{ height: "72px" }}
                    />
                  ) : (
                    <div className="w-28 flex-shrink-0 rounded-xl bg-[#1C1C1C] flex items-center justify-center" style={{ height: "72px" }}>
                      <Eye className="w-6 h-6 text-[#333]" />
                    </div>
                  )}

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-medium text-[13px] truncate">{entry.title}</p>

                    <div className="flex items-center gap-5 mt-2 text-xs">
                      <div>
                        <p className="text-[#555]">Original</p>
                        <p className="text-[#aaa] font-semibold mt-0.5">{fmt(entry.original_views)} views</p>
                      </div>
                      <div className="text-[#333]">→</div>
                      <div>
                        <p className="text-[#555]">Your reach</p>
                        <p className="text-red-400 font-bold mt-0.5">{fmt(entry.uploaded_views)} views</p>
                      </div>
                      <div className="ml-2">
                        <p className="text-[#555]">Uploads</p>
                        <p className="text-white font-semibold mt-0.5">{entry.uploads.length}</p>
                      </div>
                    </div>

                    <MultiplierGauge value={entry.multiplier} />
                  </div>
                </div>

                {/* Expanded: per-upload breakdown */}
                {isExpanded && entry.uploads.length > 0 && (
                  <div className="border-t border-[#1C1C1C]">
                    <table className="w-full">
                      <thead>
                        <tr className="text-[10px] uppercase tracking-wider text-[#444] border-b border-[#141414]">
                          <th className="text-left px-5 py-2.5 font-medium">Target Channel</th>
                          <th className="text-left px-4 py-2.5 font-medium">Uploaded</th>
                          <th className="text-right px-4 py-2.5 font-medium">Views</th>
                          <th className="text-right px-4 py-2.5 font-medium">Contribution</th>
                          <th className="text-right px-4 py-2.5 font-medium">Link</th>
                        </tr>
                      </thead>
                      <tbody>
                        {entry.uploads.map((u) => {
                          const pct = entry.uploaded_views > 0
                            ? Math.round((u.views / entry.uploaded_views) * 100)
                            : 0;
                          return (
                            <tr key={u.job_id} className="border-b border-[#141414] hover:bg-white/[0.02] transition-colors">
                              <td className="px-5 py-3">
                                <span className="text-[12px] text-[#ddd] font-medium">{u.channel_name}</span>
                              </td>
                              <td className="px-4 py-3">
                                <span className="text-[11px] text-[#555]">
                                  {u.uploaded_at
                                    ? new Date(u.uploaded_at).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
                                    : "—"}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-right">
                                <span className="text-[13px] text-white font-semibold tabular-nums">{fmt(u.views)}</span>
                              </td>
                              <td className="px-4 py-3 text-right">
                                <div className="flex items-center justify-end gap-2">
                                  <div className="w-16 h-1.5 bg-[#1C1C1C] rounded-full overflow-hidden">
                                    <div
                                      className="h-full bg-red-500 rounded-full"
                                      style={{ width: `${pct}%` }}
                                    />
                                  </div>
                                  <span className="text-[11px] text-[#666] w-8 text-right">{pct}%</span>
                                </div>
                              </td>
                              <td className="px-4 py-3 text-right">
                                <a
                                  href={`https://youtube.com/shorts/${u.youtube_video_id}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-[#444] hover:text-sky-400 transition-colors inline-flex items-center gap-1 text-[11px]"
                                >
                                  <ExternalLink className="w-3.5 h-3.5" />
                                </a>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── How multiplier is calculated ── */}
      <div className="bg-[#0D0D0D] border border-[#1C1C1C] rounded-2xl p-5">
        <h3 className="text-[#777] text-xs font-semibold uppercase tracking-wider mb-3">How Multiplier is Calculated</h3>
        <p className="text-[12px] text-[#555] leading-relaxed">
          <span className="text-white font-mono">Multiplier = Total Re-upload Views ÷ Original Video Views</span>
          <br /><br />
          Example: If a Short originally has <span className="text-[#aaa]">50K views</span> and your 5 re-uploads collect
          a combined <span className="text-[#aaa]">250K views</span>, your multiplier is <span className="text-red-400 font-bold">5.0×</span>.
          Stats refresh every 30 minutes automatically.
        </p>
      </div>
    </div>
  );
}
