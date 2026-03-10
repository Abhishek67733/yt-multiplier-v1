interface BadgeProps {
  status: "monitoring" | "queued" | "uploading" | "done" | "failed" | "pending" | string;
}

const MAP: Record<string, { label: string; cls: string }> = {
  queued:     { label: "Viral · Queued",   cls: "bg-red-500/15 text-red-400 border border-red-500/30" },
  monitoring: { label: "Monitoring",       cls: "bg-amber-500/10 text-amber-400 border border-amber-500/20" },
  done:       { label: "Uploaded",         cls: "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" },
  uploading:  { label: "Uploading…",       cls: "bg-blue-500/10 text-blue-400 border border-blue-500/20" },
  pending:    { label: "Pending",          cls: "bg-zinc-500/10 text-zinc-400 border border-zinc-500/20" },
  failed:     { label: "Failed",           cls: "bg-red-500/10 text-red-400 border border-red-500/20" },
};

export function StatusBadge({ status }: BadgeProps) {
  const s = MAP[status] || { label: status, cls: "bg-zinc-500/10 text-zinc-400 border border-zinc-500/20" };
  return (
    <span className={`inline-flex items-center text-[11px] px-2 py-0.5 rounded-full font-medium ${s.cls}`}>
      {s.label}
    </span>
  );
}
