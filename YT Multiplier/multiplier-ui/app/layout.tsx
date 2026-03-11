import type { Metadata } from "next";
import "./globals.css";
import { ToastProvider } from "./components/ui/Toast";
import Providers from "./providers";

export const metadata: Metadata = {
  title: "Shorts Multiplier",
  description: "Multiply your YouTube Shorts reach",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="bg-[#0A0A0A] text-white antialiased">
        <Providers>
          <ToastProvider>{children}</ToastProvider>
        </Providers>
      </body>
    </html>
  );
}
