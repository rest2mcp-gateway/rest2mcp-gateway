import type { FastifyRequest } from "fastify";
import { env } from "../config/env.js";

export const loggerConfig = {
  level: env.NODE_ENV === "production" ? "info" : "debug",
  transport: env.NODE_ENV === "production"
    ? undefined
    : {
        target: "pino-pretty",
        options: {
          colorize: true
        }
      }
};

export const getRequestIp = (request: FastifyRequest) => {
  const forwardedFor = request.headers["x-forwarded-for"];
  if (typeof forwardedFor === "string") {
    const [firstIp] = forwardedFor.split(",");
    if (firstIp) {
      return firstIp.trim();
    }
  }

  return request.ip;
};

export const formatIncomingRequestLog = (request: FastifyRequest) =>
  `${request.id} ${getRequestIp(request)} incoming request ${request.method} ${request.url}`;

export const formatCompletedRequestLog = (request: FastifyRequest, statusCode: number, latencyMs: number) =>
  `${request.id} ${getRequestIp(request)} request completed ${statusCode} ${request.method} ${request.url} ${latencyMs}ms`;
