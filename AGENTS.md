# Famo Admin Panel - Agent Instructions

## Project Overview
React 19 + TypeScript SPA (Persian/Farsi, RTL) for the Famo Academy admin panel (`پنل مدیریت - آموزشگاه فامو`). Navigation is state-driven via `currentPage`. All data is fetched directly from `https://api.famoacademy.ir/api/v1` via `src/lib/api.ts` (using `famo_jwt` Bearer token and `credentials: 'include'`).

## Stack
- **Frontend**: React 19, TypeScript, Vite 6, Tailwind CSS v4, Lucide React
- **API**: `https://api.famoacademy.ir/api/v1`
- **Styling**: RTL Persian layout (`Vazirmatn` font, `#445D84` primary brand palette)
- **Testing**: `node:test` via `tsx` (`npx tsx --test src/lib/logic.test.ts`)

## Architecture
| Path | Purpose |
|------|---------|
| `index.html` | Root HTML entry point (`lang="fa" dir="rtl"`) |
| `src/main.tsx` | React application entry point |
| `src/App.tsx` | Main shell, page router, keyboard shortcuts (`/`, `?`, `Escape`), and help modal |
| `src/types.ts` | Shared TypeScript interfaces for domain entities |
| `src/lib/api.ts` | HTTP client connecting directly to `https://api.famoacademy.ir/api/v1` |
| `src/lib/jalali.ts` | Pure TypeScript Gregorian ↔ Jalali date utilities |
| `src/lib/exam-math.ts` | Konkur negative-marking score calculation, validation & filtering |
| `src/lib/logic.test.ts` | Unit tests for pure business logic |
| `src/components/` | Reusable UI components (`Sidebar`, `Modal`, `ConfirmModal`, `ToastStack`, `Charts`) |
| `src/pages/` | Page views (`OverviewPage`, `StudentsPage`, `CoursesPage`, `InstructorsPage`, `ExamsPage`, `ExamEntryPage`, `FilesPage`, `SupportersPage`, `BlogPage`, `ReportsPage`) |
