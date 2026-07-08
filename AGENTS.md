# Matrix Compass Codex Handoff

Last updated: 2026-07-09

This file is the project handoff for Codex or any coding agent working on Matrix Compass from a fresh local clone.

## Project Identity

- Project name: Matrix Compass / 矩阵罗盘
- Repository: `https://github.com/yangdyjp-glitch/XHS.git`
- Main branch: `master`
- Production deployment: Railway automatically deploys after push to `master`
- Local project path on the original machine: `E:\AIJP\Compass`
- Product purpose: an internal operations system for Xiaohongshu account matrix management, topic planning, publishing, data entry, review reports, recommendations, account management, user management, type management, and dashboard overview.

Do not confuse this project with unrelated local folders such as `japan-travel-site`.

## Sensitive Information Policy

Do not commit secrets.

The project needs environment variables such as database credentials and JWT secret, but those belong in `.env` or the deployment platform. Never write production database URLs, passwords, cookies, tokens, or login credentials into repository documents or source code.

Use `.env.example` only for variable names and placeholders.

## Tech Stack

- Frontend: React 19, Vite, TypeScript, Tailwind CSS
- Backend: Express, tRPC
- Database: PostgreSQL on Supabase
- ORM: Drizzle ORM
- Auth: JWT stored in HTTP-only cookie
- Package manager: pnpm
- Runtime: Node.js 20+
- Deployment: Railway

## Useful Commands

Run from the project root.

```bash
pnpm install
pnpm dev
pnpm build
pnpm start
pnpm db:generate
pnpm db:migrate
pnpm db:push
pnpm db:studio
```

Expected verification before finishing code changes:

```bash
pnpm build
```

There is no dedicated lint script at the time of writing.

## Repository Layout

```text
client/
  src/
    App.tsx                         App routes and auth gating
    main.tsx                        Frontend entry
    index.css                       Global styles and Tailwind classes
    hooks/useAuth.ts                Auth state, role helpers, selected account state
    lib/trpc.ts                     tRPC React client
    components/
      layout/Sidebar.tsx            Main sidebar navigation
      layout/AppShell.tsx           Authenticated app shell
      ui/Dropdown.tsx               Shared dropdown
      ui/AccountFilter.tsx          Multi-account filter
      ui/NoteLink.tsx               XHS note link helper
      ImpersonationBanner.tsx       Admin impersonation banner
    pages/
      KanbanPage.tsx                Topic kanban
      CalendarPage.tsx              Publish calendar
      TrashPage.tsx                 Deleted topics
      DataEntryPage.tsx             Manual metrics entry
      AutoFetchPage.tsx             Data fetching page
      DataOverviewPage.tsx          Data overview page
      ReviewPage.tsx                Review reports
      RecommendationPage.tsx        Next-period recommendations
      DashboardPage.tsx             Matrix overview dashboard
      AccountsPage.tsx              Account management
      UsersPage.tsx                 User management
      TypesPage.tsx                 Topic type management
      TopicDetailPage.tsx           Topic details

server/
  index.ts                          Express server
  db.ts                             Database connection
  _core/
    auth.ts                         JWT, password hashing, auth cookie helpers
    trpc.ts                         tRPC context and role middleware
  routers/
    auth.router.ts                  Login, users, impersonation, password reset
    dashboard.router.ts             Matrix overview and rankings
    review.router.ts                Review aggregation and AI analysis
    recommendation.router.ts        Recommendation generation and actions
    account.router.ts               Accounts
    topic.router.ts                 Topics
    data.router.ts                  Metrics data
    type.router.ts                  Topic types

drizzle/
  schema.ts                         Database schema
  migrations/                       Drizzle migrations if present

shared/
  enums.ts                          Shared labels and enums

docs/
  admin-impersonation-rules.md      Reusable admin impersonation rules
```

## Git And Deployment Rules

The user expects completed changes to be pushed after verification.

General flow:

```bash
git status --short --branch
pnpm build
git add <changed source files>
git commit -m "<short clear message>"
git push origin master
```

Important:

- Push to `master` triggers Railway deployment.
- Do not commit `.env`, logs, uploads, build output, or local helper files.
- Preserve unrelated local changes. If there are changes you did not make, do not revert them.
- Commit only files relevant to the current request.
- The following local files are intentionally ignored and should not be mentioned unless they are directly needed:
  - `.claude/`
  - `_extract_pdf.py`
  - `stats.html`
  - `.railway/`

## Roles And Auth

Main roles:

```text
leader  负责人 / admin-like role
editor  编辑
teacher 老师
```

Role helpers are in `client/src/hooks/useAuth.ts`.

Server-side protected procedures:

- `protectedProcedure`: any logged-in user
- `leaderProcedure`: only `role === "leader"`

Auth is cookie-based. The JWT cookie name is defined in `server/_core/auth.ts`.

Do not change auth behavior casually. Changes here can affect every page.

## Admin Impersonation

Matrix Compass supports admin/leader impersonation: a leader can click “登录该账户” in user management and temporarily operate as another user.

Core rule:

