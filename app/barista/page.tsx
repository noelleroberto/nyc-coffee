"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import type { Order, OrderItem, OrderStatus } from "@/lib/supabase";

// ── Constants ─────────────────────────────────────────────────────────────────

// These drinks are always iced — don't prefix with "Iced" in the title
const ALWAYS_ICED = new Set(["Cold Brew", "Coffee Frappuccino"]);

// ── Helpers ───────────────────────────────────────────────────────────────────

function capitalizeWords(str: string): string {
  return str.replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Pluralizes a menu item name for quantities > 1. */
function pluralizeName(name: string): string {
  if (name === "Banana Bread (Slice)") return "Banana Bread (Slices)";
  return `${name}s`;
}

/**
 * Builds the primary display title for an item.
 * Format: "[Size] [Temp] [Milk] [Name(s)]"
 * - Temperature omitted for always-iced drinks (Cold Brew, Coffee Frappuccino)
 * - Milk omitted if default (whole milk or not set)
 * - Name pluralized when quantity > 1
 * - Pastries: just the name (pluralized if needed)
 */
function formatItemTitle(item: OrderItem, quantity = 1): string {
  const plural = quantity > 1;
  if (item.category === "pastry") return plural ? pluralizeName(item.name) : item.name;

  const parts: string[] = [];

  if (item.size) parts.push(capitalizeWords(item.size));

  if (item.temperature && !ALWAYS_ICED.has(item.name)) {
    parts.push(capitalizeWords(item.temperature));
  }

  if (item.milk && item.milk !== "whole milk" && item.milk !== "whole") {
    parts.push(capitalizeWords(item.milk));
  }

  parts.push(plural ? pluralizeName(item.name) : item.name);
  return parts.join(" ");
}

/**
 * Returns extra customizations shown in parentheses after the title.
 * - Non-default sweetness (less sugar / extra sugar / no sugar)
 * - Non-default ice (only for iced drinks)
 * - Add-ons excluding milk (already in title)
 */
function getCustomizations(item: OrderItem): string[] {
  const custom: string[] = [];

  if (item.sweetness && item.sweetness !== "normal") {
    custom.push(item.sweetness); // "less sugar", "extra sugar", "no sugar"
  }

  const isIced =
    item.temperature === "iced" || ALWAYS_ICED.has(item.name);
  if (isIced && item.ice && item.ice !== "normal") {
    custom.push(item.ice); // "less ice", "extra ice", "no ice"
  }

  for (const addon of item.add_ons ?? []) {
    if (!addon.toLowerCase().includes("milk")) {
      custom.push(addon); // "extra espresso shot", "1 pump caramel syrup", etc.
    }
  }

  return custom;
}

// ── OrderCard ─────────────────────────────────────────────────────────────────

interface CardProps {
  order: Order;
  isDragging: boolean;
  checkedItems: Set<number>;
  onDragStart: () => void;
  onDragEnd: () => void;
  onToggleItem: (index: number) => void;
  onStart?: () => void;
}

function OrderCard({
  order,
  isDragging,
  checkedItems,
  onDragStart,
  onDragEnd,
  onToggleItem,
  onStart,
}: CardProps) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const elapsed = Math.floor(
    (now - new Date(order.created_at).getTime()) / 60_000
  );
  const totalQty = order.items.reduce((s, i) => s + i.quantity, 0);
  const isUrgent = order.status === "new" && elapsed >= 5;
  const isInProgress = order.status === "in_progress";

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={`bg-gray-700 rounded-xl p-4 space-y-3 transition-all cursor-grab active:cursor-grabbing select-none ${
        isUrgent ? "ring-1 ring-yellow-500/60" : ""
      } ${isDragging ? "opacity-40 scale-[0.97] shadow-none" : "shadow-sm"}`}
    >
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <span className="font-bold text-white text-lg tracking-tight">
          #{String(order.order_number).padStart(3, "0")}
        </span>
        <div className="flex items-center gap-2">
          {order.status === "completed" && order.completed_at ? (
            <span className="text-xs font-medium px-2 py-0.5 rounded-full text-green-300 bg-green-900/40">
              ✓{" "}
              {new Date(order.completed_at).toLocaleTimeString("en-US", {
                hour: "numeric",
                minute: "2-digit",
                hour12: true,
              })}
            </span>
          ) : (
            <span
              className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                elapsed < 5
                  ? "text-green-400 bg-green-900/40"
                  : elapsed < 10
                  ? "text-yellow-400 bg-yellow-900/40"
                  : "text-red-400 bg-red-900/40"
              }`}
            >
              {elapsed < 1 ? "just now" : `${elapsed}m ago`}
            </span>
          )}
          {/* Drag handle */}
          <svg className="w-3 h-3 text-gray-500 flex-shrink-0" viewBox="0 0 10 16" fill="currentColor">
            <circle cx="2" cy="2" r="1.5" />
            <circle cx="8" cy="2" r="1.5" />
            <circle cx="2" cy="8" r="1.5" />
            <circle cx="8" cy="8" r="1.5" />
            <circle cx="2" cy="14" r="1.5" />
            <circle cx="8" cy="14" r="1.5" />
          </svg>
        </div>
      </div>

      {/* ── Line items ── */}
      <div className="space-y-2">
        {order.items.map((item, i) => {
          const title = formatItemTitle(item, item.quantity);
          const customs = getCustomizations(item);
          const isChecked = checkedItems.has(i);

          return (
            <div key={i} className="flex items-start gap-2.5">
              {/* Circle checkbox — in-progress orders only */}
              {isInProgress && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleItem(i);
                  }}
                  className={`mt-1 w-6 h-6 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-all ${
                    isChecked
                      ? "bg-green-500 border-green-500"
                      : "border-gray-300 hover:border-white bg-gray-600"
                  }`}
                >
                  {isChecked && (
                    <svg className="w-3.5 h-3.5 text-white" viewBox="0 0 12 12" fill="none">
                      <path
                        d="M2 6l3 3 5-5"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                </button>
              )}

              <div className={`flex-1 transition-opacity ${isChecked ? "opacity-40" : ""}`}>
                <p
                  className={`text-white text-base font-bold leading-snug ${
                    isChecked ? "line-through" : ""
                  }`}
                >
                  {item.quantity > 1 && (
                    <span className="text-yellow-400 font-bold mr-0.5">
                      {item.quantity}×
                    </span>
                  )}{" "}
                  {title}
                </p>
                {customs.length > 0 && (
                  <p className="text-amber-300 font-semibold text-sm mt-0.5">
                    {customs.join(" · ")}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Footer ── */}
      <div className="flex items-center justify-between pt-2 border-t border-gray-600/50">
        <span className="text-xs text-gray-400">
          {totalQty} item{totalQty !== 1 ? "s" : ""}
        </span>
        <span className="text-xs font-medium text-gray-300">
          ${Number(order.total).toFixed(2)}
        </span>
      </div>

      {/* ── Action button ── */}
      {onStart && (
        <button
          onClick={onStart}
          className="w-full py-2 bg-blue-600 hover:bg-blue-500 active:scale-95 text-white text-sm font-semibold rounded-lg transition-all"
        >
          Start
        </button>
      )}
    </div>
  );
}

// ── Column ────────────────────────────────────────────────────────────────────

interface ColumnProps {
  title: string;
  dotColor: string;
  status: OrderStatus;
  orders: Order[];
  emptyText: string;
  isDragOver: boolean;
  anyDragging: boolean;
  draggingId: string | null;
  checkedItems: Map<string, Set<number>>;
  onDragOver: () => void;
  onDragLeave: () => void;
  onDrop: () => void;
  onCardDragStart: (id: string) => void;
  onCardDragEnd: () => void;
  onToggleItem: (orderId: string, itemIndex: number) => void;
  onStart?: (id: string) => void;
}

function Column({
  title,
  dotColor,
  orders,
  emptyText,
  isDragOver,
  anyDragging,
  draggingId,
  checkedItems,
  onDragOver,
  onDragLeave,
  onDrop,
  onCardDragStart,
  onCardDragEnd,
  onToggleItem,
  onStart,
}: ColumnProps) {
  return (
    <div
      onDragOver={(e) => { e.preventDefault(); onDragOver(); }}
      onDragLeave={onDragLeave}
      onDrop={(e) => { e.preventDefault(); onDrop(); }}
      className={`rounded-xl p-4 flex flex-col transition-all ${
        isDragOver
          ? "bg-gray-700 ring-2 ring-sky-400/60 ring-offset-2 ring-offset-gray-900"
          : anyDragging
          ? "bg-gray-800/70"
          : "bg-gray-800"
      }`}
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${dotColor}`} />
        <h2 className="font-semibold text-white">{title}</h2>
        <span className="ml-auto text-xs text-gray-400 bg-gray-700 px-2 py-0.5 rounded-full">
          {orders.length}
        </span>
      </div>

      {/* Cards */}
      <div className="space-y-3 flex-1 min-h-[120px]">
        {orders.length === 0 ? (
          <div
            className={`flex items-center justify-center min-h-[120px] rounded-lg border-2 border-dashed transition-colors ${
              isDragOver ? "border-sky-400/60 bg-sky-900/10" : "border-transparent"
            }`}
          >
            <p className="text-gray-500 text-sm">{emptyText}</p>
          </div>
        ) : (
          orders.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              isDragging={draggingId === order.id}
              checkedItems={checkedItems.get(order.id) ?? new Set()}
              onDragStart={() => onCardDragStart(order.id)}
              onDragEnd={onCardDragEnd}
              onToggleItem={(idx) => onToggleItem(order.id, idx)}
              onStart={onStart ? () => onStart(order.id) : undefined}
            />
          ))
        )}
      </div>
    </div>
  );
}

