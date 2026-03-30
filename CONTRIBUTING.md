# Contributing

## Development Workflow

This repository uses local Git hooks and GitHub Actions to keep `main` releasable.

- `pre-commit` runs `npm run verify:commit`
- `pre-push` runs `npm run verify:push`
- CI runs the same remote enforcement on pushes and pull requests

Install dependencies with:

```bash
npm install
```

The root `prepare` script installs Husky hooks automatically after install.

## Local Quality Gates

Use these commands during development:

```bash
npm run typecheck
npm run build
npm test
npm run lint:frontend
```

Expected workflow:

1. Commit locally as often as needed.
2. Keep commits small and coherent.
3. Let `pre-commit` catch fast type regressions.
4. Let `pre-push` block pushes if build, tests, or frontend lint are red.
5. Push only when the branch is in a releasable state.

## Current Enforcement Policy

- Do not relax TypeScript strictness to make builds pass unless the change is explicitly reviewed.
- Do not bypass hooks with `--no-verify` except for emergencies, and fix the broken gate immediately after.
- Update docs and examples when behavior, scripts, or environment expectations change.
- Keep `main` deployable and suitable for open source consumers cloning the repository.

## Pull Requests

Before opening a pull request, make sure:

- `npm run build` passes
- `npm test` passes
- `npm run lint:frontend` passes
- any required README or docs changes are included
