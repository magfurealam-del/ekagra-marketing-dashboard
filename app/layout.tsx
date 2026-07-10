import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Ekagra Health — Marketing Intelligence",
  description: "Ads and Page performance dashboard for Ekagra Health",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="sticky top-0 z-50 flex items-center justify-between gap-2 border-b border-border bg-bg px-5 py-2.5">
          <div className="flex items-center gap-2.5">
            <svg width="26" height="26" viewBox="0 0 26 26">
              <rect width="26" height="26" rx="5" fill="#1D9E75" />
              <text y="18" x="5" fontSize="13" fill="white" fontFamily="sans-serif" fontWeight="bold">
                EH
              </text>
            </svg>
            <h1 className="text-[15px] font-semibold">Ekagra Health — Marketing Intelligence</h1>
            <span className="live-dot rounded-full bg-accentDark px-2 py-0.5 text-[10px] font-bold text-white">
              ● LIVE
            </span>
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}
