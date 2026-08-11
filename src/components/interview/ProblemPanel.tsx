interface ProblemPanelProps {
  title: string;
  difficulty: string;
  statement: string;
  constraints: string[];
}

export function ProblemPanel({
  title,
  difficulty,
  statement,
  constraints,
}: ProblemPanelProps) {
  return (
    <aside className="problem-panel">
      <div className="problem-meta">
        <h2>{title}</h2>
        <span className="difficulty">{difficulty}</span>
      </div>
      <p className="problem-statement">{statement}</p>
      <h3>Constraints</h3>
      <ul>
        {constraints.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
    </aside>
  );
}
