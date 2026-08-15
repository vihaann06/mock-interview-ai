/**
 * Public interview-domain API — session state machine, stages, events.
 */

export {
  createEvent,
  appendEvent,
  EventLogger,
} from "./event-logger";

export {
  getNextStage,
  getStageLabel,
  isTerminal,
  canTransition,
  assertTransition,
} from "./stages";

export {
  createSession,
  startInterview,
  recordCandidateTurn,
  recordInterviewerTurn,
  recordExecutionRun,
  touchCodeActivity,
  /** @deprecated Prefer recordCandidateTurn */
  appendCandidateMessage,
  /** @deprecated Prefer recordInterviewerTurn */
  appendInterviewerMessage,
  updateCode,
  snapshotCode,
  requestHint,
  applyHintGiven,
  applyHintFromAction,
  isHintActionAllowed,
  transitionStage,
  moveForward,
  applyStageAction,
  endInterview,
  getElapsedMs,
  type CreateSessionInput,
  type RecordCandidateTurnInput,
} from "./session";

export {
  LONG_INACTIVITY_MS,
  INACTIVITY_POLL_MS,
  getLastActivityAt,
  isLongInactive,
  mergeActivityClocks,
  readSessionActivityClocks,
  suggestInactivityFollowUp,
  type InterviewActivityClocks,
  type InactivityFollowUpAction,
  type LongInactivityPayload,
  type LongInactivityReason,
} from "./inactivity";

export { buildOpeningMessage } from "./opening-message";
