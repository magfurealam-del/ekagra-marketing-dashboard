"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

export interface TabDef {
  id: string;
  label: string;
  emoji: string;
}

export const TABS: TabDef[] = [
  { id: "overview", label: "Overview", emoji: "📊" },
  { id: "campaigns", label: "Campaigns", emoji: "📋" },
  { id: "video", label: "Video", emoji: "🎬" },
  { id: "audience", label: "Audience", emoji: "🎯" },
  { id: "fatigue", label: "Fatigue", emoji: "⚡" },
  { id: "intelligence", label: "Intelligence", emoji: "🧠" },
  { id: "page-insights", label: "Page Insights", emoji: "📘" },
];

export function useActiveTab(): string {
  const sp = useSearchParams();
  const tab = sp.get("tab");
  return TABS.some((t) => t.id === tab) ? (tab as string) : "overview";
}

export default function Tabs() {
  const router = useRouter();
  const active = useActiveTab();

  const setTab = useCallback(
    (id: string) => {
      const url = new URL(window.location.href);
      url.searchParams.set("tab", id);
      router.push(url.pathname + url.search, { scroll: false });
    },
    [router]
  );

  return (
    <nav className="flex gap-0.5 overflow-x-auto border-b border-border bg-bg px-5">
      {TABS.map((t) => (
        <button
          key={t.id}
          onClick={() => setTab(t.id)}
          className={`flex-shrink-0 whitespace-nowrap border-b-2 px-4 py-3 text-[12.5px] font-medium transition-colors ${
            active === t.id
              ? "border-accent text-accent"
              : "border-transparent text-muted2 hover:text-text"
          }`}
        >
          {t.emoji} {t.label}
        </button>
      ))}
    </nav>
  );
}
