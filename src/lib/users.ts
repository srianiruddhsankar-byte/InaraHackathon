// Synthetic demo accounts. Passwords are plain text because this is a prototype with no backend.
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
    },
    {
      id: "u-lab",
      role: "lab",
      name: "Meridian Diagnostics",
      email: "lab@inara-diagnostics.in",
      password: DEMO_PASSWORD,
    },
    { id: "u-ravi", role: "patient", name: "Ravi Kumar", phone: "+919000000001", patientId: "ravi" },
    { id: "u-priya", role: "patient", name: "Priya S", phone: "+919000000002", patientId: "priya" },
    { id: "u-arjun", role: "patient", name: "Arjun M", phone: "+919000000003", patientId: "arjun" },
    { id: "u-karthik", role: "patient", name: "Karthik R", phone: "+919000000004", patientId: "karthik" },
  ];
}
