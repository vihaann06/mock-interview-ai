import Link from "next/link";
import { getCompanyById } from "@/lib/data/companies";
import { getQuestionsByCompany } from "@/lib/data/questions";

interface SetupPageProps {
  searchParams: Promise<{ company?: string }>;
}

export default async function SetupPage({ searchParams }: SetupPageProps) {
  const params = await searchParams;
  const companyId = params.company ?? "google";
  const company = getCompanyById(companyId) ?? getCompanyById("google")!;
  const questionList = getQuestionsByCompany(company.name);

  return (
    <main className="page">
      <header className="page-header">
        <h1>Interview setup</h1>
        <p>
          {company.styleLabel}. Pick a problem to open the mock interview
          room. AI behavior is mocked until Day 2.
        </p>
      </header>

      <ul className="question-list">
        {questionList.map((q) => (
          <li key={q.id}>
            <Link
              href={`/interview/${q.id}?company=${company.id}`}
              className="select-row"
            >
              <div>
                <h2>{q.title}</h2>
                <p>
                  ~{q.expectedTimeMinutes} min · Expected {q.expectedComplexity.time}{" "}
                  time
                </p>
              </div>
              <span className="meta-pill">{q.difficulty}</span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
