import { redirect } from "next/navigation";

/**
 * Old share links: the one way to share is now "Access a patient" (QR code or patient ID,
 * patient approval + one-time code, time-limited). The doctor logs in first if needed.
 */
export default async function SharePage({ params }: PageProps<"/share/[token]">) {
  const { token } = await params;
  redirect(`/doctor/access?code=${encodeURIComponent(token)}`);
}
