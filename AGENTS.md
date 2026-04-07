# AGENTS.md

## Purpose

Repository instructions for coding agents working in this project.

Keep this file project-specific and tool-neutral. Use it for repository expectations that should remain true regardless of which coding agent or harness is used.

Project architecture guidance lives in [`docs/architecture-guide.md`](docs/architecture-guide.md). Review guidance lives in [`docs/review-checklist.md`](docs/review-checklist.md). Contributor workflow details live in [`CONTRIBUTING.md`](CONTRIBUTING.md).

## Required Checks

After TypeScript or behavior changes, run the relevant checks and prefer the full gate before finishing:

```bash
npm run typecheck
npm run test:backend:unit
npm run build
npm run test:backend:integration
npm run test:frontend
npm run lint:frontend
```

Treat a failing `npm run build` as a release blocker.

## TypeScript Rules

- Keep `strict` and `exactOptionalPropertyTypes` intact.
- Do not silence type errors with `any`, broad casts, or `@ts-ignore` unless explicitly requested.
- Prefer fixing object construction so optional properties are omitted instead of set to `undefined`.
- Prefer tightening types near the source of the mismatch instead of casting at call sites.

## Workflow Rules

- Assume local hooks and CI are part of the contract.
- Do not remove or weaken `pre-commit`, `pre-push`, or CI checks without explicit approval.
- When adding scripts, keep local and CI enforcement aligned.
- Local `pre-push` should prefer stable checks; backend integration tests may remain CI-only when they depend on local listener availability.
- If a change intentionally breaks an existing gate, explain why and restore a working replacement in the same change.
- Follow the structural conventions in [`docs/architecture-guide.md`](docs/architecture-guide.md) for backend modules, frontend pages, services, contracts, and shared layers.

## Documentation Rules

- Update contributor-facing docs when scripts, hooks, architecture, setup, or release workflow change.
- Keep setup instructions accurate for a clean clone.
