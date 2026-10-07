import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { accessFor, applyStatusChange, MFA_ROLES } from "../access";
import { homeFor, loginDoctorOrLab, roleLabel } from "../auth";
import { seedPatients } from "../seed";
import { seedUsers } from "../users";
import type { Session } from "../types";
import { analyseWearable } from "../wearable/analyse";
import { seedPatientSettings, setConsent } from "../wearable/consent";
import { detectPatterns } from "../wearable/detect";
import type { AnonymisedOutcome } from "../wearable/outcomes";
import type { PopulationDb, PrevalenceBand } from "../wearable/population";
import type { WeatherData } from "../wearable/types";
import { buildSurveillance, K_ANONYMITY, metricValue, type VisibleArea } from "../surveillance/aggregate";
import {
  alertsForPatient,
  authoriseAlert,
  dismissAlert,
  editAlertMessage,
  newProposals,
  proposeAlert,
  validateMessage,
  withdrawAlert,
  type Officer,
  type PublicHealthAlert,
} from "../surveillance/alerts";
import { CHENNAI_AREAS } from "../surveillance/areas";
import { CLUSTER_RULES, detectCluster, type ClusterDay } from "../surveillance/cluster";
import { AIR_QUALITY_FILE, environmentDays, type AirQualityData } from "../surveillance/environment";
import { memberDayFrom, surveillanceSeed, type SurveillanceData } from "../surveillance/seed";

const weather: WeatherData = JSON.parse(readFileSync("public/data/weather_chennai_2026-09-06_2026-10-05.json", "utf8"));
const population: PopulationDb = JSON.parse(readFileSync("public/data/population.json", "utf8"));
const air: AirQualityData = JSON.parse(readFileSync(`public${AIR_QUALITY_FILE}`, "utf8"));
const settings = seedPatientSettings();
const data = surveillanceSeed();

const view = (over: Partial<Parameters<typeof buildSurveillance>[0]> = {}) =>
  buildSurveillance({ data, settings, outcomes: [], population, day: 30, ...over });
const visible = (v: ReturnType<typeof view>, id: string) => {
  const a = v.areas.find((x) => x.id === id)!;
  if (a.hidden) throw new Error(`${id} hidden`);
  return a;
};

const officer: Officer = { name: "Dr. Kavya Iyer (Public Health)", role: "health_officer", status: "verified" };
const AT = "2026-10-05T09:00:00.000Z";

describe("health officer role", () => {
  const users = seedUsers();
  const health = users.find((u) => u.role === "health_officer")!;

  it("logs in with the hospital email, lands on /health and needs 2FA on real logins", () => {
    const r = loginDoctorOrLab(users, "health@inara-hospital.in", "demo123");
    expect(r.ok && r.user.id).toBe("u-health");
    expect(homeFor("health_officer")).toBe("/health");
    expect(roleLabel("health_officer")).toBe("Public health officer");
    expect(MFA_ROLES).toContain("health_officer");
    const demo: Session = { userId: health.id, role: "health_officer", loggedInAt: AT, mode: "demo" };
    expect(accessFor("/health", demo, health)).toEqual({ kind: "allow" });
    const real: Session = { ...demo, mode: "supabase", status: "verified", aal: "aal1" };
    expect(accessFor("/health", real, health).kind).toBe("mfa");
    expect(accessFor("/health", { ...real, aal: "aal2" }, health)).toEqual({ kind: "allow" });
  });

  it("is verified or suspended by the hospital admin like doctors; a pending officer is blocked", () => {
    const r = applyStatusChange(users, { targetId: "u-health", status: "suspended", reason: "Under review", actorName: "Admin", id: "a1", timestamp: AT });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const suspended = r.users.find((u) => u.id === "u-health")!;
    const s: Session = { userId: "u-health", role: "health_officer", loggedInAt: AT, mode: "demo" };
    expect(accessFor("/health", s, suspended).kind).toBe("blocked");
  });

  it("every role's home path is guarded as that role's area (no unguarded /health)", () => {
    for (const role of ["doctor", "patient", "lab", "admin", "health_officer"] as const) {
      expect(accessFor(homeFor(role), null, undefined).kind, role).toBe("login");
    }
  });

  it("other roles can't open /health, and the officer can't open patient areas", () => {
    const meera = users.find((u) => u.id === "u-meera")!;
    const s: Session = { userId: meera.id, role: "doctor", loggedInAt: AT, mode: "demo" };
    expect(accessFor("/health", s, meera)).toEqual({ kind: "login", redirect: "/login?tab=health" });
    const h: Session = { userId: health.id, role: "health_officer", loggedInAt: AT, mode: "demo" };
    expect(accessFor("/doctor", h, health).kind).toBe("login");
    expect(accessFor("/patient", h, health).kind).toBe("login");
  });
});

