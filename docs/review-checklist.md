# Review Checklist

Use this checklist during review when a change touches code structure, architecture, or workflow.

## Correctness

- Does the change preserve the intended behavior?
- Are edge cases and failure paths covered?
- Are tests present or updated near the changed behavior?

## Structural consistency

Check the change against [`docs/architecture-guide.md`](architecture-guide.md).

Backend:

- Does the change live in the owning module under `backend/src/modules/<domain>/`?
- Are Fastify routes still thin and boundary-focused?
- Is business logic in `service.ts` rather than `route.ts` or `repository.ts`?
- Is persistence isolated to `repository.ts`?
- Is API-facing transformation handled consistently with serializers or existing response helpers?

Frontend:

- Do route-level screens stay in `frontend/src/pages/`?
- Do API calls stay in `frontend/src/services/`?
- Does server-state loading use React Query rather than ad hoc `useEffect` fetching?
- Are shared API contract types reused from `frontend/src/contracts/`?
- Does the UI code match existing query-key and invalidation patterns in the surrounding area?

## Workflow alignment

- Were the relevant repository checks run?
- Were contributor-facing docs updated if structure, workflow, or setup expectations changed?
- Does the change strengthen the prevailing pattern instead of introducing a new competing one?
