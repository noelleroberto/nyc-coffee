/**
 * Seed script — inserts realistic dummy orders for barista-view testing.
 * Run with:  node scripts/seed-orders.mjs
 */

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  "https://joormbhvhbnwizyznfjx.supabase.co",
  "sb_publishable_r_0_22_lCiSQbYjUtFA0kg_CvdbrzY2"
);

const now = new Date();
const minsAgo = (m) => new Date(now.getTime() - m * 60_000).toISOString();

const orders = [
  // ── NEW ──────────────────────────────────────────────────────────────
  {
    status: "new",
    created_at: minsAgo(1),
    items: [
      {
        name: "Latte",
        category: "coffee",
        size: "large",
        temperature: "iced",
        milk: "oat milk",
        sweetness: "normal",
        ice: "less ice",
        add_ons: ["oat milk", "extra espresso shot"],
        quantity: 1,
        base_price: 5.00,
        add_on_price: 2.00,
        item_total: 7.00,
      },
      {
        name: "Plain Croissant",
        category: "pastry",
        size: null,
        temperature: null,
        milk: null,
        sweetness: null,
        ice: null,
        add_ons: ["heated"],
        quantity: 1,
        base_price: 3.50,
        add_on_price: 0,
        item_total: 3.50,
      },
    ],
    subtotal: 10.50,
    tax: 0.93,
    total: 11.43,
  },
  {
    status: "new",
    created_at: minsAgo(3),
    items: [
      {
        name: "Cold Brew",
        category: "coffee",
        size: "small",
        temperature: "iced",
        milk: null,
        sweetness: "extra sugar",
        ice: "normal",
        add_ons: [],
        quantity: 2,
        base_price: 4.00,
        add_on_price: 0,
        item_total: 8.00,
      },
    ],
    subtotal: 8.00,
    tax: 0.71,
    total: 8.71,
  },
  {
    // Urgent — >5 min old, still "new"
    status: "new",
    created_at: minsAgo(7),
    items: [
      {
        name: "Mocha",
        category: "coffee",
        size: "large",
        temperature: "hot",
        milk: "whole milk",
        sweetness: "less sugar",
        ice: null,
        add_ons: ["1 pump caramel syrup"],
        quantity: 1,
        base_price: 5.50,
        add_on_price: 0.50,
        item_total: 6.00,
      },
      {
        name: "Matcha Latte",
        category: "tea",
        size: "small",
        temperature: "hot",
        milk: "oat milk",
        sweetness: "normal",
        ice: null,
        add_ons: ["oat milk", "extra matcha shot"],
        quantity: 1,
        base_price: 4.50,
        add_on_price: 2.00,
        item_total: 6.50,
      },
    ],
    subtotal: 12.50,
    tax: 1.11,
    total: 13.61,
  },

  // ── IN PROGRESS ──────────────────────────────────────────────────────
  {
    status: "in_progress",
    created_at: minsAgo(5),
    items: [
      {
        name: "Americano",
        category: "coffee",
        size: "small",
        temperature: "hot",
        milk: null,
        sweetness: "no sugar",
        ice: null,
        add_ons: [],
        quantity: 1,
        base_price: 3.00,
        add_on_price: 0,
        item_total: 3.00,
      },
      {
        name: "Chocolate Chip Cookie",
        category: "pastry",
        size: null,
        temperature: null,
        milk: null,
        sweetness: null,
        ice: null,
        add_ons: [],
        quantity: 2,
        base_price: 2.50,
        add_on_price: 0,
        item_total: 5.00,
      },
    ],
    subtotal: 8.00,
    tax: 0.71,
    total: 8.71,
  },
  {
    status: "in_progress",
    created_at: minsAgo(8),
    items: [
      {
        name: "Coffee Frappuccino",
        category: "coffee",
        size: "large",
        temperature: "iced",
        milk: "almond milk",
        sweetness: "extra sugar",
        ice: "extra ice",
        add_ons: ["almond milk", "1 pump hazelnut syrup"],
        quantity: 1,
        base_price: 6.00,
        add_on_price: 1.25,
        item_total: 7.25,
      },
    ],
    subtotal: 7.25,
    tax: 0.64,
    total: 7.89,
  },

  // ── COMPLETED ────────────────────────────────────────────────────────
  {
    status: "completed",
    created_at: minsAgo(20),
    completed_at: minsAgo(15),
    items: [
      {
        name: "Lemon Green Tea",
        category: "tea",
        size: "large",
        temperature: "iced",
        milk: null,
        sweetness: "less sugar",
        ice: "no ice",
        add_ons: [],
        quantity: 1,
        base_price: 4.25,
        add_on_price: 0,
        item_total: 4.25,
      },
    ],
    subtotal: 4.25,
    tax: 0.38,
    total: 4.63,
  },
  {
    status: "completed",
    created_at: minsAgo(30),
    completed_at: minsAgo(22),
    items: [
      {
        name: "Latte",
        category: "coffee",
        size: "small",
        temperature: "hot",
        milk: "skim milk",
        sweetness: "normal",
        ice: null,
        add_ons: [],
        quantity: 1,
        base_price: 4.00,
        add_on_price: 0,
        item_total: 4.00,
      },
      {
        name: "Banana Bread (Slice)",
        category: "pastry",
        size: null,
        temperature: null,
        milk: null,
        sweetness: null,
        ice: null,
        add_ons: ["heated"],
        quantity: 1,
        base_price: 3.00,
        add_on_price: 0,
        item_total: 3.00,
      },
    ],
    subtotal: 7.00,
    tax: 0.62,
    total: 7.62,
  },
  {
    status: "completed",
    created_at: minsAgo(45),
    completed_at: minsAgo(38),
    items: [
      {
        name: "Black Tea",
        category: "tea",
        size: "large",
        temperature: "hot",
        milk: null,
        sweetness: "extra sugar",
        ice: null,
        add_ons: [],
        quantity: 3,
        base_price: 3.75,
        add_on_price: 0,
        item_total: 11.25,
      },
    ],
    subtotal: 11.25,
    tax: 1.00,
    total: 12.25,
  },
];

async function seed() {
  console.log(`Inserting ${orders.length} dummy orders…`);

  const { data, error } = await supabase
    .from("orders")
    .insert(orders)
    .select("id, order_number, status");

  if (error) {
    console.error("❌ Insert failed:", error.message);
    process.exit(1);
  }

  console.log("✅ Inserted orders:");
  data.forEach((o) =>
    console.log(`  #${o.order_number}  [${o.status}]  ${o.id}`)
  );
}

seed();
