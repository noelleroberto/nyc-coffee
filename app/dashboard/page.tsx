"use client";

import { useEffect, useState, useMemo } from "react";
import {
  ComposedChart,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { supabase, Order, OrderItem } from "../../lib/supabase";

type DateFilter = "today" | "7days" | "30days";
type CompareMode = "prior" | "yoy";

// Add-ons that are free — excluded from attach rate
const FREE_ADDONS = new Set(["whole milk", "skim milk", "heated", ""]);
function isPaidAddon(addon: string) {
  return !FREE_ADDONS.has(addon.toLowerCase().trim());
}

// ── Date ranges ─────────────────────────────────────────────────────────────

function getDateRanges(
  filter: DateFilter,
  compareMode: CompareMode
): {
  current: { from: Date; to: Date };
  prior: { from: Date; to: Date };
} {
  const now = new Date();

  // Current period bounds
  let currentFrom: Date;
  switch (filter) {
    case "today":
      currentFrom = new Date(now);
      currentFrom.setHours(0, 0, 0, 0);
      break;
    case "7days":
      currentFrom = new Date(now);
      currentFrom.setDate(currentFrom.getDate() - 7);
      break;
    case "30days":
      currentFrom = new Date(now);
      currentFrom.setDate(currentFrom.getDate() - 30);
      break;
  }

  // Prior period bounds
  let priorFrom: Date;
  let priorTo: Date;
  if (compareMode === "yoy") {
    priorFrom = new Date(currentFrom);
    priorFrom.setFullYear(priorFrom.getFullYear() - 1);
    priorTo = new Date(now);
    priorTo.setFullYear(priorTo.getFullYear() - 1);
  } else {
    // prior period = same duration, immediately before current
    switch (filter) {
      case "today":
        priorFrom = new Date(currentFrom);
        priorFrom.setDate(priorFrom.getDate() - 1);
        priorTo = new Date(currentFrom);
        break;
      case "7days":
        priorFrom = new Date(now);
        priorFrom.setDate(priorFrom.getDate() - 14);
        priorTo = new Date(currentFrom);
        break;
      case "30days":
        priorFrom = new Date(now);
        priorFrom.setDate(priorFrom.getDate() - 60);
        priorTo = new Date(currentFrom);
        break;
    }
  }

  return {
    current: { from: currentFrom, to: now },
    prior: { from: priorFrom!, to: priorTo! },
  };
}

// Subtext shown on each date button depending on compareMode
const BUTTON_SUBTEXT: Record<DateFilter, Record<CompareMode, string>> = {
  today:   { prior: "vs yesterday",    yoy: "vs last year" },
  "7days": { prior: "vs prior 7 days", yoy: "vs last year" },
  "30days":{ prior: "vs prior 30 days",yoy: "vs last year" },
};

// ── Metric helpers ───────────────────────────────────────────────────────────

function completedOnly(orders: Order[]) {
  return orders.filter((o) => o.status === "completed");
}

function calcAOV(orders: Order[]): number {
  const done = completedOnly(orders);
  if (!done.length) return 0;
  return done.reduce((s, o) => s + Number(o.total), 0) / done.length;
}

function calcAvgFulfillmentSecs(orders: Order[]): number | null {
  const done = completedOnly(orders).filter((o) => o.completed_at);
  if (!done.length) return null;
  const ms = done.reduce(
    (s, o) =>
      s +
      (new Date(o.completed_at!).getTime() - new Date(o.created_at).getTime()),
    0
  );
  return ms / done.length / 1000;
}

function formatDuration(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = Math.round(secs % 60);
  return `${m}m ${s}s`;
}

function pctChange(
  current: number,
  prior: number
): { pct: number; up: boolean } | null {
  if (prior === 0) return null;
  const pct = ((current - prior) / prior) * 100;
  return { pct: Math.abs(pct), up: pct >= 0 };
}

// ── Chart data helpers ───────────────────────────────────────────────────────

function computeTrendData(orders: Order[], filter: DateFilter) {
  const done = completedOnly(orders);
  if (filter === "today") {
    const byHour: Record<number, { rev: number; cnt: number }> = {};
    done.forEach((o) => {
      const h = new Date(o.created_at).getHours();
      if (!byHour[h]) byHour[h] = { rev: 0, cnt: 0 };
      byHour[h].rev += Number(o.total);
      byHour[h].cnt += 1;
    });
    return Array.from({ length: 24 }, (_, i) => ({
      label:
        i === 0 ? "12am" : i < 12 ? `${i}am` : i === 12 ? "12pm" : `${i - 12}pm`,
      revenue: Math.round((byHour[i]?.rev ?? 0) * 100) / 100,
      orders: byHour[i]?.cnt ?? 0,
    })).filter((_, i) => i >= 6 && i <= 21);
  }
  const byDay: Record<string, { rev: number; cnt: number }> = {};
  done.forEach((o) => {
    const key = new Date(o.created_at).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
    if (!byDay[key]) byDay[key] = { rev: 0, cnt: 0 };
    byDay[key].rev += Number(o.total);
    byDay[key].cnt += 1;
  });
  return Object.entries(byDay).map(([label, { rev, cnt }]) => ({
    label,
    revenue: Math.round(rev * 100) / 100,
    orders: cnt,
  }));
}

function computeTop5ByRevenue(orders: Order[]) {
  const items: Record<string, { revenue: number; count: number }> = {};
  completedOnly(orders).forEach((o) => {
    o.items.forEach((item: OrderItem) => {
      if (!items[item.name]) items[item.name] = { revenue: 0, count: 0 };
      items[item.name].revenue += item.item_total * item.quantity;
      items[item.name].count += item.quantity;
    });
  });
  return Object.entries(items)
    .map(([name, { revenue, count }]) => ({
      name,
      revenue: Math.round(revenue * 100) / 100,
      count,
    }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);
}

function computeOrdersByHour(orders: Order[]) {
  const byHour: Record<number, number> = {};
  orders.forEach((o) => {
    const h = new Date(o.created_at).getHours();
    byHour[h] = (byHour[h] || 0) + 1;
  });
  const data = Array.from({ length: 24 }, (_, i) => ({
    label:
      i === 0 ? "12am" : i < 12 ? `${i}am` : i === 12 ? "12pm" : `${i - 12}pm`,
    orders: byHour[i] || 0,
  })).filter((_, i) => i >= 6 && i <= 21);
  const peak = Math.max(...data.map((d) => d.orders), 0);
  return { data, peak };
}

function computeAddOnMetrics(orders: Order[]) {
  const done = completedOnly(orders);
  if (!done.length) return { attachRate: 0, topAddOns: [] as { name: string; count: number }[] };
  let withPaid = 0;
  const counts: Record<string, number> = {};
  done.forEach((o) => {
    let hasPaid = false;
    o.items.forEach((item: OrderItem) => {
      (item.add_ons || []).forEach((a: string) => {
        if (isPaidAddon(a)) {
          hasPaid = true;
          counts[a] = (counts[a] || 0) + 1;
        }
      });
    });
    if (hasPaid) withPaid++;
  });
  return {
    attachRate: Math.round((withPaid / done.length) * 100),
    topAddOns: Object.entries(counts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6),
  };
}

function computeAOVSparkline(orders: Order[], filter: DateFilter) {
  const done = completedOnly(orders);
  if (filter === "today") {
    const byHour: Record<number, { t: number; c: number }> = {};
    done.forEach((o) => {
      const h = new Date(o.created_at).getHours();
      if (!byHour[h]) byHour[h] = { t: 0, c: 0 };
      byHour[h].t += Number(o.total);
      byHour[h].c += 1;
    });
    return Array.from({ length: 24 }, (_, i) => ({
      v: byHour[i] ? byHour[i].t / byHour[i].c : 0,
    })).filter((_, i) => i >= 6 && i <= 21);
  }
  const byDay: Record<string, { t: number; c: number }> = {};
  done.forEach((o) => {
    const key = new Date(o.created_at).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
    if (!byDay[key]) byDay[key] = { t: 0, c: 0 };
    byDay[key].t += Number(o.total);
    byDay[key].c += 1;
  });
  return Object.values(byDay).map((d) => ({ v: d.t / d.c }));
}

// ── Small components ─────────────────────────────────────────────────────────

function TrendBadge({
  current,
  prior,
  lowerIsBetter = false,
}: {
  current: number;
  prior: number;
  lowerIsBetter?: boolean;
}) {
  const t = pctChange(current, prior);
  if (!t) return null;
  const good = lowerIsBetter ? !t.up : t.up;
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-xs font-medium px-1.5 py-0.5 rounded-full ${
        good ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
      }`}
    >
      {t.up ? "↑" : "↓"} {t.pct.toFixed(1)}%
    </span>
  );
}

function EmptyChart({ message }: { message: string }) {
  return (
    <div className="h-full flex items-center justify-center text-stone-400 text-sm">
      {message}
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [filter, setFilter] = useState<DateFilter>("today");
  const [compareMode, setCompareMode] = useState<CompareMode>("prior");
  const [orders, setOrders] = useState<Order[]>([]);
  const [priorOrders, setPriorOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchOrders() {
      setLoading(true);
      setError(null);
      const { current, prior } = getDateRanges(filter, compareMode);
      const [cur, prev] = await Promise.all([
        supabase
          .from("orders")
          .select("*")
          .gte("created_at", current.from.toISOString())
          .lte("created_at", current.to.toISOString())
          .order("created_at", { ascending: true }),
        supabase
          .from("orders")
          .select("*")
          .gte("created_at", prior.from.toISOString())
          .lte("created_at", prior.to.toISOString())
          .order("created_at", { ascending: true }),
      ]);
      if (cur.error) {
        setError(cur.error.message);
      } else {
        setOrders(cur.data || []);
        setPriorOrders(prev.data || []);
      }
      setLoading(false);
    }
    fetchOrders();
  }, [filter, compareMode]);

  // KPIs
  const done = useMemo(() => completedOnly(orders), [orders]);
  const aov = useMemo(() => calcAOV(orders), [orders]);
  const priorAov = useMemo(() => calcAOV(priorOrders), [priorOrders]);
  const fulfillSecs = useMemo(() => calcAvgFulfillmentSecs(orders), [orders]);
  const priorFulfillSecs = useMemo(
    () => calcAvgFulfillmentSecs(priorOrders),
    [priorOrders]
  );

  // Charts
  const trendData = useMemo(
    () => computeTrendData(orders, filter),
    [orders, filter]
  );
  const top5 = useMemo(() => computeTop5ByRevenue(orders), [orders]);
  const { data: hourData, peak } = useMemo(
    () => computeOrdersByHour(orders),
    [orders]
  );
  const { attachRate, topAddOns } = useMemo(
    () => computeAddOnMetrics(orders),
    [orders]
  );
  const sparkline = useMemo(
    () => computeAOVSparkline(orders, filter),
    [orders, filter]
  );

  return (
    <div className="min-h-[calc(100vh-3.5rem)] bg-gray-50 p-4 md:p-6">
      <div className="max-w-7xl mx-auto">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-3">
          <div>
            <h1 className="text-2xl font-bold text-stone-900">Dashboard</h1>
            <p className="text-stone-500 text-sm mt-1">
              Business performance overview
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">

            {/* P/P vs Y/Y toggle */}
            <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs font-medium">
              {(["prior", "yoy"] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setCompareMode(mode)}
                  className={`px-3 py-1.5 transition-colors ${
                    compareMode === mode
                      ? "bg-stone-800 text-white"
                      : "bg-white text-stone-500 hover:bg-gray-50"
                  }`}
                >
                  {mode === "prior" ? "P/P" : "Y/Y"}
                </button>
              ))}
            </div>

            {/* Date filter buttons with comparison subtext */}
            <div className="flex gap-2">
              {(["today", "7days", "30days"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-3 py-2 text-sm rounded-md border transition-colors flex flex-col items-center leading-tight ${
                    filter === f
                      ? "bg-stone-800 text-white border-stone-800"
                      : "border-gray-200 bg-white text-stone-600 hover:bg-gray-50"
                  }`}
                >
                  <span className="font-medium">
                    {f === "today" ? "Today" : f === "7days" ? "7 Days" : "30 Days"}
                  </span>
                  <span
                    className={`text-[10px] mt-0.5 ${
                      filter === f ? "text-stone-300" : "text-stone-400"
                    }`}
                  >
                    {BUTTON_SUBTEXT[f][compareMode]}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-stone-400 text-sm animate-pulse">
              Loading dashboard…
            </div>
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-64">
            <p className="text-red-500 text-sm">Error: {error}</p>
          </div>
        ) : (
          <>
            {/* ── Row 1: KPI Cards ── */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">

              {/* AOV */}
              <div className="bg-white rounded-xl border border-gray-200 p-4 md:p-5">
                <p className="text-sm text-stone-500 font-medium">
                  Avg Order Value
                </p>
                <div className="flex items-end gap-2 mt-1">
                  <p className="text-2xl font-bold text-stone-900">
                    {done.length > 0 ? `$${aov.toFixed(2)}` : "—"}
                  </p>
                  {done.length > 0 && (
                    <TrendBadge current={aov} prior={priorAov} />
                  )}
                </div>
                {sparkline.length > 1 && sparkline.some((d) => d.v > 0) && (
                  <div className="h-8 mt-2">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart
                        data={sparkline}
                        margin={{ top: 2, right: 0, left: 0, bottom: 0 }}
                      >
                        <Line
                          type="monotone"
                          dataKey="v"
                          stroke="#2563eb"
                          strokeWidth={1.5}
                          dot={false}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}
                <p className="text-xs text-stone-400 mt-1">
                  {done.length} completed order{done.length !== 1 ? "s" : ""}
                </p>
              </div>

              {/* Avg Fulfillment Time */}
              <div className="bg-white rounded-xl border border-gray-200 p-4 md:p-5">
                <p className="text-sm text-stone-500 font-medium">
                  Avg Fulfillment Time
                </p>
                <div className="flex items-end gap-2 mt-1">
                  <p className="text-2xl font-bold text-stone-900">
                    {fulfillSecs !== null ? formatDuration(fulfillSecs) : "—"}
                  </p>
                  {fulfillSecs !== null && priorFulfillSecs !== null && (
                    <TrendBadge
                      current={fulfillSecs}
                      prior={priorFulfillSecs}
                      lowerIsBetter
                    />
                  )}
                </div>
                <p className="text-xs text-stone-400 mt-1">
                  {done.filter((o) => o.completed_at).length} timed orders
                </p>
              </div>

              {/* Cancellation Rate — not tracked yet */}
              <div className="bg-white rounded-xl border border-gray-200 p-4 md:p-5">
                <p className="text-sm text-stone-500 font-medium">
                  Cancellation Rate
                </p>
                <p className="text-2xl font-bold text-stone-300 mt-1">—</p>
                <p className="text-xs text-stone-400 mt-1">Not tracked yet</p>
              </div>

              {/* Remake Rate — not tracked yet */}
              <div className="bg-white rounded-xl border border-gray-200 p-4 md:p-5">
                <p className="text-sm text-stone-500 font-medium">
                  Remake Rate
                </p>
                <p className="text-2xl font-bold text-stone-300 mt-1">—</p>
                <p className="text-xs text-stone-400 mt-1">Not tracked yet</p>
              </div>
            </div>

            {/* ── Row 2: Revenue + Order Volume Trend (full width, dual axis) ── */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-stone-700">
                  Revenue & Order Volume
                  <span className="text-stone-400 font-normal ml-2 text-xs">
                    ({filter === "today" ? "by hour" : "by day"})
                  </span>
                </h3>
                <div className="flex items-center gap-4 text-xs text-stone-500">
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block w-3 h-0.5 bg-blue-600 rounded" />
                    Revenue
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block w-3 h-3 rounded-sm bg-amber-300 opacity-70" />
                    Orders
                  </span>
                </div>
              </div>
              <div className="h-44 sm:h-56">
                {trendData.some((d) => d.revenue > 0 || d.orders > 0) ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart
                      data={trendData}
                      margin={{ top: 4, right: 40, left: -8, bottom: 0 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="#f1f5f9"
                        vertical={false}
                      />
                      <XAxis
                        dataKey="label"
                        tick={{ fontSize: 11, fill: "#78716c" }}
                        tickLine={false}
                        axisLine={false}
                        interval="preserveStartEnd"
                      />
                      <YAxis
                        yAxisId="rev"
                        tick={{ fontSize: 11, fill: "#78716c" }}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(v) => `$${v}`}
                      />
                      <YAxis
                        yAxisId="cnt"
                        orientation="right"
                        tick={{ fontSize: 11, fill: "#78716c" }}
                        tickLine={false}
                        axisLine={false}
                        allowDecimals={false}
                      />
                      <Tooltip
                        contentStyle={{
                          borderRadius: 8,
                          border: "1px solid #e2e8f0",
                          fontSize: 12,
                        }}
                        formatter={(value, name) =>
                          name === "revenue"
                            ? [`$${Number(value).toFixed(2)}`, "Revenue"]
                            : [Number(value), "Orders"]
                        }
                      />
                      <Bar
                        yAxisId="cnt"
                        dataKey="orders"
                        fill="#fbbf24"
                        opacity={0.55}
                        radius={[2, 2, 0, 0]}
                      />
                      <Line
                        yAxisId="rev"
                        type="monotone"
                        dataKey="revenue"
                        stroke="#2563eb"
                        strokeWidth={2.5}
                        dot={false}
                        activeDot={{ r: 4 }}
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                ) : (
                  <EmptyChart message="No completed orders in this period" />
                )}
              </div>
            </div>

            {/* ── Row 3: Top 5 by Revenue + Orders by Hour ── */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">

              {/* Top 5 Items by Revenue */}
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <h3 className="text-sm font-semibold text-stone-700 mb-4">
                  Top 5 Items by Revenue
                </h3>
                <div className="h-44 md:h-52">
                  {top5.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={top5}
                        layout="vertical"
                        margin={{ top: 0, right: 56, left: 0, bottom: 0 }}
                      >
                        <CartesianGrid
                          strokeDasharray="3 3"
                          horizontal={false}
                          stroke="#f1f5f9"
                        />
                        <XAxis
                          type="number"
                          tick={{ fontSize: 11, fill: "#78716c" }}
                          tickLine={false}
                          axisLine={false}
                          tickFormatter={(v) => `$${v}`}
                        />
                        <YAxis
                          type="category"
                          dataKey="name"
                          tick={{ fontSize: 11, fill: "#44403c" }}
                          tickLine={false}
                          axisLine={false}
                          width={115}
                        />
                        <Tooltip
                          contentStyle={{
                            borderRadius: 8,
                            border: "1px solid #e2e8f0",
                            fontSize: 12,
                          }}
                          formatter={(value, name) =>
                            name === "revenue"
                              ? [`$${Number(value).toFixed(2)}`, "Revenue"]
                              : [Number(value), "Ordered"]
                          }
                        />
                        <Bar
                          dataKey="revenue"
                          fill="#2563eb"
                          radius={[0, 4, 4, 0]}
                          label={{
                            position: "right",
                            fontSize: 10,
                            fill: "#78716c",
                            formatter: (v: unknown) => `$${Number(v).toFixed(0)}`,
                          }}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <EmptyChart message="No data yet" />
                  )}
                </div>
                {top5.length > 0 && (
                  <div className="mt-3 space-y-1">
                    {top5.map((item) => (
                      <div
                        key={item.name}
                        className="flex justify-between text-xs text-stone-500"
                      >
                        <span>{item.name}</span>
                        <span className="text-stone-400">
                          {item.count} sold
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Orders by Hour */}
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <h3 className="text-sm font-semibold text-stone-700 mb-1">
                  Orders by Hour
                </h3>
                {hourData.some((d) => d.orders > 0) && (
                  <p className="text-xs text-stone-400 mb-3">
                    Peak:{" "}
                    <span className="text-red-500 font-semibold">
                      {hourData.find((d) => d.orders === peak)?.label}
                    </span>{" "}
                    ({peak} orders)
                  </p>
                )}
                <div className="h-44 md:h-52">
                  {hourData.some((d) => d.orders > 0) ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={hourData}
                        margin={{ top: 0, right: 8, left: -24, bottom: 0 }}
                      >
                        <CartesianGrid
                          strokeDasharray="3 3"
                          vertical={false}
                          stroke="#f1f5f9"
                        />
                        <XAxis
                          dataKey="label"
                          tick={{ fontSize: 10, fill: "#78716c" }}
                          tickLine={false}
                          axisLine={false}
                          interval={1}
                        />
                        <YAxis
                          tick={{ fontSize: 11, fill: "#78716c" }}
                          tickLine={false}
                          axisLine={false}
                          allowDecimals={false}
                        />
                        <Tooltip
                          contentStyle={{
                            borderRadius: 8,
                            border: "1px solid #e2e8f0",
                            fontSize: 12,
                          }}
                          formatter={(v) => [Number(v), "Orders"]}
                        />
                        <Bar dataKey="orders" radius={[3, 3, 0, 0]}>
                          {hourData.map((d, i) => (
                            <Cell
                              key={i}
                              fill={
                                d.orders === peak && peak > 0
                                  ? "#ef4444"
                                  : "#d97706"
                              }
                            />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <EmptyChart message="No orders in this period" />
                  )}
                </div>
              </div>
            </div>

            {/* ── Row 4: Add-On Attach Rate ── */}
            <div className="bg-white rounded-xl border border-gray-200 p-4 md:p-6">
              <div className="flex flex-col sm:flex-row items-start gap-5 sm:gap-10">
                {/* Attach rate KPI */}
                <div className="shrink-0 w-full sm:w-auto sm:min-w-[140px]">
                  <p className="text-sm text-stone-500 font-medium mb-1">
                    Add-On Attach Rate
                  </p>
                  <p className="text-4xl sm:text-5xl font-bold text-stone-900">
                    {done.length > 0 ? `${attachRate}%` : "—"}
                  </p>
                  <p className="text-xs text-stone-400 mt-2 leading-snug">
                    of orders include a paid add-on
                  </p>
                </div>

                {/* Divider — vertical on desktop, horizontal on mobile */}
                <div className="hidden sm:block w-px self-stretch bg-gray-100 shrink-0" />
                <div className="sm:hidden w-full h-px bg-gray-100" />

                {/* Top paid add-ons ranked list */}
                <div className="flex-1">
                  <p className="text-xs font-semibold text-stone-400 uppercase tracking-widest mb-3">
                    Top Paid Add-Ons
                  </p>
                  {topAddOns.length > 0 ? (
                    <div className="space-y-2.5">
                      {topAddOns.map((addon, i) => (
                        <div key={addon.name} className="flex items-center gap-3">
                          <span className="text-xs text-stone-300 w-4 shrink-0 text-right">
                            {i + 1}
                          </span>
                          <span className="text-sm text-stone-700 w-40 shrink-0 capitalize">
                            {addon.name}
                          </span>
                          <div className="flex-1 bg-gray-100 rounded-full h-1.5">
                            <div
                              className="bg-blue-500 h-1.5 rounded-full transition-all"
                              style={{
                                width: `${
                                  (addon.count / topAddOns[0].count) * 100
                                }%`,
                              }}
                            />
                          </div>
                          <span className="text-sm font-semibold text-stone-700 w-12 text-right shrink-0">
                            {addon.count} orders
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-stone-400">
                      {done.length > 0
                        ? "No paid add-ons ordered yet"
                        : "No completed orders in this period"}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
