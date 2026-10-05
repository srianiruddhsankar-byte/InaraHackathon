# Inara — Project Brief for Claude

## What Inara is
A doctor-in-the-loop lab report platform. Tagline: "One test. Many diseases. Always doctor-approved."
Flow: lab uploads results → system normalises tests → rules flag abnormal values → the same panel is screened for several diseases (doctor's suspected disease FIRST) → trend engine compares with the patient's own history → AI draft report → doctor edits and approves → only then the patient sees a plain-language report → patient can share the record via QR with OTP consent.
This is a HACKATHON PROTOTYPE. Priority: a polished, reliable demo over completeness.

## Non-negotiable rules
- Synthetic data only. Never add real patient data.
- Clinical decision support, NOT diagnosis. Wording in UI: "suggests", "consider", "flag for review". Never "you have X".
- Patients NEVER see AI drafts. Only reports with status "approved" are visible in patient views.
- The doctor's prescription is shown verbatim. Any AI explanation of it is labelled "AI explanation".
- Report versions are append-only: ai_draft → doctor_edited → approved. Never overwrite a version.
- AI-generated text always shows an "AI DRAFT" badge on doctor screens.
- Every page shows a footer: "Prototype · Synthetic data · Clinical decision support, not a diagnosis."

## Stack
- Next.js (App Router, TypeScript, src/ dir), Tailwind, shadcn/ui, lucide-react icons
- recharts for charts, qrcode.react for QR, zustand + persist (localStorage) for all state
- No backend database, no real auth for now. Do not add new major libraries, databases or auth providers without asking me first.
- vitest for unit tests of /lib logic

## Folder structure
- src/app/ — routes (see Screens)
- src/components/ — shared UI (layout/, charts/, report/, patient/)
- src/lib/tests.ts — test dictionary: canonical name, LOINC code, unit, aliases, reference ranges (by sex where needed)
- src/lib/normalise.ts — map messy test names via aliases + unit conversion
- src/lib/rules.ts — flags and disease screens
- src/lib/trends.ts — slope per year, baseline deviation, "drifting within range"
- src/lib/findings.ts — combine into ordered findings (suspected disease first, then "Also detected")
- src/lib/draft.ts — template-based plain-language draft text (LLM can replace this later)
- src/lib/seed.ts — synthetic patients and reports
- src/store/useInaraStore.ts — zustand store
- src/lib/__tests__/ — vitest tests

## Data model (TypeScript types in src/lib/types.ts)
- Patient: id, name, age, sex ("M"|"F"), bloodGroup, allergies[], chronicConditions[], suspectedDisease
- LabValue: testKey, value, unit, flag ("low"|"normal"|"high")
- Report: id, patientId, date, labName, values: LabValue[], versions: ReportVersion[]
- ReportVersion: id, status ("ai_draft"|"doctor_edited"|"approved"), text, prescription?, author, timestamp
- ShareToken: token (random nanoid), patientId, createdAt, revoked, emergencyOnly
- AccessLogEntry: patientId, viewer, timestamp, action

## Tests tracked (canonical keys)
hba1c (%), fasting_glucose (mg/dL), total_chol, ldl, hdl, triglycerides (mg/dL), creatinine (mg/dL), urine_acr (mg/g), hb (g/dL), mcv (fL), rbc (million/µL), platelets (10^3/µL), ferritin (ng/mL), ast, alt (U/L)
Unit conversions: glucose mmol/L × 18 = mg/dL; creatinine µmol/L ÷ 88.4 = mg/dL.

## Medical logic (implement exactly, with unit tests)
- Diabetes (ADA): HbA1c <5.7 normal, 5.7–6.4 prediabetes, ≥6.5 diabetes range. Fasting glucose 100–125 prediabetes, ≥126 diabetes range.
- Kidney: eGFR via CKD-EPI 2021 race-free equation: 142 × min(Scr/κ,1)^α × max(Scr/κ,1)^−1.200 × 0.9938^age × 1.012 [if female]; κ = 0.7 (F) / 0.9 (M); α = −0.241 (F) / −0.302 (M). KDIGO G stages: G1 ≥90, G2 60–89, G3a 45–59, G3b 30–44, G4 15–29, G5 <15. Urine ACR ≥30 mg/g = albuminuria (A2), ≥300 = A3. eGFR decline >5 per year = "rapid decline" (KDIGO).
- Anaemia (WHO): Hb <13 (men), <12 (women). Mentzer index = MCV ÷ RBC: <13 suggests thalassaemia trait, >13 suggests iron deficiency. Recommend "consider Hb electrophoresis" when trait is suggested.
- Liver fibrosis risk: FIB-4 = (age × AST) ÷ (platelets × √ALT). <1.3 low, 1.3–2.67 indeterminate, >2.67 high.
- Lipids: LDL ≥160 high, 130–159 borderline; HDL <40 (M) / <50 (F) low; triglycerides ≥150 high.
- Trends: linear regression slope per year over report dates; deviation of latest value from the patient's own mean of earlier reports; flag "drifting within range" when the trend is significant but the latest value is still normal.

## Synthetic patients (4 yearly reports each: Mar 2023, Mar 2024, Mar 2025, Mar 2026)
The first 3 reports of each patient are "approved". The latest (Mar 2026) is "ai_draft" waiting for doctor review.
1. Ravi Kumar — 52, M, B+, suspected: Type 2 diabetes.
   HbA1c 5.4, 5.6, 5.9, 6.1. Fasting glucose 95, 102, 110, 118. Creatinine 1.00, 1.14, 1.23, 1.34 (eGFR ≈92 → 78 → 71 → 64, ~9/yr decline = rapid). Urine ACR 12, 18, 28, 45. LDL 138, 142, 146, 150; HDL 42; TG 160–180. Hb 14.5, MCV 88, RBC 5.0, platelets 250, ferritin 120, AST 24, ALT 28 (FIB-4 low).
   Story: prediabetes with a rising trend + INCIDENTAL early kidney decline nobody ordered a test for.
2. Priya S — 28, F, O+, suspected: Iron-deficiency anaemia (fatigue).
   Latest: Hb 10.8, MCV 64, RBC 5.6 (Mentzer 11.4), ferritin 45 (normal), platelets 260. Earlier Hb 11.0, 10.9, 11.1 (stable). Other values normal.
   Story: same CBC suggests thalassaemia trait rather than iron deficiency → consider Hb electrophoresis before iron therapy. The doctor decides.
3. Arjun M — 35, M, A+, suspected: routine checkup.
   All values normal and stable across all reports.
   Story: proves the system does not over-alert.

## Screens (routes)
- / — landing page: name, tagline, 3-step "how it works", buttons to enter as Lab / Doctor / Patient
- /lab — select patient, upload CSV (test_name, value, unit, date), preview with mapped names + warnings, submit creates a report with an AI draft
- /doctor — patient list: name, age, suspected disease, latest report status, risk badge
- /doctor/[patientId] — HERO SCREEN: suspected condition card first, "Also detected from the same panel" cards, trend charts with normal range shaded, lab table with flags, editable AI draft with AI DRAFT badge, prescription box, "Approve & release" button, version history
- /patient — approved reports only, value cards with range bars, plain-language explanations, doctor's prescription verbatim, trend charts in simple words, share section (QR, access log, revoke, emergency view toggle)
- /share/[token] — simulated doctor login → simulated patient OTP (always 123456, shown on screen) → record opens; revoked token shows "Access revoked"
- Global top bar: Inara logo, persona switcher (Lab / Doctor / Patient — no real login), "Reset demo" button

## Design
- Clean, calm medical look. Brand colour: teal (Tailwind teal-600) on white/slate. Status colours: red = high risk, amber = watch, green = normal.
- Font: Inter via next/font. Rounded cards (rounded-2xl), soft shadows, generous spacing.
- Mobile-friendly, especially /patient and /share.
- Every page needs loading and empty states. No lorem ipsum.

## Demo script (what must always work)
1. Lab uploads a messy CSV for Ravi → names mapped, values flagged.
2. Doctor opens Ravi → prediabetes trend first → incidental kidney decline → edits draft → approves.
3. Patient (Ravi) sees the approved report in plain language.
4. Doctor opens Priya → Mentzer index suggests thalassaemia trait instead of iron deficiency.
5. Patient shares QR → second doctor scans → OTP consent → access log updates → patient revokes.
6. "Reset demo" restores everything.

## How to work
- Before big changes, show a short plan first.
- Keep logic in src/lib as pure, tested functions; keep components simple.
- After each feature: run npm run lint, npm test and npm run build, fix all errors, then commit with a clear message.
- Explain what you built in simple language at the end of each task (I need to explain it to judges).
