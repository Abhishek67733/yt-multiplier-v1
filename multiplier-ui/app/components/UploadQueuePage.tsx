"use client";
import { useState, useEffect, useCallback } from "react";
import {
  Rocket, Clock, CheckCircle, XCircle, Loader2, Flame,
  Eye, Play, ChevronRight, Upload, AlertCircle,
} from "lucide-react";
import { StatusBadge } from "./ui/Badge";
import { useToast } from "./ui/Toast";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8001";

interface Short {
  video_id: string;
  title: string;
  thumbnail: string;
  channel_id: string;
  views_last_check: number;
  views_delta: number;
  duration: number;
}

interface UploadJob {
  id: number;
  video_id: string;
  short_title: string;
  short_thumbnail: string;
  channel_name: string;
  scheduled_at: string;
  uploaded_at: string | null;
  status: string;
  youtube_video_id: string | null;
  error_message: string | null;
}

interface TargetChannel {
  id: number;
  channel_name: string;
}

function fmt(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n || 0);
}

function JobStatusIcon({ status }: { status: string }) {
  if (status === "done")     return <CheckCircle className="w-4 h-4 text-emerald-400" />;
  if (status === "failed")   return <XCircle className="w-4 h-4 text-red-400" />;
  if (status === "uploading") return <Loader2 className="w-4 h-4 text-sky-400 animate-spin" />;
  return <Clock className="w-4 h-4 text-amber-400" />;
}

function SliderTrack({ value, min, max, onChange, labels }: {
  value: number; min: number; max: number;
  onChange: (v: number) => void; labels: string[];
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div>
      <div className="relative">
        {/* Track fill */}
        <div className="absolute top-1/2 -translate-y-1/2 h-1.5 bg-red-600/30 rounded-full" style={{ width: `${pct}%` }} />
        <input
          type="range"
          min={min}
          max={max}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="relative w-full"
        />
      </div>
      <div className="flex justify-between mt-1.5">
        {labels.map((l, i) => (
          <span key={i} className="text-[10px] text-[#444]">{l}</span>
        ))}
      </div>
    </div>
  );
}

