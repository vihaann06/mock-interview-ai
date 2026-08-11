import Link from "next/link";

export function Hero() {
  return (
    <section className="hero" aria-labelledby="hero-heading">
      <div className="hero-copy">
        <p className="brand-hero">Probe</p>
        <h1 id="hero-heading" className="hero-title">
          Practice the interview, not just the problem.
        </h1>
        <p className="hero-sub">
          An AI interviewer that probes your reasoning, watches your code, and
          scores you like a real technical screen.
        </p>
        <div className="hero-actions">
          <Link href="/companies" className="btn-primary">
            Start mock interview
          </Link>
          <Link href="/setup" className="btn-secondary">
            View interview setup
          </Link>
        </div>
      </div>

      <div className="hero-visual" aria-hidden="true">
        <div className="stage-strip">
          <span className="stage-chip is-active">Approach</span>
          <span className="stage-chip">Coding</span>
          <span className="stage-chip">Testing</span>
          <span className="stage-chip">Complexity</span>
        </div>
        <div className="workspace">
          <div className="workspace-editor">
            <div className="editor-chrome">
              <span />
              <span />
              <span />
              <em>solution.py</em>
            </div>
            <pre className="editor-code">
              <code>
                <span className="tok-kw">def</span>{" "}
                <span className="tok-fn">two_sum</span>(nums, target):
                {"\n"}
                {"    "}seen = {"{}"}
                {"\n"}
                {"    "}
                <span className="tok-kw">for</span> i, n{" "}
                <span className="tok-kw">in</span>{" "}
                <span className="tok-fn">enumerate</span>(nums):
                {"\n"}
                {"        "}need = target - n
                {"\n"}
                {"        "}
                <span className="tok-kw">if</span> need{" "}
                <span className="tok-kw">in</span> seen:
                {"\n"}
                {"            "}
                <span className="tok-kw">return</span> [seen[need], i]
                {"\n"}
                {"        "}seen[n] = i
                {"\n"}
                <span className="cursor-blink">{">"}</span>
              </code>
            </pre>
          </div>
          <div className="workspace-chat">
            <p className="chat-label">Interviewer</p>
            <p className="chat-bubble">
              Before you code — what&apos;s the time complexity of that approach?
            </p>
            <p className="chat-label candidate">You</p>
            <p className="chat-bubble candidate">
              Hash map one-pass, so O(n) time and O(n) space…
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
