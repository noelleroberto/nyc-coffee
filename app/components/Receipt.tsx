import { Order, OrderItem } from "@/lib/supabase";

interface ReceiptProps {
  order: Order;
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatTime(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function getItemDetails(item: OrderItem): string {
  const parts: string[] = [];
  if (item.size) parts.push(item.size.charAt(0).toUpperCase() + item.size.slice(1));
  if (item.temperature)
    parts.push(item.temperature.charAt(0).toUpperCase() + item.temperature.slice(1));
  if (item.milk && item.milk !== "whole milk") parts.push(item.milk);
  if (item.sweetness && item.sweetness !== "normal") {
    const labels: Record<string, string> = {
      "no sugar": "No Sugar",
      "less sugar": "Less Sugar",
      "extra sugar": "Extra Sugar",
    };
    parts.push(labels[item.sweetness] ?? item.sweetness);
  }
  if (item.ice && item.ice !== "normal" && item.temperature === "iced") {
    const labels: Record<string, string> = {
      "no ice": "No Ice",
      "less ice": "Less Ice",
      "extra ice": "Extra Ice",
    };
    parts.push(labels[item.ice] ?? item.ice);
  }
  if (item.add_ons && item.add_ons.length > 0) {
    parts.push(...item.add_ons.map((a) => a.charAt(0).toUpperCase() + a.slice(1)));
  }
  return parts.join(" · ");
}

function estimateETA(items: OrderItem[]): number {
  let minutes = 2; // base prep time
  for (const item of items) {
    if (item.category === "coffee") minutes += item.quantity * 2;
    else if (item.category === "tea") minutes += item.quantity * 1;
    // pastries are quick
  }
  return Math.min(Math.max(minutes, 3), 15);
}

export default function Receipt({ order }: ReceiptProps) {
  const eta = estimateETA(order.items);

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-md w-72 font-mono text-sm my-1">
      {/* Store header */}
      <div className="bg-stone-900 text-white text-center py-4 px-5">
        <p className="font-bold tracking-widest text-base">NYC COFFEE</p>
        <p className="text-stone-400 text-xs mt-1">512 W 43rd St · New York, NY</p>
        <p className="text-stone-400 text-xs">Tel: 212-535-7367</p>
      </div>

      {/* Order number + timestamp */}
      <div className="flex justify-between items-start px-5 py-3 border-b border-dashed border-stone-200 bg-stone-50">
        <div>
          <p className="text-stone-400 text-xs uppercase tracking-wide">Date</p>
          <p className="text-stone-700 text-xs mt-0.5">{formatDate(order.created_at)}</p>
          <p className="text-stone-700 text-xs">{formatTime(order.created_at)}</p>
        </div>
        <div className="text-right">
          <p className="text-stone-400 text-xs uppercase tracking-wide">Order</p>
          <p className="text-stone-900 text-3xl font-bold leading-none mt-1">
            #{String(order.order_number).padStart(3, "0")}
          </p>
        </div>
      </div>

      {/* Items */}
      <div className="px-5 py-3 space-y-3 border-b border-dashed border-stone-200">
        {order.items.map((item, i) => (
          <div key={i} className="flex justify-between gap-2">
            <div className="flex-1 min-w-0">
              <p className="text-stone-900 font-medium leading-snug">
                {item.quantity > 1 ? `${item.quantity}× ` : ""}
                {item.name}
              </p>
              {getItemDetails(item) && (
                <p className="text-stone-400 text-xs mt-0.5 leading-relaxed">
                  {getItemDetails(item)}
                </p>
              )}
            </div>
            <p className="text-stone-900 whitespace-nowrap tabular-nums">
              ${item.item_total.toFixed(2)}
            </p>
          </div>
        ))}
      </div>

      {/* Totals */}
      <div className="px-5 py-3 space-y-1.5 border-b border-dashed border-stone-200">
        <div className="flex justify-between text-stone-500 text-xs">
          <span>Subtotal</span>
          <span className="tabular-nums">${order.subtotal.toFixed(2)}</span>
        </div>
        <div className="flex justify-between text-stone-500 text-xs">
          <span>Tax (8.875%)</span>
          <span className="tabular-nums">${order.tax.toFixed(2)}</span>
        </div>
        <div className="flex justify-between text-stone-900 font-bold text-sm pt-1.5 border-t border-stone-200">
          <span>Total</span>
          <span className="tabular-nums">${order.total.toFixed(2)}</span>
        </div>
      </div>

      {/* ETA + pickup instructions */}
      <div className="px-5 py-4 text-center">
        <p className="text-stone-400 text-xs uppercase tracking-widest">
          Estimated Pickup
        </p>
        <p className="text-stone-900 font-bold text-2xl mt-1">~{eta} min</p>
        <div className="mt-3 pt-3 border-t border-dashed border-stone-200">
          <p className="text-stone-700 text-xs font-medium">
            No need to wait in line!
          </p>
          <p className="text-stone-500 text-xs mt-0.5">
            Head straight to the pick-up counter ☕
          </p>
        </div>
      </div>
    </div>
  );
}
