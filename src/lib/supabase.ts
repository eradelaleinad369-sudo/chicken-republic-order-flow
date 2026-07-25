import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://xyzxvqcezhthphrvtmuo.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh5enh2cWNlemh0aHBocnZ0bXVvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQwNTU2ODAsImV4cCI6MjA5OTYzMTY4MH0.DyhMs63nhYwwbd8Ezb0_Hr3d-2c9sTeZ6phLe-Cf5hg";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    storage: typeof window !== "undefined" ? window.localStorage : undefined,
    storageKey: "chicken-republic-auth",
  },
});

export type OrderStatus = "New" | "Preparing" | "Ready" | "Done";

export interface RepublicOrder {
  id: number;
  created_at: string;
  Name: string | null;
  Order: string | null;
  Amount: number | null;
  Status: OrderStatus | string | null;
  payment_status?: string | null;
  table_number?: string | number | null;
  public_code?: string | null;
}

export interface PendingOrder {
  id: number;
  created_at: string;
  customer_name: string | null;
  order_summary: string | null;
  amount: number | null;
  status: string | null;
  table_number: string | number | null;
  public_code: string | null;
  payment_status: string | null;
  minutes_waiting: number | null;
}

export interface MenuItem {
  id: number | string;
  name?: string | null;
  item_name?: string | null;
  price?: number | null;
  category?: string | null;
  is_available: boolean | null;
  price_variants?: { label: string; price: number }[] | null;
}

export interface Category {
  id: number;
  name: string;
  display_order: number;
}

export const STATUSES: OrderStatus[] = ["New", "Preparing", "Ready", "Done"];

export const nextStatus = (s: string | null | undefined): OrderStatus => {
  const i = STATUSES.indexOf((s as OrderStatus) ?? "New");
  if (i < 0) return "Preparing";
  return STATUSES[Math.min(i + 1, STATUSES.length - 1)];
};
