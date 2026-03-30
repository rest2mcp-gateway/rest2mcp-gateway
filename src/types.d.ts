import "fastify";

declare module "fastify" {
  interface FastifyRequest {
    startedAt?: number;
  }
}

export {};
