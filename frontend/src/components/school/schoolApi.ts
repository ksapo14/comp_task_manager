import { api } from "../../lib/api";
import type { FocusTask, Milestone, StudyCard } from "./types";

export type SchoolSyncState = "loading" | "saving" | "synced" | "offline";

export interface FlashcardDeckPayload {
  cards: StudyCard[];
  mastered_count: number;
  review_count: number;
}

export interface FocusMatrixPayload {
  tasks: FocusTask[];
}

interface TimelinePayload {
  semester_start: string | null;
  semester_end: string | null;
  milestones: Array<Omit<Milestone, "date"> & { date: string }>;
}

export function getFlashcardDeck() {
  return api<FlashcardDeckPayload>("/school-workspace/flashcards");
}

export function saveFlashcardDeck(payload: FlashcardDeckPayload) {
  return api<FlashcardDeckPayload>("/school-workspace/flashcards", {
    method: "PUT",
    body: payload,
  });
}

export function getFocusMatrix() {
  return api<FocusMatrixPayload>("/school-workspace/focus");
}

export function saveFocusMatrix(payload: FocusMatrixPayload) {
  return api<FocusMatrixPayload>("/school-workspace/focus", {
    method: "PUT",
    body: payload,
  });
}

export async function getTimeline(): Promise<{
  start: Date | null;
  end: Date | null;
  milestones: Milestone[];
}> {
  const payload = await api<TimelinePayload>("/school-workspace/timeline");
  return {
    start: payload.semester_start ? new Date(payload.semester_start) : null,
    end: payload.semester_end ? new Date(payload.semester_end) : null,
    milestones: payload.milestones.map((milestone) => ({
      ...milestone,
      date: new Date(milestone.date),
    })),
  };
}

export function saveTimeline({
  start,
  end,
  milestones,
}: {
  start: Date | null;
  end: Date | null;
  milestones: Milestone[];
}) {
  return api<TimelinePayload>("/school-workspace/timeline", {
    method: "PUT",
    body: {
      semester_start: start?.toISOString() ?? null,
      semester_end: end?.toISOString() ?? null,
      milestones: milestones.map((milestone) => ({
        ...milestone,
        date: milestone.date.toISOString(),
      })),
    },
  });
}
