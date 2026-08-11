import Link from "next/link";
import { companies } from "@/lib/data/companies";

export default function CompaniesPage() {
  return (
    <main className="page">
      <header className="page-header">
        <h1>Choose a company style</h1>
        <p>
          Interviews are modeled on publicly reported formats — not internal
          hiring rubrics. MVP starts with Google-style DSA.
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
