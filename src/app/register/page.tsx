import { PageHeader } from "@/components/layout/PageHeader";
import { RegisterForm } from "@/components/auth/RegisterForm";

export default async function RegisterPage({ searchParams }: PageProps<"/register">) {
  const { role } = await searchParams;
  return (
    <div className="mx-auto max-w-md">
      <PageHeader
        title="Register for BioMarQ: Prodrome"
        subtitle="Doctor and lab accounts are checked by the hospital admin before they can see patient data."
      />
      <RegisterForm key={String(role)} initialRole={role === "lab" ? "lab" : "doctor"} />
    </div>
  );
}
