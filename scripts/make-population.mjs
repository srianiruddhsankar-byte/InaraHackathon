// Generates public/data/population.json — SYNTHETIC area population reference
// data for the wearable module (no real people). Deterministic: run
//   node scripts/make-population.mjs
// to regenerate the same file.
//
// Each level (area → city → state → national) holds only people who agreed to
// share their data (population-share consent): how many there are, and night
// resting HR / HRV reference values (mean, SD) by age band and sex. Demo
// patients who contribute are listed under `members` with the values they added,
// so the app can remove them exactly (their own reference never includes
// themselves, and anyone who withdraws consent is taken out).
import { writeFileSync } from "node:fs";

const AGE_BANDS = ["18-29", "30-39", "40-49", "50-59", "60+"];
const BAND_SHARE = [0.3, 0.27, 0.2, 0.14, 0.09];
const SEX_SHARE = { M: 0.55, F: 0.45 };

// Night resting HR rises a little with age; women run ~3 bpm higher. HRV falls with age.
const HR_MEAN = { M: [61, 62, 63, 64, 65], F: [64, 65, 66, 67, 68] };
const HRV_MEAN = { M: [52, 43, 35, 29, 24], F: [55, 45, 37, 30, 25] };

let seed = 20261001;
const rand = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
};
const jitter = (size) => Math.round((rand() - 0.5) * 2 * size * 10) / 10;

/** Split `total` people across age band × sex with the largest-remainder method (sums exactly). */
function split(total) {
  const cells = [];
  for (const sex of ["M", "F"]) AGE_BANDS.forEach((band, i) => cells.push({ band, sex, i, exact: total * BAND_SHARE[i] * SEX_SHARE[sex] }));
  cells.forEach((c) => (c.n = Math.floor(c.exact)));
  let left = total - cells.reduce((a, c) => a + c.n, 0);
  [...cells].sort((a, b) => b.exact - Math.floor(b.exact) - (a.exact - Math.floor(a.exact))).forEach((c) => {
    if (left > 0) {
      c.n++;
      left--;
    }
  });
  return cells;
}

function groups(total, hrOffset) {
  return split(total).map(({ band, sex, i, n }) => {
    const hr = HR_MEAN[sex][i] + hrOffset + jitter(0.4);
    const hrv = HRV_MEAN[sex][i] + jitter(1);
    return {
      ageBand: band,
      sex,
      n,
      restingHr: { mean: Math.round(hr * 10) / 10, sd: Math.round((7 + jitter(0.3)) * 10) / 10 },
      hrv: { mean: Math.round(hrv * 10) / 10, sd: Math.round(hrv * 0.35 * 10) / 10 },
    };
  });
}

const L = "low";
const M = "moderate";
const H = "high";

// Monthly prevalence bands, January → December.
const CHENNAI_PREVALENCE = {
  dengue: { months: [L, L, L, L, L, M, M, M, M, H, H, H], note: "Peaks with the northeast monsoon (Oct–Dec)." },
  febrile_illness: { months: [M, L, L, L, L, M, M, M, M, H, H, M], note: "Fevers rise with the monsoon rains." },
  respiratory: { months: [H, M, L, L, L, L, M, M, M, M, H, H], note: "More chest infections in the cooler, wetter months." },
  heat_illness: { months: [L, L, M, H, H, M, M, M, M, L, L, L], note: "Hottest April–June." },
};

// Learning-loop base counts (SYNTHETIC): confirmed cases per month among the
// level's consenting people, and wearable alerts whose outcome a doctor recorded.
// Chennai, Oct 2026: 6 dengue cases in 1,240 people ≈ 4.8 per 1,000;
// dengue-like alerts 12 of 15 confirmed (80%). Velachery is scaled to its size.
// Doctor-recorded outcomes are added on top in the app (store overlay).
const CHENNAI_OUTCOMES = {
  cases: { dengue: { "2026-09": 4, "2026-10": 6 } },
  alerts: { dengue_like: { alerts: 15, confirmed: 12 }, early_infection: { alerts: 22, confirmed: 14 } },
};
const VELACHERY_OUTCOMES = {
  cases: { dengue: { "2026-09": 0, "2026-10": 0 } },
  alerts: { dengue_like: { alerts: 1, confirmed: 1 }, early_infection: { alerts: 1, confirmed: 1 } },
};

const levels = [
  {
    id: "velachery",
    level: "area",
    name: "Velachery",
    parent: "chennai",
    groups: groups(39, 1),
    members: [{ patientId: "karthik", ageBand: "18-29", sex: "M", restingHr: 56, hrv: 60 }],
    outcomes: VELACHERY_OUTCOMES,
  },
  {
    id: "chennai",
    level: "city",
    name: "Chennai",
    parent: "tamil_nadu",
    groups: groups(1241, 1),
    members: [{ patientId: "karthik", ageBand: "18-29", sex: "M", restingHr: 56, hrv: 60 }],
    prevalence: CHENNAI_PREVALENCE,
    outcomes: CHENNAI_OUTCOMES,
  },
  {
    id: "tamil_nadu",
    level: "state",
    name: "Tamil Nadu",
    parent: "india",
    groups: groups(4861, 0.5),
    members: [{ patientId: "karthik", ageBand: "18-29", sex: "M", restingHr: 56, hrv: 60 }],
    prevalence: {
      dengue: { months: [L, L, L, L, L, M, M, M, H, H, H, M], note: "Monsoon season (Sep–Dec)." },
      febrile_illness: { months: [M, L, L, L, L, M, M, M, M, H, H, M], note: "Fevers rise with the monsoon rains." },
      respiratory: { months: [H, M, L, L, L, L, M, M, M, M, H, H], note: "Cooler, wetter months." },
      heat_illness: { months: [L, L, M, H, H, M, M, L, L, L, L, L], note: "Hottest April–June." },
    },
  },
  {
    id: "india",
    level: "national",
    name: "India",
    parent: null,
    groups: groups(25403, 0),
    members: [
      { patientId: "karthik", ageBand: "18-29", sex: "M", restingHr: 56, hrv: 60 },
      { patientId: "ravi", ageBand: "50-59", sex: "M", restingHr: 65, hrv: 30 },
      { patientId: "arjun", ageBand: "30-39", sex: "M", restingHr: 58, hrv: 48 },
    ],
    prevalence: {
      dengue: { months: [L, L, L, L, L, L, M, M, H, H, M, L], note: "National peak after the southwest monsoon (Sep–Oct)." },
      febrile_illness: { months: [L, L, L, L, L, M, M, H, H, M, M, L], note: "Monsoon fevers." },
      respiratory: { months: [H, H, M, L, L, L, M, M, M, M, H, H], note: "Winter peak." },
      heat_illness: { months: [L, L, M, H, H, H, M, L, L, L, L, L], note: "Summer heat waves (Apr–Jun)." },
    },
  },
];

const out = {
  source: "SYNTHETIC population reference for the Inara prototype — not real data.",
  generatedAt: "2026-10-01",
  note: "Only people with population-share consent are counted. Night resting HR and HRV (RMSSD) from 00:00–05:00, low motion.",
  ageBands: AGE_BANDS,
  levels,
};

writeFileSync(new URL("../public/data/population.json", import.meta.url), `${JSON.stringify(out, null, 2)}\n`);
console.log(levels.map((l) => `${l.name}: ${l.groups.reduce((a, g) => a + g.n, 0)} people`).join("\n"));
