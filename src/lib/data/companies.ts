import type { CompanyProfile } from "@/lib/types/question";

export const companies: CompanyProfile[] = [
  {
    id: "google",
    name: "Google",
    styleLabel: "Google-style DSA",
    description:
      "Modeled on publicly reported Google technical screens: reason before coding, justify tradeoffs, and discuss complexity.",
    behaviors: [
      "Encourage reasoning before implementation",
      "Probe algorithmic complexity",
      "Ask candidate to justify data structure choices",
      "Prefer hints framed as questions",
      "Introduce a follow-up if the candidate finishes early",
    ],
  },
];

export function getCompanyById(id: string): CompanyProfile | undefined {
  return companies.find((company) => company.id === id);
}
