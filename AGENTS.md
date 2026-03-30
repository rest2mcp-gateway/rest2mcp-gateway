# AGENTS.md

## Purpose

Repository instructions for coding agents working in this project.

## Required Checks

After TypeScript or behavior changes, run the relevant checks and prefer the full gate before finishing:

```bash
npm run typecheck
npm run build
npm run test:backend:unit
npm run test:backend:integration
npm run test:frontend
npm run lint:frontend
```

## TypeScript Rules

- Keep `strict` and `exactOptionalPropertyTypes` intact.
- Do not silence type errors with `any`, broad casts, or `@ts-ignore` unless explicitly requested.
- Prefer fixing object construction so optional properties are omitted instead of set to `undefined`.
- Prefer tightening types near the source of the mismatch instead of casting at call sites.
- Treat a failing `npm run build` as a release blocker.

## Workflow Rules

- Assume local hooks and CI are part of the contract.
- Do not remove or weaken `pre-commit`, `pre-push`, or CI checks without explicit approval.
- When adding scripts, keep local and CI enforcement aligned.
- Local `pre-push` should prefer stable checks; backend integration tests may remain CI-only when they depend on local listener availability.
- If a change intentionally breaks an existing gate, explain why and restore a working replacement in the same change.

## Documentation Rules

- Update contributor-facing docs when scripts, hooks, or release workflow change.
- Keep setup instructions accurate for a clean clone.
