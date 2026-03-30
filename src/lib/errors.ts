import type { FastifyError } from "fastify";
import { ZodError } from "zod";

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly code: string,
    public readonly details?: unknown
  ) {
    super(message);
  }
}

type ReplyLike = {
  status(code: number): { send(payload: unknown): unknown };
};

export const errorHandler = (
  error: FastifyError | Error,
  _request: unknown,
  reply: ReplyLike
) => {
  if ("statusCode" in error && error.statusCode === 400) {
    return reply.status(400).send({
      error: {
        code: "validation_error",
        message: error.message || "Request validation failed"
      }
    });
  }

  if (error instanceof ZodError) {
    return reply.status(400).send({
      error: {
        code: "validation_error",
        message: "Request validation failed",
        details: error.flatten()
      }
    });
  }

  if (error instanceof AppError) {
    return reply.status(error.statusCode).send({
      error: {
        code: error.code,
        message: error.message,
        details: error.details
      }
    });
  }

  return reply.status(500).send({
    error: {
      code: "internal_error",
      message: error.message || "Unexpected error"
    }
  });
};
