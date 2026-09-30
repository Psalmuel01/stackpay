"use client";
import { useCallback, useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import DashboardOverview, { type DashboardResponse } from "@/components/app/DashboardOverview";

function DashboardSkeleton() {
  return <div className="overview-loading" aria-busy="true" aria-live="polite">
    <span className="sr-only">Loading your dashboard…</span>
    <div className="mb-7 space-y-4"><div className="skeleton h-3.5 w-28" /><div className="skeleton h-8 w-48" /><div className="skeleton h-4 w-80 max-w-full" /></div>
    <div className="card mb-4 h-44 p-6"><div className="skeleton h-4 w-40" /><div className="mt-10 grid gap-6 sm:grid-cols-3">{[0, 1, 2].map(i => <div key={i} className="skeleton h-8" />)}</div></div>
    <div className="grid gap-4 sm:grid-cols-3">{[0, 1, 2].map(i => <div key={i} className="card h-32 p-5"><div className="skeleton h-4 w-28" /><div className="skeleton mt-5 h-8 w-12" /></div>)}</div>
  </div>;
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState("");
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision(value => value + 1), []);
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError(null);
    fetch("/api/dashboard", { cache: "no-store", signal: controller.signal }).then(async response => {
      const payload = await response.json(); if (!response.ok) throw new Error(payload.error?.message || "Could not load your dashboard.");
      if (!controller.signal.aborted) { setData(payload.data); setUpdatedAt(new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit" }).format(new Date())); }
    }).catch(error => { if (!controller.signal.aborted) setError(error.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [revision]);
  if (!data && !error) return <DashboardSkeleton />;
  if (!data) return <section className="card mx-auto max-w-xl" role="alert"><div className="empty-state"><span className="empty-state-icon text-danger"><AlertTriangle size={22} aria-hidden="true" /></span><h3>Your dashboard couldn’t load</h3><p>{error}</p><button onClick={refresh} disabled={loading} className="btn btn-primary mt-5">{loading ? "Retrying…" : "Try again"}</button></div></section>;
  return <>{error && <div className="alert alert-danger mb-4" role="alert">Couldn’t refresh: {error} Showing the data loaded at {updatedAt}.</div>}<DashboardOverview data={data} updatedAt={updatedAt} refreshing={loading} onRefresh={refresh} /></>;
}
