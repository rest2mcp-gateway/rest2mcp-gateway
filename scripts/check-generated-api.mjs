import { execFileSync } from "node:child_process";

const cwd = process.cwd();

execFileSync("npm", ["run", "generate:api"], {
  cwd,
  stdio: "inherit"
});

execFileSync("git", ["diff", "--exit-code", "--", "frontend/openapi/admin-api.json", "frontend/src/generated/admin-api.d.ts"], {
  cwd,
  stdio: "inherit"
});
