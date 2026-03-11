"use client";
import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus, RefreshCw, Trash2, PlaySquare, ChevronDown, ChevronRight,
  Eye, ThumbsUp, Clock, Flame, ExternalLink, MessageCircle,
  Calendar, TrendingUp, Search, ArrowUpDown,
} from "lucide-react";
import { Modal } from "./ui/Modal";
import { StatusBadge } from "./ui/Badge";
import { useToast } from "./ui/Toast";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "./ui/animated-table-rows";
import StatCard from "./ui/stat-card";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8001";

interface Short {
  video_id: string;
  channel_id: string;
  title: string;
  description: string;
  views_at_discovery: number;
  views_last_check: number;
  views_delta: number;
  likes: number;
  comments: number;
  duration: number;
  thumbnail: string;
  published_at: string;
  last_checked: string;
  status: string;
  url: string;
}

interface Channel {
  id: string;
  name: string;
  url: string;
  thumbnail: string;
  added_at: string;
}

type SortKey = "views_delta" | "views_last_check" | "likes" | "published_at" | "title";

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
  if (!d) return "—";
  if (/^\d{8}$/.test(d)) {
    return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
  }
  try {
    return new Date(d).toLocaleDateString([], { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return d;
  }
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="w-16 h-16 rounded-2xl bg-[#161616] border border-[#2A2A2A] flex items-center justify-center mb-4">
        <PlaySquare className="w-8 h-8 text-[#333]" />
      </div>
      <h3 className="text-white font-semibold mb-1">No source channels yet</h3>
      <p className="text-sm text-[#555] mb-5 max-w-xs">
        Add YouTube channels to monitor. We'll track their Shorts and alert you when views spike.
      </p>
      <button
        onClick={onAdd}
        className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-colors"
      >
        <Plus className="w-4 h-4" /> Add First Channel
      </button>
    </div>
  );
}

