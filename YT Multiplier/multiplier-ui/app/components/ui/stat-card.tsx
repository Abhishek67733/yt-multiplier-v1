"use client";

import { motion } from "framer-motion";
import { cn } from "../../../lib/utils";

interface StatCardProps {
  value: string | number;
  label: string;
  sub?: string;
  className?: string;
  variant?: "dark" | "grey";
}

export default function StatCard({ value, label, sub, className, variant = "dark" }: StatCardProps) {
  const isGrey = variant === "grey";
  return (
    <div
      className={cn(
        "relative rounded-2xl overflow-hidden h-[140px]",
        isGrey
          ? "bg-gradient-to-b from-[#2a2a2a] to-[#161616] border border-[#3a3a3a]"
          : "bg-[#111] border border-white/[0.06]",
        className
      )}
      style={undefined}
    >
      {/* Moving glow */}
      {!isGrey && (
        <motion.div
          className="absolute w-24 h-24 rounded-full blur-2xl pointer-events-none bg-white/[0.04]"
          animate={{
            top: ["20%", "20%", "60%", "60%", "20%"],
            left: ["15%", "70%", "70%", "15%", "15%"],
          }}
          transition={{ duration: 12, repeat: Infinity, ease: "linear" }}
        />
      )}

      {/* Inner content */}
      <div className="relative flex flex-col items-start justify-center w-full h-full px-5 py-4">
        {/* Label */}
        <div className={cn(
          "text-[11px] font-semibold uppercase tracking-widest mb-2",
          isGrey ? "text-[#aaa]" : "text-neutral-500"
        )}>
          {label}
        </div>

        {/* Value */}
        <motion.div
          className={cn(
            "text-4xl font-extrabold tabular-nums",
            isGrey ? "text-white" : "text-white"
          )}
          style={undefined}
          animate={{ opacity: [0.9, 1, 0.9] }}
          transition={{ duration: 4, repeat: Infinity }}
        >
          {value}
        </motion.div>

        {/* Sub label */}
        {sub && (
          <div className={cn(
            "mt-1.5 text-[11px]",
            isGrey ? "text-[#999]" : "text-neutral-600"
          )}>
            {sub}
          </div>
        )}
      </div>

    </div>
  );
}
