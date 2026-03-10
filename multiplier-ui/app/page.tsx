"use client";
import { useState } from "react";
import { Youtube, UploadCloud, TrendingUp, Settings, Zap, Radio, Flame } from "lucide-react";
import SourceChannelsPage from "./components/SourceChannelsPage";
import TargetChannelsPage from "./components/TargetChannelsPage";
import MultiplierRoomPage from "./components/MultiplierRoomPage";
import UploadQueuePage from "./components/UploadQueuePage";
import ReachStatsPage from "./components/ReachStatsPage";
import AnimatedLogo from "./components/ui/AnimatedLogo";

const NAV = [
  {
    id: "source",
    label: "Source Channels",
    sublabel: "Monitor & scrape",
    icon: Youtube,
    color: "text-red-400",
  },
  {
    id: "multiplier",
    label: "Multiplier Room",
    sublabel: "Viral Shorts + AI Titles",
    icon: Flame,
    color: "text-orange-400",
  },
  {
    id: "targets",
    label: "Target Channels",
    sublabel: "Upload destinations",
    icon: Settings,
    color: "text-violet-400",
  },
  {
    id: "queue",
    label: "Upload Queue",
    sublabel: "Jobs & campaigns",
    icon: UploadCloud,
    color: "text-sky-400",
  },
  {
    id: "reach",
    label: "Reach Stats",
    sublabel: "Multiplier dashboard",
    icon: TrendingUp,
    color: "text-emerald-400",
  },
];

export default function Home() {
  const [activeTab, setActiveTab] = useState("source");
  const active = NAV.find((n) => n.id === activeTab)!;

  return (
    <div className="flex h-screen overflow-hidden bg-[#0A0A0A]">
      {/* Sidebar */}
      <aside className="w-60 flex-shrink-0 flex flex-col border-r border-[#1C1C1C] bg-[#0D0D0D]">
        {/* Logo */}
        <div className="px-3 py-4 border-b border-[#1C1C1C]">
          <AnimatedLogo />
          <p className="text-[10px] text-[#444] mt-1 leading-tight text-center">
            Monitor · Multiply · Dominate
          </p>
        </div>

        {/* Nav items */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {NAV.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all group ${
                  isActive
                    ? "bg-white/5 border border-white/8"
                    : "hover:bg-white/3 border border-transparent"
                }`}
              >
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors ${
                  isActive ? "bg-white/8" : "bg-white/4 group-hover:bg-white/6"
                }`}>
                  <Icon className={`w-4 h-4 ${isActive ? item.color : "text-[#555]"}`} />
                </div>
                <div className="min-w-0">
                  <p className={`text-[13px] font-medium truncate ${isActive ? "text-white" : "text-[#777] group-hover:text-[#aaa]"}`}>
                    {item.label}
                  </p>
                  <p className="text-[10px] text-[#444] truncate">{item.sublabel}</p>
                </div>
                {isActive && (
                  <div className="ml-auto w-1 h-4 rounded-full bg-red-500 flex-shrink-0" />
                )}
              </button>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-[#1C1C1C]">
          <div className="flex items-center gap-2">
            <Radio className="w-3 h-3 text-emerald-400 animate-pulse" />
            <span className="text-[10px] text-[#444]">Auto-scan every 6h (trending)</span>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <header className="flex-shrink-0 h-14 border-b border-[#1C1C1C] bg-[#0D0D0D] flex items-center px-6 gap-4">
          <div className="flex items-center gap-2.5">
            {(() => { const Icon = active.icon; return <Icon className={`w-4 h-4 ${active.color}`} />; })()}
            <h1 className="text-sm font-semibold text-white">{active.label}</h1>
          </div>
          <span className="text-[#333]">·</span>
          <p className="text-xs text-[#555]">{active.sublabel}</p>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-6">
          <div className="animate-fade-in">
            {activeTab === "source"     && <SourceChannelsPage />}
            {activeTab === "multiplier" && <MultiplierRoomPage />}
            {activeTab === "targets"    && <TargetChannelsPage />}
            {activeTab === "queue"      && <UploadQueuePage />}
            {activeTab === "reach"      && <ReachStatsPage />}
          </div>
        </main>
      </div>
    </div>
  );
}
