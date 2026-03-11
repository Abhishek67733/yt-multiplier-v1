"use client";

import { signIn } from "next-auth/react";
import { useSearchParams, useRouter } from "next/navigation";
import { Suspense } from "react";
import { BackgroundPaths } from "../components/ui/background-paths";
import { X } from "lucide-react";

function LoginContent() {
  const params = useSearchParams();
  const router = useRouter();
  const error = params.get("error");

  return (
    <BackgroundPaths>
      <div className="min-h-screen bg-[#0A0A0A] flex flex-col items-center justify-center relative overflow-hidden">
        {/* Glass card */}
        <div className="relative z-10 w-full max-w-sm rounded-3xl bg-gradient-to-b from-[#ffffff08] to-[#0f0f0f] backdrop-blur-sm shadow-2xl p-8 flex flex-col items-center border border-white/[0.06]">
          {/* Close / Back button */}
          <button
            onClick={() => router.push("/")}
            className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full text-white/40 hover:text-white hover:bg-white/10 transition-all"
            aria-label="Back"
          >
            <X className="w-4 h-4" />
          </button>

          {/* Logo */}
          <div
            className="flex items-center justify-center w-12 h-12 rounded-2xl mb-4 shadow-lg"
            style={{ backgroundColor: "#cc181e" }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="white">
              <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
            </svg>
          </div>

          {/* Title */}
          <h2 className="text-[20px] font-black text-white mb-1 text-center tracking-tight" style={{ fontFamily: "var(--font-syne), sans-serif" }}>
            Youtube Multiplier
          </h2>
          <p className="text-[11px] text-white/30 mb-6 text-center">Monitor · Multiply · Dominate</p>

          {/* Error */}
          {error && (
            <div className="w-full bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-[12px] text-red-400 text-center mb-4">
              {error === "AccessDenied"
                ? "Your email is not on the approved list."
                : "Sign in failed. Try again."}
            </div>
          )}

          {/* Sign in */}
          <div className="flex flex-col w-full gap-3">
            <hr className="border-white/5" />

            {/* Google Sign In */}
            <button
              onClick={() => signIn("google", { callbackUrl: "/dashboard" })}
              className="w-full flex items-center justify-center gap-2.5 rounded-xl px-5 py-3 font-semibold text-white text-[14px] transition-all hover:opacity-90 hover:scale-[1.01] active:scale-[0.99]"
              style={{
                background: "linear-gradient(to bottom, #232526, #2d2e30)",
                border: "1px solid rgba(255,255,255,0.08)",
              }}
            >
              <svg width="18" height="18" viewBox="0 0 18 18">
                <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"/>
                <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z"/>
                <path fill="#FBBC05" d="M3.964 10.707c-.18-.54-.282-1.117-.282-1.707s.102-1.167.282-1.707V4.961H.957C.347 6.175 0 7.55 0 9s.348 2.826.957 4.039l3.007-2.332z"/>
                <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.961L3.964 7.293C4.672 5.166 6.656 3.58 9 3.58z"/>
              </svg>
              Continue with Google
            </button>

            <p className="text-center text-[11px] text-[#444] mt-1">
              Only approved email addresses can access this tool
            </p>
          </div>
        </div>
      </div>
    </BackgroundPaths>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginContent />
    </Suspense>
  );
}
