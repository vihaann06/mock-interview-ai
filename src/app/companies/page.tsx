import Link from "next/link";
import { companies } from "@/lib/data/companies";
import "./companies.css";

export default function CompaniesPage() {
  return (
    <main className="page companies-page">
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
            <Link
              href={`/setup?company=${company.id}`}
              className="company-row"
            >
              <div className="company-row-body">
                <div className="company-row-heading">
                  <h2>{company.name}</h2>
                  <span className="company-style">{company.styleLabel}</span>
                </div>
                <p className="company-desc">{company.description}</p>
                <ul className="behavior-list">
                  {company.behaviors.slice(0, 3).map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
              </div>
              <span className="company-row-cta" aria-hidden="true">
                →
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
