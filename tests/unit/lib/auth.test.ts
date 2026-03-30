import assert from "node:assert/strict";
import test from "node:test";
import type { FastifyReply, FastifyRequest } from "fastify";
import { AppError } from "../../../src/lib/errors.js";
import { assertRole, requireAuth, requireRoles } from "../../../src/lib/auth.js";

const reply = {} as FastifyReply;

test("requireAuth allows valid authenticated requests", async () => {
  const request = {
    jwtVerify: async () => undefined
  } as FastifyRequest;

  await assert.doesNotReject(requireAuth(request, reply));
});

test("requireAuth maps expired JWTs to session_expired", async () => {
  const request = {
    jwtVerify: async () => {
      const error = new Error("expired");
      (error as Error & { code: string }).code = "FST_JWT_AUTHORIZATION_TOKEN_EXPIRED";
      throw error;
    }
  } as FastifyRequest;

  await assert.rejects(requireAuth(request, reply), (error: unknown) => {
    assert.ok(error instanceof AppError);
    assert.equal(error.statusCode, 401);
    assert.equal(error.code, "session_expired");
    return true;
  });
});

test("requireAuth maps generic JWT failures to unauthorized", async () => {
  const request = {
    jwtVerify: async () => {
      throw new Error("invalid");
    }
  } as FastifyRequest;

  await assert.rejects(requireAuth(request, reply), (error: unknown) => {
    assert.ok(error instanceof AppError);
    assert.equal(error.statusCode, 401);
    assert.equal(error.code, "unauthorized");
    return true;
  });
});

test("requireRoles enforces allowed roles", async () => {
  const request = {
    jwtVerify: async () => undefined,
    user: {
      sub: "user-1",
      organizationId: "org-1",
      role: "viewer",
      email: "viewer@example.com"
    }
  } as FastifyRequest;

  const guard = requireRoles(["admin"]);

  await assert.rejects(guard(request, reply), (error: unknown) => {
    assert.ok(error instanceof AppError);
    assert.equal(error.statusCode, 403);
    assert.equal(error.code, "forbidden");
    return true;
  });
});

test("assertRole throws when a role is not allowed", () => {
  assert.throws(
    () => assertRole("viewer", ["admin"]),
    (error: unknown) => {
      assert.ok(error instanceof AppError);
      assert.equal(error.statusCode, 403);
      assert.equal(error.code, "forbidden");
      return true;
    }
  );
});
