"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MoveRight } from "lucide-react";
import Link from "next/link";
import { BackgroundPaths } from "./background-paths";
import { ShimmerButton } from "./shimmer-button";

function Hero() {
  const [titleNumber, setTitleNumber] = useState(0);
  const titles = useMemo(() => ["Monitor", "Multiply", "Dominate"], []);

  useEffect(() => {
    const interval = setInterval(() => {
      setTitleNumber((prev) => (prev + 1) % titles.length);
    }, 2200);
    return () => clearInterval(interval);
  }, [titles.length]);

  return (
    <BackgroundPaths>
      <div className="w-full h-screen">
        <div className="container mx-auto h-full">
          <div className="flex gap-8 h-full items-center justify-center flex-col">
            {/* Heading */}
            <motion.div
              className="flex gap-4 flex-col"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.1 }}
            >
              <h1 className="text-4xl sm:text-5xl md:text-7xl max-w-2xl tracking-tighter text-center font-black text-white leading-tight px-4 md:px-0">
                <span className="block">Youtube Multiplier</span>
                <span
                  className="relative block overflow-hidden"
                  style={{ height: "1.15em" }}
                >
                  <AnimatePresence mode="popLayout" initial={false}>
                    <motion.span
                      key={titleNumber}
                      className="absolute inset-0 flex items-center justify-center font-black"
                      style={{ color: "#cc181e" }}
                      initial={{ y: "100%", opacity: 0 }}
                      animate={{ y: "0%", opacity: 1 }}
                      exit={{ y: "-100%", opacity: 0 }}
                      transition={{
                        duration: 0.55,
                        ease: [0.25, 0.46, 0.45, 0.94],
                      }}
                    >
                      {titles[titleNumber]}
                    </motion.span>
                  </AnimatePresence>
                </span>
              </h1>

              <p className="text-base md:text-xl leading-relaxed tracking-tight text-[#666] max-w-2xl text-center px-6 md:px-0">
                Everything you need to scale your social handles.
              </p>
            </motion.div>

            {/* CTA */}
            <motion.div
              className="flex flex-row gap-3"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.3 }}
            >
              <Link href="/login">
                <ShimmerButton
                  background="rgba(204,24,30,1)"
                  shimmerColor="#ffaaaa"
                  shimmerDuration="2.5s"
                  className="px-8 py-4 text-[15px] font-bold shadow-[0_0_40px_rgba(204,24,30,0.4)]"
                >
                  <span className="flex items-center gap-2">
                    Get Started
                    <MoveRight className="w-4 h-4" />
                  </span>
                </ShimmerButton>
              </Link>
            </motion.div>
          </div>
        </div>
      </div>
    </BackgroundPaths>
  );
}

export { Hero };