function ShortsTable({
  shorts,
  sortKey,
  sortAsc,
  onSort,
  search,
}: {
  shorts: Short[];
  sortKey: SortKey;
  sortAsc: boolean;
  onSort: (k: SortKey) => void;
  search: string;
}) {
  const filtered = shorts.filter((s) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      s.title?.toLowerCase().includes(q) ||
      s.video_id.toLowerCase().includes(q) ||
      s.description?.toLowerCase().includes(q)
    );
  });

  const sorted = [...filtered].sort((a, b) => {
    let av: any = a[sortKey];
    let bv: any = b[sortKey];
    if (typeof av === "string") av = av?.toLowerCase() || "";
    if (typeof bv === "string") bv = bv?.toLowerCase() || "";
    if (av < bv) return sortAsc ? -1 : 1;
    if (av > bv) return sortAsc ? 1 : -1;
    return 0;
  });

  const SortHeader = ({ label, k, icon: Icon }: { label: string; k: SortKey; icon?: any }) => (
    <TableHead
      onClick={() => onSort(k)}
      className="text-[10px] uppercase tracking-wider text-[#444] font-medium cursor-pointer hover:text-[#888] transition-colors select-none px-4 py-2.5 h-auto"
    >
      <div className="flex items-center gap-1">
        {Icon && <Icon className="w-3 h-3" />}
        {label}
        {sortKey === k && <ArrowUpDown className="w-3 h-3 text-red-400" />}
      </div>
    </TableHead>
  );

  if (sorted.length === 0) {
    return (
      <p className="text-center text-[#444] text-xs py-8">
        {search ? "No Shorts match your search." : "No Shorts detected yet — run a scan."}
      </p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow className="border-b border-[#1C1C1C] hover:bg-transparent">
          <TableHead className="text-[10px] uppercase tracking-wider text-[#444] font-medium w-8 px-4 py-2.5 h-auto">#</TableHead>
          <SortHeader label="Title" k="title" />
          <TableHead className="text-[10px] uppercase tracking-wider text-[#444] font-medium px-4 py-2.5 h-auto">ID</TableHead>
          <TableHead className="text-[10px] uppercase tracking-wider text-[#444] font-medium px-4 py-2.5 h-auto">Description</TableHead>
          <SortHeader label="Views" k="views_last_check" icon={Eye} />
          <SortHeader label="24h Delta" k="views_delta" icon={TrendingUp} />
          <SortHeader label="Likes" k="likes" icon={ThumbsUp} />
          <TableHead className="text-[10px] uppercase tracking-wider text-[#444] font-medium text-right px-4 py-2.5 h-auto">Comments</TableHead>
          <SortHeader label="Published" k="published_at" icon={Calendar} />
          <TableHead className="text-[10px] uppercase tracking-wider text-[#444] font-medium text-right px-4 py-2.5 h-auto">Dur.</TableHead>
          <TableHead className="text-[10px] uppercase tracking-wider text-[#444] font-medium px-4 py-2.5 h-auto">Status</TableHead>
          <TableHead className="px-4 py-2.5 h-auto" />
        </TableRow>
      </TableHeader>
      <TableBody>
        <AnimatePresence initial={false}>
          {sorted.map((s, idx) => (
            <motion.tr
              key={s.video_id}
              layout
              initial={{ opacity: 0, x: -16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -80 }}
              transition={{ duration: 0.3, delay: idx * 0.04 }}
              className="border-b border-[#141414] hover:bg-white/[0.02] transition-colors group"
            >
              <TableCell className="px-4 py-3 text-[11px] text-[#444]">{idx + 1}</TableCell>

              {/* Title + Thumbnail */}
              <TableCell className="px-4 py-3">
                <div className="flex items-center gap-3 max-w-[220px]">
                  <img
                    src={thumbUrl(s.thumbnail, s.video_id)}
                    alt=""
                    className="w-14 h-9 rounded-lg object-cover flex-shrink-0 ring-1 ring-white/5"
                  />
                  <span className="text-[13px] text-[#ddd] truncate" title={s.title}>
                    {s.title || s.video_id}
                  </span>
                </div>
              </TableCell>

              {/* Video ID */}
              <TableCell className="px-4 py-3">
                <span className="text-[11px] text-[#555] font-mono" title={s.video_id}>
                  {s.video_id.slice(0, 8)}...
                </span>
              </TableCell>

              {/* Description */}
              <TableCell className="px-4 py-3">
                <span className="text-[11px] text-[#555] truncate block max-w-[120px]" title={s.description}>
                  {s.description
                    ? s.description.slice(0, 50) + (s.description.length > 50 ? "..." : "")
                    : "—"}
                </span>
              </TableCell>

              {/* Views */}
              <TableCell className="px-4 py-3 text-right">
                <span className="text-[13px] text-[#aaa] tabular-nums">{fmt(s.views_last_check)}</span>
              </TableCell>

              {/* 24h Delta */}
              <TableCell className="px-4 py-3 text-right">
                <span
                  className={`text-[13px] font-semibold tabular-nums ${
                    s.views_delta >= 1000
                      ? "text-red-400"
                      : s.views_delta >= 500
                      ? "text-orange-400"
                      : "text-[#555]"
                  }`}
                >
                  +{fmt(s.views_delta)}
                </span>
              </TableCell>

              {/* Likes */}
              <TableCell className="px-4 py-3 text-right">
                <span className="text-[13px] text-[#666] tabular-nums">{fmt(s.likes)}</span>
              </TableCell>

              {/* Comments */}
              <TableCell className="px-4 py-3 text-right">
                <span className="text-[12px] text-[#555] tabular-nums">{fmt(s.comments)}</span>
              </TableCell>

              {/* Published */}
              <TableCell className="px-4 py-3">
                <span className="text-[11px] text-[#555]">{fmtDate(s.published_at)}</span>
              </TableCell>

              {/* Duration */}
              <TableCell className="px-4 py-3 text-right">
                <span className="text-[12px] text-[#555]">{s.duration}s</span>
              </TableCell>

              {/* Status */}
              <TableCell className="px-4 py-3">
                <StatusBadge status={s.status} />
              </TableCell>

              {/* External link */}
              <TableCell className="px-4 py-3 text-right">
                <a
                  href={s.url || `https://youtube.com/shorts/${s.video_id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#444] hover:text-[#aaa] transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </TableCell>
            </motion.tr>
          ))}
        </AnimatePresence>
      </TableBody>
    </Table>
  );
}

function channelDisplayName(ch: Channel): string {
  if (ch.name && ch.name !== ch.url && !ch.name.startsWith("http")) return ch.name;
  const m = ch.url.match(/youtube\.com\/@?([\w.%-]+)/);
  return m ? `@${m[1]}` : ch.url;
}

function ChannelAvatar({ ch }: { ch: Channel }) {
  const [imgError, setImgError] = useState(false);
  const name = channelDisplayName(ch);
  const initials = name.replace("@", "").slice(0, 2).toUpperCase();

  if (ch.thumbnail && !imgError) {
    return (
      <img
        src={ch.thumbnail}
        alt={name}
        onError={() => setImgError(true)}
        className="w-11 h-11 rounded-full object-cover ring-2 ring-[#2A2A2A] flex-shrink-0"
      />
    );
  }
  // Initials avatar with gradient background
  const colors = ["bg-red-900/60", "bg-violet-900/60", "bg-sky-900/60", "bg-emerald-900/60", "bg-amber-900/60", "bg-pink-900/60"];
  const color = colors[initials.charCodeAt(0) % colors.length];
  return (
    <div className={`w-11 h-11 rounded-full ${color} border border-white/10 flex items-center justify-center flex-shrink-0`}>
      <span className="text-[13px] font-bold text-white/80">{initials}</span>
    </div>
  );
}

function ChannelRow({ ch, shorts, onRemove }: { ch: Channel; shorts: Short[]; onRemove: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("views_delta");
  const [sortAsc, setSortAsc] = useState(false);
  const viral = shorts.filter((s) => s.status === "queued").length;
  const total = shorts.length;
  const totalViews = shorts.reduce((a, s) => a + (s.views_last_check || 0), 0);
  const name = channelDisplayName(ch);

  const handleSort = (k: SortKey) => {
    if (k === sortKey) setSortAsc(!sortAsc);
    else { setSortKey(k); setSortAsc(false); }
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={`bg-[#111] border rounded-2xl overflow-hidden transition-colors ${
        viral > 0 ? "border-red-900/40 hover:border-red-800/60" : "border-[#1C1C1C] hover:border-[#2A2A2A]"
      }`}
    >
      <div
        className="flex items-center gap-4 px-5 py-4 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        {/* Avatar */}
        <ChannelAvatar ch={ch} />

        {/* Name + handle */}
        <div className="flex-1 min-w-0">
          <p className="text-white font-semibold text-sm truncate leading-tight">{name}</p>
          <p className="text-[11px] text-[#444] mt-0.5 truncate">{ch.url}</p>
        </div>

        {/* Metric values — widths must match header widths exactly */}
        <div className="flex items-center flex-shrink-0">

          {/* Total Shorts */}
          <div className="w-32 flex items-center justify-center gap-1.5">
            <PlaySquare className="w-3.5 h-3.5 text-[#555]" />
            <span className="text-[14px] font-bold text-white tabular-nums">{total}</span>
          </div>

          <div className="w-px h-8 bg-[#222]" />

          {/* Total Views */}
          <div className="w-36 flex items-center justify-center gap-1.5">
            <Eye className="w-3.5 h-3.5 text-sky-500" />
            <span className="text-[14px] font-bold text-sky-400 tabular-nums">{fmt(totalViews)}</span>
          </div>

          <div className="w-px h-8 bg-[#222]" />

          {/* Visit */}
          <div className="w-24 flex items-center justify-center">
            <a
              href={ch.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="flex items-center gap-1.5 text-[#555] hover:text-white transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span className="text-[12px]">Visit</span>
            </a>
          </div>

          <div className="w-px h-8 bg-[#222] mx-2" />

          {/* Actions */}
          <div className="w-16 flex items-center justify-center gap-0.5">
            <button
              onClick={(e) => { e.stopPropagation(); onRemove(); }}
              className="text-[#333] hover:text-red-500 transition-colors p-1.5 rounded-lg hover:bg-red-500/10"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
            {expanded
              ? <ChevronDown className="w-4 h-4 text-[#444]" />
              : <ChevronRight className="w-4 h-4 text-[#444]" />
            }
          </div>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="shorts-panel"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
            className="overflow-hidden border-t border-[#1C1C1C]"
          >
            {shorts.length > 0 && (
              <div className="px-5 py-3 border-b border-[#1C1C1C] flex items-center gap-3">
                <div className="relative flex-1 max-w-xs">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#444]" />
                  <input
                    className="w-full bg-[#0A0A0A] border border-[#2A2A2A] rounded-lg pl-9 pr-3 py-2 text-xs text-white placeholder:text-[#444] outline-none focus:border-[#444]"
                    placeholder="Search shorts by title, ID, description..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>
                <span className="text-[10px] text-[#444]">{shorts.length} total</span>
              </div>
            )}
            <ShortsTable
              shorts={shorts}
              sortKey={sortKey}
              sortAsc={sortAsc}
              onSort={handleSort}
              search={search}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export default function SourceChannelsPage() {
  const { data: session } = useSession();
  const userEmail = session?.user?.email || "";
  const { success, error } = useToast();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [shorts, setShorts] = useState<Short[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [newUrl, setNewUrl] = useState("");
  const [adding, setAdding] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [enriching, setEnriching] = useState(false);
  const [apiDown, setApiDown] = useState(false);

  const fetchAll = useCallback(async () => {
    try {
      const [ch, sh] = await Promise.all([
        fetch(`${API}/channels/source`, { headers: { "x-user-email": userEmail } }).then((r) => r.json()),
        fetch(`${API}/shorts/all`, { headers: { "x-user-email": userEmail } }).then((r) => r.json()),
      ]);
      setApiDown(false);
      setChannels(Array.isArray(ch) ? ch : []);
      setShorts(Array.isArray(sh) ? sh : []);
    } catch {
      setApiDown(true);
    }
  }, [userEmail]);

  const handleEnrich = useCallback(async () => {
    setEnriching(true);
    try {
      await fetch(`${API}/channels/source/enrich`, { method: "POST", headers: { "x-user-email": userEmail } });
      await fetchAll();
    } catch { /* silent */ } finally {
      setEnriching(false);
    }
  }, [fetchAll, userEmail]);

  useEffect(() => {
    fetchAll().then(() => {
      // Auto-enrich on first load to pull thumbnails + names
      handleEnrich();
    });
  }, [fetchAll, handleEnrich]);

  const handleAdd = async () => {
    if (!newUrl.trim()) return;
    setAdding(true);
    try {
      const res = await fetch(`${API}/channels/source`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-user-email": userEmail },
        body: JSON.stringify({ url: newUrl.trim() }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.detail || "Failed");
      }
      setNewUrl("");
      setModalOpen(false);
      success("Channel added successfully");
      await fetchAll();
    } catch (e: any) {
      error(e.message);
    } finally {
      setAdding(false);
    }
  };

  const handleRemove = async (id: string) => {
    await fetch(`${API}/channels/source/${encodeURIComponent(id)}`, { method: "DELETE", headers: { "x-user-email": userEmail } });
    success("Channel removed");
    await fetchAll();
  };

  const handleScan = async () => {
    setScanning(true);
    try {
      const res = await fetch(`${API}/shorts/scan`, { method: "POST", headers: { "x-user-email": userEmail } });
      const data = await res.json();
      if (data.status === "already_running") {
        success("Scan already in progress...");
      }
      const poll = async () => {
        try {
          const st = await fetch(`${API}/shorts/scan/status`, { headers: { "x-user-email": userEmail } }).then((r) => r.json());
          if (st.running) {
            setTimeout(poll, 2000);
          } else {
            await fetchAll();
            setScanning(false);
            const r = st.last_result;
            if (r?.error) {
              error(`Scan error: ${r.error}`);
            } else if (r) {
              const msg = `Scan done: ${r.new_shorts} new Shorts found${r.queued_shorts > 0 ? `, ${r.queued_shorts} queued` : ""}${r.errors?.length ? ` (${r.errors.length} channel errors)` : ""}`;
              success(msg);
            }
          }
        } catch {
          await fetchAll();
          setScanning(false);
        }
      };
      setTimeout(poll, 2000);
    } catch {
      error("Could not start scan - is the backend running?");
      setScanning(false);
    }
  };

  const totalViral = shorts.filter((s) => s.status === "queued").length;
  const totalViews = shorts.reduce((a, s) => a + (s.views_last_check || 0), 0);
  const totalDelta = shorts.reduce((a, s) => a + (s.views_delta || 0), 0);

  return (
    <>
      {apiDown && (
        <div className="flex items-center gap-3 bg-red-950/40 border border-red-800/50 rounded-xl px-4 py-3 mb-4 text-sm text-red-300">
          <span className="text-red-400">!</span>
          <span>
            Cannot reach the API at <code className="bg-red-900/40 px-1 rounded text-xs">{API}</code>.
            Make sure the backend is running.
          </span>
        </div>
      )}

      {/* Page Header */}
      <div className="mb-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-white font-bold text-xl tracking-tight">Source Channels</h1>
            <p className="text-[13px] text-[#555] mt-1">
              Channels from where the Shorts are being fetched
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleScan}
              disabled={scanning || channels.length === 0}
              className="flex items-center gap-2 bg-[#161616] hover:bg-[#1C1C1C] border border-[#2A2A2A] hover:border-[#333] text-[#aaa] hover:text-white text-sm font-medium px-4 py-2.5 rounded-xl disabled:opacity-40 transition-all"
            >
              <RefreshCw className={`w-4 h-4 ${scanning ? "animate-spin" : ""}`} />
              {scanning ? "Scanning..." : "Run Scan"}
            </button>
            <button
              onClick={() => setModalOpen(true)}
              className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-colors shadow-lg shadow-red-900/20"
            >
              <Plus className="w-4 h-4" /> Add Channel
            </button>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      {channels.length > 0 && (
        <div className="grid grid-cols-3 gap-4 mb-6">
          <StatCard value={channels.length} label="Total Channels" sub="being monitored" variant="grey" />
          <StatCard value={shorts.length} label="Total Shorts" sub="tracked across channels" variant="grey" />
          <StatCard value={fmt(totalViews)} label="Total Views" sub="combined view count" variant="grey" />
        </div>
      )}

      {/* Channel list */}
      {channels.length === 0 ? (
        <EmptyState onAdd={() => setModalOpen(true)} />
      ) : (
        <div>
          {/* Column headers */}
          <div className="flex items-center px-5 pb-2 mb-1 border-b border-[#1A1A1A]">
            <div className="flex-1 min-w-0 flex items-center gap-4">
              <div className="w-11 flex-shrink-0" />
              <span className="text-[11px] font-semibold text-[#444] uppercase tracking-widest">Name</span>
            </div>
            <div className="flex items-center flex-shrink-0">
              <div className="w-32 text-center">
                <span className="text-[11px] font-semibold text-[#444] uppercase tracking-widest">Total Shorts</span>
              </div>
              <div className="w-px h-4 bg-transparent" />
              <div className="w-36 text-center">
                <span className="text-[11px] font-semibold text-[#444] uppercase tracking-widest">Total Views</span>
              </div>
              <div className="w-px h-4 bg-transparent" />
              <div className="w-24 text-center">
                <span className="text-[11px] font-semibold text-[#444] uppercase tracking-widest">Visit</span>
              </div>
              <div className="w-px h-4 bg-transparent mx-2" />
              <div className="w-16" />
            </div>
          </div>

          <div className="space-y-2">
          <AnimatePresence>
            {channels.map((ch) => (
              <ChannelRow
                key={ch.id}
                ch={ch}
                shorts={shorts.filter((s) => (s as any).channel_id === ch.id)}
                onRemove={() => handleRemove(ch.id)}
              />
            ))}
          </AnimatePresence>
          </div>
        </div>
      )}

      {/* Add Channel Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Add Source Channel">
        <div className="space-y-4">
          <div>
            <label className="block text-xs text-[#777] mb-1.5 font-medium uppercase tracking-wide">
              YouTube Channel URL
            </label>
            <input
              autoFocus
              className="w-full bg-[#0D0D0D] border border-[#2A2A2A] focus:border-red-600 rounded-xl px-4 py-3 text-sm text-white placeholder:text-[#444] outline-none transition-colors"
              placeholder="https://youtube.com/@channelname"
              value={newUrl}
              onChange={(e) => setNewUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            />
            <p className="text-[11px] text-[#444] mt-1.5">
              Paste any YouTube channel URL — we'll auto-detect the channel ID.
            </p>
          </div>

          <div className="bg-[#0D0D0D] border border-[#1C1C1C] rounded-xl p-3 text-[11px] text-[#555] space-y-1">
            <p className="text-[#444] font-medium mb-1">Accepted formats:</p>
            <p>youtube.com/@handle</p>
            <p>youtube.com/c/channelname</p>
            <p>youtube.com/channel/UC...</p>
          </div>

          <div className="flex gap-2 pt-1">
            <button
              onClick={() => setModalOpen(false)}
              className="flex-1 py-2.5 rounded-xl border border-[#2A2A2A] text-[#777] hover:text-white text-sm transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleAdd}
              disabled={adding || !newUrl.trim()}
              className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-medium disabled:opacity-40 transition-colors"
            >
              {adding ? "Adding..." : "Add Channel"}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
