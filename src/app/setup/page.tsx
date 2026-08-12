import { redirect } from "next/navigation";
import { getCompanyById } from "@/lib/data/companies";
import { pickRandomQuestionForCompany } from "@/lib/data/questions";

interface SetupPageProps {
  searchParams: Promise<{ company?: string }>;
}

/**
 * Setup no longer shows a question picker.
 * Choosing a company redirects straight into a random interview from that bank.
 */
export default async function SetupPage({ searchParams }: SetupPageProps) {
  const params = await searchParams;
  const companyId = params.company ?? "google";
  const company = getCompanyById(companyId) ?? getCompanyById("google");

  if (!company) {
    redirect("/companies");
  }

  const question = pickRandomQuestionForCompany(company.name);

  if (!question) {
    redirect("/companies");
  }

  redirect(`/interview/${question.id}?company=${company.id}`);
}
