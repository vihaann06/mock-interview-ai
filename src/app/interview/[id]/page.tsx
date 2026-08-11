import { Suspense } from "react";
import { InterviewRoom } from "./InterviewRoom";

export default function InterviewPage() {
  return (
    <Suspense
      fallback={
        <main className="page">
          <p className="muted">Loading interview room…</p>
        </main>
      }
    >
      <InterviewRoom />
    </Suspense>
  );
}
