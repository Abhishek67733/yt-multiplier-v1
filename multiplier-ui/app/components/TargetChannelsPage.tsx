"use client";
import { useState, useEffect, useCallback } from "react";
import { Plus, Trash2, Upload, CheckCircle, AlertCircle, Settings } from "lucide-react";
import { Modal } from "./ui/Modal";
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

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="w-16 h-16 rounded-2xl bg-[#161616] border border-[#2A2A2A] flex items-center justify-center mb-4">
        <Settings className="w-8 h-8 text-[#333]" />
      </div>
      <h3 className="text-white font-semibold mb-1">No target channels yet</h3>
      <p className="text-sm text-[#555] mb-5 max-w-xs">
        Connect your upload channels via Google OAuth. Viral Shorts will be uploaded here.
      </p>
      <button
        onClick={onAdd}
        className="flex items-center gap-2 bg-[#cc181e] hover:bg-[#b01419] text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-colors"
      >
        <Plus className="w-4 h-4" /> Connect First Channel
      </button>
    </div>
  );
}

export default function TargetChannelsPage() {
  const { success, error } = useToast();
  const [channels, setChannels] = useState<TargetChannel[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [apiDown, setApiDown] = useState(false);

  // Form state
  const [channelName, setChannelName] = useState("");
  const [oauthJson, setOauthJson] = useState("");
  const [jsonError, setJsonError] = useState("");
  const [adding, setAdding] = useState(false);

  const fetch_ = useCallback(async () => {
    try {
      const res = await fetch(`${API}/channels/target`);
      const data = await res.json();
      setChannels(Array.isArray(data) ? data : []);
      setApiDown(false);
    } catch {
      setApiDown(true);
    }
  }, []);

  useEffect(() => { fetch_(); }, [fetch_]);

  const resetForm = () => {
    setChannelName("");
    setOauthJson("");
    setJsonError("");
  };

  const handleAdd = async () => {
    if (!channelName.trim() || !oauthJson.trim()) return;
    let parsed: object;
    try {
      parsed = JSON.parse(oauthJson);
      setJsonError("");
    } catch {
      setJsonError("Invalid JSON — paste the full OAuth credentials object");
      return;
    }

    setAdding(true);
    try {
      const res = await fetch(`${API}/channels/target`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel_name: channelName.trim(), oauth_credentials: parsed }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.detail || "Failed");
      }
      resetForm();
      setModalOpen(false);
      success("Target channel connected");
      await fetch_();
    } catch (e: any) {
      error(e.message);
    } finally {
      setAdding(false);
    }
  };

  const handleRemove = async (id: number) => {
    await fetch(`${API}/channels/target/${id}`, { method: "DELETE" });
    success("Channel removed");
    await fetch_();
  };

  return (
    <>
      {apiDown && (
        <div className="flex items-center gap-3 bg-red-950/40 border border-red-800/50 rounded-xl px-4 py-3 mb-4 text-sm text-red-300">
          <span className="text-red-400">⚠</span>
          <span>
            Cannot reach the API at <code className="bg-red-900/40 px-1 rounded text-xs">{API}</code>.
            Start the backend: <code className="bg-red-900/40 px-1 rounded text-xs">python3 main.py</code> in <code className="bg-red-900/40 px-1 rounded text-xs">multiplier-api/</code>
          </span>
        </div>
      )}

      {/* ── Top bar ── */}
      <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h2 className="text-white font-semibold text-base">Target Channels</h2>
          <p className="text-[11px] text-[#555] mt-0.5">
            {channels.length} / 5 upload channels connected
          </p>
        </div>
        <button
          onClick={() => { resetForm(); setModalOpen(true); }}
          disabled={channels.length >= 5}
          className="flex items-center gap-2 bg-[#cc181e] hover:bg-[#b01419] text-white text-sm font-medium px-4 py-2.5 rounded-xl disabled:opacity-40 transition-colors shadow-lg shadow-[#cc181e33]"
        >
          <Plus className="w-4 h-4" /> Connect Channel
        </button>
      </div>

      {/* ── Channel slots ── */}
      {channels.length === 0 ? (
        <EmptyState onAdd={() => setModalOpen(true)} />
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
                    <span className="text-[10px] text-[#444] bg-[#1C1C1C] px-2 py-0.5 rounded-full">
                      Slot {i + 1}
                    </span>
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

          {/* Empty slots */}
          {Array.from({ length: Math.max(0, 5 - channels.length) }, (_, i) => (
            <div
              key={`empty-${i}`}
              onClick={() => setModalOpen(true)}
              className="bg-[#0D0D0D] border border-dashed border-[#1C1C1C] hover:border-[#333] rounded-2xl px-5 py-4 flex items-center gap-4 cursor-pointer transition-colors group mb-3"
            >
              <div className="w-11 h-11 rounded-full bg-[#161616] border border-dashed border-[#2A2A2A] flex items-center justify-center flex-shrink-0">
                <Plus className="w-4 h-4 text-[#333] group-hover:text-[#666] transition-colors" />
              </div>
              <p className="text-[#444] group-hover:text-[#666] text-sm transition-colors">
                Connect channel {channels.length + i + 1}
              </p>
            </div>
          ))}
        </>
      )}

      {/* ── How it works ── */}
      <div className="mt-4 bg-[#0D0D0D] border border-[#1C1C1C] rounded-2xl p-5">
        <h3 className="text-[#777] text-xs font-semibold uppercase tracking-wider mb-3">How OAuth Setup Works</h3>
        <ol className="space-y-2 text-[12px] text-[#555]">
          <li className="flex gap-2">
            <span className="text-[#333] font-bold flex-shrink-0">1.</span>
            Go to <span className="text-[#888]">Google Cloud Console → APIs → YouTube Data API v3</span>
          </li>
          <li className="flex gap-2">
            <span className="text-[#333] font-bold flex-shrink-0">2.</span>
            Create OAuth 2.0 credentials → Download JSON
          </li>
          <li className="flex gap-2">
            <span className="text-[#333] font-bold flex-shrink-0">3.</span>
            Run <code className="bg-[#161616] px-1.5 py-0.5 rounded text-[#aaa]">python oauth_helper.py</code> from multiplier-api/ to get a token
          </li>
          <li className="flex gap-2">
            <span className="text-[#333] font-bold flex-shrink-0">4.</span>
            Paste the resulting JSON token here
          </li>
        </ol>
      </div>

      {/* ── Add Modal ── */}
      <Modal
        open={modalOpen}
        onClose={() => { setModalOpen(false); resetForm(); }}
        title="Connect Target Channel"
        width="max-w-xl"
      >
        <div className="space-y-4">
          {/* Channel name */}
          <div>
            <label className="block text-xs text-[#777] mb-1.5 font-medium uppercase tracking-wide">
              Channel Name
            </label>
            <input
              autoFocus
              className="w-full bg-[#0D0D0D] border border-[#2A2A2A] focus:border-violet-500 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-[#444] outline-none transition-colors"
              placeholder="My Upload Channel"
              value={channelName}
              onChange={(e) => setChannelName(e.target.value)}
            />
          </div>

          {/* OAuth JSON */}
          <div>
            <label className="block text-xs text-[#777] mb-1.5 font-medium uppercase tracking-wide">
              OAuth Credentials JSON
            </label>
            <textarea
              className="w-full bg-[#0D0D0D] border border-[#2A2A2A] focus:border-violet-500 rounded-xl px-4 py-3 text-sm text-white placeholder:text-[#444] outline-none transition-colors font-mono resize-none"
              placeholder={`{\n  "token": "ya29...",\n  "refresh_token": "1//...",\n  "token_uri": "https://oauth2.googleapis.com/token",\n  "client_id": "...",\n  "client_secret": "..."\n}`}
              rows={8}
              value={oauthJson}
              onChange={(e) => { setOauthJson(e.target.value); setJsonError(""); }}
            />
            {jsonError && (
              <div className="flex items-center gap-1.5 mt-1.5 text-red-400 text-[11px]">
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                {jsonError}
              </div>
            )}
          </div>

          <div className="bg-violet-950/30 border border-violet-800/30 rounded-xl p-3 text-[11px] text-violet-300/70">
            <p className="font-medium text-violet-300 mb-0.5">Required fields:</p>
            <p>token, refresh_token, token_uri, client_id, client_secret</p>
          </div>

          <div className="flex gap-2 pt-1">
            <button
              onClick={() => { setModalOpen(false); resetForm(); }}
              className="flex-1 py-2.5 rounded-xl border border-[#2A2A2A] text-[#777] hover:text-white text-sm transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleAdd}
              disabled={adding || !channelName.trim() || !oauthJson.trim()}
              className="flex-1 py-2.5 rounded-xl bg-[#cc181e] hover:bg-[#b01419] text-white text-sm font-medium disabled:opacity-40 transition-colors"
            >
              {adding ? "Connecting…" : "Connect Channel"}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
