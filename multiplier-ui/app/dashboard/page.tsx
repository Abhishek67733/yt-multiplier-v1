"use client";
import { useState } from "react";
import { ProfileDropdown } from "../components/ui/profile-dropdown";
import { Youtube, UploadCloud, Settings, Flame, Radio, ChevronLeft, ChevronRight, X, Menu } from "lucide-react";

import SourceChannelsPage from "../components/SourceChannelsPage";
import TargetChannelsPage from "../components/TargetChannelsPage";
import MultiplierRoomPage from "../components/MultiplierRoomPage";
import UploadQueuePage from "../components/UploadQueuePage";

const NAV = [
  { id: "source",     label: "Source Channels",  sublabel: "Monitor & scrape",        icon: Youtube    },
  { id: "multiplier", label: "Multiplier Room",   sublabel: "Viral Shorts + AI Titles", icon: Flame      },
  { id: "targets",    label: "Target Channels",   sublabel: "Upload destinations",      icon: Settings   },
  { id: "queue",      label: "Upload Queue",      sublabel: "Jobs & campaigns",         icon: UploadCloud },
];

export default function Home() {
  const [activeTab, setActiveTab] = useState("source");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="relative flex h-screen overflow-hidden bg-[#0A0A0A]">

      {/* ─── DESKTOP Sidebar ─── */}
      <aside
        className="hidden md:flex flex-shrink-0 flex-col transition-all duration-300"
        style={{
          backgroundColor: "#cc181e",
          width: sidebarOpen ? "232px" : "56px",
          borderRight: "1px solid rgba(204,24,30,0.3)",
        }}
      >
        {/* Header */}
        <div
          className="flex-shrink-0 flex items-center border-b border-white/10 overflow-hidden"
          style={{
            height: "60px",
            background: "linear-gradient(to bottom, #3a3a3a, #1e1e1e)",
            borderBottom: "1px solid #444",
            boxShadow: "0 1px 0 rgba(255,255,255,0.08) inset, 0 2px 8px rgba(0,0,0,0.4)",
            justifyContent: sidebarOpen ? "flex-start" : "center",
            padding: sidebarOpen ? "0 16px" : "0",
          }}
        >
          {sidebarOpen ? (
            <div className="text-center w-full">
              <p className="text-[15px] font-black text-white tracking-tight leading-tight whitespace-nowrap">
                Youtube Multiplier
              </p>
              <p className="text-[9px] text-white/40 mt-0.5 whitespace-nowrap">
                Monitor · Multiply · Dominate
              </p>
            </div>
          ) : (
            <span className="text-[11px] font-black text-white/60">YM</span>
          )}
        </div>

        {/* Nav items */}
        <nav className="flex-1 px-2 py-4 space-y-1 overflow-y-auto overflow-x-hidden">
          {NAV.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                title={!sidebarOpen ? item.label : undefined}
                className={`w-full flex items-center rounded-xl text-left transition-all group border ${
                  sidebarOpen ? "gap-3 px-3 py-2.5" : "justify-center px-0 py-2.5"
                } ${isActive ? "border-black/20" : "border-transparent hover:bg-black/10"}`}
                style={isActive ? { backgroundColor: "#1a1a1a" } : undefined}
              >
                <div
                  className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors ${
                    !isActive && "bg-white/10 group-hover:bg-white/15"
                  }`}
                  style={isActive ? { backgroundColor: "#2a2a2a" } : undefined}
                >
                  <Icon className="w-4 h-4 text-white" />
                </div>
                {sidebarOpen && (
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-semibold text-white truncate">{item.label}</p>
                    <p className="text-[10px] text-white/50 truncate">{item.sublabel}</p>
                  </div>
                )}
                {sidebarOpen && isActive && (
                  <div className="ml-auto w-1 h-4 rounded-full bg-white flex-shrink-0" />
                )}
              </button>
            );
          })}
        </nav>

        {/* Toggle */}
        <div className="flex-shrink-0 px-2 pb-3 pt-1 border-t border-white/10">
          {sidebarOpen && (
            <div className="flex items-center gap-2 px-1 pb-2">
              <Radio className="w-3 h-3 text-white/60 animate-pulse flex-shrink-0" />
              <span className="text-[10px] text-white/40 whitespace-nowrap">Auto-scan every 6h</span>
            </div>
          )}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className={`w-full flex items-center rounded-xl border border-white/10 bg-black/20 hover:bg-black/30 transition-colors py-2 ${
              sidebarOpen ? "gap-2 px-3 justify-start" : "justify-center px-0"
            }`}
          >
            {sidebarOpen
              ? <><ChevronLeft className="w-3.5 h-3.5 text-white/70" /><span className="text-[11px] text-white/60">Collapse</span></>
              : <ChevronRight className="w-3.5 h-3.5 text-white/70" />
            }
          </button>
        </div>
      </aside>

      {/* ─── MOBILE Drawer overlay ─── */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setMobileMenuOpen(false)}
          />
          {/* Drawer */}
          <aside
            className="absolute left-0 top-0 h-full w-64 flex flex-col"
            style={{ backgroundColor: "#cc181e" }}
          >
            {/* Header */}
            <div
              className="flex-shrink-0 flex items-center justify-between px-4"
              style={{
                height: "60px",
                background: "linear-gradient(to bottom, #3a3a3a, #1e1e1e)",
                borderBottom: "1px solid #444",
              }}
            >
              <div>
                <p className="text-[15px] font-black text-white tracking-tight leading-tight">Youtube Multiplier</p>
                <p className="text-[9px] text-white/40 mt-0.5">Monitor · Multiply · Dominate</p>
              </div>
              <button onClick={() => setMobileMenuOpen(false)} className="text-white/60 hover:text-white p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Nav */}
            <nav className="flex-1 px-2 py-4 space-y-1 overflow-y-auto">
              {NAV.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => { setActiveTab(item.id); setMobileMenuOpen(false); }}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all border ${
                      isActive ? "border-black/20" : "border-transparent hover:bg-black/10"
                    }`}
                    style={isActive ? { backgroundColor: "#1a1a1a" } : undefined}
                  >
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${!isActive && "bg-white/10"}`}
                      style={isActive ? { backgroundColor: "#2a2a2a" } : undefined}
                    >
                      <Icon className="w-4 h-4 text-white" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-semibold text-white truncate">{item.label}</p>
                      <p className="text-[10px] text-white/50 truncate">{item.sublabel}</p>
                    </div>
                    {isActive && <div className="ml-auto w-1 h-4 rounded-full bg-white flex-shrink-0" />}
                  </button>
                );
              })}
            </nav>

            <div className="flex-shrink-0 px-3 pb-4 border-t border-white/10 pt-3">
              <div className="flex items-center gap-2">
                <Radio className="w-3 h-3 text-white/60 animate-pulse" />
                <span className="text-[10px] text-white/40">Auto-scan every 6h</span>
              </div>
            </div>
          </aside>
        </div>
      )}

      {/* ─── Main content ─── */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Top bar */}
        <div
          className="flex-shrink-0 flex items-center justify-between px-4 md:px-6"
          style={{ height: "60px", borderBottom: "1px solid #1a1a1a" }}
        >
          {/* Mobile: hamburger + title */}
          <div className="flex items-center gap-3 md:hidden">
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="p-1.5 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors"
            >
              <Menu className="w-5 h-5" />
            </button>
            <span className="text-[14px] font-black text-white tracking-tight">
              {NAV.find(n => n.id === activeTab)?.label ?? "Dashboard"}
            </span>
          </div>
          {/* Desktop: spacer */}
          <div className="hidden md:block" />
          <ProfileDropdown />
        </div>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-3 md:p-6">
          <div className="animate-fade-in">
            {activeTab === "source"     && <SourceChannelsPage />}
            {activeTab === "multiplier" && <MultiplierRoomPage />}
            {activeTab === "targets"    && <TargetChannelsPage />}
            {activeTab === "queue"      && <UploadQueuePage />}
          </div>
        </main>

        {/* ─── MOBILE Bottom Nav ─── */}
        <nav
          className="md:hidden flex-shrink-0 flex items-center justify-around border-t px-2 py-2"
          style={{ borderColor: "#1a1a1a", backgroundColor: "#0A0A0A" }}
        >
          {NAV.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className="flex flex-col items-center gap-1 px-3 py-1.5 rounded-xl transition-all"
                style={isActive ? { backgroundColor: "#1a1a1a" } : undefined}
              >
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: isActive ? "#cc181e" : "transparent" }}
                >
                  <Icon className="w-4 h-4 text-white" style={{ opacity: isActive ? 1 : 0.4 }} />
                </div>
                <span
                  className="text-[9px] font-semibold whitespace-nowrap"
                  style={{ color: isActive ? "#fff" : "rgba(255,255,255,0.4)" }}
                >
                  {item.label.split(" ")[0]}
                </span>
              </button>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
