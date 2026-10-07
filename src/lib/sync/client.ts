import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null | undefined;

/**
 * The browser Supabase client, or null when the keys are missing or invalid —
 * then the app runs exactly as before, from localStorage only.
 * (process.env.NEXT_PUBLIC_* must be written out in full so Next can inline it.)
 */
export function getSupabase(): SupabaseClient | null {
  if (client !== undefined) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  client = null;
  if (url && key) {
    try {
      client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    } catch {
      client = null;
    }
  }
  return client;
}
