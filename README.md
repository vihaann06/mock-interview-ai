# Probe — AI Technical Interview Simulator

Realistic technical interview practice: company-style questions, an AI interviewer that probes (not tutors), a live IDE, and evidence-based evaluation.

## Status

**Text-based AI interview MVP is wired.** You can:

1. Choose a company on `/companies` — the app picks a **random** question from that company's bank and opens the interview (no manual question picker)
2. Chat with a structured AI interviewer
3. Edit Python in Monaco; **Run Code** executes in-browser via [Pyodide](https://pyodide.org/) (WASM) — stdout/stderr show under the controls (no server-side eval)
4. Persist session stage / hints / events in client memory for the duration of the interview

Voice I/O is wired (OpenAI Realtime transcription + OpenAI TTS + turn-taking / barge-in). Still stubbed: evaluator / results scoring.


## Interview engine

Semantic flow (typed chat and spoken turn completion share one path):

1. Candidate message → one `candidate_turn` (transcript + code snapshot + latestExecution + stage)
2. Monaco edits update `lastCodeActivityAt` only (no keystroke event flood)
3. Run Code → free-form Pyodide → `execution_run` + `session.latestExecution` (no question harness)
4. Interviewer receives code + execution + stage + hints; structured actions validated; **WAIT** renders no bubble / no TTS
5. Local 5-minute inactivity monitor can probe once per quiet period (skipped while coding or mid-turn)
6. Confirmed speech completion only creates a candidate turn; transcript deltas never do. Speech start barges in on TTS.

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
| `OPENAI_API_KEY` | Yes (for live interviewer / voice / TTS) | Server-only key for Chat Completions, Realtime transcription SDP proxy, and speech |
| `OPENAI_MODEL` | No | Defaults to `gpt-4o-mini` |
| `OPENAI_BASE_URL` | No | Optional base URL for compatible providers |
| `OPENAI_TTS_VOICE` | No | Interviewer TTS voice; defaults to `alloy` |
| `OPENAI_TTS_MODEL` | No | Defaults to `gpt-4o-mini-tts` (falls back to `tts-1`) |
| `OPENAI_REALTIME_SILENCE_MS` | No | Server VAD silence window (ms) before a spoken turn completes; default `1400` |

Without `OPENAI_API_KEY`, the interview room UI loads but `/api/interview/turn`, `/api/realtime/transcribe`, and `/api/tts/speak` return errors. Typed chat still loads; voice will fail until the key is set.

Never set `NEXT_PUBLIC_OPENAI_API_KEY` — the permanent key must stay server-side.

### Voice STT (OpenAI Realtime transcription)

Streaming speech-to-text uses OpenAI Realtime with `gpt-live-transcribe` over WebRTC.

1. Set `OPENAI_API_KEY` in `.env.local` (never ship this to the browser).
2. Browser calls `POST /api/realtime/transcribe` → short-lived `{ clientSecret, silenceDurationMs }`.
3. Browser opens WebRTC and POSTs its SDP to OpenAI `/v1/realtime/calls` with the ephemeral secret (permanent key never leaves the server).
4. Use `createOpenAiRealtimeSTT()` from `@/lib/voice` (or `@/lib/voice/stt`):
   - `connect()` — mint secret, mic + WebRTC to OpenAI
   - `start()` / `stop()` — enable / mute the mic track
   - `disconnect()` — stop tracks and close the peer connection
5. Wire callbacks: `onTurnStart`, `onTranscriptUpdate` (draft only), and `onTurnEnd` (sole `FinalSpeechTurn` → candidate turn). End-of-turn uses a patient silence commit (`gpt-live-transcribe` has no server VAD).

The existing interviewer engine remains authoritative — Realtime is transcription only, not a free-running speech-to-speech agent.

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
| `/api/realtime/transcribe` | WebRTC SDP proxy for OpenAI Realtime transcription |
| `/results/[id]` | Hiring-style results (placeholder) |

## Project layout

```
src/
  app/
    api/interview/turn/   # OpenAI-compatible interviewer route
    api/tts/speak/        # OpenAI TTS for interviewer speech
    api/realtime/transcribe/  # OpenAI Realtime transcription SDP proxy
    interview/[id]/      # Interview room UI
  components/interview/   # Monaco editor, chat, controls, voice panel
  lib/
    types/                # Session, events, questions, evaluation
    interview/            # Session state machine + event logger
    interviewer/          # Prompts, zod schema, hint policy
    voice/                # STT (OpenAI Realtime) + TTS (OpenAI) + orchestration
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

Free-form runs only — there is no hidden question test harness.
