# NCC SmartExam

A role-based NCC Army Wing examination, practice and AI learning platform.

Built with TanStack Start (React + TypeScript), Tailwind CSS and Supabase
(Postgres, Auth, Row Level Security). All privileged logic runs in server
functions — answer keys are never sent to the browser.

## Features

- Main Admin dashboard, Admin dashboard and Cadet dashboard
- B Certificate and C Certificate support
- Army Wing central question bank, subject-wise and topic-wise
- Exam management, exam assignments, exam attempts
- Automatic server-side scoring with negative marking
- Results and analytics with charts
- AI practice (adaptive, weak-area aware) and AI performance review
- PDF question extraction, AI subject detection, AI question generation
- Duplicate detection and repeated-question analysis
- Main Admin approval workflow — nothing reaches cadets unapproved
- Authorized external content ingestion with source attribution
- Notifications
- Event-based Geo-Tagging (LOGIN, EXAM_START, EXAM_SUBMIT only)
- Supabase email/password authentication and Google authentication

## User Roles

| Role | Permissions |
| --- | --- |
| `MAIN_ADMIN` | Everything: members and roles, exams, questions, subjects, topics, imports, approvals, duplicates, audit log, geo-tag activity, analytics, and deletion of any record |
| `ADMIN` | Create and manage exams, sections and questions; run PDF and content imports; review AI questions; assign exams; view cadet performance and geo-tag activity. Cannot change roles or delete members |
| `CADET` | Own dashboard only: assigned exams, taking exams, own results and analytics, AI practice, Army Wing practice, own notifications. Read-only against the question bank |

Roles are resolved only from `auth.users.id → profiles → user_roles`. A missing
role never falls back to Cadet — access is blocked and reported instead.

## B/C Question Logic

- `B` questions → visible to B certificate cadets
- `C` questions → visible to C certificate cadets
- `BOTH` questions → visible to B and C cadets

Only questions with status `APPROVED` are ever served. Rejected, archived and
pending questions are invisible to cadets, in practice and in exams alike.

## AI PDF Workflow

```text
PDF
  ↓ complete PDF analysis
Subject detection
  ↓
Topic detection
  ↓
Question extraction
  ↓
B/C classification
  ↓
Duplicate detection
  ↓
Main Admin review
  ↓
Approved question bank
  ↓
Practice / AI Practice / Exams
```

Every extracted or generated question keeps its subject, topic, certificate
applicability, source, source reference (page/section/URL) and review status.

## Project Structure

```text
src/
  components/          shared UI and layout
  hooks/               auth and device hooks
  integrations/        Supabase clients, middleware, generated types
  lib/                 server functions (exam, admin, ai, content-import) and utils
  routes/              file-based routes; _authenticated/* is role-gated
supabase/
  migrations/          full schema history: tables, indexes, FKs, RLS, functions, triggers
public/
```

## Setup

1. Clone the repository

   ```sh
   git clone <this-repository-url>
   cd NCC-SmartExam
   ```

2. Install dependencies

   ```sh
   npm install
   ```

3. Configure environment variables

   ```sh
   cp .env.example .env
   ```

   Fill in your Supabase URL, publishable key, project id, service-role key
   (server only) and the AI gateway key. Never commit `.env`.

4. Connect Supabase — create a project, then point the variables above at it.

5. Run migrations

   ```sh
   npx supabase link --project-ref <your-project-ref>
   npx supabase db push
   ```

6. Start the development server

   ```sh
   npm run dev
   ```

## Security Notes

- Row Level Security is enabled on every table; cadets can only read their own
  rows and approved question content.
- Correct answers are never returned to the client; grading is server-side.
- The service-role key is used only inside server functions, never in browser code.
- Geo-tagging is event-based only — there is no background tracking.
