import type { InterviewEvent, InterviewEventType } from "@/lib/types/events";
import type { InterviewStage } from "@/lib/types/interview";

function newId(): string {
  return `evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
}

/**
 * Event logger — source of truth append-only stream for a session.
 */
export function createEvent(
  type: InterviewEventType,
  stage: InterviewStage,
  content?: string,
  timestamp = 0,
  metadata?: InterviewEvent["metadata"],
): InterviewEvent {
  return {
    id: newId(),
    timestamp,
    type,
    content,
    stage,
    metadata,
  };
}

export class EventLogger {
  private events: InterviewEvent[] = [];

  log(event: InterviewEvent): void {
    this.events.push(event);
  }

  getAll(): InterviewEvent[] {
    return [...this.events];
  }

  clear(): void {
    this.events = [];
  }
}
