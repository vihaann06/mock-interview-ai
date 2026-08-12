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
    <aside className="problem-panel" aria-label="Problem statement">
      <header className="pane-header">
        <h2>Problem</h2>
        <span className="difficulty">{difficulty}</span>
      </header>
      <div className="problem-panel-body">
        <h3 className="problem-title">{title}</h3>
        <p className="problem-statement">{statement}</p>
        <h3>Constraints</h3>
        <ul>
          {constraints.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      </div>
    </aside>
  );
}
