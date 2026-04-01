import assert from "node:assert/strict";
import test from "node:test";
import { ZodError, z } from "zod";
import { AppError, errorHandler } from "../../../src/lib/errors.js";

const createReply = () => {
  const reply = {
    statusCode: 200,
    payload: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    send(payload: unknown) {
      this.payload = payload;
      return this;
    }
  };

  return reply;
};

test("errorHandler maps Fastify validation errors to validation_error", () => {
  const reply = createReply();

  errorHandler(
    { statusCode: 400, message: "Bad request" } as Error & { statusCode: number },
    {} as never,
    reply as never
  );

  assert.equal(reply.statusCode, 400);
  assert.deepEqual(reply.payload, {
    error: {
      code: "validation_error",
      message: "Bad request"
    }
  });
});

test("errorHandler maps ZodError to validation_error with details", () => {
  const reply = createReply();
  const schema = z.object({ name: z.string() });
  const parse = schema.safeParse({});
  assert.equal(parse.success, false);

  errorHandler(parse.error as ZodError, {} as never, reply as never);

  assert.equal(reply.statusCode, 400);
  assert.equal((reply.payload as { error: { code: string } }).error.code, "validation_error");
});

test("errorHandler maps AppError directly", () => {
  const reply = createReply();

  errorHandler(
    new AppError(403, "Forbidden", "forbidden", { reason: "role" }),
    {} as never,
    reply as never
  );

  assert.equal(reply.statusCode, 403);
  assert.deepEqual(reply.payload, {
    error: {
      code: "forbidden",
      message: "Forbidden",
      details: { reason: "role" }
    }
  });
});

test("errorHandler falls back to internal_error for unexpected exceptions", () => {
  const reply = createReply();

  errorHandler(new Error("Boom"), {} as never, reply as never);

  assert.equal(reply.statusCode, 500);
  assert.deepEqual(reply.payload, {
    error: {
      code: "internal_error",
      message: "Boom"
    }
  });
});
