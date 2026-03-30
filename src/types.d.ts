import "fastify";

declare module "fastify" {
  interface FastifyRequest {
    startedAt?: number;
  }
}

declare module "pg";

export {};
