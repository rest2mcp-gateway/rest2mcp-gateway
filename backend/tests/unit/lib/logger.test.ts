import assert from "node:assert/strict";
import test from "node:test";
import type { FastifyRequest } from "fastify";
import {
  formatCompletedRequestLog,
  formatIncomingRequestLog,
  getRequestIp
} from "../../../src/lib/logger.js";

const createRequest = (headers: Record<string, string> = {}): FastifyRequest => ({
  id: "req-1",
  ip: "127.0.0.1",
  method: "POST",
  url: "/api/widgets",
  headers
} as FastifyRequest);

test("getRequestIp prefers x-forwarded-for and trims the first value", () => {
  assert.equal(
    getRequestIp(createRequest({ "x-forwarded-for": "203.0.113.1, 198.51.100.4" })),
    "203.0.113.1"
  );
  assert.equal(getRequestIp(createRequest()), "127.0.0.1");
});

test("logger formatters include request id, IP, method, and URL", () => {
  const request = createRequest({ "x-forwarded-for": "203.0.113.1" });

  assert.equal(
    formatIncomingRequestLog(request),
    "req-1 203.0.113.1 incoming request POST /api/widgets"
  );
  assert.equal(
    formatCompletedRequestLog(request, 201, 42),
    "req-1 203.0.113.1 request completed 201 POST /api/widgets 42ms"
  );
});
