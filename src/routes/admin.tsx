import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { supabase, type MenuItem } from "@/lib/supabase";
import type { Session } from "@supabase/supabase-js";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

export const Route = createFileRoute("/admin")({
  component: AdminPage,
});

interface StatsRow {
  order_count?: number | null;
  revenue?: number | null;
  avg_order_value?: number | null;
}

function AdminPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setChecked(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  if (!checked) {
    return <div className="flex min-h-screen items-center justify-center bg-slate-50 text-slate-500">Loading…</div>;
  }
  if (!session) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <Link to="/" className="rounded-xl bg-slate-900 px-6 py-3 font-bold text-white">Sign in</Link>
      </div>
    );
  }
  return <AdminInner />;
}

function AdminInner() {
  const [today, setToday] = useState<StatsRow | null>(null);
  const [week, setWeek] = useState<StatsRow | null>(null);
  const [month, setMonth] = useState<StatsRow | null>(null);
  const [all, setAll] = useState<StatsRow | null>(null);
  const [revByDay, setRevByDay] = useState<any[]>([]);
  const [byHour, setByHour] = useState<any[]>([]);
  const [byStatus, setByStatus] = useState<any[]>([]);
  const [topItems, setTopItems] = useState<any[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [exporting, setExporting] = useState(false);

  const loadAll = useCallback(async () => {
    const results = await Promise.all([
      supabase.from("v_stats_today").select("*").maybeSingle(),
      supabase.from("v_stats_this_week").select("*").maybeSingle(),
      supabase.from("v_stats_this_month").select("*").maybeSingle(),
      supabase.from("v_stats_all_time").select("*").maybeSingle(),
      supabase.from("v_revenue_by_day").select("*"),
      supabase.from("v_orders_by_hour").select("*"),
      supabase.from("v_orders_by_status").select("*"),
      supabase.from("v_top_items_best_effort").select("*"),
      supabase.from("menu_items").select("*").order("id"),
    ]);
    const firstErr = results.find((r) => r.error)?.error;
    if (firstErr) setError(firstErr.message);
    setToday((results[0].data as StatsRow) ?? null);
    setWeek((results[1].data as StatsRow) ?? null);
    setMonth((results[2].data as StatsRow) ?? null);
    setAll((results[3].data as StatsRow) ?? null);
    setRevByDay((results[4].data as any[]) ?? []);
    setByHour((results[5].data as any[]) ?? []);
    setByStatus((results[6].data as any[]) ?? []);
    setTopItems((results[7].data as any[]) ?? []);
    setMenuItems((results[8].data as MenuItem[]) ?? []);
    setLastUpdated(new Date());
  }, []);

  useEffect(() => {
    loadAll();
    const interval = setInterval(loadAll, 45000);
    return () => clearInterval(interval);
  }, [loadAll]);

  const exportCsv = useCallback(async () => {
    setExporting(true);
    setError(null);
    try {
      const { data, error } = await supabase
        .from("Republic_Data")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      const rows = data ?? [];
      if (rows.length === 0) {
        setError("No orders to export.");
        return;
      }
      const headers = Object.keys(rows[0]);
      const escapeCsv = (val: unknown) => {
        const s = val == null ? "" : String(val);
        if (s.includes(",") || s.includes('"') || s.includes("\n")) {
          return `"${s.replace(/"/g, '""')}"`;
        }
        return s;
      };
      const csvLines = [
        headers.join(","),
        ...rows.map((row: Record<string, unknown>) => headers.map((h) => escapeCsv(row[h])).join(",")),
      ];
      const csvContent = csvLines.join("\n");
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const dateStr = new Date().toISOString().slice(0, 10);
      link.href = url;
      link.download = `orders-export-${dateStr}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setExporting(false);
    }
  }, []);

  const toggleAvailable = async (item: MenuItem) => {
    const next = !item.is_available;
    setMenuItems((prev) => prev.map((m) => (m.id === item.id ? { ...m, is_available: next } : m)));
    const { error } = await supabase.from("menu_items").update({ is_available: next }).eq("id", item.id);
    if (error) {
      setError(error.message);
      setMenuItems((prev) => prev.map((m) => (m.id === item.id ? item : m)));
    }
  };

  const hourData = Array.from({ length: 24 }, (_, h) => {
    const row = byHour.find((r) => Number(r.hour_of_day) === h);
    return { hour: `${h}`, orders: Number(row?.order_count ?? 0) };
  });

  const dayData = revByDay
    .slice()
    .sort((a, b) => String(a.day).localeCompare(String(b.day)))
    .map((r) => ({
      day: String(r.day).slice(5),
      revenue: Number(r.revenue ?? 0),
    }));

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-600 text-xl">🍗</div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-slate-900">Admin</h1>
              <p className="text-xs text-slate-500">Analytics & menu control</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {lastUpdated && (
              <span className="hidden text-xs text-slate-400 sm:inline">
                Updated {lastUpdated.toLocaleTimeString()}
              </span>
            )}
            <button
              onClick={exportCsv}
              disabled={exporting}
              className="rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
            >
              {exporting ? "Exporting…" : "Export CSV"}
            </button>
            <Link to="/" className="rounded-full bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-200">
              ← Dashboard
            </Link>
            <button
              onClick={() => supabase.auth.signOut()}
              className="rounded-full bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-200"
            >
              Log out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1600px] space-y-6 px-6 py-6">
        {error && (
          <div className="rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
        )}

        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Today" data={today} tone="bg-red-600" />
          <StatCard label="This week" data={week} tone="bg-orange-500" />
          <StatCard label="This month" data={month} tone="bg-blue-600" />
          <StatCard label="All time" data={all} tone="bg-slate-900" />
        </section>

        <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-4 text-base font-bold text-slate-900">Revenue — last 30 days</h2>
            <div className="h-64 w-full">
              <ResponsiveContainer>
                <BarChart data={dayData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: any) => `₦${Number(v).toLocaleString()}`} />
                  <Bar dataKey="revenue" fill="#dc2626" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-4 text-base font-bold text-slate-900">Orders by hour</h2>
            <div className="h-64 w-full">
              <ResponsiveContainer>
                <BarChart data={hourData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="hour" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="orders" fill="#2563eb" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-4 text-base font-bold text-slate-900">Top 5 items</h2>
            <ol className="space-y-2">
              {topItems.slice(0, 5).map((it, i) => (
                <li
                  key={i}
                  className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50 px-4 py-3"
                >
                  <span className="flex items-center gap-3">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-red-600 text-sm font-bold text-white">
                      {i + 1}
                    </span>
                    <span className="font-semibold text-slate-800">{it.item_name || "—"}</span>
                  </span>
                  <span className="text-sm font-bold text-slate-600">
                    {Number(it.times_ordered ?? 0)}x
                  </span>
                </li>
              ))}
              {topItems.length === 0 && <li className="text-sm text-slate-500">No data yet.</li>}
            </ol>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-4 text-base font-bold text-slate-900">Current orders by status</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {byStatus.map((s, i) => (
                <div key={i} className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-center">
                  <div className="text-2xl font-extrabold text-slate-900">{Number(s.order_count ?? 0)}</div>
                  <div className="mt-1 text-xs font-semibold uppercase text-slate-500">{s.status || "—"}</div>
                </div>
              ))}
              {byStatus.length === 0 && <div className="text-sm text-slate-500">No data yet.</div>}
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-900">
              Menu items <span className="text-slate-400">({menuItems.length})</span>
            </h2>
            <span className="text-xs text-slate-500">Toggle availability for customer ordering</span>
          </div>
          <ul className="divide-y divide-slate-100">
            {menuItems.map((m) => {
              const name = m.name || m.item_name || `Item #${m.id}`;
              const available = !!m.is_available;
              return (
                <li key={m.id} className="flex items-center justify-between gap-4 py-3">
                  <div>
                    <div className="font-semibold text-slate-800">{name}</div>
                    <div className="text-xs text-slate-500">
                      {m.category ? `${m.category} · ` : ""}
                      {m.price != null ? `₦${Number(m.price).toLocaleString()}` : ""}
                    </div>
                  </div>
                  <button
                    onClick={() => toggleAvailable(m)}
                    className={`relative inline-flex h-8 w-14 items-center rounded-full transition ${
                      available ? "bg-green-600" : "bg-slate-300"
                    }`}
                    aria-pressed={available}
                  >
                    <span
                      className={`inline-block h-6 w-6 transform rounded-full bg-white shadow transition ${
                        available ? "translate-x-7" : "translate-x-1"
                      }`}
                    />
                  </button>
                </li>
              );
            })}
            {menuItems.length === 0 && <li className="py-6 text-center text-sm text-slate-500">No menu items.</li>}
          </ul>
        </section>
      </main>
    </div>
  );
}

function StatCard({ label, data, tone }: { label: string; data: StatsRow | null; tone: string }) {
  const revenue = Number(data?.revenue ?? 0);
  const count = Number(data?.order_count ?? 0);
  const avg = Number(data?.avg_order_value ?? 0);
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className={`px-5 py-2 text-xs font-bold uppercase tracking-wide text-white ${tone}`}>{label}</div>
      <div className="p-5">
        <div className="text-3xl font-extrabold text-slate-900">₦{revenue.toLocaleString()}</div>
        <div className="mt-2 flex justify-between text-sm text-slate-600">
          <span><span className="font-bold text-slate-900">{count}</span> orders</span>
          <span>avg <span className="font-bold text-slate-900">₦{Math.round(avg).toLocaleString()}</span></span>
        </div>
      </div>
    </div>
  );
             }
