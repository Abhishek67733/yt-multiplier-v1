"use client";
import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { Plus, Trash2, Upload, CheckCircle, Settings, Youtube, Loader2 } from "lucide-react";
import { useToast } from "./ui/Toast";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8001";

interface TargetChannel {
  id: number;
  channel_name: string;
  channel_id: string | null;
  upload_count: number;
  added_at: string;
}

function ChannelAvatar({ name }: { name: string }) {
  const initials = name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const colors = [
    "from-violet-600 to-purple-800",
    "from-sky-600 to-blue-800",
    "from-emerald-600 to-green-800",
    "from-amber-600 to-orange-800",
    "from-rose-600 to-red-800",
  ];
  const color = colors[name.charCodeAt(0) % colors.length];
  return (
    <div className={`w-11 h-11 rounded-full bg-gradient-to-br ${color} flex items-center justify-center flex-shrink-0 text-white text-sm font-bold`}>
      {initials}
    </div>
  );
}

function EmptyState({ onConnect }: { onConnect: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="w-16 h-16 rounded-2xl bg-[#161616] border border-[#2A2A2A] flex items-center justify-center mb-4">
        <Settings className="w-8 h-8 text-[#333]" />
      </div>
      <h3 className="text-white font-semibold mb-1">No target channels yet</h3>
      <p className="text-sm text-[#555] mb-5 max-w-xs">
        Connect your YouTube channels with one click. We&apos;ll handle the rest.
      </p>
      <button
        onClick={onConnect}
        className="flex items-center gap-2 bg-[#cc181e] hover:bg-[#b01419] text-white text-sm font-medium px-5 py-2.5 rounded-xl transition-colors"
      >
        <Youtube className="w-4 h-4" /> Connect YouTube Channel
      </button>
    </div>
  );
}

