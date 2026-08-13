# Probe — AI Technical Interview Simulator

Realistic technical interview practice: company-style questions, an AI interviewer that probes (not tutors), a live IDE, and evidence-based evaluation.

## Status

**Text-based AI interview MVP is wired.** You can:

1. Choose a company on `/companies` — the app picks a **random** question from that company's bank and opens the interview (no manual question picker)
2. Chat with a structured AI interviewer
3. Edit Python in Monaco; **Run Code** executes in-browser via [Pyodide](https://pyodide.org/) (WASM) — stdout/stderr show under the controls (no server-side eval)
4. Persist session stage / hints / events in client memory for the duration of the interview

Voice I/O is wired (Deepgram Flux STT + OpenAI TTS + turn-taking / barge-in). Still stubbed: evaluator / results scoring.


## Interview engine

Semantic flow (typed chat and spoken EndOfTurn share one path):

1. Candidate message → one `candidate_turn` (transcript + code snapshot + latestExecution + stage)
2. Monaco edits update `lastCodeActivityAt` only (no keystroke event flood)
3. Run Code → free-form Pyodide → `execution_run` + `session.latestExecution` (no question harness)
4. Interviewer receives code + execution + stage + hints; structured actions validated; **WAIT** renders no bubble / no TTS
5. Local 5-minute inactivity monitor can probe once per quiet period (skipped while coding or mid-turn)
6. Flux **EndOfTurn** only creates a candidate turn; **EagerEndOfTurn** never does. StartOfTurn barges in on TTS.

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
| `OPENAI_API_KEY` | Yes (for live interviewer / TTS) | API key for OpenAI Chat Completions and audio speech |
| `OPENAI_MODEL` | No | Defaults to `gpt-4o-mini` |
| `OPENAI_BASE_URL` | No | Optional base URL for compatible providers |
| `OPENAI_TTS_VOICE` | No | Interviewer TTS voice; defaults to `alloy` |
| `OPENAI_TTS_MODEL` | No | Defaults to `gpt-4o-mini-tts` (falls back to `tts-1`) |
| `DEEPGRAM_API_KEY` | Yes (for voice STT) | Server-only key; minted into short-lived tokens via `/api/deepgram/token` |

Without `OPENAI_API_KEY`, the interview room UI loads but `/api/interview/turn` and `/api/tts/speak` return an error.
Without `DEEPGRAM_API_KEY`, voice STT token minting fails (typed chat still works).

### Voice STT (Deepgram Flux)

Streaming speech-to-text uses Deepgram Flux (`flux-general-en` on `/v2/listen`).

1. Set `DEEPGRAM_API_KEY` in `.env.local` (never ship this to the browser).
2. Client calls `POST` or `GET` `/api/deepgram/token` → `{ accessToken, expiresIn }`.
3. Use `createDeepgramFluxSTT()` from `@/lib/voice` (or `@/lib/voice/stt`):
   - `connect()` — mint token, open Flux WebSocket (`Bearer` via WS subprotocol), request mic
   - `start()` / `stop()` — stream / pause PCM16 16 kHz ~80 ms chunks
   - `disconnect()` — stop tracks and close the socket
4. Wire callbacks: `onTurnStart`, `onTranscriptUpdate`, optional `onEagerEndOfTurn` / `onTurnResumed`, and `onTurnEnd` (only `EndOfTurn` produces a `FinalSpeechTurn` for a candidate turn).

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
| `/api/tts/speak` | OpenAI TTS audio (mp3) for interviewer speech |
| `/api/deepgram/token` | Short-lived Deepgram JWT for Flux STT |
| `/results/[id]` | Hiring-style results (placeholder) |

## Project layout

```
src/
  app/
    api/interview/turn/   # OpenAI-compatible interviewer route
    api/tts/speak/        # OpenAI TTS for interviewer speech
    api/deepgram/token/   # Deepgram short-lived JWT for Flux STT
    interview/[id]/      # Interview room UI
  components/interview/   # Monaco editor, chat, controls, voice panel
  lib/
    types/                # Session, events, questions, evaluation
    interview/            # Session state machine + event logger
    interviewer/          # Prompts, zod schema, hint policy
    voice/                # STT (Deepgram Flux) + TTS (OpenAI) + contracts
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
