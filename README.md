# Probe — AI Technical Interview Simulator

Realistic technical interview practice: company-style questions, an AI interviewer that probes (not tutors), a live IDE, and evidence-based evaluation.

## Week-one status

**Day 1 skeleton is in place.** You can click through:

Landing → Company selection → Setup → Interview room → Results

AI interviewer, code sandbox, voice, and evaluation are stubbed for later days.

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

## App routes

| Route | Purpose |
| --- | --- |
| `/` | Landing |
| `/companies` | Company style selection |
| `/setup` | Question / interview setup |
| `/interview/[id]` | Interview room (problem, editor, chat, timer) |
| `/results/[id]` | Hiring-style results (placeholder) |

## Project layout

```
src/
  app/                  # Next.js App Router pages
  components/
    landing/            # Landing hero
    interview/          # Interview UI templates
    layout/             # Shared chrome
  lib/
    types/              # Interview stages, events, questions, evaluation
    interview/          # Stage helpers + event logger stub
    data/               # Company profile + ~10 Google-style DSA questions
```

## Core concepts (already typed)

- **Stages:** `INTRO` → `CLARIFICATION` → `APPROACH_DISCUSSION` → `CODING` → `TESTING` → `COMPLEXITY_ANALYSIS` → `WRAP_UP`
- **Events:** candidate/interviewer messages, hints, code snapshots, test runs, stage changes
- **Interviewer actions:** `PROBE`, `GIVE_HINT_1..3`, `WAIT`, etc. (Day 2)
- **Evaluation rubric:** 8 categories scored 1–5 with evidence (Day 5)

## What not to build in week one

Payments, auth, social, leaderboards, huge question banks, system design / behavioral tracks, mobile apps.
