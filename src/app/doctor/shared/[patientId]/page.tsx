import { SharedRecord } from "@/components/access/SharedRecord";

export default async function SharedRecordPage({ params }: PageProps<"/doctor/shared/[patientId]">) {
  const { patientId } = await params;
  return <SharedRecord patientId={patientId} />;
}
