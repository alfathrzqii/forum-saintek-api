# AGENTS.md — Backend Rewrite Progress & Continuation Guide

## Overview
- **Goal**: Rewrite Forum SAINTEK Backend (`/home/ubuntu/dev/forum-saintek/backend`) from Node.js + Express + Prisma + Zod (JavaScript) to **Bun + Elysia + Drizzle ORM + Elysia Built-in Validation (TypeBox) + PostgreSQL** in **TypeScript**.
- **Requirement**: 100% API, database schema, authentication/RBAC, status code, response payload, and error message parity with `main` (zero breaking changes).
- **Working Branch**: `feat/bun-elysia-drizzle-ts` (`main` remains untouched at commit `8278023`).
- **Local PostgreSQL 18 Configuration**:
  - Host/Port: `localhost:5433` (PostgreSQL 18 cluster `18/main`)
  - Credentials: user `user`, password `password`, database `forum_saintek`
  - Connection URI in `.env`: `DATABASE_URL="postgresql://user:password@localhost:5433/forum_saintek"`

---

## What Has Been Completed (Done)

### 1. Milestone 1 (`M1_foundation_db`) — Foundation & Drizzle Database Layer
- **Project & TypeScript Setup**:
  - `package.json`, `bun.lock`, `tsconfig.json`, `drizzle.config.ts`, `.gitignore` updated for Bun + Elysia + Drizzle ORM + TypeScript (no runtime dependency on Express, Prisma, or Zod).
  - `bun run typecheck` (`bunx tsc --noEmit`) passes with **0 errors**.
- **Drizzle Schema & Migration**:
  - `src/db/schema.ts`: Full PostgreSQL schema matching `prisma/schema.prisma` (`Role` enum, `users`, `authentications`, `subforums`, `threads`, `comments`, `votes`, relations, indexes, and composite PKs).
  - `src/db/index.ts`: Drizzle `postgres-js` connection pool and `db` instance.
  - `src/db/seed.ts`: Idempotent database seeder matching `prisma/seed.js`.
  - `drizzle/0000_majestic_misty_knight.sql` & `drizzle/meta/*`: Generated SQL migration and Drizzle metadata.

### 2. Milestone 2 (`M2_core_infra`) — Core Infrastructure & App Scaffolding
- **Configuration & Logging**:
  - `src/config/index.ts`: Environment config loader with fail-fast validation for `DATABASE_URL`, `ACCESS_TOKEN_KEY`, and `REFRESH_TOKEN_KEY`.
  - `src/utils/logger.ts`: Pino logger configured for development/production/test.
- **Exception Hierarchy & Error Handling**:
  - `src/exceptions/{ClientError,InvariantError,AuthenticationError,AuthorizationError,NotFoundError}.ts`
  - `src/api/middlewares/errorHandler.ts`: Global Elysia error handler mapping `ClientError` subclasses, TypeBox `VALIDATION` errors (forced to HTTP `400` with concise Indonesian messages), malformed JSON `PARSE` errors (`400`), `NOT_FOUND` routes (`404`), and unexpected errors (`500`).
- **Response, Validators, Rate Limit, Security, Compression, Health & Swagger**:
  - `src/utils/response.ts`: `formatResponse` and `successResponse` helpers.
  - `src/validators/commonValidator.ts`: Reusable UUID parameter validators with exact Indonesian error messages.
  - `src/api/middlewares/rateLimitMiddleware.ts`: In-memory rate limiters (`globalLimiter`, `authLimiter`) emitting standard IETF draft-7 `ratelimit-*` headers.
  - `src/api/controllers/healthController.ts` & `src/api/routes/healthRoutes.ts`: `GET /api/health` endpoint checking database connectivity (`200` healthy / `503` disconnected).
  - `src/utils/swagger.ts`: `@elysiajs/swagger` mounted at `/api-docs` and `/api-docs/json`.
  - `src/app.ts`: `createApp()` factory with Helmet-equivalent security headers, CORS, global rate limiter, request logging, gzip/RFC-1950 deflate compression (`>= 1024` bytes), error handler, Swagger, `/api` welcome route, `/api/health`, `/api/authentications`, and `/api/users`.
- **Unit Tests**:
  - `tests/unit/coreInfra.test.ts` (passes 100%).

### 3. Milestone 3 (`M3_auth_users`) — Authentication & Users Domain
- **Auth & Password Utilities**:
  - `src/utils/password.ts`: `Bun.password` bcrypt hashing (cost 10) and verification.
  - `src/utils/jwt.ts`: HS256 access token (`15m`) & refresh token (`7d`) signing and verification with cross-key rejection.
- **Auth & RBAC Middlewares**:
  - `src/api/middlewares/authenticationMiddleware.ts`: Bearer token extraction, verification, and live user lookup (rejects ghost/deleted users).
  - `src/api/middlewares/roleMiddleware.ts`: `requireRole([...])` guard throwing `AuthorizationError` (`403`).
- **Authentication & User Modules**:
  - Validators: `src/validators/authenticationValidator.ts`, `src/validators/userValidator.ts`
  - Repositories: `src/repositories/authenticationRepository.ts`, `src/repositories/userRepository.ts`
  - Services: `src/services/authenticationService.ts`, `src/services/userService.ts`
  - Controllers: `src/api/controllers/authenticationController.ts`, `src/api/controllers/userController.ts`
  - Routes: `src/api/routes/authenticationRoutes.ts`, `src/api/routes/userRoutes.ts`
  - Legacy `.js` files for `authentication` and `user` (plus `tests/unit/authenticationService.test.js` and `tests/unit/userService.test.js`) have been removed.
