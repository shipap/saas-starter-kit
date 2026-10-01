import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();
const port = process.env.PORT ?? "3000";
if (!/^\d{1,5}$/.test(port) || Number(port) < 1 || Number(port) > 65535)
  throw new Error("PORT must be a valid local port.");
const directory = resolve(root, ".data/demo");
await mkdir(directory, { recursive: true });
const environment = {
  ...process.env,
  NEXT_TELEMETRY_DISABLED: "1",
  DEMO_MODE: "true",
  DATABASE_DRIVER: "pglite",
  DATA_DIRECTORY: directory,
  DATABASE_PATH: directory,
  APP_URL: `http://localhost:${port}`,
  BETTER_AUTH_SECRET:
    process.env.BETTER_AUTH_SECRET ?? randomBytes(48).toString("base64url"),
};
console.log(`Local demo: http://localhost:${port}`);
console.log(
  "Click Try demo to create an isolated fictional workspace. No external services are contacted.",
);
const child = spawn(
  process.execPath,
  [
    resolve(root, "node_modules/next/dist/bin/next"),
    "dev",
    resolve(root, "apps/web"),
    "--hostname",
    "127.0.0.1",
    "--port",
    port,
  ],
  {
    cwd: root,
    env: environment,
    stdio: "inherit",
  },
);
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => child.kill(signal));
child.on("error", () => {
  console.error("Unable to launch Next.js. Run pnpm install first.");
  process.exitCode = 1;
});
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
