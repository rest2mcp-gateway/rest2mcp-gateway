import { buildApp } from "./app.js";
import { env } from "./config/env.js";

const start = async () => {
  const app = await buildApp();

  try {
    for (const warning of env.startupWarnings) {
      app.log.warn(warning);
    }
    await app.listen({ host: env.HOST, port: env.PORT });
    app.log.info({ host: env.HOST, port: env.PORT }, "admin api and mcp runtime started");
  } catch (error) {
    app.log.error(error, "failed to start admin api and mcp runtime");
    process.exit(1);
  }
};

void start();
