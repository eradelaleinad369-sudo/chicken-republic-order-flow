import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { Link } from "@tanstack/react-router";
import { supabase, STATUSES, nextStatus, type RepublicOrder, type OrderStatus, type PendingOrder } from "@/lib/supabase";
import type { Session } from "@supabase/supabase-js";

export const Route = createFileRoute("/")({
  component: Dashboard,
});

const TABLE = "Republic_Data";

const statusStyles: Record<string, string> = {
  New: "bg-yellow-400 text-yellow-950 ring-yellow-500",
  Preparing: "bg-blue-500 text-white ring-blue-600",
  Ready: "bg-green-500 text-white ring-green-600",
  Done: "bg-gray-400 text-white ring-gray-500",
};

function timeAgo(iso: string): string {
  const diff = Math.max(0, Date.now() - new Date(iso).getTime());
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function playBeep() {
  try {
    const Ctx = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext;
    const ctx = new Ctx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(880, ctx.currentTime);
    o.frequency.setValueAtTime(1320, ctx.currentTime + 0.15);
    g.gain.setValueAtTime(0.001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.55);
    o.onended = () => ctx.close();
  } catch {
    /* ignore */
  }
}

function Dashboard() {
  const [session, setSession] = useState<Session | null>(null);
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthChecked(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  if (!authChecked) {
    return <div className="flex min-h-screen items-center justify-center bg-slate-50 text-slate-500">Loading…</div>;
  }

  if (!session) {
    return <LoginScreen />;
  }

  return <DashboardInner userEmail={session.user.email ?? ""} />;
}

function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setErr("Invalid email or password.");
    setBusy(false);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <form onSubmit={submit} className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-600 text-xl">🍗</div>
          <div>
            <h1 className="text-lg font-bold text-slate-900">Chicken Republic</h1>
            <p className="text-xs text-slate-500">Staff sign in</p>
          </div>
        </div>
        <label className="block text-sm font-medium text-slate-700">
          Email
          <input
            type="email"
            required
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900"
          />
        </label>
        <label className="mt-4 block text-sm font-medium text-slate-700">
          Password
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900"
          />
        </label>
        {err && (
          <div className="mt-4 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">{err}</div>
        )}
        <button
          type="submit"
          disabled={busy}
          className="mt-6 h-12 w-full rounded-xl bg-slate-900 text-base font-bold text-white transition hover:bg-slate-800 disabled:opacity-60"
        >
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}

function DashboardInner({ userEmail }: { userEmail: string }) {
  const [orders, setOrders] = useState<RepublicOrder[]>([]);
  const [filter, setFilter] = useState<"All" | OrderStatus>("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [realtimeConnected, setRealtimeConnected] = useState(true);
  const [flashIds, setFlashIds] = useState<Set<number>>(new Set());
  const [, setTick] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingOrder[]>([]);
  const initialLoaded = useRef(false);
  const knownIds = useRef<Set<number>>(new Set());

  // re-render every 30s so "time ago" updates
  useEffect(() => {
    const i = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(i);
  }, []);

  const loadPending = useCallback(async () => {
    const { data, error } = await supabase.from("v_pending_orders").select("*");
    if (!error && data) setPending(data as PendingOrder[]);
  }, []);

  useEffect(() => {
    loadPending();
    const i = setInterval(loadPending, 20_000);
    return () => clearInterval(i);
  }, [loadPending]);

  const flashCard = useCallback((id: number) => {
    setFlashIds((prev) => {
      const n = new Set(prev);
      n.add(id);
      return n;
    });
    setTimeout(() => {
      setFlashIds((prev) => {
        const n = new Set(prev);
        n.delete(id);
        return n;
      });
    }, 3000);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from(TABLE)
        .select("*")
        .order("created_at", { ascending: false });
      if (cancelled) return;
      if (error) {
        setError(error.message);
      } else if (data) {
        setOrders(data as RepublicOrder[]);
        knownIds.current = new Set((data as RepublicOrder[]).map((o) => o.id));
      }
      setLoading(false);
      initialLoaded.current = true;
    })();

    const channel = supabase
      .channel("republic-data-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: TABLE },
        (payload) => {
          if (payload.eventType === "INSERT") {
            const row = payload.new as RepublicOrder;
            setOrders((prev) => {
              if (prev.some((o) => o.id === row.id)) return prev;
              return [row, ...prev];
            });
            if (initialLoaded.current && !knownIds.current.has(row.id)) {
              knownIds.current.add(row.id);
              playBeep();
              flashCard(row.id);
            } else {
              knownIds.current.add(row.id);
            }
          } else if (payload.eventType === "UPDATE") {
            const row = payload.new as RepublicOrder;
            setOrders((prev) => prev.map((o) => (o.id === row.id ? row : o)));
          } else if (payload.eventType === "DELETE") {
            const row = payload.old as RepublicOrder;
            setOrders((prev) => prev.filter((o) => o.id !== row.id));
            knownIds.current.delete(row.id);
          }
        },
      )
      .subscribe((status) => {
        setRealtimeConnected(status === "SUBSCRIBED");
      });

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [flashCard]);

  const updateStatus = useCallback(async (order: RepublicOrder, status: OrderStatus) => {
    // optimistic
    setOrders((prev) => prev.map((o) => (o.id === order.id ? { ...o, Status: status } : o)));
    const { error } = await supabase.from(TABLE).update({ Status: status }).eq("id", order.id);
    if (error) {
      setError(error.message);
      // revert
      setOrders((prev) => prev.map((o) => (o.id === order.id ? order : o)));
    }
    loadPending();
  }, []);

  const togglePaid = useCallback(async (order: RepublicOrder) => {
    const current = (order.payment_status || "unpaid").toLowerCase();
    const nextPay = current === "paid" ? "unpaid" : "paid";
    setOrders((prev) => prev.map((o) => (o.id === order.id ? { ...o, payment_status: nextPay } : o)));
    const { error } = await supabase.from(TABLE).update({ payment_status: nextPay }).eq("id", order.id);
    if (error) {
      setError(error.message);
      setOrders((prev) => prev.map((o) => (o.id === order.id ? order : o)));
    }
    loadPending();
  }, [loadPending]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { All: orders.length, New: 0, Preparing: 0, Ready: 0, Done: 0 };
    for (const o of orders) {
      const s = (o.Status as string) || "New";
      if (c[s] !== undefined) c[s]++;
    }
    return c;
  }, [orders]);

  const visible = useMemo(() => {
    let list = filter === "All" ? orders : orders.filter((o) => (o.Status || "New") === filter);
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      const normalizedQuery = q.replace(/^rpb-/, "");
      list = list.filter((o) => {
        const code = (o.public_code || "").toLowerCase().replace(/^rpb-/, "");
        const name = (o.Name || "").toLowerCase();
        return code.includes(normalizedQuery) || name.includes(q);
      });
    }
    return list;
  }, [orders, filter, searchQuery]);

  const tabs: ("All" | OrderStatus)[] = ["All", ...STATUSES];

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-4 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-600 text-xl">
              🍗
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-slate-900">
                Chicken Republic
              </h1>
              <div className="flex items-center gap-1.5 text-xs text-slate-500">
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    realtimeConnected ? "bg-green-500" : "bg-red-500 animate-pulse"
                  }`}
                />
                {realtimeConnected ? "Live order dashboard" : "Reconnecting… try refreshing if this persists"}
              </div>
            </div>
          </div>
          <div className="w-full sm:w-64">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search order code or name…"
              className="w-full rounded-full border border-slate-300 px-4 py-2 text-sm focus:border-slate-500 focus:outline-none"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {tabs.map((t) => {
              const active = filter === t;
              return (
                <button
                  key={t}
                  onClick={() => setFilter(t)}
                  className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition ${
                    active
                      ? "bg-slate-900 text-white shadow"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
                >
                  <span>{t}</span>
                  <span
                    className={`inline-flex min-w-6 items-center justify-center rounded-full px-2 py-0.5 text-xs font-bold ${
                      active ? "bg-white/20 text-white" : "bg-white text-slate-700"
                    }`}
                  >
                    {counts[t] ?? 0}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-xs text-slate-500 sm:inline">{userEmail}</span>
            <Link
              to="/admin"
              className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              Admin
            </Link>
            <button
              onClick={() => supabase.auth.signOut()}
              className="rounded-full bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-200"
            >
              Log out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1600px] px-6 py-6">
        {error && (
          <div className="mb-4 rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </div>
        )}
        {pending.length > 0 && (
          <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-900">
                Pending orders <span className="text-slate-400">({pending.length})</span>
              </h2>
              <span className="text-xs text-slate-500">Oldest first · red = waiting &gt;15m</span>
            </div>
            <ul className="divide-y divide-slate-100">
              {pending.map((p) => {
                const mins = Number(p.minutes_waiting ?? 0);
                const tone =
                  mins > 15
                    ? "bg-red-50 border-l-4 border-red-500"
                    : mins > 10
                    ? "bg-amber-50 border-l-4 border-amber-500"
                    : "";
                return (
                  <li key={p.id} className={`flex flex-wrap items-center gap-3 px-3 py-2 text-sm ${tone}`}>
                    <span className="w-20 font-mono text-xs text-slate-500">{p.public_code || `#${p.id}`}</span>
                    <span className="min-w-[8rem] font-semibold text-slate-800">{p.customer_name || "—"}</span>
                    <span className="flex-1 truncate text-slate-600">{p.order_summary || "—"}</span>
                    <span className="font-bold text-slate-900">₦{Number(p.amount ?? 0).toLocaleString()}</span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-bold uppercase ${
                        (p.payment_status || "").toLowerCase() === "paid"
                          ? "bg-green-100 text-green-800"
                          : "bg-red-100 text-red-800"
                      }`}
                    >
                      {p.payment_status || "unpaid"}
                    </span>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
                      {p.status}
                    </span>
                    {p.table_number != null && (
                      <span className="text-xs text-slate-500">Table {p.table_number}</span>
                    )}
                    <span
                      className={`text-xs font-bold ${
                        mins > 15 ? "text-red-700" : mins > 10 ? "text-amber-700" : "text-slate-500"
                      }`}
                    >
                      {mins}m waiting
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
        {loading ? (
          <div className="py-24 text-center text-slate-500">Loading orders…</div>
        ) : visible.length === 0 ? (
          <div className="py-24 text-center text-slate-500">No orders in this view.</div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {visible.map((o) => {
              const status = ((o.Status as OrderStatus) || "New") as OrderStatus;
              const isDone = status === "Done";
              const flashing = flashIds.has(o.id);
              return (
                <article
                  key={o.id}
                  className={`relative flex flex-col rounded-2xl border bg-white p-5 shadow-sm transition ${
                    flashing
                      ? "border-yellow-400 ring-4 ring-yellow-300 animate-pulse"
                      : "border-slate-200"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-bold text-slate-900">
                        {o.Name || "Customer"}
                      </h2>
                      <p className="text-xs text-slate-500">
                        {timeAgo(o.created_at)} · #{o.id}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span
                        className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide ring-1 ${
                          statusStyles[status] || statusStyles.New
                        }`}
                      >
                        {status}
                      </span>
                      {(() => {
                        const paid = (o.payment_status || "").toLowerCase() === "paid";
                        return (
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ring-1 ${
                              paid
                                ? "bg-green-100 text-green-800 ring-green-300"
                                : "bg-red-100 text-red-800 ring-red-300"
                            }`}
                          >
                            {paid ? "Paid" : "Unpaid"}
                          </span>
                        );
                      })()}
                    </div>
                  </div>

                  <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
                    {o.Order || "—"}
                  </p>

                  <div className="mt-4 text-2xl font-extrabold text-slate-900">
                    ₦{Number(o.Amount ?? 0).toLocaleString()}
                  </div>

                  <div className="mt-5 flex flex-col gap-2">
                    <button
                      disabled={isDone}
                      onClick={() => updateStatus(o, nextStatus(status))}
                      className={`h-14 w-full rounded-xl text-base font-bold transition ${
                        isDone
                          ? "cursor-not-allowed bg-slate-100 text-slate-400"
                          : "bg-slate-900 text-white hover:bg-slate-800 active:scale-[.98]"
                      }`}
                    >
                      {isDone ? "Completed" : `Mark ${nextStatus(status)}`}
                    </button>
                    <button
                      onClick={() => togglePaid(o)}
                      className={`h-11 w-full rounded-xl text-sm font-bold transition ${
                        (o.payment_status || "").toLowerCase() === "paid"
                          ? "bg-green-600 text-white hover:bg-green-700"
                          : "bg-red-600 text-white hover:bg-red-700"
                      }`}
                    >
                      {(o.payment_status || "").toLowerCase() === "paid" ? "Paid" : "Pending Payment"}
                    </button>
                    <label className="text-xs font-medium text-slate-500">
                      Set status
                      <select
                        value={status}
                        onChange={(e) =>
                          updateStatus(o, e.target.value as OrderStatus)
                        }
                        className="mt-1 h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-800"
                      >
                        {STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}

