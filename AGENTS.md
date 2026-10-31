# Famo Admin Panel - Agent Instructions

## Project Overview
React 19 + TypeScript SPA (Persian/Farsi, RTL) for the Famo Academy admin panel (`پنل مدیریت - آموزشگاه فامو`). Navigation is state-driven via `navigateTo(page)`. Data is managed via the unified API client in `src/lib/api.ts` (connecting to `/api/v1` when available with automatic fallback to a persistent `localStorage` data store).

## Stack
- **Frontend**: React 19, TypeScript, Vite 6, Tailwind CSS v4, Lucide React
- **Styling**: RTL Persian layout (`Vazirmatn` font, `#445D84` primary brand palette)
- **Testing**: `node:test` via `tsx` (`npx tsx --test src/lib/logic.test.ts`)

## Architecture
| Path | Purpose |
|------|---------|
| `index.html` | Root HTML entry point (`lang="fa" dir="rtl"`) |
| `src/main.tsx` | React application entry point |
| `src/App.tsx` | Main shell, page router, keyboard shortcuts (`/`, `?`, `Escape`), and help modal |
| `src/types.ts` | Shared TypeScript interfaces for domain entities |
| `src/lib/api.ts` | Unified API client & seeded local persistence store |
| `src/lib/jalali.ts` | Pure TypeScript Gregorian ↔ Jalali date utilities |
| `src/lib/exam-math.ts` | Konkur negative-marking score calculation, validation & filtering |
| `src/lib/logic.test.ts` | Unit tests for pure business logic |
| `src/components/` | Reusable UI components (`Sidebar`, `Modal`, `ConfirmModal`, `ToastStack`, `Charts`) |
| `src/pages/` | Page views (`OverviewPage`, `StudentsPage`, `CoursesPage`, `InstructorsPage`, `ExamsPage`, `ExamEntryPage`, `FilesPage`, `SupportersPage`, `BlogPage`, `ReportsPage`) |
