import Link from "next/link";
import { companies } from "@/lib/data/companies";

export default function CompaniesPage() {
  return (
    <main className="page">
      <header className="page-header">
        <h1>Choose a company style</h1>
        <p>
          Pick a company — we assign a random problem from that bank and start
          the interview. Formats are modeled on publicly reported screens, not
          internal hiring rubrics.
        </p>
      </header>

      <ul className="company-list">
        {companies.map((company) => (
          <li key={company.id}>
            <Link href={`/setup?company=${company.id}`}>
              <h2>{company.name}</h2>
              <p>{company.description}</p>
              <ul className="behavior-list">
                {company.behaviors.slice(0, 3).map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
