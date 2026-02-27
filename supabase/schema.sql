-- NYC Coffee — Supabase Database Schema
-- Run this in the Supabase SQL Editor to set up the orders table.

-- ============================================================
-- orders table
-- ============================================================
CREATE TABLE IF NOT EXISTS orders (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number  serial NOT NULL,
  items         jsonb NOT NULL DEFAULT '[]',
  subtotal      decimal(10, 2) NOT NULL,
  tax           decimal(10, 2) NOT NULL,
  total         decimal(10, 2) NOT NULL,
  status        text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'in_progress', 'completed')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  completed_at  timestamptz
);

-- Index for barista queue queries (ordered by creation time, filtered by status)
CREATE INDEX IF NOT EXISTS idx_orders_status_created ON orders (status, created_at DESC);

-- Index for dashboard date-range queries
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders (created_at DESC);

-- ============================================================
-- Row Level Security (RLS)
-- Enable RLS but allow full access via the anon key for this project
-- (no auth required per the PRD — all views are publicly accessible)
-- ============================================================
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

-- Allow anonymous reads (barista view, dashboard)
CREATE POLICY "Allow anon read" ON orders
  FOR SELECT
  USING (true);

-- Allow anonymous inserts (customer placing orders)
CREATE POLICY "Allow anon insert" ON orders
  FOR INSERT
  WITH CHECK (true);

-- Allow anonymous updates (barista updating status)
CREATE POLICY "Allow anon update" ON orders
  FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- ============================================================
-- Enable Realtime for the orders table (barista live updates)
-- Run this separately in the Supabase dashboard if needed:
--   Supabase Dashboard → Database → Replication → orders table
-- Or uncomment and run:
-- ============================================================
-- ALTER PUBLICATION supabase_realtime ADD TABLE orders;

-- ============================================================
-- daily_order_sequence — resets order_number daily
-- We use a function + trigger approach for human-readable daily order numbers
-- e.g., order 1, 2, 3... reset to 1 each day
-- ============================================================

-- Function to get today's next order number
CREATE OR REPLACE FUNCTION next_daily_order_number()
RETURNS integer AS $$
DECLARE
  next_num integer;
BEGIN
  SELECT COALESCE(MAX(order_number), 0) + 1
  INTO next_num
  FROM orders
  WHERE created_at >= date_trunc('day', now())
    AND created_at <  date_trunc('day', now()) + interval '1 day';
  RETURN next_num;
END;
$$ LANGUAGE plpgsql;

-- Trigger function that sets order_number before insert
CREATE OR REPLACE FUNCTION set_daily_order_number()
RETURNS trigger AS $$
BEGIN
  NEW.order_number := next_daily_order_number();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Attach trigger to orders table
DROP TRIGGER IF EXISTS trigger_set_daily_order_number ON orders;
CREATE TRIGGER trigger_set_daily_order_number
  BEFORE INSERT ON orders
  FOR EACH ROW
  EXECUTE FUNCTION set_daily_order_number();
