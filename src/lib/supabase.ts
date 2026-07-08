import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://jbhlflxfvefgubbjudaq.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpiaGxmbHhmdmVmZ3ViYmp1ZGFxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI4MzQxODksImV4cCI6MjA5ODQxMDE4OX0.zzYSmhQyA4rj0q_LQL-tI8e4VxAjQKZPwgR4heOx45k";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

export type OrderStatus = "New" | "Preparing" | "Ready" | "Done";

export interface RepublicOrder {
  id: number;
  created_at: string;
  Name: string | null;
  Order: string | null;
  Amount: number | null;
  Status: OrderStatus | string | null;
}

export const STATUSES: OrderStatus[] = ["New", "Preparing", "Ready", "Done"];

export const nextStatus = (s: string | null | undefined): OrderStatus => {
  const i = STATUSES.indexOf((s as OrderStatus) ?? "New");
  if (i < 0) return "Preparing";
  return STATUSES[Math.min(i + 1, STATUSES.length - 1)];
};