export default function TargetChannelsPage() {
  const { data: session } = useSession();
  const userEmail = session?.user?.email || "";
  const { success, error } = useToast();
  const [channels, setChannels] = useState<TargetChannel[]>([]);
  const [apiDown, setApiDown] = useState(false);
  const [connecting, setConnecting] = useState(false);

  const fetchChannels = useCallback(async () => {
    try {
      const res = await fetch(`${API}/channels/target`, { headers: { "x-user-email": userEmail } });
      const data = await res.json();
      setChannels(Array.isArray(data) ? data : []);
      setApiDown(false);
    } catch {
      setApiDown(true);
    }
  }, [userEmail]);

  useEffect(() => { fetchChannels(); }, [fetchChannels]);

  // Check URL params for OAuth callback result
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const connectStatus = params.get("youtube_connect");
    const channelName = params.get("channel");
    const reason = params.get("reason");

    if (connectStatus === "success") {
      success(`Connected: ${channelName || "YouTube channel"}`);
      fetchChannels();
      // Clean URL params
      window.history.replaceState({}, "", window.location.pathname);
    } else if (connectStatus === "error") {
      if (reason === "no_channel") {
        error("No YouTube channel found on this Google account");
      } else {
        error(`Connection failed: ${reason || "Unknown error"}`);
      }
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleConnect = async () => {
    setConnecting(true);
    try {
      const res = await fetch(`${API}/auth/youtube/connect`, { headers: { "x-user-email": userEmail } });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.detail || "Failed to start OAuth");
      }
      const { auth_url } = await res.json();
      // Redirect current window to Google OAuth consent screen
      window.location.href = auth_url;
    } catch (e: any) {
      error(e.message);
      setConnecting(false);
    }
  };

  const handleRemove = async (id: number) => {
    await fetch(`${API}/channels/target/${id}`, { method: "DELETE", headers: { "x-user-email": userEmail } });
    success("Channel disconnected");
    await fetchChannels();
  };

  return (
    <>
      {apiDown && (
        <div className="flex items-center gap-3 bg-red-950/40 border border-red-800/50 rounded-xl px-4 py-3 mb-4 text-sm text-red-300">
          <span className="text-red-400">!</span>
          <span>
            Cannot reach the API at <code className="bg-red-900/40 px-1 rounded text-xs">{API}</code>.
            Start the backend: <code className="bg-red-900/40 px-1 rounded text-xs">python3 main.py</code> in <code className="bg-red-900/40 px-1 rounded text-xs">multiplier-api/</code>
          </span>
        </div>
      )}

      {/* Top bar */}
      <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h2 className="text-white font-semibold text-base">Target Channels</h2>
          <p className="text-[11px] text-[#555] mt-0.5">
            {channels.length} upload channel{channels.length !== 1 ? "s" : ""} connected
          </p>
        </div>
        <button
          onClick={handleConnect}
          disabled={connecting}
          className="flex items-center gap-2 bg-[#cc181e] hover:bg-[#b01419] text-white text-sm font-medium px-4 py-2.5 rounded-xl disabled:opacity-40 transition-colors shadow-lg shadow-[#cc181e33]"
        >
          {connecting ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Connecting...</>
          ) : (
            <><Youtube className="w-4 h-4" /> Connect YouTube Channel</>
          )}
        </button>
      </div>

      {/* Channel slots */}
      {channels.length === 0 ? (
        <EmptyState onConnect={handleConnect} />
      ) : (
        <>
          <div className="grid gap-3 mb-6">
            {channels.map((ch, i) => (
              <div
                key={ch.id}
                className="bg-[#111] border border-[#1C1C1C] hover:border-[#2A2A2A] rounded-2xl px-5 py-4 flex items-center gap-4 transition-colors"
              >
                <div className="relative">
                  <ChannelAvatar name={ch.channel_name} />
                  <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-emerald-500 border-2 border-[#111] flex items-center justify-center">
                    <CheckCircle className="w-2.5 h-2.5 text-white" />
                  </div>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-white font-medium text-sm">{ch.channel_name}</p>
                  </div>
                  {ch.channel_id && (
                    <p className="text-[11px] text-[#555] mt-0.5 truncate">{ch.channel_id}</p>
                  )}
                </div>

                <div className="text-right flex-shrink-0">
                  <p className="text-lg font-bold text-white">{ch.upload_count}</p>
                  <p className="text-[10px] text-[#444]">uploads</p>
                </div>

                <div className="flex items-center gap-1 text-[#444] flex-shrink-0">
                  <Upload className="w-3.5 h-3.5" />
                  <button
                    onClick={() => handleRemove(ch.id)}
                    className="text-[#333] hover:text-red-500 transition-colors p-1.5 rounded-lg hover:bg-red-500/10"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Add more channels */}
          <div
            onClick={handleConnect}
            className="bg-[#0D0D0D] border border-dashed border-[#1C1C1C] hover:border-[#333] rounded-2xl px-5 py-4 flex items-center gap-4 cursor-pointer transition-colors group mb-3"
          >
            <div className="w-11 h-11 rounded-full bg-[#161616] border border-dashed border-[#2A2A2A] flex items-center justify-center flex-shrink-0">
              <Plus className="w-4 h-4 text-[#333] group-hover:text-[#666] transition-colors" />
            </div>
            <p className="text-[#444] group-hover:text-[#666] text-sm transition-colors">
              Connect another channel
            </p>
          </div>
        </>
      )}

      {/* How it works — updated for OAuth flow */}
      <div className="mt-4 bg-[#0D0D0D] border border-[#1C1C1C] rounded-2xl p-5">
        <h3 className="text-[#777] text-xs font-semibold uppercase tracking-wider mb-3">How It Works</h3>
        <ol className="space-y-2 text-[12px] text-[#555]">
          <li className="flex gap-2">
            <span className="text-[#333] font-bold flex-shrink-0">1.</span>
            Click <span className="text-[#888]">&quot;Connect YouTube Channel&quot;</span> above
          </li>
          <li className="flex gap-2">
            <span className="text-[#333] font-bold flex-shrink-0">2.</span>
            Sign in with the Google account that owns the YouTube channel
          </li>
          <li className="flex gap-2">
            <span className="text-[#333] font-bold flex-shrink-0">3.</span>
            Grant upload permission — your channel is automatically connected
          </li>
          <li className="flex gap-2">
            <span className="text-[#333] font-bold flex-shrink-0">4.</span>
            Add as many channels as you want — each gets unique content variations
          </li>
        </ol>
      </div>
    </>
  );
}
