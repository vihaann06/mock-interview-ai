import Link from "next/link";
import { getQuestionById } from "@/lib/data/questions";

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
    <main className="page">
      <header className="page-header">
        <h1>Interview results</h1>
        <p>
          {question
            ? `Placeholder evaluation for “${question.title}”. Real scoring lands on Day 5.`
            : "Placeholder evaluation report."}
        </p>
      </header>

      <div className="results-grid">
        <div className="score-block">
          <p className="muted">Overall score</p>
          <p className="score">— / 100</p>
          <p className="verdict">Verdict pending</p>
        </div>

        <ul className="category-list">
          {PLACEHOLDER_CATEGORIES.map((c) => (
            <li key={c.category}>
              <span>{c.category}</span>
              <span className="muted">{c.score} / 5</span>
            </li>
          ))}
        </ul>
      </div>

      <p className="placeholder-note">
        Strengths, improvements, and evidence-backed feedback will appear here
        once the evaluation agent is wired up.
      </p>

      <p style={{ marginTop: "1.75rem" }}>
        <Link href="/companies" className="btn-primary">
          Start another interview
        </Link>
      </p>
    </main>
  );
}
