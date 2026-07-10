"use client";

import { useMemo, useState } from "react";
import { Card, DateRangePicker, ErrorBanner, Spinner } from "@/components/ui";
import { useCampaigns, defaultRange } from "@/lib/useCampaigns";
import {
  cprCls,
  fmt,
  fmtDate,
  getC,
  getCPR,
  getLeads,
  getVid,
  isActiveRunning,
} from "@/lib/metaCalc";

export default function CampaignsTab() {
  const [range, setRange] = useState(defaultRange());
  const { campaigns, loading, error } = useCampaigns(range);
  const [status, setStatus] = useState("all");
  const [type, setType] = useState("all");
  const [search, setSearch] = useState("");

  const types = useMemo(() => Array.from(new Set(campaigns.map((c) => c.type.l))), [campaigns]);

  const filtered = useMemo(() => {
    let list = campaigns;
    if (status === "ACTIVE") list = list.filter(isActiveRunning);
    if (status === "PAUSED") list = list.filter((c) => !isActiveRunning(c));
    if (type !== "all") list = list.filter((c) => c.type.l === type);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((c) => c.name.toLowerCase().includes(q));
    }
    return [...list].sort((a, b) => getCPR(a) - getCPR(b));
  }, [campaigns, status, type, search]);

  const acctAgg = campaigns.reduce(
    (a, c) => ({ sp: a.sp + (+c.spend! || 0), cv: a.cv + getC(c) }),
    { sp: 0, cv: 0 }
  );
  const avgCPR = acctAgg.cv > 0 ? acctAgg.sp / acctAgg.cv : 0;

  const summary = filtered.reduce(
    (a, c) => ({
      sp: a.sp + (+c.spend! || 0),
      im: a.im + (+c.impressions! || 0),
      cl: a.cl + (+c.clicks! || 0),
      cv: a.cv + getC(c),
      rc: a.rc + (+c.reach! || 0),
      leads: a.leads + getLeads(c),
    }),
    { sp: 0, im: 0, cl: 0, cv: 0, rc: 0, leads: 0 }
  );

  return (
    <div>
      <DateRangePicker since={range.since} until={range.until} onChange={(since, until) => setRange({ since, until })} />
      {error && <ErrorBanner message={error} />}

      <div className="mb-3 flex flex-wrap items-center gap-2.5">
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="rounded-md border border-border2 bg-card px-2.5 py-1.5 text-xs text-[#C8D5DF]"
        >
          <option value="all">All statuses</option>
          <option value="ACTIVE">Active &amp; spending</option>
          <option value="PAUSED">Paused / not spending</option>
        </select>
        <select
          value={type}
          onChange={(e) => setType(e.target.value)}
          className="rounded-md border border-border2 bg-card px-2.5 py-1.5 text-xs text-[#C8D5DF]"
        >
          <option value="all">All types</option>
          {types.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <input
          type="text"
          placeholder="Search…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="min-w-[140px] flex-1 rounded-md border border-border2 bg-card px-2.5 py-1.5 text-xs text-[#C8D5DF]"
        />
        <span className="ml-auto text-[11px] text-muted2">{filtered.length} campaigns</span>
      </div>

      {loading ? (
        <Spinner />
      ) : (
        <>
          <div className="mb-3 flex gap-0.5 overflow-x-auto rounded-card bg-card p-0.5">
            {[
              ["Campaigns", String(filtered.length)],
              ["Total spend", fmt(summary.sp, "$0")],
              ["Impressions", fmt(summary.im, "big")],
              ["Reach", fmt(summary.rc, "big")],
              ["Conversations", String(summary.cv)],
              ["Leads", summary.leads ? String(summary.leads) : "—"],
              ["Blended CTR", `${(summary.im > 0 ? (summary.cl / summary.im) * 100 : 0).toFixed(2)}%`],
              ["Blended CPR", summary.cv > 0 ? `$${(summary.sp / summary.cv).toFixed(2)}` : "—"],
            ].map(([label, value]) => (
              <div key={label} className="min-w-[100px] flex-1 rounded-lg p-2.5 px-3.5 text-center">
                <div className="mb-1 text-[10.5px] text-muted2">{label}</div>
                <div className="text-base font-bold text-text">{value}</div>
              </div>
            ))}
          </div>

          <Card className="overflow-x-auto">
            <table className="dt w-full">
              <thead>
                <tr>
                  <th>Campaign</th>
                  <th>Status</th>
                  <th>Content type</th>
                  <th>Objective</th>
                  <th>Started</th>
                  <th>Ended</th>
                  <th>Spend</th>
                  <th>Impressions</th>
                  <th>Clicks</th>
                  <th>CTR</th>
                  <th>CPM</th>
                  <th title="Spend ÷ clicks">CPC</th>
                  <th title="Flag if &gt;2.5">Freq</th>
                  <th>Reach</th>
                  <th>Convos</th>
                  <th title="Cost per conversation">CPR</th>
                  <th title="vs account average CPR">vs avg</th>
                  <th>Leads</th>
                  <th>Cost/Lead</th>
                  <th title="% watching past 25%">Hook%</th>
                  <th title="% finishing video">Comp%</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((a) => {
                  const cpr = getCPR(a);
                  const cv = getC(a);
                  const freq = +a.frequency! || 0;
                  const cl = +a.clicks! || 0;
                  const sp = +a.spend! || 0;
                  const cpc = cl > 0 ? sp / cl : 0;
                  const leads = getLeads(a);
                  const costPerLead = leads > 0 ? sp / leads : 0;
                  const p25 = getVid(a.video_p25_watched_actions);
                  const imp = +a.impressions! || 1;
                  const p100 = getVid(a.video_p100_watched_actions);
                  const hook = ((p25 / imp) * 100).toFixed(1);
                  const comp = p25 > 0 ? ((p100 / p25) * 100).toFixed(0) + "%" : "—";
                  const eff = avgCPR > 0 && cpr > 0 ? ((avgCPR - cpr) / avgCPR) * 100 : 0;
                  const running = isActiveRunning(a);
                  return (
                    <tr key={a.id}>
                      <td className="max-w-[240px] overflow-hidden text-ellipsis font-medium text-[#C8D5DF]" title={a.name}>
                        {a.name.length > 40 ? a.name.slice(0, 40) + "…" : a.name}
                      </td>
                      <td>
                        <span className={`pill ${running ? "p-a" : "p-p"}`}>{running ? "ACTIVE" : a.status}</span>
                      </td>
                      <td>
                        <span className={`pill ${a.type.c}`}>
                          {a.type.e} {a.type.l}
                        </span>
                      </td>
                      <td className="text-[10.5px] text-muted">{a.objective || "—"}</td>
                      <td className="text-[10.5px] text-muted">{fmtDate(a.startTime)}</td>
                      <td className="text-[10.5px] text-muted">{a.stopTime ? fmtDate(a.stopTime) : "Ongoing"}</td>
                      <td>${sp.toFixed(0)}</td>
                      <td>{fmt(+a.impressions!, "big")}</td>
                      <td>{fmt(cl, "big")}</td>
                      <td>{(+a.ctr! || 0).toFixed(2)}%</td>
                      <td>${(+a.cpm! || 0).toFixed(2)}</td>
                      <td>{cl > 0 ? `$${cpc.toFixed(2)}` : "—"}</td>
                      <td className={freq > 2.5 ? "text-danger2" : ""}>{freq.toFixed(2)}</td>
                      <td>{fmt(+a.reach!, "big")}</td>
                      <td>{cv}</td>
                      <td className={cprCls(cpr)}>${cpr.toFixed(3)}</td>
                      <td className={cpr > 0 ? (eff > 0 ? "text-accent" : "text-danger2") : ""}>
                        {cpr > 0 ? `${eff > 0 ? "+" : ""}${eff.toFixed(0)}%` : "—"}
                      </td>
                      <td>{leads || "—"}</td>
                      <td>{leads > 0 ? `$${costPerLead.toFixed(2)}` : "—"}</td>
                      <td>{hook}%</td>
                      <td>{comp}</td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={20} className="py-5 text-center text-muted2">
                      No campaigns match filters
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </Card>
        </>
      )}
    </div>
  );
}
