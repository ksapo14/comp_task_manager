export type Priority = "low" | "medium" | "high";

export interface User {
  id: string;
  email: string;
  preferred_start_time: string;
  preferred_end_time: string;
  created_at: string;
}

export interface Course {
  id: string;
  user_id: string;
  code: string;
  name: string;
  professor: string;
  location: string;
  schedule_rrule: string;
  color: string;
  created_at: string;
}

export interface Task {
  id: string;
  user_id: string;
  course_id: string | null;
  title: string;
  description: string;
  duration_minutes: number;
  priority: Priority;
  due_date: string | null;
  scheduled_start_time: string | null;
  is_completed: boolean;
  is_routine: boolean;
  created_at: string;
}

export interface Habit {
  id: string;
  user_id: string;
  course_id: string | null;
  name: string;
  color: string;
  created_at: string;
  completion_history: string[];
}

export interface Journal {
  id: string;
  user_id: string;
  course_id: string | null;
  title: string;
  content_markdown: string;
  created_at: string;
  updated_at: string;
}

export interface CalendarBlock {
  id: string;
  title: string;
  kind: "course" | "task" | "external";
  start: string;
  end: string;
  color: string;
  locked: boolean;
}

export interface FocusLink {
  id: string;
  label: string;
  url: string;
  position: number;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
  user: User;
}

