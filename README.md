# Probe — AI Technical Interview Simulator

Realistic technical interview practice: company-style questions, an AI interviewer that probes (not tutors), a live IDE, and evidence-based evaluation.

## Status

**Text-based AI interview MVP is wired.** You can:

1. Choose a company on `/companies` — the app picks a **random** question from that company's bank and opens the interview (no manual question picker)
2. Chat with a structured AI interviewer
3. Edit Python in Monaco; **Run Code** executes in-browser via [Pyodide](https://pyodide.org/) (WASM) — stdout/stderr show under the controls (no server-side eval)
4. Persist session stage / hints / events in client memory for the duration of the interview

Voice I/O is wired (OpenAI Realtime transcription + OpenAI TTS + turn-taking / barge-in). Question knowledge is generated into committed dossiers (`npm run questions:prep`) so the bank scales without hand-authoring interviewer notes. Still stubbed: evaluator / results scoring.


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
| `TTS_PROVIDER` | No | `openai` (default) or `cartesia`. Anything unrecognized falls back to `openai`, so a typo cannot take voice offline |
| `CARTESIA_API_KEY` | Only if `TTS_PROVIDER=cartesia` | Server-only Cartesia key |
| `CARTESIA_VOICE_ID` | Only if `TTS_PROVIDER=cartesia` | Voice UUID from https://play.cartesia.ai/voices. No default — an arbitrary voice would present the wrong interviewer persona |
| `CARTESIA_MODEL` | No | Defaults to `sonic-3.6` |
| `CARTESIA_FORMAT` | No | `mp3` (default) or `wav` |
| `CARTESIA_LANGUAGE` | No | Defaults to `en` |
| `OPENAI_TTS_VOICE` | No | Interviewer TTS voice; defaults to `cedar`. `ash` is the alternative for a deeper, slower read |
| `OPENAI_TTS_MODEL` | No | Defaults to `gpt-4o-mini-tts`. Falls back to `tts-1`, which ignores delivery instructions — a degraded response carries an `X-TTS-Fallback` header |
| `OPENAI_TTS_INSTRUCTIONS` | No | Overrides the delivery direction (tone, pacing, intonation) sent to `gpt-4o-mini-tts`; defaults to the interviewer persona in `src/lib/voice/tts/delivery.ts`. No effect on `tts-1` |
| `OPENAI_TTS_FORMAT` | No | Speech audio format; defaults to `mp3`. `opus` is smaller but Safari cannot play Ogg Opus from a blob URL |
| `OPENAI_TTS_SPEED` | No | Optional `0.25`–`4.0` speech rate. Unset by default: pacing is steered through the instructions, since `speed` time-scales the audio and flattens prosody |
| `OPENAI_REALTIME_SILENCE_MS` | No | Browser silence window (ms) before committing a spoken turn; default `1400` |
| `OPENAI_DOSSIER_MODEL` | No | Model for `npm run questions:prep`; defaults to `gpt-4o`. Build-time only |

Without `OPENAI_API_KEY`, the interview room UI loads but `/api/interview/turn`, `/api/realtime/transcribe`, and `/api/tts/speak` return errors. Typed chat still loads; voice will fail until the key is set.

Never set `NEXT_PUBLIC_OPENAI_API_KEY` — the permanent key must stay server-side.

### Voice STT (OpenAI Realtime transcription)

Streaming speech-to-text uses OpenAI Realtime with `gpt-live-transcribe` over WebRTC.

1. Set `OPENAI_API_KEY` in `.env.local` (never ship this to the browser).
2. Browser opens WebRTC, waits for ICE candidates, then `POST`s its SDP to `/api/realtime/transcribe`.
3. The server forwards that offer (plus the transcription session config) to OpenAI `/v1/realtime/calls` and returns the SDP answer — the permanent key never leaves the server.
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
npm run questions:prep    # generate question dossiers (see below)
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
| `/api/realtime/transcribe` | WebRTC SDP proxy (`application/sdp`) + silence config for Realtime STT |
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
    questions/            # Dossier schema + authored/dossier merge
    data/                 # Questions + company profiles
    data/dossiers/        # Generated interviewer knowledge (committed JSON)
    execution/            # Code runner (Pyodide in browser; mock fallback)
```

## Adding a question

A question has two halves. You author the first; the second is generated once and committed.

**Tier 1 — you write this** (in `src/lib/data/questions.ts`): `id`, `title`, `company`,
`difficulty`, `expectedTimeMinutes`, `statement`, `constraints`, `starterCode`. This is
candidate-facing content and identity, so it cannot be derived.

**Tier 2 — generated** (in `src/lib/data/dossiers/<id>.json`): the interviewer's private
knowledge — `interviewerConcerns`, `hintLadder`, `expectedComplexity`, `solutions`,
`rubricNotes`, `clarifications`, `edgeCases`, `commonMistakes`, `expectedApproaches`,
`followups`.

```bash
# add the Tier 1 entry, then:
set -a && . ./.env.local && set +a
npm run questions:prep                    # fills in anything missing
npm run questions:prep -- --only my-question
npm run questions:prep -- --force         # regenerate everything
npm run questions:prep -- --dry-run       # validate without writing
```

Set `OPENAI_DOSSIER_MODEL` to pick the generator model (default `gpt-4o`). Generation is
build-time only — nothing here runs during an interview.

### Precedence

```
dossier (generated)  →  dossier-overrides.ts (hand patch)  →  questions.ts (authored, wins)
```

A field counts as authored only if it has content, so an omitted or empty field falls
through to the dossier. Existing hand-enriched questions are therefore untouched by
generation. When the generator gets one field wrong, patch that field in
`src/lib/data/dossier-overrides.ts` rather than rerunning until it agrees with you —
overrides survive regeneration.

### Why generate once instead of per turn

`reasoning-state.ts` tracks concerns across turns by `templateId` and escalates probes on
re-match. Stable ids are load-bearing: regenerating specifics each turn would reset
escalation to level 1 forever, so dossiers are committed and read like authored data.

`concern.topic` must be one of the canonical `TOPIC_KEYS` — a free-form topic degrades to
`"other"`, which puts unrelated concerns in one namespace and lets resolving either one
suppress the other. `src/lib/questions/dossier.test.ts` enforces this, validates every
committed dossier against the schema (the barrel's JSON import would otherwise typecheck
while stale), and runs each `incorrectPatterns` entry through the real matcher.

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
