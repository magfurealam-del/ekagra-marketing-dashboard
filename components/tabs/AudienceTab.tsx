"use client";

import { useEffect, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { Card, DateRangePicker, ErrorBanner, Spinner } from "@/components/ui";
import { metaAdsGet } from "@/lib/api";
import { defaultRange } from "@/lib/useCampaigns";

interface Row {
  age?: string;
  gender?: string;
  impressions?: string;
  clicks?: string;
  ctr?: string;
  reach?: string;
  spend?: string;
}

const AGE_COLORS = ["#5ECBA1", "#78A8E0", "#EFB060", "#C090F0", "#F08080", "#70D0F0"];

export default function AudienceTab() {
  const [range, setRange] = useState(defaultRange());
  const [age, setAge] = useState<Row[]>([]);
  const [gender, setGender] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    Promise.all([
      metaAdsGet({
        path: "insights",
        fields: "impressions,clicks,ctr,reach,spend",
        since: range.since,
        until: range.until,
        breakdowns: "age",
        level: "account",
      }),
      metaAdsGet({
        path: "insights",
        fields: "impressions,clicks,ctr,reach,spend",
        since: range.since,
        until: range.until,
        breakdowns: "gender",
        level: "account",
      }),
    ])
      .then(([ageR, genR]) => {
        if (cancelled) return;
        setAge((ageR.data || []).filter((r: Row) => r.age !== "Unknown"));
        setGender((genR.data || []).filter((r: Row) => r.gender !== "unknown"));
      })
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : "Failed to load audience data"))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [range.since, range.until]);

  const male = gender.find((r) => r.gender === "male");
  const female = gender.find((r) => r.gender === "female");
  const totalGenderImp = (+((male?.impressions as string) || 0) || 0) + (+((female?.impressions as string) || 0) || 0);
  const mPct = totalGenderImp > 0 ? Math.round(((+((male?.impressions as string) || 0) || 0) / totalGenderImp) * 100) : 0;

  const totalAgeImp = age.reduce((s, r) => s + (+(r.impressions || 0) || 0), 0);
  const ageData = age
    .map((r) => ({
      label: r.age,
      impressions: +(r.impressions || 0) || 0,
      pct: totalAgeImp > 0 ? ((+(r.impressions || 0) || 0) / totalAgeImp) * 100 : 0,
      ctr: +(r.ctr || 0) || 0,
    }))
    .sort((a, b) => (a.label || "").localeCompare(b.label || ""));

  return (
    <div>
      <DateRangePicker since={range.since} until={range.until} onChange={(since, until) => setRange({ since, until })} />
      {error && <ErrorBanner message={error} />}
      {loading ? (
        <Spinner />
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Card title="Impression share by age">
            <div style={{ height: 240 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={ageData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.04)" />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: "rgba(200,213,220,.4)" }} />
                  <YAxis tick={{ fontSize: 10, fill: "rgba(200,213,220,.4)" }} />
                  <Tooltip contentStyle={{ background: "#1A2535", border: "1px solid #2A3A4A", fontSize: 12 }} formatter={(v: number) => v.toLocaleString()} />
                  <Bar dataKey="impressions" radius={[4, 4, 0, 0]}>
                    {ageData.map((_, i) => (
                      <Cell key={i} fill={AGE_COLORS[i % AGE_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card title="Impression share by gender">
            <div className="flex flex-col gap-3 py-2">
              <GenderRow label="Male" pct={mPct} ctr={+((male?.ctr as string) || 0)} color="#78A8E0" />
              <GenderRow label="Female" pct={100 - mPct} ctr={+((female?.ctr as string) || 0)} color="#C090F0" />
              <p className="mt-2 text-[11.5px] leading-relaxed text-muted">
                {Math.abs((+((male?.ctr as string) || 0)) - (+((female?.ctr as string) || 0))) < 0.3
                  ? `Male and female CTR are nearly identical (${(+((male?.ctr as string) || 0)).toFixed(2)}% vs ${(+((female?.ctr as string) || 0)).toFixed(2)}%). Your creative resonates equally across genders${
                      mPct > 65 ? ` — but ${mPct}% of spend goes to male, which may not reflect the actual patient population.` : "."
                    }`
                  : `CTR differs meaningfully between genders (male ${(+((male?.ctr as string) || 0)).toFixed(2)}% vs female ${(+((female?.ctr as string) || 0)).toFixed(2)}%). Consider tailoring creative by gender.`}
              </p>
              {mPct > 65 && (
                <div className="rounded-lg border border-warn/30 bg-warn/10 p-2.5 text-[11.5px] text-warn">
                  ⚠ {mPct}% male spend — test female-targeted ad sets with caregiver messaging, since women
                  frequently make healthcare decisions for family members.
                </div>
              )}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

function GenderRow({ label, pct, ctr, color }: { label: string; pct: number; ctr: number; color: string }) {
  return (
    <div className="grid grid-cols-[55px_1fr_55px_55px] items-center gap-2 border-b border-[#13202C] py-1.5 text-[11.5px] last:border-b-0">
      <span>{label}</span>
      <div className="h-[7px] overflow-hidden rounded bg-bg">
        <div className="h-full rounded" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="text-right">{pct.toFixed(0)}%</span>
      <span className="text-right text-muted">{ctr.toFixed(2)}%</span>
    </div>
  );
}
