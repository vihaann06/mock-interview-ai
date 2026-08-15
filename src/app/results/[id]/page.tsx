import Link from "next/link";
import { getQuestionById } from "@/lib/data/questions";
import "../results.css";

interface ResultsPageProps {
  params: Promise<{ id: string }>;
}

const PLACEHOLDER_CATEGORIES = [
  { category: "Problem Understanding", score: "—" },
  { category: "Clarifying Questions", score: "—" },
  { category: "Algorithmic Reasoning", score: "—" },
  { category: "Communication", score: "—" },
  { category: "Implementation", score: "—" },
  { category: "Testing & Debugging", score: "—" },
  { category: "Complexity Analysis", score: "—" },
  { category: "Independence", score: "—" },
];

export default async function ResultsPage({ params }: ResultsPageProps) {
  const { id } = await params;
  const question = getQuestionById(id);

  return (
    <main className="page results-page">
      <header className="page-header">
        <p className="results-kicker">Evaluation report</p>
        <h1>Interview results</h1>
        <p>
          {question
            ? `Placeholder evaluation for “${question.title}”. Real scoring lands on Day 5.`
            : "Placeholder evaluation report."}
        </p>
      </header>

      <div className="results-grid">
        <section className="score-block" aria-labelledby="overall-score-heading">
          <p id="overall-score-heading" className="score-label">
            Overall score
          </p>
          <p className="score">
            — <span className="score-denom">/ 100</span>
          </p>
          <p className="verdict">Verdict pending</p>
        </section>

        <section className="category-panel" aria-labelledby="rubric-heading">
          <p id="rubric-heading" className="results-section-label">
            Rubric breakdown
          </p>
          <ul className="category-list">
            {PLACEHOLDER_CATEGORIES.map((c) => (
              <li key={c.category}>
                <span className="category-name">{c.category}</span>
                <span className="category-score">{c.score} / 5</span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <p className="placeholder-note">
        Strengths, improvements, and evidence-backed feedback will appear here
        once the evaluation agent is wired up.
      </p>

      <p className="results-actions">
        <Link href="/companies" className="btn-primary">
          Start another interview
        </Link>
      </p>
    </main>
  );
}
