import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { buildApp } from "../src/app.js";

const outputPath = resolve(process.cwd(), process.argv[2] ?? "frontend/openapi/admin-api.json");

const main = async () => {
  const app = await buildApp();

  try {
    await app.ready();
    const document = app.swagger();
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, JSON.stringify(document, null, 2));
    app.log.info({ outputPath }, "exported openapi document");
  } finally {
    await app.close();
  }
};

void main();
