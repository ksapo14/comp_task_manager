You are an expert full-stack engineer specializing in building clean,
minimalist, high-performance web applications. Your task is to build a
comprehensive productivity dashboard tailored specifically for Computer Science
and computationally heavy students.

### Core Tech Stack

- Frontend: React (SPA), Tailwind CSS (for a minimalist UI), and a lightweight
  state management library (like Zustand or React Context).
- Backend: FastAPI (Python), leveraging asynchronous endpoints and Pydantic for
  strict data validation.
- Database: PostgreSQL, utilizing SQLAlchemy or SQLModel as the ORM.
- Integrations: Google Calendar API (OAuth2).

---

### Architectural & UI Requirements

1. Minimalist UI/UX: A distraction-free, ultra-clean aesthetic with plenty of
   whitespace.
2. Theme Management: Automated Light/Dark mode toggling based on the user's
   system time/browser preferences, with a manual override toggle.
3. Protected Routes: A global frontend router guard that redirects
   unauthenticated users to a clean login/signup page.

---

### Comprehensive Feature Specifications

1. User Authentication & Security
   - Secure Sign-up, Login, and Logout flows.
   - Backend auth utilizing OAuth2 with Password Bearer flow and JWT (JSON Web
     Tokens) for stateless session management.
   - Password hashing implemented using passlib with bcrypt.
   - All API endpoints must be strictly protected, ensuring users can only
     read/write their own data.

2. Academic Class Scheduling
   - A dedicated manager for university courses supporting recurring schedules
     (e.g., Every Mon/Wed/Fri from 1:00 PM - 2:15 PM).
   - Class properties: Course Code, Course Name, Professor, Location/Zoom Link,
     and a custom UI color-code.
   - **System Rule:** Class times are absolute, locked blocks. They
     automatically populate the calendar and cannot be overwritten by the
     auto-scheduler.
   - Relational Tagging: Tasks, habits, and journal entries must support an
     optional `course_id` foreign key for unified course-specific filtering.

3. Task & Habit Management
   - Task Manager: Full CRUD operations for tasks. Includes title, notes,
     priority weight (Low, Medium, High), estimated duration (in minutes), due
     date, and completion status.
   - Boilerplate Routines: Quick-add toggles or automated generation for daily
     foundational tasks (e.g., Breakfast, Lunch, Dinner, Sleep, Wake up).
   - Habit Tracker: A clean matrix/grid view showing weekly and monthly
     completion status for habits, utilizing checkmarks or simple toggle
     indicators.

4. Smart Calendar & Auto-Scheduling
   - Full Calendar component featuring clean Day, Week, and Month views.
   - Split views for "Scheduled Tasks" (assigned to a fixed time) and
     "Unscheduled Tasks" (the backlog).
   - **Auto-Scheduling Algorithm:** A backend endpoint that takes Unscheduled
     Tasks and intelligently slots them into empty calendar spaces based on:
     - Task priority and due date proximity.
     - Task estimated duration.
     - User-defined "Preferred Working Hours" (configured in user profile).
     - Hard-blocked academic class times.
   - Google Calendar API: Two-way sync via OAuth2 to pull external personal
     events and push scheduled dashboard tasks.

5. Interactive Focus Page
   - A full-screen, ultra-minimalist "Deep Work" interface.
   - Features a prominent digital flip clock with an integrated Pomodoro /
     countdown timer.
   - Displays a dynamic, session-specific checklist of tasks pulled from the
     main task manager.
   - Includes an editable "Launchpad" of useful hyperlinks needed for the
     current study block.
   - **The Anti-Distraction Alarm:** An audible sound triggers when the timer
     hits zero. The alarm _cannot_ be turned off or muted until the user
     correctly types a dynamically generated string or motivational code-snippet
     into a text input field.

6. Developer Journal
   - A minimalist journaling interface for daily logging, system architecture
     thoughts, or emotional check-ins.
   - **Technical Requirement:** Must support full Markdown rendering, explicitly
     including syntax-highlighted code blocks so CS students can log bugs,
     terminal snippets, and algorithms.

---

### Database Schema Guidelines (PostgreSQL)

Ensure the following relational integrity rules are met:

- `users`: ID, email (unique), hashed_password, preferred_start_time,
  preferred_end_time.
- `courses`: ID, user_id (FK), code, name, professor, schedule_rrule, color.
- `tasks`: ID, user_id (FK), course_id (FK, nullable), title, description,
  duration_minutes, priority, due_date, scheduled_start_time, is_completed.
- `habits`: ID, user_id (FK), course_id (FK, nullable), name, completion_history
  (jsonb or separate tracking table).
- `journals`: ID, user_id (FK), course_id (FK, nullable), title,
  content_markdown, created_at.

### Code Style & Implementation Plan

- Write clean, production-grade, modular code.
- Prioritize asynchronous database operations in FastAPI.
- Implement comprehensive error handling for both the Google Calendar API
  integration and the auto-scheduling algorithm.
- Provide a step-by-step implementation plan, starting with the database setup
  and backend authentication, followed by the frontend architecture.
