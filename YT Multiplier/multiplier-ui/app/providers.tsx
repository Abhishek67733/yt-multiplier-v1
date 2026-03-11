"use client";
import { useEffect } from "react";
import { SessionProvider, useSession } from "next-auth/react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8001";

function IdentifyUser() {
  const { data: session, status } = useSession();
  useEffect(() => {
    if (status === "authenticated" && session?.user?.email) {
      fetch(`${API}/auth/identify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: session.user.email,
          name: session.user.name || undefined,
          avatar_url: session.user.image || undefined,
        }),
      }).catch(() => {});
    }
  }, [session, status]);
  return null;
}

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <IdentifyUser />
      {children}
    </SessionProvider>
  );
}