```text
Impersonation = target user's permissions + original admin audit trail
```

Never implement this by reading or changing user passwords.

Relevant files:

- `server/routers/auth.router.ts`
- `server/_core/auth.ts`
- `server/_core/trpc.ts`
- `client/src/pages/UsersPage.tsx`
- `client/src/components/ImpersonationBanner.tsx`
- `client/src/hooks/useAuth.ts`
- `drizzle/schema.ts`
- `docs/admin-impersonation-rules.md`

Important behavior:

- Only `leader` can impersonate.
- A leader cannot impersonate self.
- Nested impersonation is blocked.
- Only active target users can be impersonated.
- JWT stores the target user as `userId` and original leader as `impersonatorId`.
- `auth.me` returns `impersonator` when in impersonation mode.
- The UI shows a bottom banner with “返回我的账户”.
- Start and stop actions are written to `impersonation_logs`.
- While impersonating, permissions and menus are based on the target user role.

## Important Product Areas

### Topic Kanban

Main page: `client/src/pages/KanbanPage.tsx`

Topics are organized by status. Deleted topics go to Trash rather than being hard-deleted in common flows.

Topic statuses and shared labels are in `shared/enums.ts`.

### Recommendations

Main page: `client/src/pages/RecommendationPage.tsx`
Backend: `server/routers/recommendation.router.ts`

Recent rule from the user:

- Recommendation labels must not exceed existing topic types.
- Recommendation chips should show both the topic type and keyword chips.
- Do not let generated labels such as `judgment_exam` appear in the UI.

If changing recommendation logic, verify both type constraints and keyword display.

### Matrix Overview

Main page: `client/src/pages/DashboardPage.tsx`
Backend: `server/routers/dashboard.router.ts`

Recent behavior:

- The dashboard has a global period selector: `近7天`, `近14天`, `近30天`, `全部时间`.
- The selected period affects KPI totals, topic progress, account health cards, and content rankings.
- Account filtering is multi-select through `AccountFilter`.

### Review Reports

Main page: `client/src/pages/ReviewPage.tsx`
Backend: `server/routers/review.router.ts`

Review reports aggregate data by week or month and can include account scopes.

### Data Entry And Data Overview

Metrics are based on `notes` and `metric_snapshots`.

When aggregating performance data, inspect how the code chooses snapshots. Some dashboard flows use the latest/best snapshot for notes in a period.

## Database Schema Notes

Primary schema file:

```text
drizzle/schema.ts
```

Important tables:

- `users`
- `accounts`
- `columns`
- `topics`
- `notes`
- `metricSnapshots`
- `reviews`
- `aiAnalysisResults`
- `rejectedRecommendations`
- `comments`
- `notifications`
- `calendarEvents`
- `impersonationLogs`

Before schema changes:

1. Read `drizzle/schema.ts`.
2. Check existing migrations.
3. Decide whether migration generation is required.
4. Do not run destructive database changes without explicit user approval.

## Frontend Style Rules

The app is an internal operations tool. Keep the UI quiet, dense, and work-focused.

Use existing visual patterns:

- `card-surface`
- `eyebrow`
- `status-pill`
- `kpi-value`
- `Dropdown`
- `AccountFilter`

Avoid introducing decorative landing-page style UI. The application should feel like a practical admin tool.

When adding controls:

- Use dropdowns for option sets.
- Use filters near the page header when they affect the whole page.
- Keep table/action text compact.
- Avoid nested cards.
- Keep buttons readable and stable at desktop and mobile widths.

## Backend Style Rules

- Prefer existing tRPC router patterns.
- Validate inputs with `zod`.
- Use `leaderProcedure` for admin-only mutations.
- Use Drizzle query builders where possible.
- Keep output shapes backward-compatible if a frontend page already depends on them.
- When changing tRPC output, run `pnpm build` so frontend type inference is checked.

## Common Gotchas

1. `dist/` is ignored. Do not commit build output.
2. `.env` is ignored. Do not commit secrets.
3. `stats.html` is a bundle visualizer output and is ignored.
4. `_extract_pdf.py` is a local helper script and is ignored.
5. `.claude/` is local AI tool data and is ignored.
6. The app may show a Git warning about `C:\Users\PhD.Yang/.config/git/ignore` permission. It is usually harmless.
7. Always check whether a file was already modified by someone else before editing.
8. Do not remove user-created changes unless explicitly asked.
9. If adding generated AI recommendation text, sanitize it so internal labels or English machine keys do not leak into the UI.
10. If modifying dashboard aggregation, define whether the period applies to publish date, snapshot date, or topic creation date.

## Suggested First Steps For A New Codex Session

1. Read this file.
2. Run:

```bash
git status --short --branch
```

3. Inspect the relevant page and router before editing.
4. Make scoped changes only.
5. Run:

```bash
pnpm build
```

6. Commit only relevant files.
7. Push to `master` if the user asked for deployment or the standing instruction is to deploy completed changes.

## Current Documentation

Additional handoff document:

```text
docs/admin-impersonation-rules.md
```

Use it when another project needs to reproduce the admin impersonation feature.