describe("k-anonymity", () => {
  it("hides areas with fewer than 10 people sharing data (Sholinganallur: 8)", () => {
    const sh = view().areas.find((a) => a.id === "sholinganallur")!;
    expect(sh.hidden).toBe(true);
    expect(JSON.stringify(sh)).not.toMatch(/feverLike|people"|days/);
    expect(K_ANONYMITY.value).toBe(10);
  });

  it("an area that falls below 10 when someone withdraws consent is hidden", () => {
    const small: SurveillanceData = {
      ...data,
      areas: [{ ...data.areas.find((a) => a.areaId === "velachery")!, people: 10 }],
    };
    const on = buildSurveillance({ data: small, settings, outcomes: [], population, day: 30, areas: CHENNAI_AREAS.filter((a) => a.id === "velachery") });
    expect(on.areas[0].hidden).toBe(false);
    const off = settings.map((s) => (s.patientId === "karthik" ? setConsent(s, "populationShare", false, AT) : s));
    const out = buildSurveillance({ data: small, settings: off, outcomes: [], population, day: 30, areas: CHENNAI_AREAS.filter((a) => a.id === "velachery") });
    expect(out.areas[0].hidden).toBe(true);
  });

  it("subtracts a member exactly when their population-share consent is off", () => {
    const off = settings.map((s) => (s.patientId === "karthik" ? setConsent(s, "populationShare", false, AT) : s));
    const a = visible(view(), "velachery");
    const b = visible(view({ settings: off }), "velachery");
    expect(a.people).toBe(39);
    expect(b.people).toBe(38);
    expect(a.days.at(-1)!.feverLike - b.days.at(-1)!.feverLike).toBe(1);
    expect(a.days.at(-1)!.dengueLike - b.days.at(-1)!.dengueLike).toBe(1);
  });
});

describe("officer never sees personal data", () => {
  it("the view and proposals carry no names, patient IDs, phones or coordinates", () => {
    const v = view();
    const proposals = newProposals(v.areas.filter((a): a is VisibleArea => !a.hidden), [], v.date, AT);
    const text = JSON.stringify({ v, proposals });
    for (const p of seedPatients()) {
      expect(text).not.toContain(p.id);
      expect(text).not.toContain(p.name);
      expect(text).not.toContain(p.phone);
      if (p.publicId) expect(text).not.toContain(p.publicId);
    }
    expect(text).not.toMatch(/patientId|latitude|longitude|members/);
  });
});

describe("seeded data is consistent with Karthik's wearable story", () => {
  it("Karthik's Velachery contribution matches his real analysis + detection, day by day", () => {
    const patient = seedPatients().find((p) => p.id === "karthik")!;
    const a = analyseWearable("karthik", settings.find((s) => s.patientId === "karthik"), weather);
    if (a.status !== "ok") throw new Error(a.status);
    const member = data.members.find((m) => m.patientId === "karthik")!;
    expect(member.areaId).toBe("velachery");
    for (let day = 1; day <= 30; day++) {
      const sense = a.sense!.days;
      const d = detectPatterns({ person: patient, nights: a.nights, amplitude: a.amplitude, weather: a.weatherDays, population, record: patient, settings, day, sense });
      expect(member.days[day - 1], `day ${day}`).toEqual(memberDayFrom(day, a.nights[day - 1], d, sense[day - 1]));
    }
  });

  it("Velachery has the same consenting people as population.json and Chennai's confirmed dengue adds up", () => {
    const vel = population.levels.find((l) => l.id === "velachery")!;
    expect(data.areas.find((a) => a.areaId === "velachery")!.people).toBe(vel.groups.reduce((s, g) => s + g.n, 0));
    const chennai = population.levels.find((l) => l.id === "chennai")!.outcomes!.cases!.dengue!;
    for (const month of ["2026-09", "2026-10"]) {
      expect(data.areas.reduce((s, a) => s + (a.confirmed[month]?.dengue ?? 0), 0)).toBe(chennai[month]);
    }
  });
});

describe("cluster rule", () => {
  const flat = (share: number, people = 50): ClusterDay[] =>
    Array.from({ length: 30 }, (_, i) => ({ day: i + 1, people, feverLike: Math.round(share * people), dengueLike: 0 }));
  const noSeason = () => null;

  it("needs a baseline first", () => {
    expect(detectCluster({ series: flat(0.02), day: 10, seasonBand: noSeason }).status).toBe("insufficient");
  });

  it("flags a cluster only at ≥ 2× expected, ≥ 3 people, 2 days in a row", () => {
    const s = flat(0.02); // 1 of 50 usual
    s[28] = { ...s[28], feverLike: 3 };
    let r = detectCluster({ series: s, day: 29, seasonBand: noSeason });
    expect(r.status).toBe("rising"); // first day only
    s[29] = { ...s[29], feverLike: 4 };
    r = detectCluster({ series: s, day: 30, seasonBand: noSeason });
    expect(r.status).toBe("cluster");
    expect(r.daysMeeting).toBe(2);
    expect(r.ratio).toBeCloseTo(4, 5);
  });

  it("never flags fewer than 3 people, however high the ratio", () => {
    const s = flat(0, 20);
    s[28] = { ...s[28], feverLike: 2 };
    s[29] = { ...s[29], feverLike: 2 };
    const r = detectCluster({ series: s, day: 30, seasonBand: noSeason });
    expect(r.status).toBe("rising");
    expect(CLUSTER_RULES.clusterMinPeople.value).toBe(3);
  });

  it("takes local seasonal prevalence into account: a rise the season explains is not a cluster", () => {
    const s = flat(0.04, 100); // 4 of 100 usual
    s[28] = { ...s[28], feverLike: 9 };
    s[29] = { ...s[29], feverLike: 9 };
    // Same month: 9% vs 4% expected → 2.25× → cluster.
    expect(detectCluster({ series: s, day: 30, seasonBand: () => "moderate" }).status).toBe("cluster");
    // September moderate → October high (×1.33): expected 5.3% → 1.7× → only rising.
    const season = (d: number): PrevalenceBand => (d >= 26 ? "high" : "moderate");
    const r = detectCluster({ series: s, day: 30, seasonBand: season });
    expect(r.seasonFactor).toBeCloseTo(4 / 3, 5);
    expect(r.status).toBe("rising");
  });

  it("seeded Chennai data: a dengue-like cluster in Velachery around the demo days, nowhere else", () => {
    for (let day = 14; day <= 26; day++) {
      const v = view({ day });
      for (const a of v.areas) if (!a.hidden) expect(a.cluster.status, `${a.name} day ${day}`).not.toBe("cluster");
    }
    expect(visible(view({ day: 26 }), "velachery").cluster.status).toBe("rising");
    for (const day of [27, 28, 29, 30]) expect(visible(view({ day }), "velachery").cluster.status).toBe("cluster");
    const v = view();
    const vel = visible(v, "velachery");
    expect(vel.cluster.dengueLike).toBe(true);
    expect(vel.cluster.label).toBe("Dengue-like illness cluster");
    expect(vel.cluster.seasonFactor).toBeCloseTo(4 / 3, 5); // Chennai fevers: Sep moderate → Oct high
    expect(visible(v, "tambaram").cluster.status).toBe("rising");
    const clusters = v.areas.filter((a) => !a.hidden && a.cluster.status === "cluster").map((a) => a.name);
    expect(clusters).toEqual(["Velachery"]);
  });
});

describe("map metrics", () => {
  it("confirmed outcomes per 1,000 add anonymised recorded outcomes for the area and month", () => {
    expect(visible(view(), "velachery").confirmed).toEqual({ month: "2026-10", count: 0, per1000: 0 });
    const rec: AnonymisedOutcome = { id: "pop-x", area: "Velachery", city: "Chennai", month: "2026-10", patternId: "dengue_like", condition: "dengue", confirmed: true, labConfirmed: true };
    const v = visible(view({ outcomes: [rec, { ...rec, id: "pop-y", condition: undefined, confirmed: false }] }), "velachery");
    expect(v.confirmed).toEqual({ month: "2026-10", count: 1, per1000: 25.6 });
    expect(metricValue(v, "confirmed")).toBe(25.6);
  });

  it("Velachery stands out on raised temperature, night HR and concerning patterns (and low hydration) on Day 30", () => {
    const v = view();
    const vel = visible(v, "velachery");
    const others = v.areas.filter((a): a is VisibleArea => !a.hidden && a.id !== "velachery");
    for (const m of ["raised_temp", "hr_change", "concerning", "low_hydration"] as const) {
      for (const o of others) expect(metricValue(vel, m), `${m} vs ${o.name}`).toBeGreaterThan(metricValue(o, m));
    }
  });
});

describe("environment data", () => {
  it("summarises the real weather and air quality per demo day", () => {
    const env = environmentDays(weather, air, 30);
    expect(env).toHaveLength(30);
    expect(env[0].date).toBe("2026-09-06");
    expect(env.every((d) => d.meanPm25 !== null && d.maxAqi !== null && d.maxFeelsLike !== null)).toBe(true);
  });
});

describe("alert workflow", () => {
  const vel = () => visible(view(), "velachery");
  const proposed = () => proposeAlert(vel(), "2026-10-05", AT)!;
  const karthik = seedPatients().find((p) => p.id === "karthik")!;
  const ravi = seedPatients().find((p) => p.id === "ravi")!;

  it("the system proposes an alert for a cluster, with a plain-language message", () => {
    const p = proposed();
    expect(p.status).toBe("proposed");
    expect(p.id).toBe("pha-velachery-2026-10-05");
    expect(p.message).toMatch(/standing water/);
    expect(p.message).toMatch(/belly pain/);
    expect(validateMessage(p.message)).toBeNull();
    expect(p.log.map((l) => l.action)).toEqual(["proposed"]);
    expect(proposeAlert(visible(view(), "tambaram"), "2026-10-05", AT)).toBeNull();
  });

  it("does not re-propose while one is open, or after it was dismissed", () => {
    const v = view();
    const areas = v.areas.filter((a): a is VisibleArea => !a.hidden);
    const first = newProposals(areas, [], v.date, AT);
    expect(first.map((a) => a.areaId)).toEqual(["velachery"]);
    expect(newProposals(areas, first, v.date, AT)).toEqual([]);
    const dismissed = dismissAlert(first[0], officer, "Known event", AT);
    expect(dismissed.ok && newProposals(areas, [dismissed.alert], v.date, AT)).toEqual([]);
  });

  it("patients see an alert only after authorisation, and only in that area", () => {
    const p = proposed();
    expect(alertsForPatient([p], karthik)).toEqual([]);
    const edited = editAlertMessage(p, "Dengue cases rising in Velachery — remove standing water, see a doctor if fever + belly pain.", officer, AT);
    expect(edited.ok).toBe(true);
    if (!edited.ok) return;
    expect(alertsForPatient([edited.alert], karthik)).toEqual([]);
    const auth = authoriseAlert(edited.alert, officer, AT);
    expect(auth.ok).toBe(true);
    if (!auth.ok) return;
    expect(alertsForPatient([auth.alert], karthik).map((a) => a.message)).toEqual([
      "Dengue cases rising in Velachery — remove standing water, see a doctor if fever + belly pain.",
    ]);
    expect(alertsForPatient([auth.alert], ravi)).toEqual([]); // no area on record
    expect(alertsForPatient([auth.alert], { area: "Adyar", city: "Chennai" })).toEqual([]);
    expect(alertsForPatient([auth.alert], { area: "velachery", city: "Chennai" })).toHaveLength(1);
    expect(auth.alert.log.map((l) => l.action)).toEqual(["proposed", "edited", "authorised"]);
  });

  it("withdrawn and dismissed alerts disappear for patients; every step is logged", () => {
    const auth = authoriseAlert(proposed(), officer, AT);
    if (!auth.ok) throw new Error(auth.error);
    const w = withdrawAlert(auth.alert, officer, "Cases falling", "2026-10-06T09:00:00.000Z");
    expect(w.ok).toBe(true);
    if (!w.ok) return;
    expect(alertsForPatient([w.alert], karthik)).toEqual([]);
    expect(w.alert.log.map((l) => l.action)).toEqual(["proposed", "authorised", "withdrawn"]);
    expect(withdrawAlert(w.alert, officer, "again", AT).ok).toBe(false);
    expect(authoriseAlert(w.alert, officer, AT).ok).toBe(false);
  });

  it("only a verified public health officer can authorise, and messages are checked", () => {
    const p = proposed();
    expect(authoriseAlert(p, { ...officer, role: "doctor" }, AT).ok).toBe(false);
    expect(authoriseAlert(p, { ...officer, status: "pending" }, AT).ok).toBe(false);
    expect(authoriseAlert(p, officer, AT, "short").ok).toBe(false);
    expect(validateMessage("Dengue in Velachery: you have dengue if you have a fever, see a doctor")).toMatch(/illness/);
    expect(withdrawAlert(p, officer, "x", AT).ok).toBe(false); // not authorised yet
  });

  it("an alert holds only area-level aggregate data", () => {
    const a: PublicHealthAlert = proposed();
    expect(Object.keys(a).sort()).toEqual(
      ["areaId", "areaName", "city", "date", "evidence", "id", "kind", "log", "message", "people", "proposedAt", "status", "title"].sort(),
    );
  });
});
