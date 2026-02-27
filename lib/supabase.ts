import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Types for the orders table
export type OrderStatus = "new" | "in_progress" | "completed";

export interface OrderItem {
  name: string;
  category: "coffee" | "tea" | "pastry";
  size?: "small" | "large";
  temperature?: "hot" | "iced";
  milk?: string;
  sweetness?: string;
  ice?: string;
  add_ons: string[];
  quantity: number;
  base_price: number;
  add_on_price: number;
  item_total: number;
}

export interface Order {
  id: string;
  order_number: number;
  items: OrderItem[];
  subtotal: number;
  tax: number;
  total: number;
  status: OrderStatus;
  created_at: string;
  completed_at: string | null;
}
