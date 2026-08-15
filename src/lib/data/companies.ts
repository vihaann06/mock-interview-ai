import type { CompanyProfile } from "@/lib/types/question";

export const companies: CompanyProfile[] = [
  {
    id: "google",
    name: "Google",
    styleLabel: "Google-style DSA",
    description:
      "Modeled on publicly reported Google technical screens: reason before coding, justify tradeoffs, and discuss complexity.",
    behaviors: [
      "Give space for clarifying questions before probing complexity or approach",
      "Encourage reasoning before implementation",
      "Once an approach is underway, probe algorithmic complexity and data-structure tradeoffs",
      "Ask candidate to justify data structure choices when they commit to one",
      "Prefer hints framed as questions",
      "Introduce a follow-up if the candidate finishes early",
    ],
  },
];

export function getCompanyById(id: string): CompanyProfile | undefined {
  return companies.find((company) => company.id === id);
}
