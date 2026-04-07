# Architecture Guide

This document defines the structural conventions that contributors and coding tools should follow in this repository.

The intent is consistency first. These rules describe the dominant patterns already present in the codebase and should be treated as the default for new work.

## Backend

Backend code is organized by domain module under `backend/src/modules/<domain>/`.

Use this module structure where applicable:

- `route.ts`
  - registers Fastify endpoints
  - applies auth guards
  - parses params, query, and body input
  - returns shaped API responses
- `schemas.ts`
  - defines Zod request and query schemas
  - keeps boundary validation close to the route
- `service.ts`
  - contains business rules and orchestration
  - coordinates repositories, audit logging, publishing, and cross-module behavior
- `repository.ts`
  - owns persistence and database queries
  - does not contain request parsing or response shaping
- `serializer.ts`
  - converts database or internal rows into safe API responses
  - handles masking or compatibility shaping when needed

Backend rules:

- Keep routes thin.
- Keep database logic out of routes.
- Keep business logic out of repositories.
- Reuse shared helpers from `backend/src/lib/` and `backend/src/modules/common/`.
- Reuse contracts from `backend/src/contracts/` for response schemas and API envelope consistency.
- Prefer module-local files over spreading one feature across unrelated folders.

## Frontend

Frontend code is organized by responsibility.

- `frontend/src/pages/`
  - route-level screens
  - compose queries, mutations, local form state, and UI sections
- `frontend/src/services/`
  - API clients and request helpers
  - owns raw HTTP interaction
- `frontend/src/contracts/`
  - typed wrappers around generated API contracts
  - source of shared request and response types for the UI
- `frontend/src/generated/`
  - generated types only
  - do not hand-edit
- `frontend/src/components/`
  - reusable UI building blocks and shared presentation
- `frontend/src/providers/`
  - app-wide state and integration boundaries
- `frontend/src/hooks/`
  - reusable stateful logic
- `frontend/src/lib/`
  - pure helpers and non-UI utilities

Frontend rules:

- Keep raw `fetch` usage inside `frontend/src/services/`.
- Prefer React Query for server-state loading, mutation, caching, and invalidation.
- Keep pages focused on orchestration, not transport details.
- Use contracts from `frontend/src/contracts/` instead of duplicating API types locally.
- Reuse query-key patterns already established in the surrounding feature area.

## Shared conventions

- Keep types explicit and strict.
- Omit optional properties rather than assigning `undefined` when constructing objects.
- Prefer the smallest coherent change that matches the surrounding module or page style.
- When adding a new feature, extend the nearest existing pattern before inventing a new one.
- Update contributor-facing docs when architectural rules or workflow expectations change.

## For contributors and tools

When making code changes in this repository:

1. Infer the owning backend module or frontend page family first.
2. Place new logic in the layer that already owns that concern.
3. If a change would break these conventions, standardize the code rather than documenting avoidable drift.
4. Use [`AGENTS.md`](../AGENTS.md) for workflow rules and quality gates.
5. Use this document as the default structural reference before introducing a new pattern.
