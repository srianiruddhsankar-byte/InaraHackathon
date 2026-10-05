import { seedPatients, seedReports } from "../seed";
import type { Patient, Report } from "../types";

export function patientData(id: string): { patient: Patient; reports: Report[] } {
  const patient = seedPatients().find((p) => p.id === id);
  if (!patient) throw new Error(`No seed patient ${id}`);
  return { patient, reports: seedReports().filter((r) => r.patientId === id) };
}
