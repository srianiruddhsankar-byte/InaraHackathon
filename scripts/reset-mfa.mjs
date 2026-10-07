// Remove a staff account's authenticator (TOTP) factors, so it can be enrolled again on another phone.
// LOCAL ONLY (service_role key, see scripts/seed-auth.mjs).
//
//   node --env-file=.env.local scripts/reset-mfa.mjs dr.meera@inara-hospital.in
import { createClient } from "@supabase/supabase-js";

const email = process.argv[2]?.trim().toLowerCase();
const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!email || !url || !serviceKey) {
  console.error("Usage: node --env-file=.env.local scripts/reset-mfa.mjs <email>  (needs SUPABASE_SERVICE_ROLE_KEY)");
  process.exit(1);
}

const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

let user;
for (let page = 1; !user; page++) {
  const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
  if (error) throw error;
  user = data.users.find((u) => u.email?.toLowerCase() === email);
  if (data.users.length < 200) break;
}
if (!user) {
  console.error(`No account for ${email}`);
  process.exit(1);
}

const { data, error } = await admin.auth.admin.mfa.listFactors({ userId: user.id });
if (error) throw error;
for (const factor of data.factors) {
  const { error: delError } = await admin.auth.admin.mfa.deleteFactor({ userId: user.id, id: factor.id });
  if (delError) throw delError;
  console.log(`✓ removed ${factor.factor_type} factor ${factor.friendly_name ?? factor.id}`);
}
console.log(data.factors.length ? `Done. ${email} will set up a new authenticator at the next login.` : `${email} had no 2FA factors.`);
