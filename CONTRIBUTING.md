# Contributing

## Development Workflow

This repository uses local Git hooks and GitHub Actions to keep `main` releasable.

- `pre-commit` runs `npm run verify:commit`
- `pre-push` runs `npm run verify:push`
- CI runs the full remote enforcement on pushes and pull requests, including backend integration tests
- the admin API contract is exported from the backend and checked into the repo so the frontend can consume generated types

Install dependencies with:

```bash
npm install
```

The root `prepare` script installs Husky hooks automatically after install.

The repository root is a workspace orchestrator. Backend-specific scripts and dependencies live in `backend/`, frontend-specific scripts and dependencies live in `frontend/`, and the root scripts delegate to those packages.

## Local Quality Gates

Use these commands during development:

```bash
npm run check:api
npm run typecheck
npm run build
npm run test:backend:unit
npm run test:backend:integration
npm run test:frontend
npm run lint:frontend
```

Expected workflow:

1. Commit locally as often as needed.
2. Keep commits small and coherent.
3. Let `pre-commit` catch fast type and backend unit-test regressions.
4. Let `pre-push` block pushes if generated API artifacts are stale or if build, backend unit tests, frontend tests, or frontend lint are red.
5. Push only when the branch is in a releasable state.

The local `pre-push` hook intentionally skips backend integration tests because they require opening local listeners and can be environment-sensitive. Those integration tests still run in GitHub Actions.

For release preparation, use the checklist in [`docs/release-checklist.md`](docs/release-checklist.md).

## Project Guidance

This repository keeps project guidance tool-neutral:

- repository expectations in [`AGENTS.md`](AGENTS.md)
- structural coding guidance in [`docs/architecture-guide.md`](docs/architecture-guide.md)
- review guidance in [`docs/review-checklist.md`](docs/review-checklist.md)

If you use an AI coding tool locally, keep harness-specific workflow files outside this repository and use the project guidance here as the source of truth for build, architecture, review, and release expectations.

## Current Enforcement Policy

- Do not relax TypeScript strictness to make builds pass unless the change is explicitly reviewed.
- Do not bypass hooks with `--no-verify` except for emergencies, and fix the broken gate immediately after.
- Update docs and examples when behavior, scripts, or environment expectations change.
- Keep `main` deployable and suitable for open source consumers cloning the repository.

## Pull Requests

Before opening a pull request, make sure:

- `npm run build` passes
- `npm run check:api` passes
- `npm run test:backend:unit` passes
- `npm run test:backend:integration` passes
- `npm run test:frontend` passes
- `npm run lint:frontend` passes
- any required README or docs changes are included
