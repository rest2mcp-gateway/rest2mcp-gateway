import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import staticPlugin from "@fastify/static";
import type { FastifyPluginAsync } from "fastify";
import { repoRootDir } from "../../config/env.js";

const frontendDistDir = resolve(repoRootDir, "frontend", "dist");
const frontendIndexPath = join(frontendDistDir, "index.html");
const frontendAssetsDir = join(frontendDistDir, "assets");

const rootStaticFiles = ["favicon.ico", "robots.txt", "placeholder.svg"];

export const frontendRoutes: FastifyPluginAsync = async (app) => {
  await mkdir(frontendDistDir, { recursive: true });
  const hasFrontendBuild = existsSync(frontendDistDir) && existsSync(frontendIndexPath);

  if (!hasFrontendBuild) {
    app.log.warn({ frontendDistDir }, "frontend build not found; frontend routes will return 503 until the build is ready");
  }

  await app.register(staticPlugin, {
    root: frontendAssetsDir,
    prefix: "/assets/",
    wildcard: true,
    decorateReply: true
  });

  for (const fileName of rootStaticFiles) {
    app.get(`/${fileName}`, async (_request, reply) => {
      const filePath = join(frontendDistDir, fileName);
      if (!existsSync(filePath)) {
        return reply.callNotFound();
      }

      return reply.sendFile(fileName, frontendDistDir);
    });
  }

  app.get("/", async (_request, reply) => {
    if (!existsSync(frontendIndexPath)) {
      return reply.status(503).type("text/plain").send("Frontend build is not ready yet. Wait for the frontend watcher to finish.");
    }

    return reply.type("text/html").send(await readFile(frontendIndexPath, "utf8"));
  });

  app.get("/*", async (request, reply) => {
    const path = typeof request.params === "object" && request.params !== null && "*" in request.params
      ? String((request.params as Record<string, unknown>)["*"] ?? "")
      : "";

    if (
      path.startsWith("api/") ||
      path === "health" ||
      path === "docs" ||
      path.startsWith("docs/") ||
      path.includes(".")
    ) {
      return reply.callNotFound();
    }

    if (!existsSync(frontendIndexPath)) {
      return reply.status(503).type("text/plain").send("Frontend build is not ready yet. Wait for the frontend watcher to finish.");
    }

    return reply.type("text/html").send(await readFile(frontendIndexPath, "utf8"));
  });
};
