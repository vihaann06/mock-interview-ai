# Probe — AI Technical Interview Simulator

Realistic technical interview practice: company-style questions, an AI interviewer that probes (not tutors), a live IDE, and evidence-based evaluation.

## Status

**Text-based AI interview MVP is wired.** You can:

1. Choose a company on `/companies` — the app picks a **random** question from that company's bank and opens the interview (no manual question picker)
2. Chat with a structured AI interviewer
3. Edit Python in Monaco; **Run Code** executes in-browser via [Pyodide](https://pyodide.org/) (WASM) — stdout/stderr show under the controls (no server-side eval)
4. Persist session stage / hints / events in client memory for the duration of the interview

Still stubbed: voice, evaluator / results scoring.

## Getting started

```bash
npm install
cp .env.example .env.local
# set OPENAI_API_KEY in .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Environment variables

| Variable | Required | Description |
| --- | --- | --- |
| `OPENAI_API_KEY` | Yes (for live interviewer) | API key for OpenAI-compatible Chat Completions |
| `OPENAI_MODEL` | No | Defaults to `gpt-4o-mini` |
| `OPENAI_BASE_URL` | No | Optional base URL for compatible providers |

Without `OPENAI_API_KEY`, the interview room UI loads but `/api/interview/turn` returns an error.

## Scripts

```bash
npm run dev
npm run build
npm run lint
npm test
```

## App routes

| Route | Purpose |
| --- | --- |
| `/` | Landing |
| `/companies` | Company style selection (start interview) |
| `/setup` | Redirects to a random `/interview/[id]?company=` for the chosen company |
| `/interview/[id]` | Interview room (problem, Monaco, chat, timer) |
| `/api/interview/turn` | LLM interviewer turn (JSON `InterviewerResponse`) |
| `/results/[id]` | Hiring-style results (placeholder) |

## Project layout

```
src/
  app/
    api/interview/turn/   # OpenAI-compatible interviewer route
    interview/[id]/      # Interview room UI
  components/interview/   # Monaco editor, chat, controls
  lib/
    types/                # Session, events, questions, evaluation
    interview/            # Session state machine + event logger
    interviewer/          # Prompts, zod schema, hint policy
    data/                 # Questions + company profiles
    execution/            # Code runner (Pyodide in browser; mock fallback)
```

## Core concepts

- **Stages:** `INTRO` → `CLARIFICATION` → `APPROACH_DISCUSSION` → `CODING` → `TESTING` → `COMPLEXITY_ANALYSIS` → `WRAP_UP`
- **Events:** candidate/interviewer messages, hints, code snapshots, stage changes
- **Interviewer actions:** `PROBE`, `GIVE_HINT_1..3`, `WAIT`, `MOVE_FORWARD`, …
- **Hint ladder:** cannot skip levels; enforced in session + interviewer policy + API
- **Evaluation rubric:** typed for Day 5 (not wired yet)

## Run Code (Python)

Interview **Run Code** uses a provider adapter in `src/lib/execution/`:

- **Default (browser):** `PyodideCodeExecutionProvider` — loads Pyodide once from the jsDelivr CDN via a `<script>` tag (avoids bundler issues with dynamic imports), runs candidate Python in WASM, captures stdout/stderr, soft-timeout ~5s.
- **Fallback:** `MockCodeExecutionProvider` remains available (SSR default / tests); call `setCodeExecutionProvider` to swap.

No candidate code is `eval`'d on the Next.js server.

## What not to build in week one

Payments, auth, social, leaderboards, huge question banks, system design / behavioral tracks, mobile apps.