export default function UploadQueuePage() {
  const { success, error } = useToast();
  const [queued, setQueued] = useState<Short[]>([]);
  const [jobs, setJobs] = useState<UploadJob[]>([]);
  const [targets, setTargets] = useState<TargetChannel[]>([]);
  const [selected, setSelected] = useState<Short | null>(null);
  const [nChannels, setNChannels] = useState(3);
  const [gapHours, setGapHours] = useState(4);
  const [launching, setLaunching] = useState(false);
  const [activeJobTab, setActiveJobTab] = useState<"all" | "pending" | "done" | "failed">("all");

  const fetchAll = useCallback(async () => {
    try {
      const [q, j, t] = await Promise.all([
        fetch(`${API}/shorts/queue`).then((r) => r.json()),
        fetch(`${API}/upload/jobs`).then((r) => r.json()),
        fetch(`${API}/channels/target`).then((r) => r.json()),
      ]);
      setQueued(Array.isArray(q) ? q : []);
      setJobs(Array.isArray(j) ? j : []);
      setTargets(Array.isArray(t) ? t : []);
    } catch {
      // silently ignore — no toast spam on auto-refresh
    }
  }, []);

  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, 30_000);
    return () => clearInterval(interval);
  }, [fetchAll]);

  const handleLaunch = async () => {
    if (!selected) return;
    if (targets.length === 0) {
      error("No target channels configured — go to Target Channels first");
      return;
    }
    setLaunching(true);
    try {
      const res = await fetch(`${API}/upload/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ video_id: selected.video_id, n_channels: nChannels, gap_hours: gapHours }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.detail || "Failed");
      success(`Campaign started! ${d.jobs_created} upload jobs scheduled`);
      setSelected(null);
      await fetchAll();
    } catch (e: any) {
      error(e.message);
    } finally {
      setLaunching(false);
    }
  };

  const handleExecuteNow = async (jobId: number) => {
    await fetch(`${API}/upload/execute/${jobId}`, { method: "POST" });
    success("Upload triggered");
    setTimeout(fetchAll, 2000);
  };

  const previewSchedule = Array.from({ length: Math.min(nChannels, targets.length || nChannels) }, (_, i) => {
    const ch = targets[i]?.channel_name || `Channel ${i + 1}`;
    if (i === 0) return `${ch} → now`;
    const hrs = gapHours * i;
    return `${ch} → +${hrs}h`;
  });

  const filteredJobs = jobs.filter((j) => {
    if (activeJobTab === "all") return true;
    if (activeJobTab === "pending") return ["pending", "uploading"].includes(j.status);
    return j.status === activeJobTab;
  });

  const jobCounts = {
    all: jobs.length,
    pending: jobs.filter((j) => ["pending", "uploading"].includes(j.status)).length,
    done: jobs.filter((j) => j.status === "done").length,
    failed: jobs.filter((j) => j.status === "failed").length,
  };

  return (
    <div className="grid grid-cols-5 gap-6 h-full">
      {/* ── Left: Viral Queue ── */}
      <div className="col-span-2 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Flame className="w-4 h-4 text-red-400" />
            <h2 className="text-white font-semibold text-sm">Viral Queue</h2>
            {queued.length > 0 && (
              <span className="bg-red-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                {queued.length}
              </span>
            )}
          </div>
        </div>

        {queued.length === 0 ? (
          <div className="bg-[#111] border border-dashed border-[#1C1C1C] rounded-2xl p-8 text-center">
            <Flame className="w-8 h-8 text-[#333] mx-auto mb-2" />
            <p className="text-[#555] text-sm">No viral Shorts yet</p>
            <p className="text-[#333] text-xs mt-1">Run a scan from Source Channels</p>
          </div>
        ) : (
          <div className="space-y-2">
            {queued.map((s) => {
              const isSelected = selected?.video_id === s.video_id;
              return (
                <div
                  key={s.video_id}
                  onClick={() => setSelected(isSelected ? null : s)}
                  className={`group relative bg-[#111] border rounded-2xl p-4 cursor-pointer transition-all ${
                    isSelected
                      ? "border-red-500/50 ring-1 ring-red-500/20 shadow-lg shadow-red-900/10"
                      : "border-[#1C1C1C] hover:border-[#2A2A2A]"
                  }`}
                >
                  {isSelected && (
                    <div className="absolute top-3 right-3 w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                  )}
                  <div className="flex gap-3">
                    {s.thumbnail ? (
                      <img src={s.thumbnail} alt="" className="w-16 h-11 rounded-lg object-cover flex-shrink-0" />
                    ) : (
                      <div className="w-16 h-11 rounded-lg bg-[#1C1C1C] flex-shrink-0 flex items-center justify-center">
                        <Play className="w-4 h-4 text-[#333]" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] text-white font-medium truncate leading-tight">{s.title}</p>
                      <div className="flex items-center gap-2 mt-1.5">
                        <span className="flex items-center gap-1 text-[11px] text-[#666]">
                          <Eye className="w-3 h-3" /> {fmt(s.views_last_check)}
                        </span>
                        <span className="text-[11px] text-red-400 font-semibold">
                          +{fmt(s.views_delta)}/24h
                        </span>
                        <span className="text-[11px] text-[#555]">{s.duration}s</span>
                      </div>
                    </div>
                    {!isSelected && (
                      <ChevronRight className="w-4 h-4 text-[#333] group-hover:text-[#666] flex-shrink-0 self-center transition-colors" />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Distribution panel — appears when a short is selected */}
        {selected && (
          <div className="bg-[#111] border border-red-500/25 rounded-2xl p-5 space-y-5 animate-fade-in">
            <div>
              <p className="text-xs text-[#666] font-medium uppercase tracking-wide mb-0.5">Selected Short</p>
              <p className="text-white text-sm font-medium truncate">{selected.title}</p>
            </div>

            {targets.length === 0 && (
              <div className="flex items-center gap-2 bg-amber-950/30 border border-amber-800/30 rounded-xl px-3 py-2.5 text-amber-400 text-xs">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                No target channels — add them first
              </div>
            )}

            {/* Slider: channels */}
            <div>
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs text-[#777]">Push to N channels</span>
                <span className="text-sm font-bold text-white">{Math.min(nChannels, targets.length || 5)} / {targets.length || 5}</span>
              </div>
              <SliderTrack
                value={nChannels}
                min={1}
                max={Math.max(targets.length, 1)}
                onChange={setNChannels}
                labels={["1", "2", "3", "4", "5"]}
              />
            </div>

            {/* Slider: time gap */}
            <div>
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs text-[#777]">Gap between uploads</span>
                <span className="text-sm font-bold text-white">{gapHours === 0 ? "Simultaneous" : `${gapHours}h apart`}</span>
              </div>
              <SliderTrack
                value={gapHours}
                min={0}
                max={24}
                onChange={setGapHours}
                labels={["Now", "6h", "12h", "18h", "24h"]}
              />
            </div>

            {/* Schedule preview */}
            <div className="bg-[#0D0D0D] rounded-xl p-3">
              <p className="text-[10px] text-[#444] uppercase tracking-wider mb-2">Schedule Preview</p>
              <div className="flex flex-col gap-1.5">
                {previewSchedule.map((label, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" />
                    <span className="text-[12px] text-[#aaa]">{label}</span>
                  </div>
                ))}
              </div>
            </div>

            <button
              onClick={handleLaunch}
              disabled={launching || targets.length === 0}
              className="w-full flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 text-white font-semibold text-sm py-3 rounded-xl disabled:opacity-40 transition-colors shadow-lg shadow-red-900/25"
            >
              <Rocket className="w-4 h-4" />
              {launching ? "Scheduling campaign…" : "Launch Upload Campaign"}
            </button>
          </div>
        )}
      </div>

      {/* ── Right: Jobs table ── */}
      <div className="col-span-3 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-white font-semibold text-sm flex items-center gap-2">
            <Upload className="w-4 h-4 text-sky-400" /> Upload Jobs
          </h2>
          {/* Tab filter */}
          <div className="flex items-center gap-1 bg-[#111] border border-[#1C1C1C] rounded-xl p-1">
            {(["all", "pending", "done", "failed"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveJobTab(tab)}
                className={`px-3 py-1.5 rounded-lg text-[11px] font-medium capitalize transition-colors ${
                  activeJobTab === tab
                    ? "bg-white/8 text-white"
                    : "text-[#555] hover:text-[#aaa]"
                }`}
              >
                {tab} {jobCounts[tab] > 0 && <span className="opacity-60">({jobCounts[tab]})</span>}
              </button>
            ))}
          </div>
        </div>

        {filteredJobs.length === 0 ? (
          <div className="bg-[#111] border border-dashed border-[#1C1C1C] rounded-2xl p-12 text-center">
            <Clock className="w-8 h-8 text-[#333] mx-auto mb-2" />
            <p className="text-[#555] text-sm">No jobs yet</p>
            <p className="text-[#333] text-xs mt-1">Select a viral Short on the left to start</p>
          </div>
        ) : (
          <div className="bg-[#111] border border-[#1C1C1C] rounded-2xl overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-[#444] border-b border-[#1C1C1C]">
                  <th className="text-left px-5 py-3 font-medium">Short</th>
                  <th className="text-left px-4 py-3 font-medium">Channel</th>
                  <th className="text-left px-4 py-3 font-medium">Scheduled</th>
                  <th className="text-center px-4 py-3 font-medium">Status</th>
                  <th className="text-right px-4 py-3 font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredJobs.map((j) => (
                  <tr key={j.id} className="border-b border-[#141414] hover:bg-white/[0.02] transition-colors">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        {j.short_thumbnail ? (
                          <img src={j.short_thumbnail} alt="" className="w-10 h-7 rounded-lg object-cover flex-shrink-0" />
                        ) : (
                          <div className="w-10 h-7 rounded-lg bg-[#1C1C1C] flex-shrink-0" />
                        )}
                        <span className="text-[12px] text-[#ddd] truncate max-w-[140px]" title={j.short_title}>
                          {j.short_title}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-[12px] text-[#888]">{j.channel_name}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-[11px] text-[#555]">
                        {j.scheduled_at ? new Date(j.scheduled_at).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col items-center gap-1">
                        <div className="flex items-center gap-1.5">
                          <JobStatusIcon status={j.status} />
                          <StatusBadge status={j.status} />
                        </div>
                        {j.youtube_video_id && (
                          <a
                            href={`https://youtube.com/shorts/${j.youtube_video_id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[10px] text-sky-400 hover:underline"
                          >
                            View on YouTube ↗
                          </a>
                        )}
                        {j.error_message && (
                          <span className="text-[10px] text-red-400 max-w-[120px] truncate" title={j.error_message}>
                            {j.error_message}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {(j.status === "pending" || j.status === "failed") && (
                        <button
                          onClick={() => handleExecuteNow(j.id)}
                          className="text-[11px] bg-[#1A1A1A] hover:bg-[#2A2A2A] border border-[#2A2A2A] text-[#aaa] hover:text-white px-3 py-1.5 rounded-lg transition-colors"
                        >
                          Upload Now
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
