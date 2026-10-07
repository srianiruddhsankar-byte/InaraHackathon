// Synthetic demo accounts for the OFFLINE demo login. Passwords are plain text because this
// is a prototype. The same staff accounts exist in Supabase Auth (scripts/seed-auth.mjs).
import type { User } from "./types";

export const DEMO_PASSWORD = "demo123";

export function seedUsers(): User[] {
  return [
    {
      id: "u-meera",
      role: "doctor",
      name: "Dr. Meera Nair",
      email: "dr.meera@inara-hospital.in",
      password: DEMO_PASSWORD,
      specialty: "Endocrinology / General Medicine",
      hospital: "Meridian Hospital",
      patientIds: ["ravi", "priya", "arjun", "karthik"],
      councilRegNo: "TNMC 104522",
      status: "verified",
    },
    {
      id: "u-arun",
      role: "doctor",
      name: "Dr. Arun Rao",
      email: "dr.arun@citycare.in",
      password: DEMO_PASSWORD,
      specialty: "Nephrology",
      hospital: "CityCare Hospital",
      patientIds: [],
      councilRegNo: "KMC 88213",
      status: "verified",
    },
    {
      id: "u-test-pending",
      role: "doctor",
      name: "Dr. Test Pending",
      email: "dr.test@inara-hospital.in",
      password: DEMO_PASSWORD,
      specialty: "General Medicine",
      hospital: "Meridian Hospital",
      patientIds: [],
      councilRegNo: "TNMC 200001",
      status: "pending",
    },
    {
      id: "u-lab",
      role: "lab",
      name: "Meridian Diagnostics",
      email: "lab@inara-diagnostics.in",
      password: DEMO_PASSWORD,
      status: "verified",
    },
    {
      id: "u-admin",
      role: "admin",
      name: "Hospital Admin (Meridian)",
      email: "admin@inara-hospital.in",
      password: DEMO_PASSWORD,
      hospital: "Meridian Hospital",
      status: "verified",
    },
    {
      id: "u-health",
      role: "health_officer",
      name: "Dr. Kavya Iyer (Public Health)",
      email: "health@inara-hospital.in",
      password: DEMO_PASSWORD,
      specialty: "Public health surveillance",
      hospital: "Chennai Public Health Unit",
      status: "verified",
    },
    { id: "u-ravi", role: "patient", name: "Ravi Kumar", phone: "+919000000001", patientId: "ravi" },
    { id: "u-priya", role: "patient", name: "Priya S", phone: "+919000000002", patientId: "priya" },
    { id: "u-arjun", role: "patient", name: "Arjun M", phone: "+919000000003", patientId: "arjun" },
    { id: "u-karthik", role: "patient", name: "Karthik R", phone: "+919000000004", patientId: "karthik" },
  ];
}
