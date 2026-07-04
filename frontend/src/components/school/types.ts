export interface StudyCard {
  id: string;
  course: string;
  question: string;
  answer: string;
}

export type FocusTaskStatus = "todo" | "progress" | "completed";

export interface FocusTask {
  id: string;
  title: string;
  course: string;
  status: FocusTaskStatus;
}

export interface Milestone {
  id: string;
  title: string;
  course: string;
  kind: "Exam" | "Project" | "Deadline";
  date: Date;
  detail: string;
}

export interface FocusRequest {
  id: number;
  title: string;
  course: string;
}
