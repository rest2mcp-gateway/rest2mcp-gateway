type RequestLogSource = {
  id: string;
  headers: Record<string, string | string[] | undefined>;
  ip: string;
  method: string;
  url: string;
};
import { env } from "../config/env.js";

export const loggerConfig = env.NODE_ENV === "production"
  ? {
      level: "info"
    }
  : {
      level: "debug",
      transport: {
        target: "pino-pretty",
        options: {
          colorize: true
        }
      }
    };

export const getRequestIp = (request: RequestLogSource) => {
  const forwardedFor = request.headers["x-forwarded-for"];
  if (typeof forwardedFor === "string") {
    const [firstIp] = forwardedFor.split(",");
    if (firstIp) {
      return firstIp.trim();
    }
  }

  return request.ip;
};

export const formatIncomingRequestLog = (request: RequestLogSource) =>
  `${request.id} ${getRequestIp(request)} incoming request ${request.method} ${request.url}`;

export const formatCompletedRequestLog = (request: RequestLogSource, statusCode: number, latencyMs: number) =>
  `${request.id} ${getRequestIp(request)} request completed ${statusCode} ${request.method} ${request.url} ${latencyMs}ms`;