// ── BaristaPage ───────────────────────────────────────────────────────────────

const DATE_STR = new Date().toLocaleDateString("en-US", {
  weekday: "long",
  month: "long",
  day: "numeric",
});

export default function BaristaPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverStatus, setDragOverStatus] = useState<OrderStatus | null>(null);
  const [checkedItems, setCheckedItems] = useState<Map<string, Set<number>>>(new Map());
  const [lastFetched, setLastFetched] = useState<Date | null>(null);
  const [secAgo, setSecAgo] = useState(0);

  const knownIdsRef = useRef<Set<string>>(new Set());
  const initializedRef = useRef(false);
  // Tracks when each order was most recently advanced (for sort order)
  const recentlyAdvancedRef = useRef<Map<string, number>>(new Map());
  // Tracks pending auto-complete timers for in-progress checkboxes
  const autoCompleteTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  // Persistent AudioContext — created on first user gesture to satisfy browser autoplay policy
  const audioCtxRef = useRef<AudioContext | null>(null);

  // Cleanup auto-complete timers on unmount
  useEffect(() => {
    return () => { autoCompleteTimers.current.forEach(clearTimeout); };
  }, []);

  // Prime the AudioContext on first click anywhere on the page (browser autoplay requirement)
  useEffect(() => {
    const prime = () => {
      if (!audioCtxRef.current) {
        const AC = window.AudioContext || (window as any).webkitAudioContext;
        audioCtxRef.current = new AC();
      } else {
        audioCtxRef.current.resume();
      }
    };
    window.addEventListener("click", prime);
    return () => window.removeEventListener("click", prime);
  }, []);

  // ── "Last updated" counter ─────────────────────────────────────────────────
  useEffect(() => {
    const t = setInterval(() => {
      if (lastFetched) {
        setSecAgo(Math.floor((Date.now() - lastFetched.getTime()) / 1000));
      }
    }, 1000);
    return () => clearInterval(t);
  }, [lastFetched]);

  // ── Audio chime ───────────────────────────────────────────────────────────
  const playChime = useCallback(() => {
    try {
      // Reuse the primed context; fall back to creating a fresh one if needed
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      const ctx: AudioContext = audioCtxRef.current ?? new AC();
      audioCtxRef.current = ctx;
      if (ctx.state === "suspended") ctx.resume();

      [880, 1100, 1320].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = "sine";
        osc.frequency.value = freq;
        const t = ctx.currentTime + i * 0.18;
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(0.45, t + 0.04);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
        osc.start(t);
        osc.stop(t + 0.4);
      });
    } catch { /* Audio not available */ }
  }, []);

  // ── Fetch orders ──────────────────────────────────────────────────────────
  const fetchOrders = useCallback(async () => {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .gte("created_at", startOfDay.toISOString())
      .order("created_at", { ascending: true });

    if (!error && data) {
      const fetched = data as Order[];
      if (initializedRef.current) {
        if (fetched.some((o) => !knownIdsRef.current.has(o.id))) playChime();
      }
      initializedRef.current = true;
      knownIdsRef.current = new Set(fetched.map((o) => o.id));
      setOrders(fetched);
      setLastFetched(new Date());
    }

    setLoading(false);
  }, [playChime]);

  useEffect(() => {
    fetchOrders();
    const timer = setInterval(fetchOrders, 5_000);
    return () => clearInterval(timer);
  }, [fetchOrders]);

  useEffect(() => {
    const channel = supabase
      .channel("orders-board")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, fetchOrders)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchOrders]);

  // ── Advance / revert status ───────────────────────────────────────────────
  const advance = useCallback(async (orderId: string, to: OrderStatus) => {
    const patch: { status: OrderStatus; completed_at: string | null } = {
      status: to,
      completed_at: to === "completed" ? new Date().toISOString() : null,
    };

    recentlyAdvancedRef.current.set(orderId, Date.now());

    setOrders((prev) =>
      prev.map((o) => (o.id === orderId ? { ...o, ...patch } : o))
    );

    await supabase.from("orders").update(patch).eq("id", orderId);
  }, []);

  // ── Per-item checkbox toggle ──────────────────────────────────────────────
  const toggleItem = useCallback((orderId: string, itemIndex: number) => {
    setCheckedItems((prev) => {
      const next = new Map(prev);
      const set = new Set(prev.get(orderId) ?? []);
      if (set.has(itemIndex)) set.delete(itemIndex);
      else set.add(itemIndex);
      next.set(orderId, set);
      return next;
    });
  }, []);

  // ── Auto-complete: watch checkedItems, move card when all items checked ───
  // useEffect ensures this works correctly in React Strict Mode (no side-effects
  // inside state updaters). Cleanup cancels pending timers if user unchecks.
  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];

    for (const [orderId, checked] of checkedItems) {
      const order = orders.find(
        (o) => o.id === orderId && o.status === "in_progress"
      );
      if (!order || order.items.length === 0) continue;
      if (checked.size < order.items.length) continue;

      const t = setTimeout(() => {
        advance(orderId, "completed");
        setCheckedItems((prev) => {
          const next = new Map(prev);
          next.delete(orderId);
          return next;
        });
      }, 500);
      timers.push(t);
    }

    return () => timers.forEach(clearTimeout);
  }, [checkedItems, orders, advance]);

  // ── Drag handlers ─────────────────────────────────────────────────────────
  const handleDrop = useCallback(
    (targetStatus: OrderStatus) => {
      if (!draggingId) return;
      const order = orders.find((o) => o.id === draggingId);
      if (order && order.status !== targetStatus) {
        advance(draggingId, targetStatus);
      }
      setDraggingId(null);
      setDragOverStatus(null);
    },
    [draggingId, orders, advance]
  );

  // ── Sort helpers — newest at top in every column ─────────────────────────
  const newOrders = [...orders.filter((o) => o.status === "new")].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  // In Progress: most recently started at top
  const inProgress = [...orders.filter((o) => o.status === "in_progress")].sort((a, b) => {
    const at = recentlyAdvancedRef.current.get(a.id) ?? 0;
    const bt = recentlyAdvancedRef.current.get(b.id) ?? 0;
    if (at !== bt) return bt - at;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  // Completed: most recently completed at top, auto-hidden after 20 min
  const TWENTY_MIN_MS = 20 * 60 * 1000;
  const completed = [...orders.filter((o) => {
    if (o.status !== "completed") return false;
    if (!o.completed_at) return false;
    return Date.now() - new Date(o.completed_at).getTime() < TWENTY_MIN_MS;
  })].sort((a, b) => {
    const at =
      recentlyAdvancedRef.current.get(a.id) ??
      (a.completed_at ? new Date(a.completed_at).getTime() : 0);
    const bt =
      recentlyAdvancedRef.current.get(b.id) ??
      (b.completed_at ? new Date(b.completed_at).getTime() : 0);
    return bt - at;
  });

  // ── Shared column props ───────────────────────────────────────────────────
  const colProps = (status: OrderStatus) => ({
    status,
    isDragOver: dragOverStatus === status,
    anyDragging: draggingId !== null,
    draggingId,
    checkedItems,
    onDragOver: () => setDragOverStatus(status),
    onDragLeave: () => setDragOverStatus((s) => (s === status ? null : s)),
    onDrop: () => handleDrop(status),
    onCardDragStart: (id: string) => setDraggingId(id),
    onCardDragEnd: () => { setDraggingId(null); setDragOverStatus(null); },
    onToggleItem: toggleItem,
  });

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-[calc(100vh-3.5rem)] bg-gray-900 text-white p-4 sm:p-6">
      <div className="max-w-7xl mx-auto">

        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Order Queue</h1>
            <p className="text-gray-400 text-sm mt-0.5">
              {DATE_STR}
              {lastFetched && (
                <> · updated {secAgo === 0 ? "just now" : `${secAgo}s ago`}</>
              )}
              {" · "}drag cards to move between columns
            </p>
          </div>
          {loading && (
            <div className="w-5 h-5 rounded-full border-2 border-gray-600 border-t-gray-300 animate-spin" />
          )}
        </div>

        {/* Kanban board */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6">
          <Column
            title="New"
            dotColor="bg-yellow-400"
            orders={newOrders}
            emptyText="No new orders"
            onStart={(id) => advance(id, "in_progress")}
            {...colProps("new")}
          />
          <Column
            title="In Progress"
            dotColor="bg-blue-400"
            orders={inProgress}
            emptyText="No orders in progress"
            {...colProps("in_progress")}
          />
          <Column
            title="Completed"
            dotColor="bg-green-400"
            orders={completed}
            emptyText="No completed orders today"
            {...colProps("completed")}
          />
        </div>

      </div>
    </div>
  );
}
