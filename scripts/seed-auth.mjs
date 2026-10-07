// Seed the demo STAFF accounts into Supabase Auth + public.profiles (synthetic data only).
//
// LOCAL ONLY. Needs the service_role (secret) key, which bypasses RLS — never put it in a
// NEXT_PUBLIC_ variable, never commit it, never send it to the browser.
//
//   1. Add to .env.local (gitignored):  SUPABASE_SERVICE_ROLE_KEY=...   (Project Settings → API keys)
//   2. Run supabase/auth_profiles.sql in the SQL Editor first.
//   3. node --env-file=.env.local scripts/seed-auth.mjs
//
// Safe to re-run: existing accounts get their password, profile and status reset to the demo values.
// Their authenticator (2FA) factors are kept — use scripts/reset-mfa.mjs to remove one.
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Run: node --env-file=.env.local scripts/seed-auth.mjs");
  process.exit(1);
}
if (serviceKey === process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
  console.error("SUPABASE_SERVICE_ROLE_KEY is the public anon key. Use the service_role / secret key.");
  process.exit(1);
}

const PASSWORD = "demo123"; // same as src/lib/users.ts DEMO_PASSWORD

// Mirrors the staff accounts in src/lib/users.ts (app_user_id = their id there).
const ACCOUNTS = [
  {
    email: "dr.meera@inara-hospital.in",
    profile: { role: "doctor", name: "Dr. Meera Nair", hospital: "Meridian Hospital", specialty: "Endocrinology / General Medicine", council_reg_no: "TNMC 104522", app_user_id: "u-meera", status: "verified" },
  },
  {
    email: "dr.arun@citycare.in",
    profile: { role: "doctor", name: "Dr. Arun Rao", hospital: "CityCare Hospital", specialty: "Nephrology", council_reg_no: "KMC 88213", app_user_id: "u-arun", status: "verified" },
  },
  {
    email: "dr.test@inara-hospital.in",
    profile: { role: "doctor", name: "Dr. Test Pending", hospital: "Meridian Hospital", specialty: "General Medicine", council_reg_no: "TNMC 200001", app_user_id: "u-test-pending", status: "pending" },
  },
  {
    email: "lab@inara-diagnostics.in",
    profile: { role: "lab", name: "Meridian Diagnostics", hospital: null, specialty: null, council_reg_no: null, app_user_id: "u-lab", status: "verified" },
  },
  {
    email: "admin@inara-hospital.in",
    profile: { role: "admin", name: "Hospital Admin (Meridian)", hospital: "Meridian Hospital", specialty: null, council_reg_no: null, app_user_id: "u-admin", status: "verified" },
  },
];

const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

async function allUsers() {
  const users = [];
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    users.push(...data.users);
    if (data.users.length < 200) return users;
  }
}

const existing = new Map((await allUsers()).map((u) => [u.email?.toLowerCase(), u]));

for (const { email, profile } of ACCOUNTS) {
  let user = existing.get(email);
  if (user) {
    const { data, error } = await admin.auth.admin.updateUserById(user.id, { password: PASSWORD, email_confirm: true });
    if (error) throw error;
    user = data.user;
  } else {
    // user_metadata.role = 'seed' → the sign-up trigger skips it; the profile is written below.
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { role: "seed", name: profile.name },
    });
    if (error) throw error;
    user = data.user;
  }
  const { error } = await admin.from("profiles").upsert({ id: user.id, email, ...profile }, { onConflict: "id" });
  if (error) throw error;
  console.log(`✓ ${profile.status.padEnd(9)} ${profile.role.padEnd(6)} ${email}`);
}

console.log(`\nDone. Password for all: ${PASSWORD}. Doctors and the admin enrol an authenticator app at first login.`);
