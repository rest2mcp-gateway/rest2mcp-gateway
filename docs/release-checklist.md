# Release Checklist

Use this checklist before making the repository public or cutting a release.

## Repository Readiness

- Confirm the default branch is clean and up to date.
- Confirm `README.md` reflects the current installation, configuration, and runtime behavior.
- Confirm `CONTRIBUTING.md`, `SECURITY.md`, and `CODE_OF_CONDUCT.md` are present and current.
- Confirm the license file and package metadata are correct.

## Quality Gates

- Run `npm run verify:commit`.
- Run `npm run verify:push`.
- Run `npm run test:backend:integration`.
- Confirm GitHub Actions is green on the latest pushed commit.

## Docs And Examples

- Verify `docs/` pages still match the current product behavior.
- Verify example commands, environment variables, and API examples are still valid.
- Remove stale roadmap or placeholder language that no longer reflects the project state.

## Release And Publish

- Review open issues or known limitations that should be documented before release.
- Decide whether a version bump, tag, or GitHub Release is needed.
- Push the final commit set to GitHub.
- If publishing publicly, enable the intended GitHub security features after the visibility change.
