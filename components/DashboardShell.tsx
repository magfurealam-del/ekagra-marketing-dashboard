"use client";

import { useEffect, useState } from "react";
import LockScreen from "@/components/LockScreen";
import Tabs, { useActiveTab } from "@/components/Tabs";
import { getSessionStatus } from "@/lib/api";
import OverviewTab from "@/components/tabs/OverviewTab";
import CampaignsTab from "@/components/tabs/CampaignsTab";
import VideoTab from "@/components/tabs/VideoTab";
import AudienceTab from "@/components/tabs/AudienceTab";
import FatigueTab from "@/components/tabs/FatigueTab";
import IntelligenceTab from "@/components/tabs/IntelligenceTab";
import PageInsightsTab from "@/components/tabs/PageInsightsTab";

type SessionState = "loading" | "locked" | "unlocked";

export default function DashboardShell() {
  const [state, setState] = useState<SessionState>("loading");
  const [hasPage, setHasPage] = useState(false);
  const activeTab = useActiveTab();

  useEffect(() => {
    getSessionStatus()
      .then((s) => {
        setHasPage(s.hasPage);
        setState(s.connected ? "unlocked" : "locked");
      })
      .catch(() => setState("locked"));
  }, []);

  if (state === "loading") {
    return <div className="p-6 text-sm text-muted">Loading…</div>;
  }

  if (state === "locked") {
    return (
      <LockScreen
        onConnected={() => {
          getSessionStatus()
            .then((s) => setHasPage(s.hasPage))
            .catch(() => setHasPage(false));
          setState("unlocked");
        }}
      />
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between border-b border-border bg-bg px-5">
        <Tabs />
        <button
          onClick={async () => {
            await fetch("/api/session", { method: "DELETE" });
            setHasPage(false);
            setState("locked");
          }}
          title="Change credentials"
          className="hbtn my-1.5 flex-shrink-0 rounded-md border border-border2 bg-card px-3 py-1.5 text-xs font-semibold text-[#C8D5DF] hover:bg-[#253545]"
        >
          ⚙ Change credentials
        </button>
      </div>
      <main className="mx-auto max-w-[1400px] p-5 pb-16">
        {activeTab === "overview" && <OverviewTab />}
        {activeTab === "campaigns" && <CampaignsTab />}
        {activeTab === "video" && <VideoTab />}
        {activeTab === "audience" && <AudienceTab />}
        {activeTab === "fatigue" && <FatigueTab />}
        {activeTab === "intelligence" && <IntelligenceTab />}
        {activeTab === "page-insights" && <PageInsightsTab hasPage={hasPage} />}
      </main>
    </div>
  );
}
