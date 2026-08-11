import type { InterviewEvent } from "@/lib/types/events";
import type { InterviewStage } from "@/lib/types/interview";

/**
 * Placeholder event logger — Day 1 skeleton.
 * Later this becomes the source of truth for interviewer + evaluation.
 */
export function createEvent(
  type: InterviewEvent["type"],
  stage: InterviewStage,
  content?: string,
  timestamp = 0,
  metadata?: Record<string, unknown>,
): InterviewEvent {
  return {
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