- **Unit Tests**:
  - `tests/unit/jwtPassword.test.ts`
  - `tests/unit/authMiddleware.test.ts`
  - `tests/unit/authenticationService.test.ts`
  - `tests/unit/userService.test.ts`
  - `tests/unit/authUserRoutes.test.ts`
  - All **70 unit tests** across the 6 `.ts` unit test files pass (`bun test tests/unit/*.test.ts`).

### 4. End-to-End Test Suite (`E2E_Track`) — Opaque-Box E2E Tests Authored
- Written in `tests/e2e/`:
  - Helpers: `tests/e2e/helpers/{config,db,fixtures,http,server}.ts`
  - Test suites:
    - `tests/e2e/tier1_core_auth.test.ts`
    - `tests/e2e/tier1_forum.test.ts`
    - `tests/e2e/tier2_core_auth.test.ts`
    - `tests/e2e/tier2_forum.test.ts`
    - `tests/e2e/tier3_combinations.test.ts`
    - `tests/e2e/tier4_scenarios.test.ts`

---

## What Remains To Be Done (When Resuming After Quota Reset)

### Step 1: Verify Live PostgreSQL 18 Migration & Seeding (`M1` Finalization)
1. Ensure PostgreSQL 18 cluster `18/main` is running on port `5433` (`pg_lsclusters`).
2. Run Drizzle migrations against live PostgreSQL:
   ```bash
   bun run db:migrate
   ```
3. Run idempotent seeding twice and verify default admin/moderator/subforum records:
   ```bash
   bun run seed && bun run seed
   ```

### Step 2: Milestone 4 (`M4_forum_domain`) — Forum Domain Modules (Subforums, Threads, Comments, Votes)
Rewrite the remaining `.js` domain modules to TypeScript (`.ts`) using Elysia, Drizzle ORM, and Elysia's TypeBox validation (`t`), preserving exact route paths, query/body validation error messages, soft-delete semantics, anonymous thread/comment masking (`Saintekfess` / `Anonim`), nested comment trees, and vote score calculations:

1. **Utilities (if needed by forum domain)**:
   - Check `main` for pagination/slug helper logic and implement clean TypeScript utilities if needed.
   - Delete legacy `src/utils/prisma.js` once all repositories use Drizzle (`src/db/index.ts`).
2. **Validators (`src/validators/`)**:
   - Rewrite `subforumValidator.js` → `subforumValidator.ts`
   - Rewrite `threadValidator.js` → `threadValidator.ts`
   - Rewrite `commentValidator.js` → `commentValidator.ts`
   - Rewrite `voteValidator.js` → `voteValidator.ts`
3. **Repositories (`src/repositories/`)**:
   - Rewrite `subforumRepository.js` → `subforumRepository.ts` (Drizzle ORM)
   - Rewrite `threadRepository.js` → `threadRepository.ts` (Drizzle ORM, including pagination, search, subforum filtering, vote sums, comment counts, soft delete `isDeleted`)
   - Rewrite `commentRepository.js` → `commentRepository.ts` (Drizzle ORM, nested replies, vote sums)
   - Rewrite `voteRepository.js` → `voteRepository.ts` (Drizzle ORM, upsert/toggle/delete thread & comment votes)
4. **Services (`src/services/`)**:
   - Rewrite `subforumService.js` → `subforumService.ts`
   - Rewrite `threadService.js` → `threadService.ts` (including anonymous author masking and owner/MODERATOR/ADMIN authorization)
   - Rewrite `commentService.js` → `commentService.ts` (including anonymous thread author masking on comments)
   - Rewrite `voteService.js` → `voteService.ts`
5. **Controllers & Routes (`src/api/controllers/` & `src/api/routes/`)**:
   - Rewrite `subforumController.js` & `subforumRoutes.js` → `.ts`
   - Rewrite `threadController.js` & `threadRoutes.js` → `.ts`
   - Rewrite `commentController.js` & `commentRoutes.js` → `.ts`
   - Rewrite `voteController.js` & `voteRoutes.js` → `.ts`
   - Register `createSubforumRoutes`, `createThreadRoutes`, `createCommentRoutes`, and `createVoteRoutes` in `src/app.ts` (`CreateAppOptions` + `.use(...)`).
6. **Unit Tests (`tests/unit/`)**:
   - Rewrite `subforumService.test.js` → `subforumService.test.ts`
   - Rewrite `threadService.test.js` → `threadService.test.ts`
   - Rewrite `commentService.test.js` → `commentService.test.ts`
   - Rewrite `voteService.test.js` → `voteService.test.ts`
   - Remove the old `.js` unit test files and verify `bun run test:unit` passes 100%.

### Step 3: Milestone 5 (`M5_integration_parity`) — Integration Tests, E2E Suite & Cleanup
1. **Migrate Integration Tests (`tests/integration/`)**:
   - Rewrite `authentication.test.js`, `user.test.js`, `subforum.test.js`, `thread.test.js`, `comment.test.js`, `vote.test.js`, and `core.test.js` to TypeScript (`.ts`) running under `bun test tests/integration` against PostgreSQL (`localhost:5433`) and remove the old `.js` files.
2. **Run Full E2E Suite (`tests/e2e/`)**:
   - Run `bun test tests/e2e` against the live PostgreSQL 18 database and fix any contract or edge-case discrepancies.
3. **Final Cleanup & Verification**:
   - Remove `prisma/` directory (or verify whether `prisma/schema.prisma` is kept only for reference per acceptance criteria) and ensure zero `.js` files remain in `src/` and `tests/`.
   - Verify `bun run typecheck`, `bun run test:unit`, `bun run test:integration`, and `bun test tests/e2e` all pass 100% with 0 errors.
   - Verify `main` branch has no unintended modifications.
