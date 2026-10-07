import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null | undefined;

/** Every request gives up after this long, so a blocked network can't hang the login or the sync. */
export const REQUEST_TIMEOUT_MS = 8000;

const fetchWithTimeout: typeof fetch = (input, init) =>
  fetch(input, init?.signal ? init : { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });

/**
 * The browser Supabase client (shared sync + staff sign-in), or null when the keys are missing
 * or invalid — then the app runs exactly as before, from localStorage, with the demo login.
 * (process.env.NEXT_PUBLIC_* must be written out in full so Next can inline it.)
 */
export function getSupabase(): SupabaseClient | null {
  if (client !== undefined) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  client = null;
  if (url && key) {
    try {
      client = createClient(url, key, {
        // The staff login (and its 2FA level) survives a reload; patients never sign in here.
        auth: { persistSession: true, autoRefreshToken: true, storageKey: "inara-auth" },
        global: { fetch: fetchWithTimeout },
      });
    } catch {
      client = null;
    }
  }
  return client;
}
