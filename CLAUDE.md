# Inara — Project Brief for Claude

## What Inara is
A doctor-in-the-loop lab report platform. Tagline: "One test. Many diseases. Always doctor-approved."
Flow: lab uploads results → system normalises tests → rules flag abnormal values → the same panel is screened for several diseases (doctor's suspected disease FIRST) → trend engine compares with the patient's own history → AI draft report → doctor edits and approves (+ treatment plan) → only then the patient sees a plain-language report → patient can share the record via QR with OTP consent.
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
- src/components/ — shared UI (layout/, charts/, report/, patient/, workflow/ = StageTracker, CaseProgress, OrderTestDialog)
- src/lib/tests.ts — test dictionary: canonical name, LOINC code, unit, aliases, reference ranges (by sex where needed)
- src/lib/normalise.ts — map messy test names via aliases + unit conversion
- src/lib/rules.ts — flags and disease screens
- src/lib/trends.ts — slope per year, baseline deviation, "drifting within range"
- src/lib/findings.ts — combine into ordered findings (suspected disease first, then "Also detected")
- src/lib/draft.ts — template-based plain-language draft text (LLM can replace this later)
- src/lib/analysis.ts — the layered lab analysis (L0 normalise → L1 range → L2 guideline scores → L2.5 targets → L3 trends → L4 model)
- src/lib/targets.ts — personalised targets per patient (guideline rules, doctor overrides)
- src/lib/medContext.ts — medication-aware notes on findings (e.g. NSAID + kidney finding)
- src/lib/record.ts — patient record helpers (timeline, sparklines, plan medicines → current medications)
- src/lib/review.ts — finding edits, drafts from kept findings, dashboard status/risk
- src/lib/treatment.ts — non-drug plan suggestions + append-only plan versions
- src/lib/formulary.ts — prototype formulary (~40 generic medicines, frequency codes with plain meanings)
- src/lib/prescriptionChecks.ts — prescription safety alerts (block / warning / info, each with a source)
- src/lib/patientView.ts — the ONLY source for patient screens (approved content only)
- src/lib/workflow.ts — case stages, panels, valid transitions, phase labels per audience (pure, tested)
- src/lib/seed.ts — synthetic patients and reports
- src/lib/users.ts — demo user accounts
- src/lib/auth.ts — login, OTP and hospital-domain checks (pure functions)
- src/store/useInaraStore.ts — zustand store
- src/lib/__tests__/ — vitest tests

## Data model (TypeScript types in src/lib/types.ts)
- Patient: id, name, age, sex ("M"|"F"), pregnant?, bloodGroup, phone, allergies[], chronicConditions[], currentMedications [{ name, dose, frequency, since, prescribedBy, note? }], visitHistory [{ date, doctor, reason, note }], suspectedDisease. Approved treatment-plan medicines are merged into currentMedications.
- LabValue: testKey, value, unit, flag ("low"|"normal"|"high")
- Report: id, patientId, date, labName, receivedAt?, raw?: [{ name, value, unit }] (as received from the lab), values: LabValue[] (normalised), versions: ReportVersion[]
- ReportVersion also has patientText (what the patient sees) and findingEdits (which findings the doctor kept/reworded); `text` is the doctor-only clinical summary.
- TargetOverride: patientId, testKey, op ("<"|">"), value, reason, author, timestamp — a doctor-set target replacing the guideline target.
- ReportVersion: id, status ("ai_draft"|"doctor_edited"|"approved"), text, prescription?, author, timestamp
- ShareToken: token (random nanoid), patientId, createdAt, revoked, emergencyOnly
- AccessLogEntry: patientId, viewer, timestamp, action
- User: id, role ("doctor"|"patient"|"lab"), name, email?, phone?, password? (demo only), specialty?, hospital?, patientId? (for patients), patientIds? (doctors: the patients they treat)
- Session: userId, role, loggedInAt
- Case: id, patientId, orderedBy, suspectedDisease, panels[] (PanelId), urgency ("routine"|"urgent"), clinicalNote, reportId?, treatmentPlanId?, stage (CaseStage), stageHistory [{ stage, by, at, note? }] (append-only)
- TreatmentPlan: id, patientId, reportId, medications [{ name, dose, frequency, duration, instructions }], lifestyle: string[], followUpTests [{ testKey?, name, inWeeks }], nextReviewDate, doctorNotes, status ("draft"|"approved"), author, timestamp. Append-only versions like reports (never overwrite a version).

## Users and login
- Three separate roles, each with its own login. A user is logged in as only ONE role at a time and only sees their own area.
- Doctor: email + password. Doctor verification is simulated by a hospital email-domain allowlist (@inara-hospital.in, @citycare.in).
- Patient: phone number + OTP. OTP is simulated (always 123456, shown on screen as "Demo OTP").
- Lab: email + password.
- Demo accounts:
  - Dr. Meera Nair (Endocrinology / General Medicine), dr.meera@inara-hospital.in / demo123. Treating doctor for all 3 patients.
  - Dr. Arun Rao (Nephrology), dr.arun@citycare.in / demo123. Has NO patients; can only see a record through a patient's QR + OTP consent.
  - Lab: lab@inara-diagnostics.in / demo123
  - Patients: Ravi Kumar 9000000001, Priya S 9000000002, Arjun M 9000000003 (+91)
- Route protection: /doctor/* = doctor only, /patient/* = patient only (their own record only), /lab/* = lab only. Wrong role → redirect to /login.
- Demo mode: the login page has a small collapsible "Demo quick login" panel with one-click buttons for each account. No persona switcher in the top bar.
- Logic: src/lib/auth.ts (pure, tested); demo users in src/lib/users.ts; session in the zustand store (persisted; "Reset demo" logs out).

## AI layer
- Layer 1 (built): rules + guideline formulas + trend engine in src/lib — deterministic and explainable.
- Layer 2 (planned): a small trained risk model (logistic regression) trained in Google Colab on a public dataset, exported as JSON weights to src/lib/model/, run in the app, with per-feature contributions (linear SHAP = weight × (value − mean)).
- Layer 3 (planned): an LLM that only rewrites structured findings into plain language, with template fallback.
- The AI analysis takes the patient's previous reports as the baseline plus the new report, and produces an editable draft.
- AI output appears ONLY on doctor screens. Patients see only doctor-approved content.
- In the doctor UI the analysis pipeline shows these as L0–L3 (normalise, range check, guideline scores, personalised targets, personal trends = "Layer 1 (built)" above) and L4 risk model (= "Layer 2 (planned)", shown as "Coming soon").

## Doctor flow
Doctor dashboard → patient → 4 steps (stepper; steps unlock in order):
1. Patient record — summary, chronic conditions, allergies, current medications, timeline of past reports + visits (read-only past reports), sparklines → "Open latest lab report".
2. Lab report & analysis — raw values as received → "Run analysis" reveals each layer (L0 normalise, L1 range check, L2 guideline scores, L2.5 personalised targets, L3 personal trends, L4 risk model = coming soon) → abnormal biomarkers, findings (suspected first, include/edit controls, medication notes), trend charts, lab table with population range + target for this patient. Results are cached per report.
3. Approval — needs the analysis to have run. Clinical summary (doctor only) + patient explanation, AI DRAFT badges, save edit, approve dialog, version history.
4. Treatment — needs approval. Treatment plan; approval releases it and adds its medicines to current medications.
Then the patient sees the approved report + approved treatment plan.

## Case workflow (src/lib/workflow.ts)
- Every lab order is a Case. Stages, strictly in order: ordered → in_lab → results_uploaded → analysis_done → under_review → approved → treatment_planned → follow_up_scheduled.
- advanceCase only allows the very next stage (no skipping, no going back) and appends { stage, by, at, note? } to stageHistory. Invalid moves return the case unchanged.
- Wiring (in the store actions): run analysis → analysis_done; open the Approval step or save an edit → under_review; approve report → approved (records under_review first if needed); approve plan → treatment_planned (+ treatmentPlanId) → follow_up_scheduled when the plan has a next review date (always, since approval requires one).
- Doctor "Order lab test" (Patient record step): panels, suspected disease, urgency, note → new Case at "ordered". Moving ordered → in_lab → results_uploaded is the lab's job (lab upload task).
- Panels: Metabolic (HbA1c, glucose), Kidney (creatinine, urine ACR, urea, sodium, potassium), Lipid, CBC + iron + B12, Liver (AST, ALT, GGT), Thyroid (TSH), Others (vitamin D, uric acid, CRP).
- Active case shown per patient: the open case that has results, else the newest open order, else the newest case.
- Phase labels:
  - Doctor badge: ordered/in_lab = "In lab"; results_uploaded = "Results received"; analysis_done/under_review = "Doctor review"; approved/treatment_planned = "Treatment phase"; follow_up_scheduled = "Completed".
  - Doctor dashboard groups: Awaiting lab / Needs your review / Treatment pending / Completed (same split).
  - Patient steps: Test ordered → At the lab → With your doctor (results_uploaded…under_review) → Report ready → Treatment plan ready → Follow-up booked. Patients see the stage only, never results before approval.
  - Top bar: "Doctor · Ravi Kumar · Treatment phase", "Doctor · 3 need review", "Patient · Report ready", "Lab · 3 open orders".
- StageTracker: horizontal steps with icons; hover/focus/tap a step to see who + when (patient variant hides notes).
- Seed: every older report has a completed case (follow_up_scheduled); each patient's Mar 2026 report has an open case at results_uploaded, ordered by Dr. Meera with all panels. Reset demo restores them.

## Personalised targets (Layer 2.5)
- LDL: heart disease (ASCVD) → <55 (ESC/EAS 2019); diabetes, age 40–75 → <70 (ADA); diabetes + ASCVD → <55; otherwise the reference range.
- HbA1c (diabetes only): <7.0%; age ≥65 healthy → <7.5%; age ≥65 with ≥3 chronic conditions → <8.0% (ADA older adults).
- Hb: pregnant → anaemia cut-off <11 g/dL (WHO).
- eGFR: show the expected age-related decline (~1/yr after 40) next to the patient's actual slope.
- Targets are guideline-based examples for the prototype; a real deployment would use local protocols and doctor-set targets. The doctor can override any target (shown as "Overridden by Dr. X · date · reason", with revert to the guideline target).

## Tests tracked (canonical keys)
hba1c (%), fasting_glucose (mg/dL), total_chol, ldl, hdl, triglycerides (mg/dL), creatinine (mg/dL), urine_acr (mg/g), hb (g/dL), mcv (fL), rbc (million/µL), platelets (10^3/µL), ferritin (ng/mL), ast, alt, ggt (U/L), tsh (mIU/L), vitamin_d (ng/mL), vitamin_b12 (pg/mL), uric_acid (mg/dL), sodium, potassium (mmol/L), bun (mg/dL), crp (mg/L)
GGT: LOINC 2324-2, men <55, women <38 U/L (stored as ≤54 / ≤37, whole units). Seeded normal (Ravi ~45, others ~20–25).
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
- / — landing page: name, tagline, 3-step "how it works", buttons "I'm a Doctor / Patient / Lab" → /login with the matching tab open
- /login — tabs Doctor / Patient / Lab, clear errors, collapsible "Demo quick login" panel. After login: doctor → /doctor, patient → /patient, lab → /lab
- /lab — open lab orders with their stage (status only, no results); then (next task) select patient, upload CSV (test_name, value, unit, date), preview with mapped names + warnings, submit creates a report with an AI draft
- /doctor — only the logged-in doctor's patients, grouped Awaiting lab / Needs your review / Treatment pending / Completed: name, age, suspected disease, stage chip, risk badge. Empty state: "Patients appear here when they share their record with you"
- /doctor/[patientId] — HERO SCREEN: the 4-step doctor flow above (Patient record → Lab report & analysis → Approval → Treatment). Analysis banner text: "Automated analysis (guideline rules + personal trends)".
- /patient — the logged-in patient's own record only (no patient dropdown). Approved reports only, value cards with range bars, plain-language explanations, approved report + approved treatment plan shown verbatim (doctor's prescription verbatim), trend charts in simple words, share section (QR, access log, revoke, emergency view toggle)
- /share/[token] — doctor login → simulated patient OTP (always 123456, shown on screen) → record opens; revoked token shows "Access revoked"
- Global top bar: Inara logo, phase label (md+ screens), logged-in user's name + role badge, Logout button, "Reset demo" button. No persona switcher.

## Design
- Clean, calm medical look. Brand colour: teal (Tailwind teal-600) on white/slate. Status colours: red = high risk, amber = watch, green = normal.
- Font: Inter via next/font. Rounded cards (rounded-2xl), soft shadows, generous spacing.
- Mobile-friendly, especially /patient and /share.
- Every page needs loading and empty states. No lorem ipsum.
- When a value has "rapid decline" and is still in range, show "Rapid decline" as the main label and "still within normal range" as small secondary text.

## Demo script (what must always work)
1. Log in as Lab → upload a messy CSV for Ravi → names mapped, values flagged → log out.
2. Log in as Dr. Meera → review Ravi (prediabetes trend first → incidental kidney decline) → edit draft → approve → treatment plan → log out.
3. Log in as Ravi (phone + OTP) → see the approved report + treatment plan in plain language.
4. Dr. Meera opens Priya → Mentzer index suggests thalassaemia trait instead of iron deficiency.
5. Ravi shares QR → Dr. Arun logs in, scans, OTP consent → views the record → access log updates → Ravi revokes.
6. "Reset demo" restores everything (and logs out).

## How to work
- Before big changes, show a short plan first.
- Keep logic in src/lib as pure, tested functions; keep components simple.
- After each feature: run npm run lint, npm test and npm run build, fix all errors, then commit with a clear message.
- Explain what you built in simple language at the end of each task (I need to explain it to judges).

@AGENTS.md
